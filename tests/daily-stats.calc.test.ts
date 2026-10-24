import { describe, expect, it } from 'vitest';

import { dayKeyVN } from '../src/common/time/time.js';
import { dayKeys, mergeDaily, rangeFor } from '../src/modules/ops/calc/daily-stats.calc.js';
import { TEST_NOW } from './test-app.js';

/* Design add-ops-daily-stats mục 2 (ranh giới ngày Việt Nam) và ghép bốn nguồn đếm, điền 0. TEST_NOW = 09:00 VN 10/10. */
describe('ngày Việt Nam', () => {
  it('khoá ngày đổi lúc 00:00 giờ Việt Nam, không phải 00:00 UTC', () => {
    expect(dayKeyVN(new Date('2026-10-09T16:30:00Z'))).toBe('2026-10-09');
    expect(dayKeyVN(new Date('2026-10-09T17:10:00Z'))).toBe('2026-10-10');
  });

  it('khoảng [from, to): từ 00:00 VN của ngày now − (N−1) tới 00:00 VN ngày mai; khoá ngày hôm nay trước', () => {
    expect(rangeFor(TEST_NOW, 3)).toEqual({
      from: new Date('2026-10-07T17:00:00Z'),
      to: new Date('2026-10-10T17:00:00Z'),
    });
    expect(dayKeys(TEST_NOW, 3)).toEqual(['2026-10-10', '2026-10-09', '2026-10-08']);
  });
});

describe('mergeDaily', () => {
  it('ghép theo khoá ngày, ngày không có nguồn nào điền 0, giữ thứ tự khoá', () => {
    const rows = mergeDaily(['2026-10-10', '2026-10-09'], {
      accounts: [{ day: '2026-10-09', count: 2 }],
      firstLive: [{ day: '2026-10-10', count: 4 }],
      runs: [{ day: '2026-10-10', started: 5, passFull: 2, passLimited: 1, hold: 1 }],
      decisions: [{ day: '2026-10-10', passed: 3, rejected: 1 }],
    });
    expect(rows).toEqual([
      {
        day: '2026-10-10',
        newAccounts: 0,
        submissions: 5,
        firstLive: 4,
        machine: { passFull: 2, passLimited: 1, hold: 1 },
        decisions: { passed: 3, rejected: 1 },
      },
      {
        day: '2026-10-09',
        newAccounts: 2,
        submissions: 0,
        firstLive: 0,
        machine: { passFull: 0, passLimited: 0, hold: 0 },
        decisions: { passed: 0, rejected: 0 },
      },
    ]);
  });
});
