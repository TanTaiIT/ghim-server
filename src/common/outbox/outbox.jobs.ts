import type { PrismaClient } from '@prisma/client';

import type { JobName } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { AppModule } from '../module/app-module.js';

export const OUTBOX_JOBS = {
  purgePublished: 'outbox.purge-published',
} as const satisfies Record<string, JobName>;

/** 04:30 giờ Việt Nam: sau các việc dọn của `identity`, lúc ít người dùng nhất. */
const PURGE_CRON = '30 4 * * *';
/** Đủ để tra lại khi điều tra một sự cố. Hằng hạ tầng, không phải con số TK 28. */
const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export function createPurgePublishedHandler(
  prisma: PrismaClient,
  clock: () => Date = () => new Date(),
): () => Promise<void> {
  return async () => {
    const before = new Date(clock().getTime() - RETENTION_DAYS * DAY_MS);
    // `published_at < x` loại sẵn dòng chưa phát (NULL không nhỏ hơn gì).
    const { count } = await prisma.outboxEvent.deleteMany({
      where: { publishedAt: { lt: before } },
    });
    logger.info({ count }, 'Đã dọn sự kiện outbox đã phát quá hạn');
  };
}

/** Module hạ tầng không có route: chỉ góp việc dọn vào danh sách module. `ops` (đợt 7) nhận lại. */
export function createOutboxModule(prisma: PrismaClient): AppModule {
  return {
    name: 'outbox',
    jobs: (jobs) =>
      jobs.schedule(OUTBOX_JOBS.purgePublished, PURGE_CRON, createPurgePublishedHandler(prisma)),
  };
}
