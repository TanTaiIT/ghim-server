import { describe, expect, it } from 'vitest';

import {
  appealOpen,
  appealUntil,
  expiresAtOf,
  inForce,
  pointsOf,
  standingOf,
  type StrikeLike,
  type StrikeRules,
  tierStrikeFacts,
} from '../src/modules/trust/calc/strike.calc.js';

/* Spec trust/strikes (ba loại, điểm tự giảm, tạm khoá), appeals (cửa sổ), trust-tiers (dữ kiện gậy) — phần thuần. */
const DAY_MS = 86_400_000;
const RULES: StrikeRules = {
  normalPoints: 1,
  normalDays: 90,
  severePoints: 2,
  severeDays: 180,
  postingLockFromPoints: 3,
  appealDays: 14,
  seriousAppealDays: 30,
  permanentReviewYears: 2,
};
const DAY0 = new Date('2026-10-01T03:00:00.000Z');
const day = (n: number) => new Date(DAY0.getTime() + n * DAY_MS);
const strike = (
  kind: StrikeLike['kind'],
  issuedDay: number,
  status: StrikeLike['status'] = 'active',
): StrikeLike => ({
  kind,
  status,
  points: pointsOf(kind, RULES),
  issuedAt: day(issuedDay),
  expiresAt: expiresAtOf(kind, day(issuedDay), RULES),
});

describe('Ba loại gậy, điểm và hạn', () => {
  it('thường 1 điểm hết ngày 90; nặng 2 điểm hết ngày 180; nghiêm trọng không điểm, không hạn', () => {
    expect(strike('normal', 0)).toMatchObject({ points: 1, expiresAt: day(90) });
    expect(strike('severe', 0)).toMatchObject({ points: 2, expiresAt: day(180) });
    expect(strike('serious', 0)).toMatchObject({ points: 0, expiresAt: null });
  });
});

describe('Điểm gậy tự giảm khi gậy hết hạn', () => {
  it('hai gậy thường ngày 0 và 40: điểm 1, 2, 1, 0 ở ngày 0, 40, 90, 130', () => {
    const first = strike('normal', 0);
    const two = [first, strike('normal', 40)];
    expect(standingOf([first], day(0), RULES).points).toBe(1);
    expect([40, 90, 130].map((n) => standingOf(two, day(n), RULES).points)).toEqual([2, 1, 0]);
  });

  it('đúng mốc hết hạn là hết, đọc là đúng ngay — không chờ job', () => {
    expect(inForce(strike('normal', 0), new Date(day(90).getTime() - 1))).toBe(true);
    expect(inForce(strike('normal', 0), day(90))).toBe(false);
  });

  it('gậy đã huỷ thôi tính điểm ngay, không chờ hạn ban đầu', () => {
    const strikes = [strike('normal', 0), strike('normal', 10, 'cancelled')];
    expect(standingOf(strikes, day(20), RULES).points).toBe(1);
  });

  it('gậy nghiêm trọng chưa quyết: đang có gậy nhưng 0 điểm; chỉ gậy nặng mới là "nặng"', () => {
    expect(standingOf([strike('serious', 0)], day(1), RULES)).toMatchObject({
      points: 0,
      active: true,
      severe: false,
    });
    expect(standingOf([strike('severe', 0)], day(1), RULES).severe).toBe(true);
  });
});

describe('Từ 3 điểm tạm khoá đăng tin', () => {
  it('gậy nặng hết ngày 150 và gậy thường hết ngày 60: khoá tới ngày 60 — mốc điểm về dưới 3', () => {
    const strikes = [
      { ...strike('severe', 0), expiresAt: day(150) },
      { ...strike('normal', 0), expiresAt: day(60) },
    ];
    expect(standingOf(strikes, day(10), RULES).postingLockedUntil).toEqual(day(60));
  });

  it('hai gậy thường (2 điểm): không khoá', () => {
    const strikes = [strike('normal', 0), strike('normal', 1)];
    expect(standingOf(strikes, day(2), RULES).postingLockedUntil).toBeNull();
  });
});

describe('Cửa sổ khiếu nại tính từ lúc ra gậy', () => {
  it('ngày 10 còn, ngày 15 hết; hạn là ngày 14', () => {
    expect(appealOpen(day(0), day(10), RULES.appealDays)).toBe(true);
    expect(appealOpen(day(0), day(15), RULES.appealDays)).toBe(false);
    expect(appealUntil(day(0), RULES.appealDays)).toEqual(day(14));
  });
});

describe('Dữ kiện gậy cho mức tin cậy', () => {
  it('gậy hết hạn hết "đang có" nhưng vẫn tính vào mốc 90 ngày; gậy huỷ coi như chưa có', () => {
    expect(tierStrikeFacts([strike('normal', 0)], day(100))).toEqual({
      active: false,
      lastIssuedAt: day(0),
    });
    expect(tierStrikeFacts([strike('normal', 5, 'cancelled')], day(10))).toEqual({
      active: false,
      lastIssuedAt: null,
    });
    expect(tierStrikeFacts([strike('severe', 5)], day(10)).active).toBe(true);
  });
});
