import { describe, expect, it } from 'vitest';

import {
  riskSamplePercent,
  type SamplePercents,
  sampled,
} from '../src/modules/review/calc/sampling.calc.js';
import {
  completionAlert,
  overturnRate,
  ruleRates,
  weeklyCompletion,
} from '../src/modules/review/calc/stats.calc.js';

/* Spec review/post-review và delta screening/rule-management, phần thuần: tỉ lệ lấy mẫu, các tỉ lệ cho master. */
const PERCENTS: SamplePercents = { borderline: 100, newAccount: 20, other: 5 };

describe('Lấy mẫu hậu kiểm theo rủi ro', () => {
  it.each([
    [{ score: 50, tier: 'T2' }, 100],
    [{ score: 45, tier: 'T3' }, 100],
    [{ score: 59, tier: 'T3' }, 100],
    [{ score: 10, tier: 'T1' }, 20],
    [{ score: 0, tier: 'T0' }, 20],
    [{ score: 0, tier: 'T3' }, 5],
    [{ score: 60, tier: 'T3' }, 5],
    [{ score: null, tier: null }, 5],
  ] as const)('%j → %i%%', (facts, percent) => {
    expect(riskSamplePercent(facts, PERCENTS)).toBe(percent);
  });

  it('lượt quay dưới tỉ lệ thì lấy mẫu', () => {
    expect(sampled(20, 19.99)).toBe(true);
    expect(sampled(20, 20)).toBe(false);
    expect(sampled(100, 99.99)).toBe(true);
  });
});

describe('Số liệu cho master', () => {
  it('20 quyết định đạt đã hậu kiểm, 2 bị lật → 10%; chưa có gì → chưa có tỉ lệ', () => {
    expect(overturnRate(20, 2)).toBe(10);
    expect(overturnRate(0, 0)).toBeNull();
  });

  it('luật trúng 10 tin máy giữ đã có quyết định, 7 tin được cho đạt → 70%', () => {
    const decisions = [
      ...Array.from({ length: 7 }, () => ({
        hits: ['off_platform_contact'],
        outcome: 'pass' as const,
        judgment: 'machine_overreach' as const,
      })),
      ...Array.from({ length: 3 }, () => ({
        hits: ['off_platform_contact', 'burst'],
        outcome: 'reject' as const,
        judgment: null,
      })),
    ];
    const rates = ruleRates(decisions);
    expect(rates.find((row) => row.code === 'off_platform_contact')).toEqual({
      code: 'off_platform_contact',
      decided: 10,
      passed: 7,
      overreach: 7,
      passRate: 70,
    });
    expect(rates.find((row) => row.code === 'burst')?.passRate).toBe(0);
  });

  it('hậu kiểm tuần: 75 xử xong, 25 tự huỷ → 75%, cảnh báo; 85 / 15 → không; 8 / 2 → 80%, không', () => {
    expect(weeklyCompletion(75, 25)).toBe(75);
    expect(completionAlert(weeklyCompletion(75, 25), 80)).toBe(true);
    expect(completionAlert(weeklyCompletion(85, 15), 80)).toBe(false);
    expect(completionAlert(weeklyCompletion(8, 2), 80)).toBe(false);
    expect(completionAlert(weeklyCompletion(0, 0), 80)).toBe(false);
  });
});
