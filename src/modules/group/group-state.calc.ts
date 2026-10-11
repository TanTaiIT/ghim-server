import type { GroupLockCause, GroupMode, GroupState } from '@prisma/client';

/** Nhận người mới qua mọi đường. Thiếu chủ vẫn nhận: điều hành viên tiếp tục việc hằng ngày (TK 10). */
export const ACCEPTS_MEMBERS: ReadonlySet<GroupState> = new Set(['active', 'ownerless']);

/** Việc hằng ngày của quản trị: duyệt, mời, gỡ, cấm, xếp đơn vị, danh sách lớp, thông báo. Tạm khoá thì chỉ đọc. */
export const ALLOWS_MODERATION: ReadonlySet<GroupState> = new Set([
  'active',
  'ownerless',
  'going_private',
]);

/** Cài đặt, chế độ, đơn vị, mã, vai là quyền riêng của chủ nhóm; lúc thiếu chủ chỉ master làm được (TK 10). */
export function allowsSettings(state: GroupState, byMaster: boolean): boolean {
  return state === 'active' || (byMaster && state === 'ownerless');
}

export const LOCKABLE: ReadonlySet<GroupState> = new Set(['active', 'ownerless']);

/** Master đóng được cả nhóm chưa có chủ và nhóm thiếu chủ; chủ nhóm đóng nhóm đang hoạt động hay đang khoá. */
export function closable(state: GroupState, byMaster: boolean): boolean {
  if (state === 'closed') return false;
  if (byMaster) return true;
  return state === 'active' || state === 'locked' || state === 'going_private';
}

/** Master giao chủ (lần đầu, nhóm thiếu chủ, giao đè, nhóm khoá cần chủ) — mọi trạng thái trừ đóng và đang chuyển. */
export const ASSIGNABLE: ReadonlySet<GroupState> = new Set([
  'pending_owner',
  'active',
  'ownerless',
  'locked',
]);

/** Khoá do hệ thống tự mở khi nhóm có chủ dùng được; khoá do master thì chỉ master mở. */
export const SYSTEM_LOCK_CAUSES: ReadonlySet<GroupLockCause> = new Set([
  'ownerless_timeout',
  'no_moderators',
]);

export const isPublicMode = (mode: GroupMode): boolean =>
  mode === 'public_open' || mode === 'public_review';

export type ModeChangePlan =
  | {
      kind: 'immediate';
      mode: GroupMode;
      /** Xét duyệt → mở cửa: đơn đang chờ huỷ, không tự duyệt (tự duyệt trao huy hiệu mà không ai xét). */
      cancelPendingRequests: boolean;
      code: 'generate' | 'clear';
      /** Đổi phía công khai ↔ riêng tư thì hai công tắc của phía cũ không còn nghĩa (CHECK của bảng). */
      resetSideSwitches: boolean;
    }
  | { kind: 'going_private'; targetMode: GroupMode };

/**
 * Công khai → riêng tư qua "đang chuyển" khi còn tin mức "nhóm công khai" (TK 9, cam kết 22); không còn tin
 * nào thì đổi ngay. `null` = không đổi gì.
 */
export function planModeChange(
  from: GroupMode,
  to: GroupMode,
  hasPublicListings: boolean,
): ModeChangePlan | null {
  if (from === to) return null;
  const toPublic = isPublicMode(to);
  if (isPublicMode(from) && !toPublic && hasPublicListings) {
    return { kind: 'going_private', targetMode: to };
  }
  return {
    kind: 'immediate',
    mode: to,
    cancelPendingRequests: from === 'public_review' && to === 'public_open',
    code: to === 'private_code' ? 'generate' : 'clear',
    resetSideSwitches: isPublicMode(from) !== toPublic,
  };
}
