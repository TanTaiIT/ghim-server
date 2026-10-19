import type { PrismaClient } from '@prisma/client';

import {
  type JobName,
  type JobOutcome,
  type JobRunLog,
  type Jobs,
  type JobSummary,
  recordedRun,
} from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { OpsService } from './ops.service.js';
import type { RetentionResult, RetentionStep } from './retention.service.js';

export const OPS_JOBS = {
  /** Hằng ngày: mọi bước của bảng TK 25, bỏ qua dữ liệu đang tạm giữ. */
  retention: 'ops.retention',
  /** Theo sự kiện: lượt trước chạm trần thời gian thì làm tiếp từ bước đã dừng. */
  retentionContinue: 'ops.retention-continue',
  /** Mỗi 6 giờ: bản nháp bỏ dở (TK 26). */
  purgeDrafts: 'ops.purge-drafts',
  /**
   * Sự kiện outbox đã phát quá 30 ngày. Tên giữ nguyên từ lúc còn là module `outbox` (trước add-data-retention): pg-boss
   * lưu lịch theo tên trong DB, đổi tên để lại một lịch mồ côi vẫn xếp việc không ai làm.
   */
  purgeOutbox: 'outbox.purge-published',
} as const satisfies Record<string, JobName>;

/** 03:45 và 04:30 giờ Việt Nam: sau các lượt dọn của `identity` (03:00, 03:30), lúc ít người dùng nhất. */
const RETENTION_CRON = '45 3 * * *';
const OUTBOX_CRON = '30 4 * * *';
const DRAFTS_CRON = '20 */6 * * *';
/** Đủ để tra lại khi điều tra một sự cố. Hằng hạ tầng, không phải con số TK 28. */
const OUTBOX_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export interface ContinueJob {
  from: RetentionStep;
}

export function createPurgePublishedHandler(
  prisma: PrismaClient,
  clock: () => Date = () => new Date(),
): () => Promise<JobOutcome> {
  return async () => {
    const before = new Date(clock().getTime() - OUTBOX_RETENTION_DAYS * DAY_MS);
    // `published_at < x` loại sẵn dòng chưa phát (NULL không nhỏ hơn gì).
    const { count } = await prisma.outboxEvent.deleteMany({
      where: { publishedAt: { lt: before } },
    });
    logger.info({ count }, 'Đã dọn sự kiện outbox đã phát quá hạn');
    return { summary: { count } };
  };
}

const outcomeOf = (result: RetentionResult): JobOutcome => {
  const summary: JobSummary = { ...result.counts, next: result.next };
  if (result.partial) {
    // TK 26 luật 2: làm dở thì phải nói ra — vào sổ `job_runs` (trạng thái `partial`) và lên log.
    logger.warn(summary, 'ops.retention mới làm được một phần, đã xếp lượt làm tiếp');
  } else {
    logger.info(summary, 'ops.retention');
  }
  return { partial: result.partial, summary };
};

export interface OpsJobDeps {
  prisma: PrismaClient;
  /** Lượt làm tiếp là việc theo sự kiện nên tự ghi sổ — nó nói tiếp câu chuyện của lượt theo lịch. */
  runLog: JobRunLog;
  clock: () => Date;
}

export async function registerOpsJobs(
  jobs: Jobs,
  ops: OpsService,
  deps: OpsJobDeps,
): Promise<void> {
  await jobs.schedule(OPS_JOBS.retention, RETENTION_CRON, async () =>
    outcomeOf(await ops.runRetention()),
  );
  await jobs.work<ContinueJob>(OPS_JOBS.retentionContinue, async ({ from }) => {
    await recordedRun(
      OPS_JOBS.retentionContinue,
      async () => outcomeOf(await ops.runRetention({ from })),
      deps.runLog,
      deps.clock,
    );
  });
  await jobs.schedule(OPS_JOBS.purgeDrafts, DRAFTS_CRON, async () => {
    const deleted = await ops.purgeDrafts();
    if (deleted > 0) logger.info({ deleted }, OPS_JOBS.purgeDrafts);
    return { summary: { deleted } };
  });
  await jobs.schedule(
    OPS_JOBS.purgeOutbox,
    OUTBOX_CRON,
    createPurgePublishedHandler(deps.prisma, deps.clock),
  );
}
