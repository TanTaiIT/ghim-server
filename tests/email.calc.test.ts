import { describe, expect, it } from 'vitest';

import { domainSuffixes, hashEmail, normalizeEmail } from '../src/modules/identity/email.calc.js';

describe('normalizeEmail — bốn scenario của spec registration', () => {
  it.each([
    ['lan+2@gmail.com', 'lan@gmail.com'],
    ['lan.hoang@googlemail.com', 'lanhoang@gmail.com'],
    ['Minh@Ghim.VN', 'minh@ghim.vn'],
    ['lan.hoang@ghim.vn', 'lan.hoang@ghim.vn'],
    ['  Lan+ghim@gmail.com ', 'lan@gmail.com'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('dấu chấm ở miền không phải Gmail là hai hộp thư khác nhau', () => {
    expect(normalizeEmail('lan.hoang@ghim.vn')).not.toBe(normalizeEmail('lanhoang@ghim.vn'));
  });
});

describe('hashEmail', () => {
  it('cùng khoá cùng email → cùng dấu băm; khác khoá → khác', () => {
    expect(hashEmail('lan@gmail.com', 'k1')).toBe(hashEmail('lan@gmail.com', 'k1'));
    expect(hashEmail('lan@gmail.com', 'k1')).not.toBe(hashEmail('lan@gmail.com', 'k2'));
  });
});

describe('domainSuffixes', () => {
  it('trả miền và mọi hậu tố, dài nhất trước', () => {
    expect(domainSuffixes('a@mx.tempmail.example')).toEqual([
      'mx.tempmail.example',
      'tempmail.example',
      'example',
    ]);
    expect(domainSuffixes('b@Ghim.VN')).toEqual(['ghim.vn', 'vn']);
  });
});
