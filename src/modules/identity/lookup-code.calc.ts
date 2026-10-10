import { randomBytes } from 'node:crypto';

/** Crockford base32: không I, L, O, U — đọc qua điện thoại không nhầm với 1 và 0. */
export const LOOKUP_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LOOKUP_CODE_LENGTH = 8;
const RANDOM_BYTES = 5;

/**
 * 5 byte ngẫu nhiên = 40 bit = 8 ký tự × 5 bit: mã không mang thông tin gì về loại đánh dấu,
 * tài khoản hay thiết bị (TK 8) — chỉ là khoá tra cứu. `random` tiêm được để test kiểm bảng chữ.
 */
export function generateLookupCode(random: (bytes: number) => Buffer = randomBytes): string {
  let value = 0n;
  for (const byte of random(RANDOM_BYTES)) value = (value << 8n) | BigInt(byte);

  let code = '';
  for (let index = 0; index < LOOKUP_CODE_LENGTH; index += 1) {
    code = LOOKUP_CODE_ALPHABET.charAt(Number(value & 31n)) + code;
    value >>= 5n;
  }
  return code;
}

/** Người dùng gõ mã từ màn hình: chấp nhận chữ thường, khoảng trắng, gạch nối và I/L/O lẫn với 1/0. */
export function normalizeLookupCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replaceAll('I', '1')
    .replaceAll('L', '1')
    .replaceAll('O', '0');
}
