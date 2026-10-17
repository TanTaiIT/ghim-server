import type { StrikeKind, StrikeStatus } from '@prisma/client';

const DAY_MS = 86_400_000;

/** Con số của gậy (TK 21, 22, bảng con số phần 28) — phiên bản đang hiệu lực truyền vào, không đọc ở đây. */
export interface StrikeRules {
  normalPoints: number;
  normalDays: number;
  severePoints: number;
  severeDays: number;
  postingLockFromPoints: number;
  appealDays: number;
  seriousAppealDays: number;
  permanentReviewYears: number;
}

export interface StrikeLike {
  kind: StrikeKind;
  status: StrikeStatus;
  points: number;
  issuedAt: Date;
  expiresAt: Date | null;
}

/** Gậy nghiêm trọng không có điểm, không có hạn (TK 21). */
export const pointsOf = (kind: StrikeKind, rules: StrikeRules): number =>
  kind === 'normal' ? rules.normalPoints : kind === 'severe' ? rules.severePoints : 0;

export const expiresAtOf = (kind: StrikeKind, issuedAt: Date, rules: StrikeRules): Date | null => {
  if (kind === 'serious') return null;
  const days = kind === 'normal' ? rules.normalDays : rules.severeDays;
  return new Date(issuedAt.getTime() + days * DAY_MS);
};

/** Hiệu lực đọc là đúng ngay: tới hạn là hết, không chờ job (spec strikes "tự hết hiệu lực trong ngày đó"). */
export const inForce = (strike: StrikeLike, now: Date): boolean =>
  strike.status === 'active' && (strike.expiresAt === null || strike.expiresAt > now);

export interface Standing {
  /** Tổng điểm gậy thường, nặng đang hiệu lực. */
  points: number;
  /** Có gậy nào đang hiệu lực (kể cả nghiêm trọng chưa quyết) — trần T1, hàng "có gậy" của máy. */
  active: boolean;
  /** Có gậy nặng đang hiệu lực — tạm mất vai trong nhóm, chặn tự xoá tài khoản. */
  severe: boolean;
  /** Đang tạm khoá đăng tin: mốc điểm về dưới ngưỡng (hạn của gậy mà sau nó tổng còn lại < ngưỡng). */
  postingLockedUntil: Date | null;
}

/** Tình trạng gậy của một người tại `now`, thuần từ danh sách gậy. */
export function standingOf(
  strikes: readonly StrikeLike[],
  now: Date,
  rules: StrikeRules,
): Standing {
  const live = strikes.filter((strike) => inForce(strike, now));
  const points = live.reduce((sum, strike) => sum + strike.points, 0);
  let postingLockedUntil: Date | null = null;
  if (points >= rules.postingLockFromPoints) {
    const expiring = live
      .filter((strike) => strike.expiresAt !== null && strike.points > 0)
      .toSorted((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0));
    let remaining = points;
    for (const strike of expiring) {
      remaining -= strike.points;
      if (remaining < rules.postingLockFromPoints) {
        postingLockedUntil = strike.expiresAt;
        break;
      }
    }
  }
  return {
    points,
    active: live.length > 0,
    severe: live.some((strike) => strike.kind === 'severe'),
    postingLockedUntil,
  };
}

/** Cửa sổ khiếu nại tính từ lúc ra gậy (chốt 17/10/2026). */
export const appealOpen = (issuedAt: Date, now: Date, days: number): boolean =>
  now.getTime() <= issuedAt.getTime() + days * DAY_MS;

export const appealUntil = (issuedAt: Date, days: number): Date =>
  new Date(issuedAt.getTime() + days * DAY_MS);

/** Dữ kiện gậy cho mức tin cậy (spec trust-tiers): trần T1 khi còn hiệu lực; T3 đòi không gậy nào ra trong N ngày. */
export function tierStrikeFacts(
  strikes: readonly StrikeLike[],
  now: Date,
): { active: boolean; lastIssuedAt: Date | null } {
  const counted = strikes.filter(
    (strike) => strike.status !== 'cancelled' && strike.status !== 'lifted',
  );
  const last = counted.reduce<Date | null>(
    (latest, strike) => (latest === null || strike.issuedAt > latest ? strike.issuedAt : latest),
    null,
  );
  return { active: strikes.some((strike) => inForce(strike, now)), lastIssuedAt: last };
}
