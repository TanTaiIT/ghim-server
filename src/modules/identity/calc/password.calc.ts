import { readFileSync } from 'node:fs';

import { hash, verify } from 'argon2';

export type PasswordIssue = 'too_short' | 'too_long' | 'common';

export interface PasswordLimits {
  min: number;
  max: number;
}

/**
 * 10.000 mật khẩu phổ biến nhất (SecLists), nạp MỘT lần lúc import: vài trăm KB, rẻ hơn mọi lượt
 * đọc lại, và thiếu file thì lộ ngay lúc khởi động chứ không ở lượt đăng ký đầu tiên. Danh sách đi
 * kèm phần mềm, không cập nhật lúc chạy (TK 7) — `pnpm run build` chép thư mục `data/` sang dist.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  readFileSync(new URL('../data/common-passwords.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
);

/** Độ dài đếm theo ký tự người dùng thấy, không theo byte — "Mật khẩu" là 8 ký tự. */
export function checkPassword(password: string, limits: PasswordLimits): PasswordIssue | null {
  const length = [...password].length;
  if (length < limits.min) return 'too_short';
  if (length > limits.max) return 'too_long';
  if (COMMON_PASSWORDS.has(password) || COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'common';
  }
  return null;
}

/** argon2id với tham số mặc định của thư viện — chuỗi băm tự mang tham số nên nâng sau không phải chuyển đổi. */
export const hashPassword = (password: string): Promise<string> => hash(password);

export const verifyPassword = (passwordHash: string, password: string): Promise<boolean> =>
  verify(passwordHash, password);
