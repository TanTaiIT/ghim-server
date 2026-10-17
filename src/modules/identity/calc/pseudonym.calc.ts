import { hmacHex } from '../../../common/crypto/secrets.js';

/**
 * Mã giả thay mã tài khoản khi ẩn danh hoá gậy và nhật ký liên quan (TK 25, add-data-retention): HMAC-SHA256 với khoá
 * nằm ngoài DB, cắt thành một UUID — cùng người luôn ra cùng mã (gậy của một người vẫn gom được), không ai dò ngược nếu
 * không có khoá. Nibble version `4` / variant `8` để cột uuid nhận và không bao giờ trùng uuidv7 của tài khoản thật.
 */
export function pseudonymOf(accountId: string, key: string): string {
  const hex = hmacHex(key, 'pseudonym', accountId).slice(0, 32);
  const body = `${hex.slice(0, 12)}4${hex.slice(13, 16)}8${hex.slice(17, 32)}`;
  return `${body.slice(0, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}-${body.slice(16, 20)}-${body.slice(20)}`;
}
