import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createOutboxDispatcher } from '../src/common/outbox/dispatcher.js';
import { createPurgePublishedHandler } from '../src/common/outbox/outbox.jobs.js';
import { prisma, sqlStateOf, truncateAll } from './db-helpers.js';

/* Trần thời gian của DB, việc dọn outbox và lượt tắt êm trên Postgres thật. */
const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-11T04:00:00.000Z');

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

describe('trần thời gian của DB', () => {
  it('client của app chạy với statement_timeout mặc định 15 giây', async () => {
    const [row] = await prisma.$queryRaw<
      Array<{ statement_timeout: string }>
    >`SHOW statement_timeout`;
    expect(row?.statement_timeout).toBe('15s');
  });

  it('câu SQL vượt trần bị huỷ (SQLSTATE 57014) thay vì giữ kết nối', async () => {
    const short = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL ?? '',
        max: 1,
        statement_timeout: 200,
      }),
    });
    try {
      await expect(sqlStateOf(short.$queryRaw`SELECT pg_sleep(1)`)).resolves.toBe('57014');
    } finally {
      await short.$disconnect();
    }
  });
});

describe('outbox.purge-published', () => {
  it('chỉ xoá sự kiện đã phát quá 30 ngày; sự kiện chưa phát giữ mãi', async () => {
    const old = new Date(NOW.getTime() - 31 * DAY_MS);
    const recent = new Date(NOW.getTime() - 29 * DAY_MS);
    await prisma.outboxEvent.createMany({
      data: [
        { type: 'test.old.published', payload: {}, createdAt: old, publishedAt: old },
        { type: 'test.recent.published', payload: {}, createdAt: recent, publishedAt: recent },
        { type: 'test.old.pending', payload: {}, createdAt: old },
      ],
    });

    await createPurgePublishedHandler(prisma, () => NOW)();

    const left = await prisma.outboxEvent.findMany({
      select: { type: true },
      orderBy: { type: 'asc' },
    });
    expect(left.map((row) => row.type)).toEqual(['test.old.pending', 'test.recent.published']);
  });
});

describe('tắt êm', () => {
  it('stop() chỉ xong sau khi bên nghe đang chạy xong', async () => {
    await prisma.outboxEvent.create({ data: { type: 'identity.account.locked', payload: {} } });
    const dispatcher = createOutboxDispatcher(prisma);
    const gate = Promise.withResolvers<void>();
    let handlerDone = false;
    dispatcher.register('identity.account.locked', async () => {
      await gate.promise;
      handlerDone = true;
    });

    const run = dispatcher.runOnce();
    // Chờ tới khi bên nghe đã được gọi (lô đã nhận) rồi mới tắt.
    await new Promise((resolve) => setTimeout(resolve, 200));
    let stopped = false;
    const stopping = (async () => {
      await dispatcher.stop();
      stopped = true;
    })();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stopped).toBe(false);

    gate.resolve();
    await stopping;
    expect(handlerDone).toBe(true);
    expect(await run).toEqual({ published: 1, failed: 0 });
  });
});
