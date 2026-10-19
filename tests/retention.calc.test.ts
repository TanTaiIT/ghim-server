import { describe, expect, it } from 'vitest';

import { pseudonymOf } from '../src/modules/identity/calc/pseudonym.calc.js';
import {
  before,
  DAY_MS,
  strikeClosedAt,
  strikeHolds,
  violationPurgeAt,
  YEAR_MS,
} from '../src/modules/ops/calc/retention.calc.js';
import type { StrikeFact } from '../src/modules/trust/strike/strike.service.js';

/* Luật thuần của hạn lưu và tạm giữ (design add-data-retention mục 3, 4) — mốc đóng của gậy và mốc xoá tin vi phạm. */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const day = (n: number) => new Date(NOW.getTime() + n * DAY_MS);
const fact = (overrides: Partial<StrikeFact>): StrikeFact => ({
  id: 'gay',
  kind: 'normal',
  status: 'active',
  issuedAt: NOW,
  expiresAt: day(90),
  cancelledAt: null,
  liftedAt: null,
  appealPending: false,
  ...overrides,
});
const rules = { graceMs: 30 * DAY_MS, seriousMs: 2 * YEAR_MS };

describe('strikeClosedAt / strikeHolds', () => {
  it('gậy còn hiệu lực, nghiêm trọng chờ master, khoá vĩnh viễn: còn mở — giữ; khiếu nại chờ: giữ dù đã hết hạn', () => {
    const since = day(-30);
    expect(strikeClosedAt(fact({}))).toBeNull();
    expect(strikeHolds(fact({}), since)).toBe(true);
    expect(strikeHolds(fact({ kind: 'serious', status: 'active', expiresAt: null }), since)).toBe(
      true,
    );
    expect(
      strikeHolds(fact({ kind: 'serious', status: 'permanent', expiresAt: null }), since),
    ).toBe(true);
    expect(
      strikeHolds(fact({ status: 'expired', expiresAt: day(-100), appealPending: true }), since),
    ).toBe(true);
  });

  it('hết hạn / huỷ / gỡ khoá: đóng tại mốc đó; giữ tới đóng + 30 ngày rồi thôi', () => {
    expect(strikeClosedAt(fact({ status: 'expired', expiresAt: day(-10) }))).toEqual(day(-10));
    expect(strikeClosedAt(fact({ status: 'cancelled', cancelledAt: day(-5) }))).toEqual(day(-5));
    expect(strikeClosedAt(fact({ status: 'lifted', liftedAt: day(-1) }))).toEqual(day(-1));
    expect(strikeHolds(fact({ status: 'expired', expiresAt: day(-20) }), day(-30))).toBe(true);
    expect(strikeHolds(fact({ status: 'expired', expiresAt: day(-31) }), day(-30))).toBe(false);
  });
});

describe('violationPurgeAt', () => {
  it('gậy thường / nặng: đóng + 30 ngày; còn hiệu lực thì chưa có mốc', () => {
    expect(violationPurgeAt(fact({}), rules)).toBeNull();
    expect(violationPurgeAt(fact({ status: 'expired', expiresAt: day(90) }), rules)).toEqual(
      day(120),
    );
    expect(violationPurgeAt(fact({ status: 'cancelled', cancelledAt: day(5) }), rules)).toEqual(
      day(35),
    );
  });

  it('khoá vĩnh viễn, kể cả đã gỡ: 2 năm kể từ ngày khoá (TK 22, 25)', () => {
    const serious = fact({ kind: 'serious', expiresAt: null, issuedAt: day(-100) });
    expect(violationPurgeAt({ ...serious, status: 'active' }, rules)).toBeNull();
    expect(violationPurgeAt({ ...serious, status: 'permanent' }, rules)).toEqual(
      new Date(day(-100).getTime() + 2 * YEAR_MS),
    );
    expect(violationPurgeAt({ ...serious, status: 'lifted', liftedAt: day(800) }, rules)).toEqual(
      new Date(day(-100).getTime() + 2 * YEAR_MS),
    );
  });
});

describe('pseudonymOf', () => {
  it('dạng UUID hợp lệ, cùng người cùng mã, khác người hay khác khoá thì khác mã, không chứa mã gốc', () => {
    const id = '01926f3a-1b2c-7def-8abc-0123456789ab';
    const a = pseudonymOf(id, 'khoa-mot');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(pseudonymOf(id, 'khoa-mot')).toBe(a);
    expect(pseudonymOf('01926f3a-1b2c-7def-8abc-0123456789ac', 'khoa-mot')).not.toBe(a);
    expect(pseudonymOf(id, 'khoa-hai')).not.toBe(a);
    expect(a).not.toContain(id.slice(0, 8));
  });
});

describe('before', () => {
  it('lùi đúng số mili-giây', () => {
    expect(before(NOW, 2 * DAY_MS)).toEqual(day(-2));
  });
});
