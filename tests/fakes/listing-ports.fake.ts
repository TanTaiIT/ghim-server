import type {
  ListingScreeningPort,
  ListingTrustPort,
  TrustTier,
} from '../../src/modules/listing/listing.ports.js';

/**
 * Cổng giả cho test (`buildTestApp({ trust })`): một mức cho mọi người, không chặn lượt gửi nào — test không bàn về
 * mức tin cậy hay hạn mức dùng nó; app thật nối `trust`.
 */
export const createInterimTrust = (tier: TrustTier): ListingTrustPort => ({
  tierOf: () => Promise.resolve(tier),
  assertCanSubmit: () => Promise.resolve(),
});

/** Không thời gian chờ, không chấm, không ghi lượt chấm: máy thật giữ tin chờ kết quả ảnh, còn test tự quyết lúc máy cho qua. */
export const interimScreening: ListingScreeningPort = {
  precheck: () => Promise.resolve(),
  scoreText: () => Promise.resolve(null),
  openRun: () => Promise.resolve(),
  notices: () => Promise.resolve(new Map()),
};
