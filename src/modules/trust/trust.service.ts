import {
  createTrustDashboardService,
  type TrustDashboardService,
} from './trust.dashboard.service.js';
import { createTrustQuotaService, type TrustQuotaService } from './trust.quota.service.js';
import type { TrustServiceDeps } from './trust.shared.js';
import { createTrustTierService, type TrustTierService } from './trust.tier.service.js';

export type { TrustServiceDeps } from './trust.shared.js';

export type TrustService = TrustTierService & TrustQuotaService & TrustDashboardService;

/** Ghép ba mặt của `trust` (mức tin cậy, hạn mức, bảng uy tín) — hạn mức đọc mức qua `tierOf` của mặt mức tin cậy. */
export function createTrustService(deps: TrustServiceDeps): TrustService {
  const tiers = createTrustTierService(deps);
  return {
    ...tiers,
    ...createTrustQuotaService(deps, tiers.tierOf),
    ...createTrustDashboardService(deps),
  };
}
