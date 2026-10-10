import { describe, expect, it } from 'vitest';

import {
  LOOKUP_CODE_ALPHABET,
  generateLookupCode,
  normalizeLookupCode,
} from '../src/modules/identity/lookup-code.calc.js';
import { foldName, isReservedName } from '../src/modules/identity/reserved-names.js';

describe('generateLookupCode', () => {
  it('8 ký tự Crockford, không bao giờ có I, L, O, U', () => {
    for (let index = 0; index < 2000; index += 1) {
      const code = generateLookupCode();
      expect(code).toHaveLength(8);
      expect(code).not.toMatch(/[ILOU]/);
      for (const char of code) expect(LOOKUP_CODE_ALPHABET).toContain(char);
    }
  });

  it('phủ hết bảng chữ khi byte vào quét đủ giá trị', () => {
    expect(generateLookupCode(() => Buffer.alloc(5, 0))).toBe('00000000');
    expect(generateLookupCode(() => Buffer.alloc(5, 0xff))).toBe('ZZZZZZZZ');
    expect(generateLookupCode(() => Buffer.from([0x00, 0x44, 0x32, 0x14, 0xc7]))).toBe('01234567');
  });

  it('normalizeLookupCode chịu được cách người dùng gõ', () => {
    expect(normalizeLookupCode(' ab1o-il0z ')).toBe('AB10110Z');
  });
});

describe('isReservedName', () => {
  it.each(['quan tri he thong', 'QUẢN TRỊ HỆ THỐNG', 'Quản  trị hệ thống ', 'admin', 'Hỗ trợ'])(
    '"%s" là tên dành riêng',
    (name) => {
      expect(isReservedName(name)).toBe(true);
    },
  );

  it.each(['Lan Hoàng', 'Quản trị', 'Hệ thống bán hàng', 'Ghim Shop'])(
    '"%s" không phải tên dành riêng',
    (name) => {
      expect(isReservedName(name)).toBe(false);
    },
  );

  it('foldName bỏ dấu kể cả đ', () => {
    expect(foldName('Đặng Thị Lành')).toBe('DANG THI LANH');
  });
});
