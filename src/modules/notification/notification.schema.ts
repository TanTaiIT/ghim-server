import { z } from 'zod';

import { paginationQuerySchema } from '../../common/schemas/pagination.js';

/** Tuple của enum `notification_category` — mười một nhóm của TK 24 (`wallet` từ add-wallet). */
export const NOTIFICATION_CATEGORIES = [
  'messages',
  'your_listings',
  'your_groups',
  'your_reports',
  'account',
  'trust_strikes',
  'group_announcements',
  'group_new_listings',
  'support',
  'saved_searches',
  'wallet',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Nhóm "tài khoản" luôn bật (TK 24). */
export const ALWAYS_ON: NotificationCategory = 'account';

export const notificationSchema = z.object({
  id: z.uuid(),
  category: z.enum(NOTIFICATION_CATEGORIES),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  /** Chỉ có khi người nhận được xem (vd lý do khoá nhóm cho chủ nhóm); không bao giờ nằm trong câu nhắc. */
  detail: z.string().nullable(),
  data: z.record(z.string(), z.string().nullable()),
  groupId: z.uuid().nullable(),
  count: z.number().int(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const inboxQuerySchema = paginationQuerySchema;

export const markReadBodySchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

export const unreadCountSchema = z.object({ count: z.number().int() });

export const preferencesSchema = z.object({
  categories: z.array(
    z.object({ category: z.enum(NOTIFICATION_CATEGORIES), enabled: z.boolean() }),
  ),
  mutedGroupIds: z.array(z.uuid()),
});

export const categoryParamsSchema = z.object({ category: z.enum(NOTIFICATION_CATEGORIES) });
export const preferenceBodySchema = z.object({ enabled: z.boolean() }).strict();
export const groupParamsSchema = z.object({ groupId: z.uuid() });

export type NotificationDto = z.infer<typeof notificationSchema>;
export type PreferencesDto = z.infer<typeof preferencesSchema>;
export type MarkReadInput = z.infer<typeof markReadBodySchema>;
