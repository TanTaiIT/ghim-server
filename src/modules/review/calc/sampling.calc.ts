import type { TrustTier } from '@prisma/client';

/** TK 16 "mẫu theo rủi ro": mọi tin điểm 45–59 — khoảng này không nằm trong bảng con số, chỉ tỉ lệ thì có. */
export const BORDERLINE_SCORE = { from: 45, to: 59 } as const;

export interface SamplePercents {
  borderline: number;
  newAccount: number;
  other: number;
}

/**
 * Tỉ lệ lấy mẫu theo rủi ro của một tin vừa lên bảng (TK 16): điểm 45–59 trước, rồi tin của T0 và T1, rồi phần còn
 * lại. Tin do người duyệt cho lên dùng điểm và mức của lượt máy đã giữ nó.
 */
export function riskSamplePercent(
  input: { score: number | null; tier: TrustTier | null },
  percents: SamplePercents,
): number {
  const { score, tier } = input;
  if (score !== null && score >= BORDERLINE_SCORE.from && score <= BORDERLINE_SCORE.to) {
    return percents.borderline;
  }
  if (tier === 'T0' || tier === 'T1') return percents.newAccount;
  return percents.other;
}

/** `roll` trong [0, 100) — tiêm được để test, production lấy từ `Math.random() * 100`. */
export const sampled = (percent: number, roll: number): boolean => roll < percent;
