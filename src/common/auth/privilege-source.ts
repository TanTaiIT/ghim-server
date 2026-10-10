/**
 * Ba việc toàn hệ thống mà master giao thêm cho staff (TK 5): hỗ trợ người dùng, xử báo cáo về
 * người, duyệt giấy tờ. Tuple này là mặt HTTP của enum `staff_scope`; `platform` sở hữu dữ liệu.
 */
export const OPS_SCOPES = ['support', 'user_reports', 'id_verification'] as const;
export type OpsScope = (typeof OPS_SCOPES)[number];

/** `suspended` vẫn là "mang quyền staff" (hai lớp, trần 3 phiên) nhưng không làm được gì ở bàn vận hành. */
export type PermissionState = 'none' | 'active' | 'suspended';

/**
 * Cổng hỏi quyền staff. Dữ liệu là của `platform`; `identity` và guard chỉ hỏi qua đây, không đọc
 * bảng. Master không đi qua đây — vai `master` là cột của `accounts`, guard kiểm trực tiếp.
 */
export interface PrivilegeSource {
  permissionState(accountId: string): Promise<PermissionState>;
  /** Có việc toàn hệ thống `scope` và quyền đang hiệu lực. */
  hasStaffScope(accountId: string, scope: OpsScope): Promise<boolean>;
  /** Phụ trách danh mục `categoryId` và quyền đang hiệu lực. */
  hasCategoryScope(accountId: string, categoryId: string): Promise<boolean>;
  /** Có quyền staff, kể cả đang treo: quyết định hai lớp bắt buộc và trần 3 phiên lúc đăng nhập. */
  isStaff(accountId: string): Promise<boolean>;
}

/** Không ai là staff — cho test và cho lúc chưa nối `platform`. */
export const noStaffPrivilegeSource: PrivilegeSource = {
  permissionState: async () => 'none',
  hasStaffScope: async () => false,
  hasCategoryScope: async () => false,
  isStaff: async () => false,
};
