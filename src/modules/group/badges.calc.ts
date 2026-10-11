import type { GroupJoinPath, GroupMode, GroupState } from '@prisma/client';

/** Bấm tham gia không chứng minh gì — ai cũng vào được, nên không bao giờ có huy hiệu (TK 10). */
const REVIEWED_PATHS: ReadonlySet<GroupJoinPath> = new Set([
  'approved',
  'invited',
  'roster',
  'assigned',
]);

/**
 * Quyền mang huy hiệu là hàm thuần, không lưu: "tính lại ngay" khi nhóm đổi chế độ hay công tắc (spec badges) đúng
 * theo cấu tạo. Tạm khoá không đổi quyền — tin đăng (đợt 2) chỉ ẩn huy hiệu lúc hiển thị.
 */
export function badgeEligible(
  member: { joinedVia: GroupJoinPath },
  group: { state: GroupState; mode: GroupMode; showNameOnMarketplace: boolean },
): boolean {
  if (group.state === 'closed' || !REVIEWED_PATHS.has(member.joinedVia)) return false;
  if (group.mode === 'public_review') return true;
  return (
    (group.mode === 'private_code' || group.mode === 'private_invite') &&
    group.showNameOnMarketplace
  );
}
