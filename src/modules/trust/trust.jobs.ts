import type { JobName, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { TrustService } from './trust.service.js';

export const TRUST_JOBS = {
  recomputeDaily: 'trust.recompute-daily',
  /** Gậy tới hạn hết hiệu lực trong ngày (TK 21): mỗi giờ là đủ — điểm đọc đã đúng từ lúc tới hạn, job chỉ phát sự kiện. */
  expireStrikes: 'trust.expire-strikes',
  /** Khoá vĩnh viễn tới kỳ xem lại 2 năm (TK 22). */
  permanentReviews: 'trust.permanent-reviews',
} as const satisfies Record<string, JobName>;

/** 00:30 giờ Việt Nam (múi mặc định của `jobs`): mốc tuổi tính theo ngày lịch nên chạy ngay sau nửa đêm (design mục 7). */
const RECOMPUTE_CRON = '30 0 * * *';
const EXPIRE_STRIKES_CRON = '5 * * * *';
const PERMANENT_REVIEWS_CRON = '45 0 * * *';

export async function registerTrustJobs(jobs: Jobs, trust: TrustService): Promise<void> {
  await jobs.schedule(TRUST_JOBS.recomputeDaily, RECOMPUTE_CRON, async () => {
    const result = await trust.recomputeDaily();
    logger.info(result, TRUST_JOBS.recomputeDaily);
  });
  await jobs.schedule(TRUST_JOBS.expireStrikes, EXPIRE_STRIKES_CRON, async () => {
    const expired = await trust.expireStrikes();
    if (expired > 0) logger.info({ expired }, TRUST_JOBS.expireStrikes);
  });
  await jobs.schedule(TRUST_JOBS.permanentReviews, PERMANENT_REVIEWS_CRON, async () => {
    const due = await trust.permanentReviewsDue();
    if (due > 0) logger.info({ due }, TRUST_JOBS.permanentReviews);
  });
}
