import { describe, expect, it } from 'vitest';

import { retryDelayMs } from '../src/common/outbox/dispatcher.js';

describe('retryDelayMs', () => {
  it('10 giây, gấp đôi mỗi lần, trần 1 giờ', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([10_000, 20_000, 40_000, 80_000]);
    expect(retryDelayMs(9)).toBe(2_560_000);
    expect(retryDelayMs(10)).toBe(3_600_000);
    expect(retryDelayMs(50)).toBe(3_600_000);
  });
});
