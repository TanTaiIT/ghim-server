import { execFileSync } from 'node:child_process';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { sequentially } from '../src/common/utils/sequential.js';
import { databaseEnvironmentIssue } from '../src/config/database-guard.js';
import { databaseName, workerDatabaseUrl, workerStorageUrl } from './db-names.js';
import { dropBucket, storageOf } from './storage-helpers.js';

/**
 * Áp migration lên DB mẫu bằng CHÍNH các file migration — không `db push`: thứ cần kiểm là migration
 * SQL viết tay (exclusion constraint, CHECK, partial index) có thật sự nằm trong DB. Rồi nhân bản DB
 * mẫu cho từng worker (`CREATE DATABASE … TEMPLATE`, nhanh hơn chạy lại migration nhiều lần).
 *
 * Container `postgres-test` chạy trên tmpfs nên trống mỗi lần khởi động. DB mẫu lệch khỏi migration
 * (vd vừa đổi nhánh) thì dựng lại container: `docker compose rm -sf postgres-test && pnpm db:test:up`.
 *
 * Gọi thẳng `node …/prisma/build/index.js` thay vì `pnpm exec prisma`: chạy được như nhau trên
 * Windows và Linux mà không cần shell.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const url = process.env.TEST_DATABASE_URL;
  const issue = databaseEnvironmentIssue('test', url);
  if (!url || issue) {
    throw new Error(issue ?? 'Thiếu TEST_DATABASE_URL');
  }

  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url },
    stdio: 'inherit',
  });

  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: maintenance.toString(), max: 1 }),
  });
  const runId = process.env.TEST_RUN_ID ?? String(process.pid);
  const names = Array.from({ length: Number(process.env.TEST_WORKERS ?? 1) }, (_, index) =>
    databaseName(workerDatabaseUrl(url, runId, index + 1)),
  );
  const template = databaseName(url);

  // Tuần tự: nhân bản song song từ cùng một DB mẫu dễ vấp 55006 hơn.
  await sequentially(names, async (name) => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await createFromTemplate(admin, name, template);
  });

  const storageUrl = process.env.TEST_STORAGE_URL;
  if (!storageUrl) throw new Error('Thiếu TEST_STORAGE_URL');
  const buckets = Array.from({ length: Number(process.env.TEST_WORKERS ?? 1) }, (_, index) =>
    workerStorageUrl(storageUrl, runId, index + 1),
  );
  await Promise.all(buckets.map((bucketUrl) => storageOf(bucketUrl).ensureBucket()));

  return async () => {
    await sequentially(names, async (name) => {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    });
    await admin.$disconnect();
    await Promise.all(buckets.map(dropBucket));
  };
}

/** Lượt chạy khác đang áp migration lên DB mẫu thì Postgres từ chối nhân bản (55006) — chờ rồi thử lại. */
async function createFromTemplate(
  admin: PrismaClient,
  name: string,
  template: string,
  attempt = 1,
): Promise<void> {
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
  } catch (error) {
    if (attempt >= 40 || !String(error).includes('55006')) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await createFromTemplate(admin, name, template, attempt + 1);
  }
}
