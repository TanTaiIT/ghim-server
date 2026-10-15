import type { JobName, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { ScreeningService } from './screening.service.js';

export const SCREENING_JOBS = {
  checkImage: 'screening.check-image',
  safetyNet: 'screening.safety-net',
  priceStats: 'screening.price-stats',
  rescanPhrase: 'screening.rescan-phrase',
} as const satisfies Record<string, JobName>;

/** Thử lại sau lượt đầu hỏng; hết lượt thì ảnh mang kết quả `error` và tin được giữ cho người (design mục 5). */
export const IMAGE_CHECK_RETRIES = 2;
const IMAGE_CHECK_CONCURRENCY = 4;
const SAFETY_NET_CRON = '*/5 * * * *';
/** 02:00 giờ Việt Nam: lúc ít người gửi tin nhất. */
const PRICE_STATS_CRON = '0 2 * * *';

export async function registerScreeningJobs(
  jobs: Jobs,
  screening: ScreeningService,
): Promise<void> {
  await jobs.work<{ imageId: string }>(
    SCREENING_JOBS.checkImage,
    ({ imageId }) => screening.checkImage(imageId),
    { retryLimit: IMAGE_CHECK_RETRIES, concurrency: IMAGE_CHECK_CONCURRENCY },
  );
  await jobs.work<{ phraseId: string }>(SCREENING_JOBS.rescanPhrase, async ({ phraseId }) => {
    const recalled = await screening.rescanPhrase(phraseId);
    logger.info({ phraseId, recalled }, SCREENING_JOBS.rescanPhrase);
  });
  await jobs.schedule(SCREENING_JOBS.safetyNet, SAFETY_NET_CRON, async () => {
    const result = await screening.safetyNet();
    // Tin đang hiện thiếu kết quả ảnh lẽ ra không có (cam kết 4) — có thì người trực phải thấy.
    if (result.restricted > 0) logger.warn(result, SCREENING_JOBS.safetyNet);
  });
  await jobs.schedule(SCREENING_JOBS.priceStats, PRICE_STATS_CRON, async () => {
    logger.info({ categories: await screening.refreshPriceStats() }, SCREENING_JOBS.priceStats);
  });
}
