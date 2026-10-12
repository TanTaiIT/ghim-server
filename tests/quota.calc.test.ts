import { describe, expect, it } from 'vitest';

import {
  liveEffect,
  type QuotaFacts,
  quotaDecision,
  type QuotaSettings,
} from '../src/modules/trust/quota.calc.js';

/* Spec trust/quotas, phần thuần: trần tin sống theo lượt, nhịp gửi cửa sổ trượt, trần người ngoài. */
const NOW = new Date('2026-10-12T05:00:00.000Z');
const MINUTE_MS = 60_000;
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE_MS);
const T0: QuotaSettings = { liveCap: 10, perHour: 3, outsiderPerGroup: 2 };
const T1: QuotaSettings = { liveCap: 20, perHour: 5, outsiderPerGroup: 2 };
const facts = (overrides: Partial<QuotaFacts> = {}): QuotaFacts => ({
  live: 0,
  recentSubmissions: [],
  outsiderLiveInGroup: null,
  ...overrides,
});
const decide = (
  effect: ReturnType<typeof liveEffect>,
  overrides: Partial<QuotaFacts>,
  settings = T0,
) => quotaDecision({ effect, facts: facts(overrides), settings, now: NOW });

describe('Lượt nào làm tăng số tin sống', () => {
  it.each([
    ['submit', 'draft', 'adds'],
    ['move', 'draft', 'adds'],
    ['renew_expired', 'expired', 'adds'],
    ['resubmit', 'rejected', 'adds'],
    ['resubmit', 'removed', 'adds'],
    ['resubmit', 'live', 'none'],
    ['resubmit', 'pending', 'none'],
    ['renew_early', 'live', 'keeps'],
  ] as const)('%s từ %s: %s', (kind, from, effect) => {
    expect(liveEffect(kind, from)).toBe(effect);
  });
});

describe('Trần tin sống theo mức', () => {
  it('T0 có 9 tin sống gửi tin mới: được; có 10: 409 LISTING_QUOTA_EXCEEDED', () => {
    expect(decide('adds', { live: 9 })).toEqual({ ok: true });
    expect(decide('adds', { live: 10 })).toEqual({ ok: false, code: 'LISTING_QUOTA_EXCEEDED' });
  });

  it('T1 có 20 tin sống: gia hạn sớm được; gia hạn tin hết hạn hay gửi lại tin bị từ chối thì không', () => {
    expect(decide('keeps', { live: 20 }, T1)).toEqual({ ok: true });
    expect(decide(liveEffect('renew_expired', 'expired'), { live: 20 }, T1)).toMatchObject({
      code: 'LISTING_QUOTA_EXCEEDED',
    });
    expect(decide(liveEffect('resubmit', 'rejected'), { live: 20 }, T1)).toMatchObject({
      code: 'LISTING_QUOTA_EXCEEDED',
    });
  });

  it('đang vượt trần (40 trên 20): gửi mới và gia hạn sớm đều bị từ chối; sửa tin đang hiện thì không xét trần', () => {
    expect(decide('adds', { live: 40 }, T1)).toMatchObject({ code: 'LISTING_QUOTA_EXCEEDED' });
    expect(decide('keeps', { live: 40 }, T1)).toMatchObject({ code: 'LISTING_QUOTA_EXCEEDED' });
    expect(decide('none', { live: 40 }, T1)).toEqual({ ok: true });
  });

  it('về dưới trần (19 trên 20): gửi mới được', () => {
    expect(decide('adds', { live: 19 }, T1)).toEqual({ ok: true });
  });
});

describe('Nhịp gửi theo mức', () => {
  it('T0 đã có 3 lượt trong giờ: 429 kèm lúc lượt sớm nhất rời cửa sổ', () => {
    const recentSubmissions = [ago(50), ago(10), ago(30)];
    expect(decide('adds', { recentSubmissions })).toEqual({
      ok: false,
      code: 'SUBMISSION_RATE_LIMITED',
      retryAt: new Date(ago(50).getTime() + 60 * MINUTE_MS),
    });
  });

  it('sửa tin phải qua máy cũng đếm vào nhịp, kể cả khi không xét trần', () => {
    expect(decide('none', { recentSubmissions: [ago(5), ago(6), ago(7)] })).toMatchObject({
      code: 'SUBMISSION_RATE_LIMITED',
    });
  });

  it('lượt sớm nhất đã qua hơn một giờ: được gửi', () => {
    expect(decide('adds', { recentSubmissions: [ago(61), ago(30), ago(10)] })).toEqual({
      ok: true,
    });
  });

  it('hết chỗ và hết lượt cùng lúc: báo hết chỗ trước — chờ thêm giờ không giải được', () => {
    expect(decide('adds', { live: 10, recentSubmissions: [ago(1), ago(2), ago(3)] })).toMatchObject(
      { code: 'LISTING_QUOTA_EXCEEDED' },
    );
  });
});

describe('Trần riêng của người ngoài trong một nhóm', () => {
  it('người ngoài có 2 tin sống trong nhóm gửi thêm vào nhóm đó: 409 OUTSIDER_QUOTA_EXCEEDED', () => {
    expect(decide('adds', { live: 2, outsiderLiveInGroup: 2 })).toEqual({
      ok: false,
      code: 'OUTSIDER_QUOTA_EXCEEDED',
    });
  });

  it('gửi sang nơi khác hay là thành viên (không có số người ngoài): được', () => {
    expect(decide('adds', { live: 2, outsiderLiveInGroup: null })).toEqual({ ok: true });
    expect(decide('adds', { live: 2, outsiderLiveInGroup: 1 })).toEqual({ ok: true });
  });
});
