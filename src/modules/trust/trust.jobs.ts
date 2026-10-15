import type { JobName, Jobs } from '../../lib/jobs.js';
import { logger } from '../../lib/logger.js';
import type { TrustService } from './trust.service.js';

export const TRUST_JOBS = {
  recomputeDaily: 'trust.recompute-daily',
} as const satisfies Record<string, JobName>;

/** 00:30 giờ Việt Nam (múi mặc định của `jobs`): mốc tuổi tính theo ngày lịch nên chạy ngay sau nửa đêm (design mục 7). */
const RECOMPUTE_CRON = '30 0 * * *';

export async function registerTrustJobs(jobs: Jobs, trust: TrustService): Promise<void> {
  await jobs.schedule(TRUST_JOBS.recomputeDaily, RECOMPUTE_CRON, async () => {
    const result = await trust.recomputeDaily();
    logger.info(result, TRUST_JOBS.recomputeDaily);
  });
}
