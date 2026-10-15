import { describe, expect, it } from 'vitest';

import {
  completionAlert,
  overturnRate,
  percentOf,
  ruleRates,
  weeklyCompletion,
} from '../src/modules/review/calc/stats.calc.js';

/* Phép tính số liệu cho master (add-review-queues, spec review/post-review và delta screening/rule-management). */

describe('percentOf', () => {
  it('một chữ số thập phân; mẫu số 0 là chưa có tỉ lệ', () => {
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(0, 4)).toBe(0);
    expect(percentOf(0, 0)).toBeNull();
  });
});

describe('Tỉ lệ bị lật', () => {
  it('20 quyết định "đạt" đã hậu kiểm, 2 bị gỡ: 10%', () => {
    expect(overturnRate(20, 2)).toBe(10);
  });

  it('10 đã hậu kiểm, 1 bị gỡ khỏi nhóm: 10%', () => {
    expect(overturnRate(10, 1)).toBe(10);
  });

  it('chưa có quyết định nào được hậu kiểm: chưa có tỉ lệ', () => {
    expect(overturnRate(0, 0)).toBeNull();
  });
});

describe('Tỉ lệ máy quá tay theo luật', () => {
  it('luật trúng ở 10 tin có quyết định, 7 tin được cho đạt: 70%', () => {
    const decisions = [
      ...Array.from({ length: 7 }, () => ({
        hits: ['contact_off_platform'],
        outcome: 'pass' as const,
        judgment: 'machine_overreach' as const,
      })),
      ...Array.from({ length: 3 }, () => ({
        hits: ['contact_off_platform'],
        outcome: 'reject' as const,
        judgment: null,
      })),
    ];
    expect(ruleRates(decisions)).toEqual([
      { code: 'contact_off_platform', decided: 10, passed: 7, overreach: 7, passRate: 70 },
    ]);
  });

  it('một tin trúng hai luật tính cho cả hai; luật nào cho đạt nhiều hơn đứng trước', () => {
    const rates = ruleRates([
      { hits: ['price_over_cap', 'duplicate_image'], outcome: 'pass', judgment: 'machine_right' },
      { hits: ['duplicate_image'], outcome: 'remove', judgment: null },
    ]);
    expect(rates.map((rate) => [rate.code, rate.passRate])).toEqual([
      ['price_over_cap', 100],
      ['duplicate_image', 50],
    ]);
  });
});

describe('Hậu kiểm làm xong trong tuần', () => {
  it('100 việc: 75 xử xong, 25 tự huỷ → 75%, dưới 80% thì cảnh báo', () => {
    const rate = weeklyCompletion(75, 25);
    expect(rate).toBe(75);
    expect(completionAlert(rate, 80)).toBe(true);
  });

  it('85 xử xong, 15 tự huỷ → 85%, không cảnh báo', () => {
    expect(completionAlert(weeklyCompletion(85, 15), 80)).toBe(false);
  });

  it('8 xử xong, 2 tự huỷ (việc huỷ vì lý do khác không vào mẫu số) → 80%, không cảnh báo', () => {
    const rate = weeklyCompletion(8, 2);
    expect(rate).toBe(80);
    expect(completionAlert(rate, 80)).toBe(false);
  });

  it('tuần không có việc nào khép lại: không cảnh báo', () => {
    expect(completionAlert(weeklyCompletion(0, 0), 80)).toBe(false);
  });
});
