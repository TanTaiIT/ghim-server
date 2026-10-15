import type { JobName, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { ReviewService } from './review.service.js';

export const REVIEW_JOBS = {
  everyMinute: 'review.every-minute',
  everyHour: 'review.every-hour',
  weeklyPostcheck: 'review.weekly-postcheck',
} as const satisfies Record<string, JobName>;

const EVERY_MINUTE_CRON = '* * * * *';
const EVERY_HOUR_CRON = '0 * * * *';
/** Thứ Hai 08:00 giờ Việt Nam (múi mặc định của `jobs`) — đầu tuần làm việc, tuần trước đã khép (design mục 9). */
const WEEKLY_CRON = '0 8 * * 1';

export async function registerReviewJobs(jobs: Jobs, review: ReviewService): Promise<void> {
  await jobs.schedule(REVIEW_JOBS.everyMinute, EVERY_MINUTE_CRON, async () => {
    const result = await review.everyMinute();
    if (result.escalated > 0 || result.expired > 0) logger.info(result, REVIEW_JOBS.everyMinute);
  });
  await jobs.schedule(REVIEW_JOBS.everyHour, EVERY_HOUR_CRON, async () => {
    logger.info(await review.everyHour(), REVIEW_JOBS.everyHour);
  });
  await jobs.schedule(REVIEW_JOBS.weeklyPostcheck, WEEKLY_CRON, async () => {
    logger.info(await review.weeklyPostcheck(), REVIEW_JOBS.weeklyPostcheck);
  });
}
