import type { GroupMode, GroupState, ListingPlacement } from '@prisma/client';

/** Ảnh chụp nhóm đọc dưới khoá (`group.lockForPosting`): đổi chế độ, cấm, rời nhóm phải chờ lượt gửi này xong. */
export interface GroupPostingSnapshot {
  state: GroupState;
  mode: GroupMode;
  allowOutsiders: boolean;
  member: { unitId: string | null } | null;
  banned: boolean;
}

export type PlacementBlock =
  | 'GROUP_LOCKED'
  | 'GROUP_CLOSED'
  | 'GROUP_MODE_CHANGING'
  | 'GROUP_BANNED'
  | 'NOT_GROUP_MEMBER'
  | 'PLACEMENT_NOT_ALLOWED'
  | 'OUTSIDER_POSTS_DISABLED';

export type PlacementOutcome =
  { ok: true; unitId: string | null; outsider: boolean } | { ok: false; code: PlacementBlock };

const isPrivate = (mode: GroupMode): boolean =>
  mode === 'private_code' || mode === 'private_invite';

/**
 * Luật nơi đăng trong nhóm (TK 9, 10), theo thứ tự cố định của design mục 5 bước 5 để cùng một lượt sai luôn ra
 * cùng một lỗi. Nhóm đang chuyển sang riêng tư vẫn mang chế độ công khai cũ — chỉ mức "nhóm công khai" bị chặn
 * (cam kết 22), "chỉ thành viên" vẫn gửi được.
 */
export function decideGroupPlacement(
  placement: Exclude<ListingPlacement, 'marketplace'>,
  group: GroupPostingSnapshot,
): PlacementOutcome {
  if (group.state === 'locked') return { ok: false, code: 'GROUP_LOCKED' };
  if (group.state === 'closed') return { ok: false, code: 'GROUP_CLOSED' };
  if (group.state === 'going_private' && placement === 'group_public') {
    return { ok: false, code: 'GROUP_MODE_CHANGING' };
  }
  if (group.banned) return { ok: false, code: 'GROUP_BANNED' };
  if (placement === 'members_only' && !group.member) return { ok: false, code: 'NOT_GROUP_MEMBER' };
  if (placement === 'group_public' && isPrivate(group.mode)) {
    return { ok: false, code: 'PLACEMENT_NOT_ALLOWED' };
  }
  if (!group.member && !group.allowOutsiders) return { ok: false, code: 'OUTSIDER_POSTS_DISABLED' };
  return { ok: true, unitId: group.member?.unitId ?? null, outsider: !group.member };
}

export interface SubmittableFields {
  placement: ListingPlacement | null;
  groupId: string | null;
  title: string | null;
  price: bigint | null;
  categoryId: string | null;
  imageIds: readonly string[];
  provinceCode: number | null;
  wardCode: number | null;
}

/** Tên trường còn thiếu để gửi (400 `VALIDATION_ERROR` kèm danh sách). Mô tả không bắt buộc (chốt 12/10/2026). */
export function missingForSubmit(listing: SubmittableFields): string[] {
  const missing: string[] = [];
  if (!listing.placement) missing.push('placement');
  if (listing.placement && listing.placement !== 'marketplace' && !listing.groupId) {
    missing.push('groupId');
  }
  if (!listing.title?.trim()) missing.push('title');
  if (listing.price === null) missing.push('price');
  if (!listing.categoryId) missing.push('categoryId');
  if (listing.imageIds.length === 0) missing.push('images');
  return missing;
}

/** Tin sàn chung cần tỉnh và phường (400 `REGION_REQUIRED`); tin trong nhóm được bỏ trống khu vực. */
export const needsRegion = (listing: SubmittableFields): boolean =>
  listing.placement === 'marketplace' &&
  (listing.provinceCode === null || listing.wardCode === null);
