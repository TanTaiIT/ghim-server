import type {
  ListingScreeningPort,
  ListingTrustPort,
  OpenWork,
  TrustTier,
} from './listing.shared.js';

/**
 * Bản tạm tới `add-trust-tiers` (design mục 7): một mức cho mọi người, không chặn lượt gửi nào. Production và test
 * truyền T0 (an toàn nhất: tin công khai mang lý do "tài khoản mới"), dev truyền `DEV_TRUST_TIER`.
 */
export const createInterimTrust = (tier: TrustTier): ListingTrustPort => ({
  tierOf: () => Promise.resolve(tier),
  assertCanSubmit: () => Promise.resolve(),
});

/** Bản tạm tới `add-screening` (design mục 8): không thời gian chờ, không chấm, không ghi lượt chấm. */
export const interimScreening: ListingScreeningPort = {
  precheck: () => Promise.resolve(),
  scoreText: () => Promise.resolve(null),
  openRun: () => Promise.resolve(),
};

/** Chưa có hàng đợi duyệt, báo cáo hay hậu kiểm nên không việc nào khoá nơi đăng — `add-review-queues` thay. */
export const noOpenWork: OpenWork = {
  blocksPlacement: () => Promise.resolve(false),
};
