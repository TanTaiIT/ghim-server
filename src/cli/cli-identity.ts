import { noStaffPrivilegeSource } from '../common/auth/privilege-source.js';
import { createStaticRuntimeConfig } from '../common/config/runtime-config.js';
import { createSecretBox } from '../common/crypto/secrets.js';
import { AppError } from '../common/errors/app-error.js';
import { env } from '../config/env.js';
import type { Jobs } from '../lib/jobs.js';
import { prisma } from '../lib/prisma.js';
import { createGoogleTokenVerifier } from '../modules/identity/google.verifier.js';
import { createIdentityRepository } from '../modules/identity/identity.repository.js';
import {
  createIdentityService,
  type IdentityService,
} from '../modules/identity/identity.service.js';

const noJob = async (): Promise<never> => {
  throw new Error('CLI không có việc nền — thao tác này không được gửi thư hay xếp việc');
};

/** Tạo master và đặt lại lớp thứ hai không gửi mã nào, nên CLI không cần pg-boss lẫn SMTP. */
const noJobs: Jobs = {
  start: async () => {},
  stop: async () => {},
  schedule: noJob,
  work: noJob,
  send: noJob,
};

export function createCliIdentity(): IdentityService {
  return createIdentityService({
    repository: createIdentityRepository(prisma),
    jobs: noJobs,
    privilegeSource: noStaffPrivilegeSource,
    config: createStaticRuntimeConfig(),
    clock: () => new Date(),
    hashKey: env.IDENTITY_HASH_KEY,
    secrets: createSecretBox(env.SECRETS_ENCRYPTION_KEY),
    googleVerifier: createGoogleTokenVerifier(env.GOOGLE_CLIENT_IDS),
  });
}

/** Chạy một việc CLI: lỗi nghiệp vụ in một dòng và thoát 1, lỗi lạ in đủ stack, luôn đóng Prisma. */
export async function runCli(job: (identity: IdentityService) => Promise<string>): Promise<void> {
  try {
    const message = await job(createCliIdentity());
    process.stdout.write(`${message}\n`);
  } catch (error) {
    process.exitCode = 1;
    if (error instanceof AppError) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
    } else {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
