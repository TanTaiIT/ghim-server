import type {
  ListingPlacement,
  ScreeningBand,
  ScreeningCause,
  ScreeningOutcome,
  TrustTier,
} from '@prisma/client';

import { type Explanation, explain } from './explanation.calc.js';
import {
  type AppliedHit,
  applyRules,
  bandOf,
  type RawHit,
  type RuleBook,
  scoreOf,
} from './score.calc.js';
import { isGate } from './screening.rules.js';

export interface Decision {
  outcome: ScreeningOutcome;
  cause: ScreeningCause;
  /** Đặt (hay gỡ) lý do hạn chế "máy" — chỉ T1 dải Vừa (TK 14); kết quả mới thay kết quả của nội dung cũ (câu 18). */
  restrictMachine: boolean;
}

/** Chỉ lần giữ vì điểm hay cổng cứng mới đếm vào "bị giữ nhiều" (câu 15). */
export const HELD_MANY_CAUSES: readonly ScreeningCause[] = ['score', 'gate'];

const hold = (cause: ScreeningCause): Decision => ({
  outcome: 'hold',
  cause,
  restrictMachine: false,
});
const pass = (outcome: ScreeningOutcome, restrictMachine = false): Decision => ({
  outcome,
  cause: 'score',
  restrictMachine,
});

/** Máy không có đủ kết quả: chấm hay kiểm ảnh lỗi, hoặc quá hạn chờ ảnh của lưới an toàn. */
export type Failure = Extract<ScreeningCause, 'error' | 'timeout'>;

/**
 * Kết luận một lượt (design mục 5 bước 4): lỗi → cổng cứng đang bật → luôn duyệt tay → đánh dấu thiết bị → ma trận dải ×
 * mức tin cậy. Máy không bao giờ từ chối (TK 13). `tier` `null` = chấm chữ lỗi, không đọc được mức — đi cùng `failure`.
 */
export function decide(input: {
  failure: Failure | null;
  hits: readonly AppliedHit[];
  alwaysManual: boolean;
  deviceFlagged: boolean;
  band: ScreeningBand;
  tier: TrustTier | null;
  placement: ListingPlacement;
}): Decision {
  if (input.failure) return hold(input.failure);
  if (input.hits.some((hit) => hit.mode === 'on' && isGate(hit.code))) return hold('gate');
  if (input.alwaysManual) return hold('always_manual');
  if (input.deviceFlagged) return hold('device');
  if (input.band === 'high' || input.tier === null) return hold('score');
  switch (input.tier) {
    case 'T0':
      if (input.band === 'medium') return hold('score');
      // Nơi công khai: hạn chế vì "tài khoản mới" do `listing` đặt, không mang lý do "máy" (spec risk-scoring).
      return pass(input.placement === 'members_only' ? 'pass_full' : 'pass_limited');
    case 'T1':
      return input.band === 'medium' ? pass('pass_limited', true) : pass('pass_full');
    default:
      return pass('pass_full');
  }
}

export interface Verdict extends Decision {
  score: number;
  band: ScreeningBand;
  hits: AppliedHit[];
  explanation: Explanation | null;
}

/**
 * Chuỗi thuần của một lượt khi đã đủ chữ và mọi ảnh: áp luật theo danh mục đã chọn → điểm → dải → kết luận → câu báo.
 * Tin luôn giữ vẫn được chấm đủ (spec hard-gates) — điểm, dải, `hits` ghi như mọi lượt.
 */
export function conclude(input: {
  raw: readonly RawHit[];
  book: RuleBook;
  categoryId: string;
  failure: Failure | null;
  alwaysManual: boolean;
  deviceFlagged: boolean;
  tier: TrustTier | null;
  placement: ListingPlacement;
}): Verdict {
  const hits = applyRules(input.raw, input.book, input.categoryId);
  const score = scoreOf(hits);
  const band = bandOf(score, input.book, input.categoryId);
  const decision = decide({ ...input, hits, band });
  const explanation = explain({ ...decision, hits, recall: false });
  return { ...decision, score, band, hits, explanation };
}
