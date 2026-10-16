import type { ReportCategory, ReportVerdict, ReviewReason, TrustTier } from '@prisma/client';

const HOUR_MS = 3_600_000;

/** Báo cáo liên quan hiện cho người xử — mới trước, kể cả đã đóng (chốt 16/10/2026). */
export const RELATED_REPORTS = 10;
const DAY_MS = 24 * HOUR_MS;

/** Hai loại có thể dẫn tới gậy nghiêm trọng: luôn tới staff, thắng khi gộp (TK 23). */
export const SEVERE_CATEGORIES: ReadonlySet<ReportCategory> = new Set(['fraud', 'prohibited']);

export const reportReason = (category: ReportCategory): ReviewReason =>
  SEVERE_CATEGORIES.has(category) ? 'report_severe' : 'report';

const TIER_RANK: Readonly<Record<TrustTier, number>> = { T0: 0, T1: 1, T2: 2, T3: 3 };

export interface ReportRules {
  autoHideReporters: number;
  autoHideDevices: number;
  autoHideMinTier: number;
  autoHideWindowHours: number;
  /** Điểm dưới −N: lượt báo không tính ngưỡng, báo cáo xếp cuối hàng. */
  scoreIgnoreBelowMinus: number;
  /** Điểm dưới −N: mất quyền báo cáo `loseRightDays` ngày. */
  scoreLoseRightBelowMinus: number;
  loseRightDays: number;
}

/** Điểm bình thường: từ −N trở lên (TK 23). */
export const normalScore = (score: number, rules: ReportRules): boolean =>
  score >= -rules.scoreIgnoreBelowMinus;

/** Lượt báo đủ điều kiện đếm vào ngưỡng tạm ẩn — chụp lúc báo, không tính lại khi điểm hay mức đổi. */
export const countsForHide = (
  input: { deviceHash: string | null; tier: TrustTier; score: number },
  rules: ReportRules,
): boolean =>
  input.deviceHash !== null &&
  TIER_RANK[input.tier] >= rules.autoHideMinTier &&
  normalScore(input.score, rules);

/**
 * Ngưỡng tạm ẩn xét ở lượt báo vừa tới: trong cửa sổ kết thúc lúc này có đủ người đủ điều kiện, từ đủ máy khác nhau.
 * Mỗi người một lượt trong một báo cáo, nên đếm lượt là đếm người.
 */
export function reachesHideThreshold(
  entries: readonly { deviceHash: string | null; countsForHide: boolean; createdAt: Date }[],
  now: Date,
  rules: ReportRules,
): boolean {
  const since = now.getTime() - rules.autoHideWindowHours * HOUR_MS;
  const eligible = entries.filter(
    (entry) =>
      entry.countsForHide && entry.deviceHash !== null && entry.createdAt.getTime() >= since,
  );
  const devices = new Set(eligible.map((entry) => entry.deviceHash));
  return eligible.length >= rules.autoHideReporters && devices.size >= rules.autoHideDevices;
}

/** Cộng / trừ một điểm theo kết quả của từng lượt báo (TK 23). */
export const scoreDelta = (verdict: ReportVerdict): number => (verdict === 'upheld' ? 1 : -1);

/**
 * Bị bác mà điểm sau đó dưới ngưỡng thì mất quyền tính từ lần bác này — bị bác tiếp khi vẫn dưới ngưỡng thì gia hạn;
 * điểm không tự đặt lại (chốt 16/10/2026).
 */
export const suspendedUntilAfter = (
  verdict: ReportVerdict,
  score: number,
  at: Date,
  rules: ReportRules,
): Date | null =>
  verdict === 'dismissed' && score < -rules.scoreLoseRightBelowMinus
    ? new Date(at.getTime() + rules.loseRightDays * DAY_MS)
    : null;

/** Lượt báo thứ `perHour + 1` trong 60 phút: báo tiếp được khi lượt sớm nhất trong cửa sổ ra khỏi nó. */
export function rateLimitedUntil(recent: readonly Date[], now: Date, perHour: number): Date | null {
  const since = now.getTime() - HOUR_MS;
  const inWindow = recent
    .filter((at) => at.getTime() > since)
    .toSorted((a, b) => a.getTime() - b.getTime());
  if (inWindow.length < perHour) return null;
  const oldest = inWindow[inWindow.length - perHour];
  return oldest ? new Date(oldest.getTime() + HOUR_MS) : null;
}
