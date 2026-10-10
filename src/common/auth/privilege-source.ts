/**
 * Việc của bàn vận hành mà staff được giao theo từng loại (TK 5). `platform` là chủ danh sách
 * này; `identity` mới cần hai việc đầu. Thêm việc = thêm vào tuple, `add-platform-roles` nối bảng.
 */
export const OPS_SCOPES = ['support', 'id_verification'] as const;
export type OpsScope = (typeof OPS_SCOPES)[number];

/**
 * Cổng hỏi quyền staff. Quyền là dữ liệu của `platform` (chưa có), nên `identity` không đọc bảng
 * mà hỏi qua interface này; `add-platform-roles` thay bản mặc định bằng bản đọc bảng quyền.
 * Master không đi qua đây — vai `master` là cột của `accounts`, guard kiểm trực tiếp.
 */
export interface PrivilegeSource {
  hasStaffScope(accountId: string, scope: OpsScope): Promise<boolean>;
  /** Có BẤT KỲ việc nào: quyết định hai lớp bắt buộc và trần 3 phiên lúc đăng nhập. */
  isStaff(accountId: string): Promise<boolean>;
}

/** Bản mặc định tới khi `platform` có bảng: chưa ai là staff. */
export const noStaffPrivilegeSource: PrivilegeSource = {
  hasStaffScope: async () => false,
  isStaff: async () => false,
};
