import type { PromotionEffect, PromotionScope, TrustTier } from '@prisma/client';

import { TIERS } from '../promotion.schema.js';

/** Một gói như master gửi lên; `null` ở `durationDays` với `rank_to_top`. */
export interface ProductInput {
  effect: PromotionEffect;
  durationDays: number | null;
}

/** Luật của CHECK `promotion_products_duration_check` nói bằng câu, cộng trần ngày của bảng con số. */
export function productIssue(input: ProductInput, featuredMaxDays: number): string | null {
  if (input.effect === 'featured') {
    if (input.durationDays === null) return 'Gói nổi bật cần thời hạn (ngày)';
    if (input.durationDays > featuredMaxDays) {
      return `Thời hạn nổi bật tối đa ${featuredMaxDays} ngày`;
    }
    return null;
  }
  return input.durationDays === null ? null : 'Gói đẩy lên đầu không có thời hạn';
}

/** Số thứ tự mức (`promotion.minTier` là số 0–3) → mức. */
export const tierAt = (index: number): TrustTier => TIERS[Math.min(Math.max(index, 0), 3)] ?? 'T0';

export interface StarterProduct {
  code: string;
  name: string;
  description: string;
  effect: PromotionEffect;
  durationDays: number | null;
  price: number;
  scope: PromotionScope;
  sort: number;
}

/** Bộ khởi đầu (chốt 28/10/2026): số nhỏ để master nhẩm — cấp 4 Xu = 4 lần đẩy hay một tuần nổi bật. */
export const STARTER_PRODUCTS: readonly StarterProduct[] = [
  {
    code: 'rank_to_top',
    name: 'Đẩy lên đầu',
    description: 'Tin đứng như vừa lên bảng rồi trôi dần theo tin mới.',
    effect: 'rank_to_top',
    durationDays: null,
    price: 1,
    scope: 'both',
    sort: 0,
  },
  {
    code: 'featured_3d',
    name: 'Nổi bật 3 ngày',
    description: 'Tin vào dải "Tin nổi bật" ở đầu bảng tin trong 3 ngày.',
    effect: 'featured',
    durationDays: 3,
    price: 2,
    scope: 'both',
    sort: 1,
  },
  {
    code: 'featured_7d',
    name: 'Nổi bật 7 ngày',
    description: 'Tin vào dải "Tin nổi bật" ở đầu bảng tin trong 7 ngày.',
    effect: 'featured',
    durationDays: 7,
    price: 4,
    scope: 'both',
    sort: 2,
  },
];
