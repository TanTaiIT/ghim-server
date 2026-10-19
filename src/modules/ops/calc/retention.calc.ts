import type { StrikeFact } from '../../trust/strike/strike.service.js';

export const DAY_MS = 86_400_000;
export const YEAR_MS = 365 * DAY_MS;

export const before = (now: Date, ms: number): Date => new Date(now.getTime() - ms);

/**
 * Mốc một gậy "đóng" với tạm giữ bằng chứng (spec evidence-hold): hết hạn, bị huỷ, hay đã gỡ khoá vĩnh viễn. `null` = còn
 * mở — đang hiệu lực, nghiêm trọng chờ master, hay khoá vĩnh viễn chưa gỡ.
 */
export function strikeClosedAt(fact: StrikeFact): Date | null {
  switch (fact.status) {
    case 'expired':
      return fact.expiresAt;
    case 'cancelled':
      return fact.cancelledAt;
    case 'lifted':
      return fact.liftedAt;
    default:
      return null;
  }
}

/** Gậy giữ dữ liệu dính tới nó khi còn mở, khiếu nại còn chờ, hay đóng sau `since` (= bây giờ − 30 ngày). */
export function strikeHolds(fact: StrikeFact, since: Date): boolean {
  if (fact.appealPending) return true;
  const closedAt = strikeClosedAt(fact);
  return closedAt === null || closedAt > since;
}

export interface ViolationRules {
  /** 30 ngày sau khi gậy thường / nặng đóng (TK 25). */
  graceMs: number;
  /** 2 năm kể từ ngày khoá với gậy nghiêm trọng khoá vĩnh viễn (TK 22, 25). */
  seriousMs: number;
}

/**
 * Mốc xoá hẳn tin bị từ chối / gỡ vì vi phạm theo gậy mới nhất của nó: khoá vĩnh viễn (kể cả đã gỡ) tính từ ngày khoá;
 * gậy khác tính từ lúc đóng. `null` = chưa có mốc (gậy còn hiệu lực hay chờ master).
 */
export function violationPurgeAt(fact: StrikeFact, rules: ViolationRules): Date | null {
  if (fact.status === 'permanent' || fact.status === 'lifted') {
    return new Date(fact.issuedAt.getTime() + rules.seriousMs);
  }
  const closedAt = strikeClosedAt(fact);
  return closedAt === null ? null : new Date(closedAt.getTime() + rules.graceMs);
}
