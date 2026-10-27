import type {
  ListingHideReason,
  ListingPlacement,
  ListingRestriction,
  ListingState,
} from '@prisma/client';

/** Vai đẩy tin (add-admin-boost) — ghi vào nhật ký cùng lượt đẩy. */
export type BoostRole = 'master' | 'staff' | 'group_owner' | 'group_moderator';

/** Người xử việc của nhóm như `group.reviewersOf` trả: vai treo, tài khoản không hoạt động đã bị loại sẵn. */
export interface BoostReviewers {
  moderationAllowed: boolean;
  ownerId: string | null;
  /** `unitId` null = điều hành cả nhóm. */
  moderators: readonly { accountId: string; unitId: string | null }[];
}

export interface BoostScope {
  actorId: string;
  isMaster: boolean;
  listing: {
    placement: ListingPlacement | null;
    groupId: string | null;
    unitId: string | null;
    categoryId: string | null;
  };
  grant: { status: 'active' | 'suspended'; categoryIds: readonly string[] } | null;
  reviewers: BoostReviewers | null;
}

/**
 * Ai đẩy được tin nào (spec listing/boosting): master mọi tin; staff đang hoạt động tin sàn chung của danh mục được giao;
 * chủ nhóm, điều hành cả nhóm tin của nhóm; điều hành đơn vị tin của đơn vị mình. Tin sàn mang huy hiệu nhóm không cho
 * quản trị nhóm quyền gì. Cùng luật phạm vi nhóm với `groupRoleOver` của `review` — đổi một chỗ thì đổi cả hai.
 */
export function boostRole(scope: BoostScope): BoostRole | null {
  if (scope.isMaster) return 'master';
  const { listing } = scope;
  if (listing.placement === 'marketplace') {
    const active = scope.grant?.status === 'active';
    return active &&
      listing.categoryId !== null &&
      scope.grant?.categoryIds.includes(listing.categoryId)
      ? 'staff'
      : null;
  }
  if (listing.placement === null || listing.groupId === null) return null;
  const reviewers = scope.reviewers;
  if (!reviewers?.moderationAllowed) return null;
  if (reviewers.ownerId === scope.actorId) return 'group_owner';
  const covers = reviewers.moderators.some(
    (m) => m.accountId === scope.actorId && (m.unitId === null || m.unitId === listing.unitId),
  );
  return covers ? 'group_moderator' : null;
}

const STATE_BLOCKS: Record<Exclude<ListingState, 'live'>, string> = {
  draft: 'Tin còn là bản nháp',
  checking: 'Tin đang được máy kiểm',
  pending: 'Tin đang chờ duyệt',
  rejected: 'Tin đã bị từ chối',
  removed: 'Tin đã bị gỡ',
  sold: 'Tin đã bán',
  expired: 'Tin đã hết hạn',
};

/**
 * Câu từ chối đẩy lên đầu / đặt nổi bật, `null` = đẩy được: chỉ tin đang hiển thị đầy đủ, không tạm ẩn. Kiểm trạng
 * thái trước, tạm ẩn, rồi hạn chế — câu luôn nói lý do nặng nhất.
 */
export function boostBlock(listing: {
  state: ListingState;
  hideReasons: readonly ListingHideReason[];
  restrictions: readonly ListingRestriction[];
}): string | null {
  if (listing.state !== 'live') return STATE_BLOCKS[listing.state];
  if (listing.hideReasons.length > 0) return 'Tin đang tạm ẩn';
  if (listing.restrictions.length > 0) {
    return 'Tin đang hiển thị hạn chế — chỉ tin hiển thị đầy đủ mới đẩy được';
  }
  return null;
}

const HOUR_MS = 3_600_000;

/** Mốc đẩy lên đầu lại được; `null` = đẩy được ngay. Thời gian chờ tính từ lần đẩy trước, bất kể ai đẩy. */
export function bumpRetryAt(
  lastBumpedAt: Date | null,
  cooldownHours: number,
  now: Date,
): Date | null {
  if (lastBumpedAt === null) return null;
  const retryAt = new Date(lastBumpedAt.getTime() + cooldownHours * HOUR_MS);
  return retryAt > now ? retryAt : null;
}

/** Hạn nổi bật đã qua đọc như không nổi bật — không việc nền nào dọn cột (design add-admin-boost mục 2). */
export const activeFeaturedUntil = (featuredUntil: Date | null, now: Date): Date | null =>
  featuredUntil !== null && featuredUntil > now ? featuredUntil : null;
