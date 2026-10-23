import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface SecretBox {
  seal(plain: string): string;
  open(sealed: string): string;
}

/**
 * AES-256-GCM với khoá 32 byte từ `SECRETS_ENCRYPTION_KEY` (`env.ts` đã kiểm độ dài). Chỉ cho dữ
 * liệu phải ĐỌC LẠI được — số giấy tờ; thứ chỉ cần so trùng (token, mã xác nhận) thì
 * băm, không mã hoá.
 *
 * Bản mã = base64(iv ‖ tag ‖ ciphertext). iv ngẫu nhiên mỗi lần nên hai lần seal cùng chuỗi ra hai
 * bản khác nhau — không ai đếm được hai người có cùng số giấy tờ qua bảng. Sai khoá hay bản mã bị
 * sửa thì tag không khớp: `open` ném, không bao giờ trả rác.
 */
export function createSecretBox(keyBase64: string): SecretBox {
  const key = Buffer.from(keyBase64, 'base64');
  return {
    seal(plain) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    open(sealed) {
      const raw = Buffer.from(sealed, 'base64');
      const decipher = createDecipheriv(ALGORITHM, key, raw.subarray(0, IV_BYTES));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const body = raw.subarray(IV_BYTES + TAG_BYTES);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    },
  };
}

/** SHA-256 hex cho token refresh: DB giữ băm, thiết bị giữ token — lộ bảng không lộ token. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const TOKEN_BYTES = 32;

/** Token ngẫu nhiên 256 bit, base64url để đi được trong header, cookie và JSON mà không mã hoá lại. */
export function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * HMAC-SHA256 hex với `scope` tách miền: băm email và băm thiết bị dùng chung `IDENTITY_HASH_KEY`
 * nhưng không bao giờ ra cùng giá trị cho cùng chuỗi vào.
 */
export function hmacHex(key: string, scope: string, value: string): string {
  return createHmac('sha256', key).update(`${scope}\u0000${value}`).digest('hex');
}
