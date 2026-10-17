import { describe, expect, it } from 'vitest';

import {
  ageDays,
  computeTier,
  countingTimes,
  factsHash,
  type TierSettings,
} from '../src/modules/trust/calc/tier.calc.js';

/*
 * Spec trust/trust-tiers, phần thuần. "Ngày n" = n ngày lịch giờ Việt Nam kể từ ngày tạo tài khoản (ngày 1), lúc
 * 10:00; tin sạch ghi mốc lúc 01:00 của ngày đó như lượt hằng ngày.
 */
const DAY_MS = 86_400_000;
const DAY_ONE = new Date('2026-10-01T03:00:00.000Z'); // 10:00 giờ Việt Nam
const day = (n: number, hour = 10) =>
  new Date(DAY_ONE.getTime() + (n - 1) * DAY_MS + (hour - 10) * 3_600_000);
const cleanOn = (...days: number[]) => days.map((n) => day(n, 1));

const SETTINGS: TierSettings = {
  minDays: { T1: 7, T2: 30, T3: 90 },
  minClean: { T1: 1, T2: 5, T3: 20 },
  maxCleanPer7Days: 3,
  noStrikeDaysForT3: 90,
};
const NO_STRIKES = { active: false, lastIssuedAt: null };
const tierAt = (n: number, cleanAt: Date[], settings = SETTINGS) =>
  computeTier({ accountCreatedAt: DAY_ONE, cleanAt, now: day(n), settings, strikes: NO_STRIKES });
/** `count` tin sạch rải ba tin mỗi tuần từ ngày `from` — đủ để không tin nào phải dời. */
const spread = (count: number, from = 2) =>
  Array.from({ length: count }, (_, i) => day(from + Math.floor(i / 3) * 7 + (i % 3), 1));

describe('Tài khoản mới, lên mức theo tuổi và tin sạch', () => {
  it('vừa tạo, chưa có tin sạch: T0', () => {
    expect(tierAt(1, []).tier).toBe('T0');
  });

  it('ngày 8, đủ 7 ngày tuổi và một tin đã hiện đủ 7 ngày: T1', () => {
    expect(tierAt(8, cleanOn(8))).toMatchObject({ tier: 'T1', countedClean: 1 });
  });

  it('20 ngày tuổi, chưa có tin sạch: T0', () => {
    expect(tierAt(20, []).tier).toBe('T0');
  });

  it('5 ngày tuổi, 2 tin sạch: T0', () => {
    expect(tierAt(5, cleanOn(4, 5)).tier).toBe('T0');
  });

  it('ngày 30, 5 tin sạch được tính: T2', () => {
    expect(tierAt(30, spread(5))).toMatchObject({ tier: 'T2', countedClean: 5 });
  });

  it('100 ngày tuổi, 19 tin sạch: T2; 90 ngày tuổi, 20 tin sạch: T3', () => {
    expect(tierAt(100, spread(19)).tier).toBe('T2');
    expect(tierAt(90, spread(20))).toMatchObject({ tier: 'T3', countedClean: 20 });
  });

  it('tuổi tính theo ngày lịch kể cả ngày tạo: tạo 23:59, sáu ngày lịch sau là 7 ngày tuổi', () => {
    const lateNight = new Date('2026-10-01T16:59:00.000Z'); // 23:59 ngày 1, giờ Việt Nam
    expect(ageDays(lateNight, new Date('2026-10-06T17:01:00.000Z'))).toBe(7); // 00:01 ngày 7
  });

  it('xác nhận email muộn không đổi tuổi: tạo ngày 1, tin sạch ngày 12 → đủ tuổi cho T1', () => {
    expect(tierAt(12, cleanOn(12)).tier).toBe('T1');
  });
});

describe('Tối đa 3 tin sạch trong 7 ngày cuốn chiếu, tin vượt được dời', () => {
  it('năm tin cùng thành sạch một ngày: ngay sau đó chỉ ba tin được tính', () => {
    expect(tierAt(10, cleanOn(10, 10, 10, 10, 10)).countedClean).toBe(3);
  });

  it('ba tin ngày 10, 11, 12 và tin thứ tư ngày 18: tin thứ tư được tính', () => {
    expect(tierAt(18, cleanOn(10, 11, 12, 18)).countedClean).toBe(4);
  });

  it('bốn tin cùng ngày 10: ba tin tính ngay, tin thứ tư tính từ ngày 17', () => {
    const four = cleanOn(10, 10, 10, 10);
    expect(tierAt(16, four).countedClean).toBe(3);
    expect(
      computeTier({
        accountCreatedAt: DAY_ONE,
        cleanAt: four,
        now: day(17, 1),
        settings: SETTINGS,
        strikes: NO_STRIKES,
      }).countedClean,
    ).toBe(4);
  });

  it('năm tin mỗi ngày trong ba ngày liền: dời qua nhiều khoảng, không khoảng 7 ngày nào quá ba tin', () => {
    const fifteen = cleanOn(...[10, 11, 12].flatMap((n) => [n, n, n, n, n]));
    const times = countingTimes(fifteen, 3).map((time) => time.getTime());
    expect(times).toHaveLength(15);
    for (let i = 0; i + 3 < times.length; i += 1) {
      expect((times[i + 3] ?? 0) - (times[i] ?? 0)).toBeGreaterThanOrEqual(7 * DAY_MS);
    }
    expect([12, 17, 24, 31, 38].map((n) => tierAt(n, fifteen).countedClean)).toEqual([
      3, 6, 9, 12, 15,
    ]);
  });
});

describe('Tính lại từ dữ kiện, hai lần ra cùng kết quả', () => {
  it('cùng dữ kiện, cùng bảng con số: cùng mức và cùng số tin được tính, kể cả khi có tin bị dời', () => {
    const five = cleanOn(10, 10, 10, 10, 10);
    expect(tierAt(10, five)).toEqual(tierAt(10, five.toReversed()));
  });

  it('bảng con số nâng tuổi T1 lên 14 ngày: tài khoản 10 ngày tuổi có 1 tin sạch về T0', () => {
    const stricter = { ...SETTINGS, minDays: { ...SETTINGS.minDays, T1: 14 } };
    expect(tierAt(10, cleanOn(9)).tier).toBe('T1');
    expect(tierAt(10, cleanOn(9), stricter).tier).toBe('T0');
  });

  it('tin sạch duy nhất thôi được tính (người gọi bỏ dòng đã void): về T0', () => {
    expect(tierAt(40, cleanOn(9)).tier).toBe('T1');
    expect(tierAt(40, []).tier).toBe('T0');
  });

  it('dấu dữ kiện không phụ thuộc thứ tự, đổi khi dữ kiện hay phiên bản bảng con số đổi', () => {
    const clean = [
      { listingId: 'a', cleanAt: day(8, 1) },
      { listingId: 'b', cleanAt: day(9, 1) },
    ];
    const base = { accountCreatedAt: DAY_ONE, clean, configVersion: 3, strikes: NO_STRIKES };
    expect(factsHash(base)).toBe(factsHash({ ...base, clean: clean.toReversed() }));
    expect(factsHash(base)).not.toBe(factsHash({ ...base, configVersion: 4 }));
    expect(factsHash(base)).not.toBe(factsHash({ ...base, clean: clean.slice(1) }));
  });
});

describe('Gậy và mức (add-strikes)', () => {
  const eligible = { accountCreatedAt: DAY_ONE, cleanAt: spread(20), settings: SETTINGS };

  it('đang có gậy: trần T1 dù đủ điều kiện T3', () => {
    const strikes = { active: true, lastIssuedAt: day(95) };
    expect(computeTier({ ...eligible, now: day(100), strikes }).tier).toBe('T1');
  });

  it('gậy đã hết hạn nhưng ra trong 90 ngày: T2; tròn 90 ngày: T3', () => {
    const strikes = { active: false, lastIssuedAt: day(30) };
    expect(computeTier({ ...eligible, now: day(100), strikes }).tier).toBe('T2');
    expect(computeTier({ ...eligible, now: day(121), strikes }).tier).toBe('T3');
  });

  it('T0 có gậy vẫn T0', () => {
    const strikes = { active: true, lastIssuedAt: day(1) };
    expect(
      computeTier({
        accountCreatedAt: DAY_ONE,
        cleanAt: [],
        now: day(2),
        settings: SETTINGS,
        strikes,
      }).tier,
    ).toBe('T0');
  });
});

describe('Điều còn thiếu để lên mức (bảng uy tín)', () => {
  it('T0, 3 ngày tuổi, chưa có tin sạch: thiếu 4 ngày tuổi và 1 tin sạch để lên T1', () => {
    expect(tierAt(3, []).next).toEqual({ tier: 'T1', missingDays: 4, missingClean: 1 });
  });

  it('T1, 40 ngày tuổi, 3 tin sạch: thiếu 2 tin sạch để lên T2, không thiếu ngày tuổi', () => {
    expect(tierAt(40, spread(3))).toMatchObject({
      tier: 'T1',
      next: { tier: 'T2', missingDays: 0, missingClean: 2 },
    });
  });

  it('T3 là mức cao nhất: không có mức kế tiếp', () => {
    expect(tierAt(120, spread(20)).next).toBeNull();
  });
});
