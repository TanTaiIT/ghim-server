import { describe, expect, it } from 'vitest';

import { createSecretBox, hmacHex, sha256Hex } from '../src/common/crypto/secrets.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 8).toString('base64');

describe('createSecretBox', () => {
  it('seal rồi open trả đúng chuỗi, kể cả tiếng Việt', () => {
    const box = createSecretBox(KEY);
    expect(box.open(box.seal('Số giấy tờ 079123456789 — Nguyễn Văn A'))).toBe(
      'Số giấy tờ 079123456789 — Nguyễn Văn A',
    );
  });

  it('hai lần seal cùng chuỗi ra hai bản mã khác nhau', () => {
    const box = createSecretBox(KEY);
    expect(box.seal('x')).not.toBe(box.seal('x'));
  });

  it('sai khoá thì open ném, không trả rác', () => {
    const sealed = createSecretBox(KEY).seal('bí mật');
    expect(() => createSecretBox(OTHER_KEY).open(sealed)).toThrow();
  });

  it('bản mã bị sửa một byte thì open ném', () => {
    const box = createSecretBox(KEY);
    const raw = Buffer.from(box.seal('bí mật'), 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    expect(() => box.open(raw.toString('base64'))).toThrow();
  });
});

describe('sha256Hex', () => {
  it('khớp vector chuẩn', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('hmacHex', () => {
  it('cùng khoá, cùng scope, cùng giá trị → cùng kết quả; khác scope → khác', () => {
    expect(hmacHex('k', 'email', 'a@b.c')).toBe(hmacHex('k', 'email', 'a@b.c'));
    expect(hmacHex('k', 'email', 'x')).not.toBe(hmacHex('k', 'device', 'x'));
    expect(hmacHex('k', 'email', 'x')).not.toBe(hmacHex('k2', 'email', 'x'));
    expect(hmacHex('k', 'email', 'x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
