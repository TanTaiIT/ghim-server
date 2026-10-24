/**
 * Lỗi NGHIỆP VỤ — thứ tầng service được phép ném ra, và là thứ duy nhất `errorHandler` dịch
 * thành response có mã lỗi.
 *
 * `code` tách khỏi `message` vì hai thứ phục vụ hai người đọc khác nhau: client `switch` theo
 * `code` để rẽ nhánh, còn `message` là câu cho người dùng đọc và được phép đổi bất cứ lúc nào.
 * Gộp làm một là buộc client so sánh chuỗi tiếng Việt.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    /** Dữ liệu cho app tự xử, không phải câu đọc — vd tin nào đang chiếm chỗ khi hết hạn mức tin sống. */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * `code` đổi được cho lỗi NGƯỜI DÙNG TỰ SỬA ĐƯỢC mà client cần rẽ nhánh: `PASSWORD_WEAK` hiện gợi
 * ý mật khẩu, `EMAIL_DISPOSABLE` bảo dùng email thường, `CODE_EXPIRED` mở nút gửi lại mã.
 */
export class BadRequestError extends AppError {
  constructor(
    message = 'Yêu cầu không hợp lệ',
    code = 'BAD_REQUEST',
    details?: Record<string, unknown>,
  ) {
    super(400, code, message, details);
  }
}

/**
 * `code` đổi được vì client phải phân biệt "đăng nhập lại" với "refresh rồi gọi lại":
 * `SESSION_REVOKED` / `SESSION_EXPIRED` xoá token và về màn đăng nhập, còn `UNAUTHORIZED` trần
 * (access token hết hạn, thiếu header) chỉ cần refresh.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Chưa đăng nhập', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}

/**
 * `code` đổi được vì client cần rẽ nhánh theo LÝ DO bị chặn, không chỉ biết là bị chặn:
 * `ACCOUNT_LOCKED` hiện màn "tài khoản đang bị khoá", `EMAIL_NOT_VERIFIED` đẩy sang màn nhập mã
 * xác nhận email — cả hai đều là 403.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Không đủ quyền', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy dữ liệu') {
    super(404, 'NOT_FOUND', message);
  }
}

/** `code` đổi được: `EMAIL_TAKEN` mở màn đăng nhập, `EMAIL_PENDING_DELETION` hiện ngày được đăng ký lại. */
export class ConflictError extends AppError {
  constructor(
    message = 'Dữ liệu đã tồn tại',
    code = 'CONFLICT',
    details?: Record<string, unknown>,
  ) {
    super(409, code, message, details);
  }
}

/**
 * `code` riêng để client hiện đúng câu "thử lại sau": `LOGIN_LOCKED` thay vì "sai mật khẩu",
 * `SUBMIT_COOLDOWN` (dính cổng cứng 3 lần trong 24 giờ) thay vì "tin không hợp lệ".
 */
export class TooManyRequestsError extends AppError {
  constructor(
    message = 'Thao tác quá nhanh, thử lại sau',
    code = 'TOO_MANY_REQUESTS',
    details?: Record<string, unknown>,
  ) {
    super(429, code, message, details);
  }
}
