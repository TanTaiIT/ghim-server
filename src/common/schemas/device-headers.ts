import { z } from 'zod';

/**
 * Mã máy của app (D2), tuỳ chọn ở tầng schema: ở `listing`, thiếu header ra đúng 400 ở bước 3 của thứ tự kiểm (design
 * add-listings mục 5), sau 404 và `INVALID_TRANSITION` — schema chặn sớm thì thứ tự lỗi đổi theo header. Đăng nhập
 * dùng cùng schema (add-login-device-marks): có thì ghi dấu máy, không có thì thôi.
 */
export const deviceHeadersSchema = z.object({
  'x-device-id': z.string().trim().max(200).optional(),
});
