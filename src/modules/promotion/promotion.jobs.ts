import type { Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { PromotionService } from './promotion.service.js';

export const PROMOTION_JOBS = { remindExpiring: 'promotion.remind-expiring' } as const;

/** Nhắc trước `promotion.featuredReminderHours`: mỗi giờ là đủ mịn cho một mốc tính bằng ngày. */
const REMIND_CRON = '0 * * * *';

export async function registerPromotionJobs(
  jobs: Jobs,
  promotion: PromotionService,
): Promise<void> {
  await jobs.schedule(PROMOTION_JOBS.remindExpiring, REMIND_CRON, async () => {
    const reminded = await promotion.remindExpiring();
    if (reminded > 0) logger.info({ reminded }, PROMOTION_JOBS.remindExpiring);
  });
}
