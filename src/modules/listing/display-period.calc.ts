import type { ListingHideReason, ListingRenewal, ListingState } from '@prisma/client';

export const DAY_MS = 86_400_000;

/** Các cột đồng hồ của một tin: `expires_at` khi đang chạy, `clock_remaining_ms` khi đang dừng, không bao giờ cả hai. */
export interface ListingClock {
  firstLiveAt: Date | null;
  expiresAt: Date | null;
  clockRemainingMs: bigint | null;
  shownMs: bigint;
  shownSince: Date | null;
  renewal: ListingRenewal | null;
}

export interface ClockSettings {
  visibleDays: number;
  renewExtendDays: number;
}

/**
 * Lý do tạm ẩn làm ngày hiển thị dừng: không do người đăng (TK 19). Tài khoản bị khoá và tự rời nhóm thì ngày vẫn
 * trôi — người đăng gây ra, hoặc tự chọn (chốt 12/10/2026).
 */
export const STOPS_CLOCK: ReadonlySet<ListingHideReason> = new Set([
  'removed_from_group',
  'group_banned',
  'group_locked',
  'category_disabled',
  'group_closed',
  'group_privatized',
  'detached_by_group',
  'account_deleted',
]);

/** Quyết định của người duyệt dừng ngày như một lý do ngoài người đăng (design D4). */
const DECISION_STATES: ReadonlySet<ListingState> = new Set(['rejected', 'removed']);

/** Dấu gia hạn chỉ sống khi tin chưa lên bảng lại (CHECK `listings_renewal_check`). */
const RENEWAL_STATES: ReadonlySet<ListingState> = new Set(['draft', 'checking', 'pending']);

/** Tin đã xong thì đồng hồ đứng nguyên: hết hạn giữ mốc đã hết, đã bán không còn ngày nào để đếm. */
const FINISHED_STATES: ReadonlySet<ListingState> = new Set(['sold', 'expired']);

const ms = (days: number): number => days * DAY_MS;
const plus = (at: Date, amount: number): Date => new Date(at.getTime() + amount);

/**
 * Đồng hồ sau một lần đổi trạng thái hay lý do tạm ẩn. Ngày hiển thị chạy qua lúc đang kiểm, chờ duyệt và nháp đã
 * từng lên bảng (design D4), nên sửa tin không làm mới hạn và tin hết ngày lúc đang chờ vẫn được xét rồi hết hạn ở
 * lượt chạy kế tiếp. `rankAt` = vị trí của tin cũ khi tin trùng lên bảng lần đầu (`add-screening`).
 */
export function nextClock(
  before: ListingClock,
  after: { state: ListingState; hideReasons: readonly ListingHideReason[] },
  now: Date,
  settings: ClockSettings,
  rankAt: Date | null = null,
): ListingClock {
  // Chỉ chép cột đồng hồ: người gọi truyền cả dòng tin rồi spread kết quả vào lượt ghi, chép cả dòng thì `state`,
  // `version` cũ đè lên giá trị mới.
  const clock: ListingClock = {
    firstLiveAt: before.firstLiveAt,
    expiresAt: before.expiresAt,
    clockRemainingMs: before.clockRemainingMs,
    shownMs: before.shownMs,
    shownSince: before.shownSince,
    renewal: before.renewal,
  };
  const goesLive = after.state === 'live';

  if (goesLive && clock.firstLiveAt === null) {
    clock.firstLiveAt = rankAt ?? now;
    clock.expiresAt = plus(now, ms(settings.visibleDays));
    clock.clockRemainingMs = null;
  } else if (goesLive && clock.renewal !== null) {
    // Gia hạn áp lúc tin lên bảng lại, không lúc yêu cầu: tin bị giữ rồi bị từ chối thì không được cộng ngày.
    const extend = ms(settings.renewExtendDays);
    if (clock.renewal === 'expired') {
      clock.expiresAt = plus(now, ms(settings.visibleDays));
      clock.clockRemainingMs = null;
    } else if (clock.expiresAt !== null) {
      clock.expiresAt = plus(clock.expiresAt, extend);
    } else if (clock.clockRemainingMs !== null) {
      clock.clockRemainingMs += BigInt(extend);
    }
  }
  // Gia hạn bị từ chối hay bị gỡ thì mất: sửa lại vì sai sót là một lượt gửi mới, gia hạn phải xin lại.
  if (!RENEWAL_STATES.has(after.state)) clock.renewal = null;

  if (clock.firstLiveAt !== null && !FINISHED_STATES.has(after.state)) {
    const runs =
      !DECISION_STATES.has(after.state) && !after.hideReasons.some((r) => STOPS_CLOCK.has(r));
    if (runs && clock.expiresAt === null && clock.clockRemainingMs !== null) {
      clock.expiresAt = plus(now, Number(clock.clockRemainingMs));
      clock.clockRemainingMs = null;
    } else if (!runs && clock.expiresAt !== null) {
      clock.clockRemainingMs = BigInt(clock.expiresAt.getTime() - now.getTime());
      clock.expiresAt = null;
    }
  }

  const shown = goesLive && after.hideReasons.length === 0;
  if (clock.shownSince !== null && !shown) {
    clock.shownMs += BigInt(now.getTime() - clock.shownSince.getTime());
    clock.shownSince = null;
  } else if (clock.shownSince === null && shown) {
    clock.shownSince = now;
  }
  return clock;
}

/** Thời gian hiển thị còn lại (âm = đã quá), `null` khi tin chưa từng lên bảng. */
export function remainingMs(clock: ListingClock, now: Date): number | null {
  if (clock.expiresAt !== null) return clock.expiresAt.getTime() - now.getTime();
  if (clock.clockRemainingMs !== null) return Number(clock.clockRemainingMs);
  return null;
}

/** Việc mỗi giờ chuyển sang hết hạn: chỉ tin đang hiển thị, đồng hồ đang chạy và đã tới hạn. */
export const isDue = (state: ListingState, clock: ListingClock, now: Date): boolean =>
  state === 'live' && clock.expiresAt !== null && clock.expiresAt.getTime() <= now.getTime();

/**
 * Gia hạn sớm chỉ trong `windowDays` cuối. Quá sớm thì trả lúc được gia hạn (HTTP 409 `RENEWAL_TOO_EARLY` kèm ngày
 * — spec display-period); đồng hồ đang dừng thì mốc đó tính như thể đồng hồ chạy lại từ bây giờ.
 */
export function renewEarlyCheck(
  clock: ListingClock,
  now: Date,
  windowDays: number,
): { ok: true } | { ok: false; opensAt: Date } {
  const left = remainingMs(clock, now);
  if (left === null) return { ok: false, opensAt: now };
  if (left <= ms(windowDays)) return { ok: true };
  return { ok: false, opensAt: plus(now, left - ms(windowDays)) };
}

/** Tổng thời gian tin đã được thấy tới `now`, kể cả khoảng đang mở — dữ kiện tin sạch của `trust` (design add-trust-tiers mục 5). */
export const shownMsAt = (clock: Pick<ListingClock, 'shownMs' | 'shownSince'>, now: Date): number =>
  Number(clock.shownMs) + (clock.shownSince ? now.getTime() - clock.shownSince.getTime() : 0);
