import type { ListingState, ListingSubmissionKind } from '@prisma/client';

const HOUR_MS = 3_600_000;

/** Lượt gửi làm số tin sống thay đổi thế nào (spec trust/quotas, design add-trust-tiers mục 6). */
export type LiveEffect = 'adds' | 'keeps' | 'none';

/**
 * Gửi tin mới, chuyển lên sàn chung, gia hạn tin hết hạn, gửi lại tin bị từ chối / bị gỡ đưa thêm một tin vào số tin
 * sống. Gia hạn sớm giữ nguyên chỗ nhưng không được khi đang vượt trần. Sửa tin đang hiển thị / chờ duyệt không xét trần.
 */
export function liveEffect(kind: ListingSubmissionKind, fromState: ListingState): LiveEffect {
  if (kind === 'renew_early') return 'keeps';
  if (kind === 'resubmit')
    return fromState === 'rejected' || fromState === 'removed' ? 'adds' : 'none';
  return 'adds';
}

export interface QuotaSettings {
  liveCap: number;
  perHour: number;
  outsiderPerGroup: number;
}

export interface QuotaFacts {
  live: number;
  /** Lúc của từng lượt gửi trong một giờ gần nhất (cửa sổ trượt). */
  recentSubmissions: readonly Date[];
  /** Tin sống của người này trong nhóm đích — chỉ khi gửi vào nhóm với tư cách người ngoài. */
  outsiderLiveInGroup: number | null;
}

export type QuotaDecision =
  | { ok: true }
  | { ok: false; code: 'LISTING_QUOTA_EXCEEDED' | 'OUTSIDER_QUOTA_EXCEEDED' }
  | { ok: false; code: 'SUBMISSION_RATE_LIMITED'; retryAt: Date };

/**
 * Thứ tự: hết chỗ trước, rồi trần người ngoài, rồi nhịp gửi — chờ thêm giờ không giải được hết chỗ, nên báo cái người
 * dùng phải tự xử trước.
 */
export function quotaDecision(input: {
  effect: LiveEffect;
  facts: QuotaFacts;
  settings: QuotaSettings;
  now: Date;
}): QuotaDecision {
  const { effect, facts, settings, now } = input;
  const overCap =
    (effect === 'adds' && facts.live >= settings.liveCap) ||
    (effect === 'keeps' && facts.live > settings.liveCap);
  if (overCap) return { ok: false, code: 'LISTING_QUOTA_EXCEEDED' };
  if (
    effect === 'adds' &&
    facts.outsiderLiveInGroup !== null &&
    facts.outsiderLiveInGroup >= settings.outsiderPerGroup
  ) {
    return { ok: false, code: 'OUTSIDER_QUOTA_EXCEEDED' };
  }
  const recent = facts.recentSubmissions
    .map((at) => at.getTime())
    .filter((at) => at > now.getTime() - HOUR_MS)
    .toSorted((a, b) => a - b);
  if (recent.length >= settings.perHour) {
    // Lượt sớm nhất phải rời cửa sổ để còn chỗ: với 5 lượt trên trần 3, đó là lượt thứ ba tính từ cuối.
    const freeing = recent[recent.length - settings.perHour] ?? now.getTime();
    return { ok: false, code: 'SUBMISSION_RATE_LIMITED', retryAt: new Date(freeing + HOUR_MS) };
  }
  return { ok: true };
}
