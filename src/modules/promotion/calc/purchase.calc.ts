import type { ListingPlacement, PromotionScope, TrustTier } from '@prisma/client';

import { formatDateVN, formatMomentVN, startOfDayVN } from '../../../common/time/time.js';
import { TIERS } from '../promotion.schema.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Dữ kiện một lượt mua, gom từ cổng của `listing`, `trust`, `group`, `wallet` và chính `promotion`. */
export interface PurchaseFacts {
  product: { scope: PromotionScope; minTier: TrustTier; cooldownHours: number; price: number };
  placement: ListingPlacement | null;
  /** Tin của nhóm: nhóm còn cho thành viên dùng gói không; tin sàn: `null`. */
  groupAllows: boolean | null;
  tier: TrustTier;
  postingLockedUntil: Date | null;
  /** Câu của `boostBlock` khi tin không hiển thị đầy đủ; `null` = đẩy được. */
  listingBlock: string | null;
  /** Lượt mua gần nhất cùng gói cho tin này. */
  lastPurchaseAt: Date | null;
  purchasesToday: number;
  maxPerDay: number;
  balance: number;
  now: Date;
}

export type PurchaseBlockCode =
  | 'NOT_FOUND'
  | 'TRUST_TIER_TOO_LOW'
  | 'POSTING_LOCKED'
  | 'GROUP_PROMOTIONS_OFF'
  | 'LISTING_NOT_PROMOTABLE'
  | 'PROMOTION_COOLDOWN'
  | 'PROMOTION_DAILY_LIMIT'
  | 'INSUFFICIENT_BALANCE';

export interface PurchaseBlock {
  code: PurchaseBlockCode;
  message: string;
  retryAt?: Date;
}

export const scopeFits = (scope: PromotionScope, placement: ListingPlacement | null): boolean =>
  scope === 'both' ||
  (scope === 'marketplace' ? placement === 'marketplace' : placement !== 'marketplace');

const tierIndex = (tier: TrustTier): number => TIERS.indexOf(tier);

/**
 * Vì sao chưa mua được (spec promotion/purchase), theo thứ tự rẻ trước: gói không hợp phạm vi → khoá đăng tin → mức → nhóm
 * tắt → tin không hiển thị đầy đủ → thời gian chờ → trần ngày → thiếu Xu. Khoá đăng tin trước mức vì gậy hạ mức về T0:
 * người bị khoá cần nghe "đang tạm khoá tới …", không phải "cần mức T1". `null` = mua được. Thiếu Xu đứng cuối: là
 * lý do duy nhất người đăng sửa được ngay bằng cách xin Xu, và lượt mua thật kiểm nó trong transaction.
 */
export function purchaseBlock(facts: PurchaseFacts): PurchaseBlock | null {
  const { product, now } = facts;
  if (!scopeFits(product.scope, facts.placement)) {
    return { code: 'NOT_FOUND', message: 'Gói này không áp cho nơi đăng của tin' };
  }
  if (facts.postingLockedUntil && facts.postingLockedUntil > now) {
    return {
      code: 'POSTING_LOCKED',
      message: `Bạn đang tạm khoá đăng tin vì điểm vi phạm — dùng gói lại được từ ${formatDateVN(facts.postingLockedUntil)}`,
      retryAt: facts.postingLockedUntil,
    };
  }
  if (tierIndex(facts.tier) < tierIndex(product.minTier)) {
    return { code: 'TRUST_TIER_TOO_LOW', message: `Cần mức ${product.minTier} để dùng gói này` };
  }
  if (facts.groupAllows === false) {
    return { code: 'GROUP_PROMOTIONS_OFF', message: 'Nhóm này không cho dùng gói đẩy tin' };
  }
  if (facts.listingBlock) {
    return { code: 'LISTING_NOT_PROMOTABLE', message: facts.listingBlock };
  }
  if (facts.lastPurchaseAt && product.cooldownHours > 0) {
    const retryAt = new Date(facts.lastPurchaseAt.getTime() + product.cooldownHours * HOUR_MS);
    if (retryAt > now) {
      return {
        code: 'PROMOTION_COOLDOWN',
        message: `Tin này vừa dùng gói — dùng lại được từ ${formatMomentVN(retryAt)}`,
        retryAt,
      };
    }
  }
  if (facts.purchasesToday >= facts.maxPerDay) {
    const retryAt = new Date(startOfDayVN(now).getTime() + DAY_MS);
    return {
      code: 'PROMOTION_DAILY_LIMIT',
      message: `Mỗi ngày dùng tối đa ${facts.maxPerDay} gói — mua lại được từ ${formatMomentVN(retryAt)}`,
      retryAt,
    };
  }
  if (facts.balance < product.price) {
    return {
      code: 'INSUFFICIENT_BALANCE',
      message: 'Ví không đủ Xu — nhắn Hỗ trợ Ghim để xin thêm',
    };
  }
  return null;
}

/** Hạn nổi bật của lượt mua `featured`: lúc mua + số ngày của gói. */
export const expiryOf = (at: Date, durationDays: number): Date =>
  new Date(at.getTime() + durationDays * DAY_MS);
