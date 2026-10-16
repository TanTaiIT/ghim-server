import { hmacHex } from '../../../common/crypto/secrets.js';

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * MỘT hàm chuẩn hoá cho mọi chỗ so trùng và trước khi băm (CLAUDE.md luật 20): chữ thường, bỏ
 * `+tag`, Gmail bỏ dấu chấm ở phần tên và gộp `googlemail.com` về `gmail.com`. Dấu chấm ở miền
 * khác vẫn có nghĩa — chỉ Gmail coi `lan.hoang` và `lanhoang` là một hộp thư.
 */
export function normalizeEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 0) return lower;

  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replaceAll('.', '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

/** Băm email ĐÃ chuẩn hoá — băm bản gốc thì `lan+2@` và `lan@` ra hai dấu băm cho cùng một người. */
export function hashEmail(normalizedEmail: string, key: string): string {
  return hmacHex(key, 'email', normalizedEmail);
}

/**
 * Miền của email và mọi hậu tố của nó, dài nhất trước: `a@mx.tempmail.example` →
 * `mx.tempmail.example`, `tempmail.example`, `example`. Danh sách miền dùng một lần so theo
 * đuôi nên miền con của miền bị chặn cũng bị chặn.
 */
/** Email trong thư báo gửi người khác: ký tự đầu + `***` + `@miền` — đủ để chủ nhận ra, không lộ cả địa chỉ. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

export function domainSuffixes(email: string): string[] {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  const labels = domain.split('.').filter(Boolean);
  return labels.map((_, index) => labels.slice(index).join('.'));
}
