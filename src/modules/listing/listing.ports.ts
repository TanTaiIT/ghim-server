import type {
  ListingScreeningPort,
  ListingTrustPort,
  OpenWork,
  TrustTier,
} from './listing.shared.js';

/**
 * Cổng giả cho test (`buildTestApp({ trust })`): một mức cho mọi người, không chặn lượt gửi nào — test không bàn về
 * mức tin cậy hay hạn mức dùng nó; app thật nối `trust` (add-trust-tiers).
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
