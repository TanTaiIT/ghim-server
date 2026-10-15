import type { ListingHideReason, ListingPlacement, ListingState } from '@prisma/client';

/**
 * Thứ tự cố định khi ghi mảng lý do: hai sự kiện tới theo thứ tự nào cũng ra cùng một mảng, nên bên nghe chạy lại hay
 * nhận trùng không đổi gì (CLAUDE.md luật 12: không dựa vào thứ tự giữa các sự kiện).
 */
const ORDER: readonly ListingHideReason[] = [
  'account_locked',
  'account_deleted',
  'left_group',
  'removed_from_group',
  'group_banned',
  'group_locked',
  'category_disabled',
  'group_closed',
  'group_privatized',
  'detached_by_group',
];

/** Rời nhóm hẳn: không lý do nào gỡ được, người đăng chỉ chuyển tin lên sàn chung thành tin mới (TK 9, 10, 17). */
export const DETACHED_REASONS: ReadonlySet<ListingHideReason> = new Set([
  'group_closed',
  'group_privatized',
  'detached_by_group',
]);

/** Lý do gắn với nhóm mà tin đang ở; tin đổi nơi đăng ra khỏi nhóm đó thì rơi theo (D3). */
const GROUP_REASONS: ReadonlySet<ListingHideReason> = new Set([
  'left_group',
  'removed_from_group',
  'group_banned',
  'group_locked',
]);

export type HideEvent =
  | { kind: 'account_locked' | 'account_unlocked' | 'account_deleted' }
  | {
      kind: 'member_left';
      reason: 'left' | 'removed' | 'banned' | 'account_deleted';
      /** Công tắc "nhận tin người ngoài" đúng lúc rời — không đọc lại lúc xử (proposal Impact). */
      allowOutsiders: boolean;
    }
  | { kind: 'member_joined' | 'ban_created' | 'ban_lifted' }
  | { kind: 'group_locked' | 'group_unlocked' | 'group_closed' }
  | { kind: 'category_disabled' | 'category_enabled' }
  | { kind: 'detached_by_group' | 'outsider_privatized' };

export interface HideTarget {
  state: ListingState;
  placement: ListingPlacement | null;
  hideReasons: readonly ListingHideReason[];
}

export interface HideChange {
  hideReasons: ListingHideReason[];
  /** Tin vừa rời nhóm hẳn — ghi `left_group_at`, mốc của hạn chuyển lên sàn chung. */
  detachedNow: boolean;
}

const sorted = (reasons: Iterable<ListingHideReason>): ListingHideReason[] => {
  const set = new Set(reasons);
  return ORDER.filter((reason) => set.has(reason));
};

function addAndRemove(
  event: HideEvent,
  target: HideTarget,
): [ListingHideReason[], ListingHideReason[]] {
  switch (event.kind) {
    case 'account_locked':
      return [['account_locked'], []];
    case 'account_unlocked':
      return [[], ['account_locked']];
    case 'account_deleted':
      return [['account_deleted'], []];
    case 'member_left': {
      // Xoá tài khoản đã có lý do riêng; tin sàn chung không thuộc nhóm nên không bị đụng.
      if (event.reason === 'account_deleted') return [[], []];
      const hides =
        target.placement === 'members_only' ||
        (target.placement === 'group_public' && !event.allowOutsiders);
      const reason = event.reason === 'left' ? 'left_group' : 'removed_from_group';
      return [hides ? [reason] : [], []];
    }
    case 'member_joined':
      return [[], ['left_group', 'removed_from_group']];
    case 'ban_created':
      return [['group_banned'], []];
    case 'ban_lifted':
      return [[], ['group_banned']];
    case 'group_locked':
      return [['group_locked'], []];
    case 'group_unlocked':
      return [[], ['group_locked']];
    case 'group_closed':
      return [['group_closed'], []];
    case 'category_disabled':
      return [['category_disabled'], []];
    case 'category_enabled':
      return [[], ['category_disabled']];
    case 'detached_by_group':
      return [['detached_by_group'], []];
    case 'outsider_privatized':
      return [['group_privatized'], []];
  }
}

/**
 * Lý do tạm ẩn sau một sự kiện; `null` = tin không đổi. Lý do chỉ ĐẶT lên tin đã rời nháp (nháp không ai thấy, gửi
 * nháp kiểm lại nhóm và danh mục — D7), nhưng GỠ ở mọi tin đang mang nó.
 */
export function applyHideEvent(target: HideTarget, event: HideEvent): HideChange | null {
  const [add, remove] = addAndRemove(event, target);
  const adding = target.state === 'draft' ? [] : add;
  const next = sorted(
    [...target.hideReasons, ...adding].filter((reason) => !remove.includes(reason)),
  );
  if (
    next.length === target.hideReasons.length &&
    next.every((r) => target.hideReasons.includes(r))
  ) {
    return null;
  }
  const wasDetached = target.hideReasons.some((r) => DETACHED_REASONS.has(r));
  return {
    hideReasons: next,
    detachedNow: !wasDetached && next.some((r) => DETACHED_REASONS.has(r)),
  };
}

export const isDetached = (reasons: readonly ListingHideReason[]): boolean =>
  reasons.some((reason) => DETACHED_REASONS.has(reason));

/** Người đăng đổi nơi đăng ra khỏi nhóm cũ: lý do của nhóm ấy rơi theo, lý do tài khoản và danh mục giữ (D3). */
export const dropGroupReasons = (reasons: readonly ListingHideReason[]): ListingHideReason[] =>
  sorted(reasons.filter((reason) => !GROUP_REASONS.has(reason)));
