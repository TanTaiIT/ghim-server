import type { JobName, JobOutcome, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { MediaService } from './media.service.js';

export const MEDIA_JOBS = {
  purgeUnconfirmed: 'media.purge-unconfirmed',
  reconcile: 'media.reconcile',
  /** Lượt đối chiếu chạm trần thời gian thì xếp lượt này làm tiếp từ chỗ dừng. */
  reconcileContinue: 'media.reconcile-continue',
} as const satisfies Record<string, JobName>;

/** TK 26: dọn ảnh chưa xác nhận mỗi 6 giờ, đối chiếu cả kho mỗi tháng. Lịch nằm trong code, không ở bảng con số. */
const PURGE_CRON = '0 */6 * * *';
const RECONCILE_CRON = '30 3 1 * *';
/** TK 26 luật 1: một lượt đối chiếu dài không được giữ worker mãi; phần còn lại xếp lượt sau. */
const RECONCILE_BUDGET_MS = 10 * 60_000;

export async function registerMediaJobs(jobs: Jobs, media: MediaService): Promise<void> {
  await jobs.schedule(MEDIA_JOBS.purgeUnconfirmed, PURGE_CRON, async () => {
    const deleted = await media.purgeUnconfirmed();
    if (deleted > 0) logger.info({ deleted }, 'media.purge-unconfirmed');
    return { summary: { deleted } };
  });

  const reconcile = async (after?: string): Promise<JobOutcome> => {
    const result = await media.reconcile({ after, budgetMs: RECONCILE_BUDGET_MS });
    if (result.missing > 0) {
      logger.error(
        { missing: result.missing },
        'media.reconcile: ảnh đang dùng mà tệp không còn trong kho',
      );
    }
    if (result.next) {
      // TK 26 luật 2: làm dở thì phải nói ra — vào sổ `job_runs` và xếp lượt làm tiếp.
      logger.warn({ ...result }, 'media.reconcile mới làm được một phần, xếp lượt làm tiếp');
      await jobs.send(MEDIA_JOBS.reconcileContinue, { after: result.next });
      return { partial: true, summary: { ...result } };
    }
    logger.info({ ...result }, 'media.reconcile');
    return { summary: { ...result } };
  };
  await jobs.schedule(MEDIA_JOBS.reconcile, RECONCILE_CRON, () => reconcile());
  await jobs.work<{ after: string }>(MEDIA_JOBS.reconcileContinue, async (data) => {
    await reconcile(data.after);
  });
}
