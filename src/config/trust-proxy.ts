import { isIP } from 'node:net';

/** Giá trị đi thẳng vào option `trustProxy` của Fastify. */
export type TrustProxy = false | string[];

/** Dải đặt tên sẵn của `proxy-addr` (thư viện Fastify dùng để đọc `X-Forwarded-For`). */
const NAMED_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

const isAddressOrRange = (entry: string): boolean => {
  if (NAMED_RANGES.has(entry)) return true;
  const [address, prefix, extra] = entry.split('/');
  if (!address || extra !== undefined) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
};

/**
 * `TRUST_PROXY` → `trustProxy`: `false` hoặc danh sách IP / CIDR / dải đặt tên, phân tách bằng dấu phẩy;
 * `null` = không hợp lệ. Từ chối hai dạng Fastify vẫn nhận: `true` cho client tự giả IP qua
 * `X-Forwarded-For`; số hop thì Fastify 5.12 cố ý không tin, nên mọi request mang IP của proxy.
 */
export function parseTrustProxy(raw: string): TrustProxy | null {
  const value = raw.trim();
  if (value === 'false') return false;
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 && entries.every(isAddressOrRange) ? entries : null;
}
