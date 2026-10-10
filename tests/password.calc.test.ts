import { describe, expect, it } from 'vitest';

import {
  checkPassword,
  hashPassword,
  verifyPassword,
} from '../src/modules/identity/password.calc.js';

const LIMITS = { min: 8, max: 128 };

describe('checkPassword', () => {
  it('7 ký tự → quá ngắn', () => {
    expect(checkPassword('abcdefg', LIMITS)).toBe('too_short');
  });

  it('129 ký tự → quá dài; 128 thì được', () => {
    expect(checkPassword('x'.repeat(129), LIMITS)).toBe('too_long');
    expect(checkPassword('x'.repeat(128), LIMITS)).toBeNull();
  });

  it('đếm theo ký tự người dùng thấy, không theo byte', () => {
    expect(checkPassword('mật khẩu', LIMITS)).toBeNull();
  });

  it.each(['12345678', 'password', 'PASSWORD', 'iloveyou'])('"%s" là mật khẩu hay gặp', (value) => {
    expect(checkPassword(value, LIMITS)).toBe('common');
  });

  it('mật khẩu hợp lệ → null', () => {
    expect(checkPassword('ghim-rao-vat-2026!', LIMITS)).toBeNull();
  });
});

describe('hashPassword / verifyPassword', () => {
  it('băm argon2id, so đúng và sai', async () => {
    const digest = await hashPassword('ghim-rao-vat-2026!');
    expect(digest).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(digest, 'ghim-rao-vat-2026!')).resolves.toBe(true);
    await expect(verifyPassword(digest, 'ghim-rao-vat-2025!')).resolves.toBe(false);
  });
});
