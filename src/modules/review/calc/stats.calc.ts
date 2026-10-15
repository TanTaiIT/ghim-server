import type { ReviewMachineJudgment, ReviewOutcome } from '@prisma/client';

/** Phần trăm một chữ số thập phân; mẫu số 0 thì chưa có tỉ lệ (`null`), không phải 0%. */
export function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part * 1000) / whole) / 10;
}

/**
 * Tỉ lệ bị lật của một người duyệt: trong các quyết định "đạt" của họ đã được hậu kiểm, phần người hậu kiểm gỡ tin hay
 * gỡ khỏi nhóm (TK 16, chốt 15/10/2026).
 */
export const overturnRate = (reviewed: number, overturned: number): number | null =>
  percentOf(overturned, reviewed);

export interface HeldDecision {
  /** Mã luật máy đã trúng lúc giữ tin. */
  hits: readonly string[];
  outcome: ReviewOutcome;
  judgment: ReviewMachineJudgment | null;
}

export interface RuleRate {
  code: string;
  decided: number;
  passed: number;
  overreach: number;
  passRate: number | null;
}

/**
 * Tỉ lệ máy quá tay theo từng luật (delta screening/rule-management): trên các tin máy giữ có trúng luật đã có quyết
 * định của người, phần người cho đạt; kèm số lần người xử ghi "máy quá tay". Một tin trúng hai luật tính cho cả hai.
 */
export function ruleRates(decisions: readonly HeldDecision[]): RuleRate[] {
  const byCode = new Map<string, { decided: number; passed: number; overreach: number }>();
  for (const decision of decisions) {
    for (const code of new Set(decision.hits)) {
      const row = byCode.get(code) ?? { decided: 0, passed: 0, overreach: 0 };
      row.decided += 1;
      if (decision.outcome === 'pass') row.passed += 1;
      if (decision.judgment === 'machine_overreach') row.overreach += 1;
      byCode.set(code, row);
    }
  }
  return [...byCode]
    .map(([code, row]) => ({ code, ...row, passRate: percentOf(row.passed, row.decided) }))
    .toSorted((a, b) => (b.passRate ?? -1) - (a.passRate ?? -1) || a.code.localeCompare(b.code));
}

/**
 * Tỉ lệ hậu kiểm làm xong của một tuần: trên các việc hàng 5 khép lại trong tuần — xử xong cộng tự huỷ vì quá hạn;
 * việc huỷ vì lý do khác không tính (chốt 15/10/2026).
 */
export const weeklyCompletion = (done: number, expired: number): number | null =>
  percentOf(done, done + expired);

export const completionAlert = (rate: number | null, threshold: number): boolean =>
  rate !== null && rate < threshold;
