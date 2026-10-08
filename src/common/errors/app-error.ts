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
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Yêu cầu không hợp lệ') {
    super(400, 'BAD_REQUEST', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Chưa đăng nhập') {
    super(401, 'UNAUTHORIZED', message);
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

export class ConflictError extends AppError {
  constructor(message = 'Dữ liệu đã tồn tại') {
    super(409, 'CONFLICT', message);
  }
}

/**
 * `code` riêng để client hiện đúng câu "thử lại sau": `LOGIN_LOCKED` thay vì "sai mật khẩu",
 * `SUBMIT_COOLDOWN` (dính cổng cứng 3 lần trong 24 giờ) thay vì "tin không hợp lệ".
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Thao tác quá nhanh, thử lại sau', code = 'TOO_MANY_REQUESTS') {
    super(429, code, message);
  }
}
