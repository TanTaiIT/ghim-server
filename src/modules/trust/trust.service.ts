import {
  createTrustDashboardService,
  type TrustDashboardService,
} from './trust.dashboard.service.js';
import { createTrustQuotaService, type TrustQuotaService } from './trust.quota.service.js';
import { createStrikeService, type TrustStrikeService } from './strike/strike.service.js';
import type { TrustServiceDeps } from './trust.shared.js';
import { createTrustTierService, type TrustTierService } from './trust.tier.service.js';

export type { TrustServiceDeps } from './trust.shared.js';

export type TrustService = TrustTierService &
  TrustQuotaService &
  TrustDashboardService &
  TrustStrikeService;

/**
 * Ghép bốn mặt của `trust` (mức tin cậy, hạn mức, bảng uy tín, gậy) — hạn mức đọc mức qua `tierOf`; gậy đổi thì tính lại
 * mức qua `recompute`.
 */
export function createTrustService(deps: TrustServiceDeps): TrustService {
  const tiers = createTrustTierService(deps);
  const strikes = createStrikeService(deps, tiers.recompute);
  return {
    ...tiers,
    ...createTrustQuotaService(deps, tiers.tierOf),
    ...createTrustDashboardService(deps, strikes),
    ...strikes,
  };
}
