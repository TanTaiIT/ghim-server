import { z } from 'zod';

import { cursorQuerySchema } from '../../common/schemas/cursor.js';
import { paginationQuerySchema } from '../../common/schemas/pagination.js';
import { REPORT_CATEGORIES } from '../review/report/report.schema.js';

/** Chỉ chữ, tối đa ngần này ký tự (design add-messaging mục 10, câu 8). */
export const MESSAGE_MAX = 2000;
const iso = z.iso.datetime();

export const listingParamsSchema = z.object({ listingId: z.uuid() });
export const conversationParamsSchema = z.object({ conversationId: z.uuid() });
export const blockParamsSchema = z.object({ accountId: z.uuid() });

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  senderId: z.uuid(),
  body: z.string(),
  createdAt: iso,
});

/** Hội thoại như một bên thấy: tin, bên kia, tin nhắn cuối, chưa đọc, và cờ "không nhận tin nhắn" (TK 24). */
export const conversationSchema = z.object({
  id: z.uuid(),
  listing: z.object({ id: z.uuid(), title: z.string().nullable() }),
  /** Vai của người xem trong hội thoại này. */
  role: z.enum(['buyer', 'seller']),
  /** `gone` = bên kia đã xoá tài khoản: đọc được, không gửi được. */
  counterpart: z.object({
    accountId: z.uuid(),
    displayName: z.string().nullable(),
    gone: z.boolean(),
  }),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int(),
  /** Có chặn giữa hai bên — cùng một cờ cho cả hai, không nói ai chặn (spec messaging/blocking). */
  locked: z.boolean(),
  canSend: z.boolean(),
  createdAt: iso,
  lastActivityAt: iso,
});

export const messageBodySchema = z
  .object({ body: z.string().trim().min(1).max(MESSAGE_MAX) })
  .strict();
export const conversationsQuerySchema = cursorQuerySchema;
export const messagesQuerySchema = cursorQuerySchema;

export const blockBodySchema = z.object({ accountId: z.uuid() }).strict();
export const blocksQuerySchema = paginationQuerySchema;
export const blockedSchema = z.object({
  accountId: z.uuid(),
  displayName: z.string().nullable(),
  blockedAt: iso,
});

/** Báo cáo từ hội thoại: chỉ chọn loại — đối tượng là bên kia, bằng chứng là chính hội thoại (spec review/reports). */
export const conversationReportBodySchema = z
  .object({ category: z.enum(REPORT_CATEGORIES) })
  .strict();

export type ConversationDto = z.infer<typeof conversationSchema>;
export type MessageDto = z.infer<typeof messageSchema>;
export type MessageBody = z.infer<typeof messageBodySchema>;
export type BlockedDto = z.infer<typeof blockedSchema>;
export type ConversationReportBody = z.infer<typeof conversationReportBodySchema>;
