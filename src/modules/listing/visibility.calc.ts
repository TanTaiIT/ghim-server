import type {
  ListingHideReason,
  ListingPlacement,
  ListingRestriction,
  ListingState,
} from '@prisma/client';

/**
 * Nơi một tin có thể hiện ra. `category` = xem danh mục không có từ khoá; `search` / `group_search` = có từ khoá —
 * tin hạn chế chỉ tìm thấy khi người xem chủ động gõ (TK 15).
 */
export type Surface =
  'link' | 'feed' | 'category' | 'search' | 'suggest' | 'group_feed' | 'group_search' | 'profile';

export interface VisibleListing {
  ownerId: string;
  state: ListingState;
  placement: ListingPlacement | null;
  groupId: string | null;
  hideReasons: readonly ListingHideReason[];
  restrictions: readonly ListingRestriction[];
  deletedAt: Date | null;
}

export interface Viewer {
  accountId: string | null;
  /** Nhóm người xem đang là thành viên — phạm vi của tin "chỉ thành viên". */
  memberGroupIds: ReadonlySet<string>;
}

/** Tin đã bán, hết hạn vẫn mở được bằng đường link (TK 12); mọi bề mặt danh sách chỉ lấy tin đang hiển thị. */
const LINK_STATES: ReadonlySet<ListingState> = new Set(['live', 'sold', 'expired']);

/** Bề mặt nhận cả tin hạn chế; còn lại chỉ mức đầy đủ. */
const RESTRICTED_OK: ReadonlySet<Surface> = new Set(['link', 'search', 'group_search', 'profile']);

const MARKETPLACE_SURFACES: ReadonlySet<Surface> = new Set([
  'feed',
  'category',
  'search',
  'suggest',
]);
const GROUP_SURFACES: ReadonlySet<Surface> = new Set(['group_feed', 'group_search']);

/**
 * Luật duy nhất "ai thấy một tin" (CLAUDE.md luật 25). Người đăng luôn mở được tin của mình bằng đường link, trừ khi
 * đã xoá; trên các bề mặt danh sách, tin của chính mình theo cùng luật như với người khác. `groupId` là nhóm đang
 * xem, chỉ có nghĩa với bảng tin và tìm kiếm trong nhóm.
 */
export function canView(
  listing: VisibleListing,
  viewer: Viewer,
  surface: Surface,
  groupId: string | null = null,
): boolean {
  if (listing.deletedAt !== null) return false;
  if (surface === 'link' && viewer.accountId === listing.ownerId) return true;
  if (listing.hideReasons.length > 0) return false;
  const stateOk = surface === 'link' ? LINK_STATES.has(listing.state) : listing.state === 'live';
  if (!stateOk) return false;
  if (listing.restrictions.length > 0 && !RESTRICTED_OK.has(surface)) return false;

  switch (listing.placement) {
    case 'marketplace':
      return !GROUP_SURFACES.has(surface);
    case 'group_public':
      return !MARKETPLACE_SURFACES.has(surface) && inGroup(listing, surface, groupId);
    case 'members_only':
      return (
        listing.groupId !== null &&
        viewer.memberGroupIds.has(listing.groupId) &&
        !MARKETPLACE_SURFACES.has(surface) &&
        inGroup(listing, surface, groupId)
      );
    case null:
      return false;
  }
}

const inGroup = (listing: VisibleListing, surface: Surface, groupId: string | null): boolean =>
  !GROUP_SURFACES.has(surface) || listing.groupId === groupId;
