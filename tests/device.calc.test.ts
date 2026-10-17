import { describe, expect, it } from 'vitest';

import {
  type DeviceFlagInput,
  type DevicePostRow,
  hashDeviceId,
  requiredDeviceFlags,
  sharesDeviceWithStruck,
} from '../src/modules/identity/calc/device.calc.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

/** Tài khoản đăng tin lần đầu `first` ngày trước, lần cuối `last` ngày trước (mặc định = lần đầu). */
const post = (accountId: string, first: number, last = first): DevicePostRow => ({
  accountId,
  firstPostedAt: daysAgo(first),
  lastPostedAt: daysAgo(last),
});

const base = (posts: DevicePostRow[], accountId: string): DeviceFlagInput => ({
  accountId,
  now: NOW,
  windowDays: 90,
  slots: 3,
  posts,
  lockedAccounts: [],
  struckAccounts: [],
  clearances: [],
});

const MANY = { kind: 'many_accounts_on_device', relatedAccountId: null, relatedStrikeId: null };

describe('requiredDeviceFlags — chỗ trên một máy', () => {
  it('tài khoản thứ ba không bị đánh dấu', () => {
    const posts = [post('A', 30), post('B', 20), post('C', 0)];
    expect(requiredDeviceFlags(base(posts, 'C'))).toEqual([]);
  });

  it('tài khoản thứ tư bị đánh dấu "nhiều tài khoản trên một máy"', () => {
    const posts = [post('A', 30), post('B', 20), post('C', 10), post('D', 0)];
    expect(requiredDeviceFlags(base(posts, 'D'))).toEqual([MANY]);
  });

  it('lượt đăng gần nhất của một tài khoản cũ quá 90 ngày thì tài khoản mới không bị đánh dấu', () => {
    const posts = [post('A', 120, 91), post('B', 20), post('C', 10), post('D', 0)];
    expect(requiredDeviceFlags(base(posts, 'D'))).toEqual([]);
  });

  it('tài khoản cũ quay lại đăng tin giữ chỗ của mình, không bị đánh dấu', () => {
    const posts = [post('A', 30, 0), post('B', 20), post('C', 10), post('D', 5)];
    expect(requiredDeviceFlags(base(posts, 'A'))).toEqual([]);
    expect(requiredDeviceFlags(base(posts, 'D'))).toEqual([MANY]);
  });

  it('một chỗ trống ra thì tài khoản thứ tư hết bị đánh dấu khi gửi tin tiếp', () => {
    const posts = [post('A', 100, 95), post('B', 20), post('C', 10), post('D', 5, 0)];
    expect(requiredDeviceFlags(base(posts, 'D'))).toEqual([]);
  });

  it('tài khoản chưa có lượt đăng nào trên máy thì không có gì để tính', () => {
    expect(requiredDeviceFlags(base([post('A', 1)], 'Z'))).toEqual([]);
  });
});

describe('requiredDeviceFlags — máy của tài khoản bị khoá', () => {
  it('đăng tin lần đầu SAU khi A bị khoá thì bị đánh dấu, kèm tài khoản A', () => {
    const input = {
      ...base([post('A', 30, 10), post('B', 0)], 'B'),
      lockedAccounts: [{ accountId: 'A', lockedAt: daysAgo(5) }],
    };
    expect(requiredDeviceFlags(input)).toEqual([
      { kind: 'device_of_locked_account', relatedAccountId: 'A', relatedStrikeId: null },
    ]);
  });

  it('người nhà đã đăng tin từ TRƯỚC lúc khoá thì không bị đánh dấu', () => {
    const input = {
      ...base([post('A', 30, 10), post('B', 20, 0)], 'B'),
      lockedAccounts: [{ accountId: 'A', lockedAt: daysAgo(5) }],
    };
    expect(requiredDeviceFlags(input)).toEqual([]);
  });

  it('A được mở khoá (không còn trong danh sách khoá) thì B hết bị đánh dấu', () => {
    expect(requiredDeviceFlags(base([post('A', 30, 10), post('B', 0)], 'B'))).toEqual([]);
  });

  it('hai loại đánh dấu có thể cùng phải có', () => {
    const input = {
      ...base([post('A', 40), post('B', 30), post('C', 20), post('D', 0)], 'D'),
      lockedAccounts: [{ accountId: 'A', lockedAt: daysAgo(10) }],
    };
    expect(requiredDeviceFlags(input)).toEqual([
      MANY,
      { kind: 'device_of_locked_account', relatedAccountId: 'A', relatedStrikeId: null },
    ]);
  });
});

describe('requiredDeviceFlags — máy của tài khoản có gậy (add-strikes)', () => {
  const struckA = { accountId: 'A', strikeId: 's-a', issuedAt: daysAgo(5) };

  it('B đăng tin lần đầu SAU khi A nhận gậy: đánh dấu kèm A và gậy', () => {
    const input = { ...base([post('A', 30, 10), post('B', 0)], 'B'), struckAccounts: [struckA] };
    expect(requiredDeviceFlags(input)).toEqual([
      { kind: 'device_of_struck_account', relatedAccountId: 'A', relatedStrikeId: 's-a' },
    ]);
  });

  it('người nhà đã đăng tin từ TRƯỚC lúc A nhận gậy: không đánh dấu, nhưng là dấu hiệu "trùng thiết bị"', () => {
    const input = {
      ...base([post('A', 30, 10), post('B', 20, 0)], 'B'),
      struckAccounts: [struckA],
    };
    expect(requiredDeviceFlags(input)).toEqual([]);
    expect(sharesDeviceWithStruck(input)).toBe(true);
  });

  it('gậy hết hiệu lực (không còn trong danh sách): B hết bị đánh dấu và hết dấu hiệu', () => {
    const input = base([post('A', 30, 10), post('B', 0)], 'B');
    expect(requiredDeviceFlags(input)).toEqual([]);
    expect(sharesDeviceWithStruck(input)).toBe(false);
  });
});

describe('requiredDeviceFlags — miễn trừ của hỗ trợ (máy mua lại)', () => {
  const posts = [post('A', 60, 50), post('B', 55, 45), post('C', 50, 40), post('X', 3, 0)];
  const cleared = [{ accountId: 'X', clearedAt: daysAgo(2) }];

  it('bỏ qua các tài khoản cũ có trước lúc miễn trừ nên X không bị đánh dấu lại', () => {
    expect(requiredDeviceFlags({ ...base(posts, 'X'), clearances: cleared })).toEqual([]);
  });

  it('bỏ qua cả lần khoá có trước lúc miễn trừ', () => {
    const input = {
      ...base(posts, 'X'),
      clearances: cleared,
      lockedAccounts: [{ accountId: 'A', lockedAt: daysAgo(4) }],
    };
    expect(requiredDeviceFlags(input)).toEqual([]);
  });

  it('miễn trừ của X không ảnh hưởng tài khoản khác trên máy', () => {
    const input = { ...base([...posts, post('E', 1, 0)], 'E'), clearances: cleared };
    expect(requiredDeviceFlags(input)).toEqual([MANY]);
  });
});

describe('hashDeviceId', () => {
  it('cùng mã cùng khoá → cùng dấu băm, không trùng với băm email của cùng chuỗi', () => {
    expect(hashDeviceId('abc', 'k')).toBe(hashDeviceId('abc', 'k'));
    expect(hashDeviceId('abc', 'k')).toMatch(/^[0-9a-f]{64}$/);
  });
});
