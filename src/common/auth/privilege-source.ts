/**
 * Ba việc toàn hệ thống mà master giao thêm cho staff (TK 5): hỗ trợ người dùng, xử báo cáo về
 * người, duyệt giấy tờ. Tuple này là mặt HTTP của enum `staff_scope`; `platform` sở hữu dữ liệu.
 */
export const OPS_SCOPES = ['support', 'user_reports', 'id_verification'] as const;
export type OpsScope = (typeof OPS_SCOPES)[number];

/**
 * Quyền staff của một tài khoản, trọn gói. `suspended` vẫn là "mang quyền staff" (trần 3 phiên
 * lúc đăng nhập) nhưng không làm được gì ở bàn vận hành.
 */
export interface StaffGrantView {
  status: 'active' | 'suspended';
  scopes: readonly OpsScope[];
  categoryIds: readonly string[];
}

/**
 * Cổng hỏi quyền staff. Dữ liệu là của `platform`; `identity` và guard chỉ hỏi qua đây, không đọc
 * bảng. Master không đi qua đây — vai `master` là cột của `accounts`, guard kiểm trực tiếp. Trả cả
 * gói để người hỏi tự kiểm phạm vi trong bộ nhớ: một lượt đọc cho mỗi request bàn vận hành.
 */
export interface PrivilegeSource {
  /** `null` = không mang quyền staff. */
  staffGrant(accountId: string): Promise<StaffGrantView | null>;
}

/** Không ai là staff — cho test và cho lúc chưa nối `platform`. */
export const noStaffPrivilegeSource: PrivilegeSource = { staffGrant: async () => null };
