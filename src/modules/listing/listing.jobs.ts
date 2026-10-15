import type { JobName, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { ListingService } from './listing.service.js';

export const LISTING_JOBS = {
  expireDue: 'listing.expire-due',
  remindExpiring: 'listing.remind-expiring',
} as const satisfies Record<string, JobName>;

/**
 * Hết hạn mỗi giờ (design mục 15): hạn tính tới mili-giây nhưng trễ tối đa một giờ chỉ làm tin hiện lâu hơn chút, không
 * sai luật — không job nào đưa tin LÊN bảng (luật 15). Nhắc lúc 9 giờ sáng giờ Việt Nam (múi mặc định của `jobs`).
 */
const EXPIRE_CRON = '25 * * * *';
const REMIND_CRON = '0 9 * * *';

export async function registerListingJobs(jobs: Jobs, listing: ListingService): Promise<void> {
  await jobs.schedule(LISTING_JOBS.expireDue, EXPIRE_CRON, async () => {
    const expired = await listing.expireDue();
    if (expired > 0) logger.info({ expired }, LISTING_JOBS.expireDue);
  });
  await jobs.schedule(LISTING_JOBS.remindExpiring, REMIND_CRON, async () => {
    const reminded = await listing.remindExpiring();
    if (reminded > 0) logger.info({ reminded }, LISTING_JOBS.remindExpiring);
  });
}
