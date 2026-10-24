import type {
  BuyerInterest,
  HoldExplanation,
  HoldNotice,
} from '../../src/modules/trust/trust.shared.js';

/*
 * Cổng giả của `trust` cho test mức tin cậy / bảng uy tín: không ai hỏi mua, mọi tin chờ duyệt nhận câu chung. Bản thật
 * là `messaging` (hỏi mua) và `screening` (câu báo máy) — hai module đó đã có, nên bản giả chỉ còn chỗ ở đây.
 */
export const noBuyerInterest: BuyerInterest = {
  hasInquiry: () => Promise.resolve(false),
};

const WAITING_FOR_REVIEWER: HoldNotice = {
  reason: 'Đang chờ người duyệt',
  estimatedWait: null,
  lookupCode: null,
};

export const genericHolds: HoldExplanation = {
  explain: (ids) => Promise.resolve(new Map(ids.map((id) => [id, WAITING_FOR_REVIEWER]))),
  cooldownOf: () => Promise.resolve(null),
};
