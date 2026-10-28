import { describe, expect, it } from 'vitest';

import {
  productIssue,
  STARTER_PRODUCTS,
  tierAt,
} from '../src/modules/promotion/calc/catalog.calc.js';
import {
  expiryOf,
  purchaseBlock,
  type PurchaseFacts,
  scopeFits,
} from '../src/modules/promotion/calc/purchase.calc.js';

/* Spec promotion/catalog, promotion/purchase — phần thuần (change add-promotions): gói hợp lệ, vì sao chưa mua được. */
const NOW = new Date('2026-10-28T10:00:00+07:00');
const HOUR_MS = 3_600_000;

const facts = (over: Partial<PurchaseFacts> = {}): PurchaseFacts => ({
  product: { scope: 'both', minTier: 'T1', cooldownHours: 24, price: 1 },
  placement: 'marketplace',
  groupAllows: null,
  tier: 'T2',
  postingLockedUntil: null,
  listingBlock: null,
  lastPurchaseAt: null,
  purchasesToday: 0,
  maxPerDay: 3,
  balance: 5,
  now: NOW,
  ...over,
});

describe('Gói hợp lệ', () => {
  it('nổi bật cần thời hạn trong trần; đẩy lên đầu không có thời hạn', () => {
    expect(productIssue({ effect: 'featured', durationDays: null }, 30)).toMatch(/cần thời hạn/);
    expect(productIssue({ effect: 'featured', durationDays: 31 }, 30)).toMatch(/tối đa 30/);
    expect(productIssue({ effect: 'featured', durationDays: 7 }, 30)).toBeNull();
    expect(productIssue({ effect: 'rank_to_top', durationDays: 3 }, 30)).toMatch(
      /không có thời hạn/,
    );
    expect(productIssue({ effect: 'rank_to_top', durationDays: null }, 30)).toBeNull();
  });

  it('bộ khởi đầu: 1 / 2 / 4 Xu, cả hai phạm vi; số thứ tự mức', () => {
    expect(STARTER_PRODUCTS.map((p) => [p.code, p.price, p.durationDays])).toEqual([
      ['rank_to_top', 1, null],
      ['featured_3d', 2, 3],
      ['featured_7d', 4, 7],
    ]);
    expect(STARTER_PRODUCTS.every((p) => p.scope === 'both')).toBe(true);
    expect([tierAt(0), tierAt(1), tierAt(3), tierAt(9)]).toEqual(['T0', 'T1', 'T3', 'T3']);
  });

  it('phạm vi gói với nơi đăng của tin', () => {
    expect(scopeFits('marketplace', 'marketplace')).toBe(true);
    expect(scopeFits('marketplace', 'members_only')).toBe(false);
    expect(scopeFits('group', 'group_public')).toBe(true);
    expect(scopeFits('group', 'marketplace')).toBe(false);
    expect(scopeFits('both', null)).toBe(true);
  });
});

describe('Vì sao chưa mua được', () => {
  it('mua được khi mọi điều kiện đủ', () => {
    expect(purchaseBlock(facts())).toBeNull();
  });

  it('thứ tự: phạm vi → khoá đăng tin → mức → nhóm tắt → tin không đầy đủ → chờ → trần ngày → thiếu Xu', () => {
    const all = facts({
      product: { scope: 'group', minTier: 'T1', cooldownHours: 24, price: 1 },
      tier: 'T0',
      postingLockedUntil: new Date(NOW.getTime() + HOUR_MS),
      groupAllows: false,
      listingBlock: 'Tin đang chờ duyệt',
      lastPurchaseAt: NOW,
      purchasesToday: 3,
      balance: 0,
    });
    expect(purchaseBlock(all)?.code).toBe('NOT_FOUND');
    const inGroup = { ...all, placement: 'members_only' as const };
    expect(purchaseBlock(inGroup)).toMatchObject({
      code: 'POSTING_LOCKED',
      retryAt: all.postingLockedUntil,
    });
    const t0 = { ...inGroup, postingLockedUntil: null };
    expect(purchaseBlock(t0)?.code).toBe('TRUST_TIER_TOO_LOW');
    const unlocked = { ...t0, tier: 'T1' as const };
    expect(purchaseBlock(unlocked)?.code).toBe('GROUP_PROMOTIONS_OFF');
    const allowed = { ...unlocked, groupAllows: true };
    expect(purchaseBlock(allowed)).toMatchObject({
      code: 'LISTING_NOT_PROMOTABLE',
      message: 'Tin đang chờ duyệt',
    });
    const live = { ...allowed, listingBlock: null };
    expect(purchaseBlock(live)).toMatchObject({
      code: 'PROMOTION_COOLDOWN',
      retryAt: new Date(NOW.getTime() + 24 * HOUR_MS),
    });
    const cooled = { ...live, lastPurchaseAt: new Date(NOW.getTime() - 25 * HOUR_MS) };
    expect(purchaseBlock(cooled)).toMatchObject({
      code: 'PROMOTION_DAILY_LIMIT',
      retryAt: new Date('2026-10-29T00:00:00+07:00'),
    });
    const fresh = { ...cooled, purchasesToday: 2 };
    expect(purchaseBlock(fresh)?.code).toBe('INSUFFICIENT_BALANCE');
    expect(purchaseBlock({ ...fresh, balance: 1 })).toBeNull();
  });

  it('câu "cần mức T1"; thời gian chờ 0 không chờ; khoá đăng tin đã qua không chặn', () => {
    expect(purchaseBlock(facts({ tier: 'T0' }))?.message).toBe('Cần mức T1 để dùng gói này');
    expect(
      purchaseBlock(
        facts({
          product: { scope: 'both', minTier: 'T1', cooldownHours: 0, price: 1 },
          lastPurchaseAt: NOW,
        }),
      ),
    ).toBeNull();
    expect(
      purchaseBlock(facts({ postingLockedUntil: new Date(NOW.getTime() - HOUR_MS) })),
    ).toBeNull();
  });

  it('hạn nổi bật = lúc mua + số ngày', () => {
    expect(expiryOf(NOW, 7)).toEqual(new Date(NOW.getTime() + 7 * 86_400_000));
  });
});
