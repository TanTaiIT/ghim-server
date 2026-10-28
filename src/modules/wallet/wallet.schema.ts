import { z } from 'zod';

import { cursorPaginated } from '../../common/schemas/cursor.js';

/** Tuple của enum `wallet_transaction_type` (CLAUDE.md luật 5). */
export const WALLET_TRANSACTION_TYPES = ['admin_adjust', 'product_purchase', 'refund'] as const;
export type WalletTransactionTypeDto = (typeof WALLET_TRANSACTION_TYPES)[number];

/** Trần một lượt cấp / trừ của master — chống gõ nhầm, không phải luật nghiệp vụ (design add-wallet mục 4). */
export const WALLET_ADJUST_LIMIT = 1000;
/** Bàn vận hành xem ví một người: các dòng gần nhất, không con trỏ. */
export const OPS_WALLET_RECENT = 20;

/** Tên sự kiện outbox của `wallet`; `notification` nghe để báo người nhận (design mục 7). */
export const WALLET_EVENTS = {
  balanceChanged: 'wallet.balance.changed',
} as const;

const iso = z.iso.datetime();

export const walletTransactionSchema = z.object({
  id: z.uuid(),
  /** Âm = trừ, dương = cộng. */
  amount: z.number().int(),
  type: z.enum(WALLET_TRANSACTION_TYPES),
  balanceAfter: z.number().int(),
  /** Việc gây ra dòng — `listingId`, `purchaseId`, `productCode` khi là gói đẩy tin (add-promotions). */
  refs: z.record(z.string(), z.string()),
  /** Lý do của master — người dùng đọc được. */
  note: z.string().nullable(),
  createdAt: iso,
});

export const walletSchema = z.object({ balance: z.number().int() });

export const walletPageSchema = cursorPaginated(walletTransactionSchema);

export const opsWalletSchema = z.object({
  balance: z.number().int(),
  transactions: z.array(walletTransactionSchema),
});

export const walletAccountParamsSchema = z.object({ accountId: z.uuid() });

/**
 * Khoá chống lặp do app sinh một lần mỗi lần mở hộp cấp Xu (design mục 3): gửi lại cùng khoá trả cùng dòng, cùng khoá
 * khác số là 409.
 */
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const walletAdjustBodySchema = z
  .object({
    amount: z
      .number()
      .int()
      .min(-WALLET_ADJUST_LIMIT)
      .max(WALLET_ADJUST_LIMIT)
      .refine((value) => value !== 0, { message: 'Số Xu phải khác 0' }),
    reason: z.string().trim().min(1).max(200),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const walletAdjustResultSchema = z.object({
  balance: z.number().int(),
  transaction: walletTransactionSchema,
});

export type WalletTransactionDto = z.infer<typeof walletTransactionSchema>;
export type WalletDto = z.infer<typeof walletSchema>;
export type OpsWalletDto = z.infer<typeof opsWalletSchema>;
export type WalletAdjustBody = z.infer<typeof walletAdjustBodySchema>;
export type WalletAdjustResultDto = z.infer<typeof walletAdjustResultSchema>;
