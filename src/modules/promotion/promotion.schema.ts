import { z } from 'zod';

import { idempotencyKeySchema } from '../wallet/wallet.schema.js';

/** Tuple của các enum `promotion` — đổi enum thì đổi luôn ở đây (CLAUDE.md luật 5). */
export const PROMOTION_EFFECTS = ['rank_to_top', 'featured'] as const;
export const PROMOTION_SCOPES = ['marketplace', 'group', 'both'] as const;
export const PURCHASE_STATUSES = ['applied', 'refunded'] as const;
export const TIERS = ['T0', 'T1', 'T2', 'T3'] as const;

export type PromotionEffectDto = (typeof PROMOTION_EFFECTS)[number];
export type PromotionScopeDto = (typeof PROMOTION_SCOPES)[number];

/** Tên sự kiện outbox của `promotion`; `notification` nghe (N60, N61). */
export const PROMOTION_EVENTS = {
  purchaseApplied: 'promotion.purchase.applied',
  purchaseExpiring: 'promotion.purchase.expiring',
} as const;

const iso = z.iso.datetime();
const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
/** Trần thời gian chờ giữa hai lần mua cùng gói cho một tin — chống gõ nhầm, 100 năm theo giờ. */
const COOLDOWN_MAX = 876_000;
const PRICE_MAX = 100_000;

export const productCodeSchema = z.string().regex(/^[a-z0-9_]{2,32}$/);
export const productCodeParamsSchema = z.object({ code: productCodeSchema });

/** Gói nhìn từ bàn vận hành — kể cả đã tắt. */
export const opsProductSchema = z.object({
  id: z.uuid(),
  code: productCodeSchema,
  name: z.string(),
  description: z.string().nullable(),
  effect: z.enum(PROMOTION_EFFECTS),
  durationDays: z.number().int().nullable(),
  cooldownHours: z.number().int(),
  price: z.number().int(),
  minTier: z.enum(TIERS),
  scope: z.enum(PROMOTION_SCOPES),
  active: z.boolean(),
  sort: z.number().int(),
  createdAt: iso,
  updatedAt: iso,
});

const productFields = {
  name: z.string().trim().min(1).max(NAME_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX).nullable(),
  /** Chỉ `featured`; trần là con số `promotion.featuredMaxDays` — service kiểm. */
  durationDays: z.number().int().positive().nullable(),
  cooldownHours: z.number().int().min(0).max(COOLDOWN_MAX),
  price: z.number().int().min(1).max(PRICE_MAX),
  minTier: z.enum(TIERS),
  scope: z.enum(PROMOTION_SCOPES),
  sort: z.number().int().min(0),
};

export const createProductBodySchema = z
  .object({
    code: productCodeSchema,
    effect: z.enum(PROMOTION_EFFECTS),
    ...productFields,
    description: productFields.description.optional(),
    durationDays: productFields.durationDays.optional(),
    sort: productFields.sort.optional(),
  })
  .strict();

/** Không đổi `code`, `effect`: lượt mua đã chụp lại chúng. */
export const updateProductBodySchema = z
  .object({
    ...productFields,
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Cần ít nhất một thay đổi' });

/** Gói nhìn từ người đăng với một tin: mua được không và vì sao chưa (TK 4 nguyên tắc 8: không ẩn gói). */
export const ownerProductSchema = z.object({
  code: productCodeSchema,
  name: z.string(),
  description: z.string().nullable(),
  effect: z.enum(PROMOTION_EFFECTS),
  durationDays: z.number().int().nullable(),
  price: z.number().int(),
  minTier: z.enum(TIERS),
  purchasable: z.boolean(),
  /** Câu người đăng đọc khi chưa mua được; `null` = mua được. */
  reason: z.string().nullable(),
  /** Lúc mua lại được khi đang trong thời gian chờ hay đã chạm trần ngày. */
  retryAt: iso.nullable(),
});

export const purchaseSchema = z.object({
  id: z.uuid(),
  listingId: z.uuid(),
  productCode: productCodeSchema,
  effect: z.enum(PROMOTION_EFFECTS),
  price: z.number().int(),
  appliedAt: iso,
  expiresAt: iso.nullable(),
  status: z.enum(PURCHASE_STATUSES),
  refundedAt: iso.nullable(),
});

export const listingPromotionsSchema = z.object({
  products: z.array(ownerProductSchema),
  /** Gói nổi bật đang chạy của tin (còn hạn), hay `null`. */
  running: purchaseSchema.nullable(),
  balance: z.number().int(),
});

export const purchaseBodySchema = z
  .object({ productCode: productCodeSchema, idempotencyKey: idempotencyKeySchema })
  .strict();

export type OpsProductDto = z.infer<typeof opsProductSchema>;
export type CreateProductBody = z.infer<typeof createProductBodySchema>;
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;
export type OwnerProductDto = z.infer<typeof ownerProductSchema>;
export type PurchaseDto = z.infer<typeof purchaseSchema>;
export type ListingPromotionsDto = z.infer<typeof listingPromotionsSchema>;
export type PurchaseBody = z.infer<typeof purchaseBodySchema>;
