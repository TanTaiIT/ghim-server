import { z } from 'zod';

import { cursorQuerySchema } from '../../common/schemas/cursor.js';
import { offerAmountSchema, priceSchema } from '../../common/schemas/money.js';
import { paginationQuerySchema } from '../../common/schemas/pagination.js';
import { LISTING_STATES } from '../listing/listing.schema.js';
import { REPORT_CATEGORIES } from '../review/report/report.schema.js';

/** Chỉ chữ, tối đa ngần này ký tự (design add-messaging mục 10, câu 8). */
export const MESSAGE_MAX = 2000;
const iso = z.iso.datetime();

/** Tuple của enum `conversation_kind` (add-team-conversations). */
export const CONVERSATION_KINDS = ['listing', 'support', 'group'] as const;
/** Tuple của enum `message_kind`, `offer_status` (add-price-offers). */
export const MESSAGE_KINDS = ['text', 'offer'] as const;
export const OFFER_STATUSES = ['pending', 'accepted', 'declined', 'superseded'] as const;
/** Người bán chỉ chọn được hai lối ra; `superseded` là việc của đề nghị mới. */
export const OFFER_DECISIONS = ['accepted', 'declined'] as const;
export type OfferDecision = (typeof OFFER_DECISIONS)[number];

export const listingParamsSchema = z.object({ listingId: z.uuid() });
export const conversationParamsSchema = z.object({ conversationId: z.uuid() });
export const offerParamsSchema = z.object({ conversationId: z.uuid(), messageId: z.uuid() });
export const groupParamsSchema = z.object({ groupId: z.uuid() });
export const blockParamsSchema = z.object({ accountId: z.uuid() });

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  /** Người dùng nhận `null` cho tin của đội — không biết ai trong đội viết (add-team-conversations). */
  senderId: z.uuid().nullable(),
  fromMe: z.boolean(),
  kind: z.enum(MESSAGE_KINDS),
  /** Đề nghị giá để rỗng — đọc `offer`. */
  body: z.string(),
  offer: z
    .object({
      amount: priceSchema,
      status: z.enum(OFFER_STATUSES),
      respondedAt: iso.nullable(),
    })
    .nullable(),
  createdAt: iso,
});

/** Hội thoại như một bên thấy: tin, bên kia, tin nhắn cuối, chưa đọc, và cờ "không nhận tin nhắn" (TK 24). */
export const conversationSchema = z.object({
  id: z.uuid(),
  kind: z.enum(CONVERSATION_KINDS),
  /** Chỉ hội thoại về tin. Tin đã xoá: tiêu đề, giá, ảnh bìa null; tin bị gỡ không có ảnh bìa (add-price-offers). */
  listing: z
    .object({
      id: z.uuid(),
      title: z.string().nullable(),
      price: priceSchema.nullable(),
      negotiable: z.boolean(),
      state: z.enum(LISTING_STATES),
      cover: z.object({ id: z.uuid(), url: z.string() }).nullable(),
    })
    .nullable(),
  /** Chỉ hội thoại với quản trị một nhóm — tên đọc lúc trả, nhóm đổi tên thì đổi theo. */
  group: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Vai của người xem: người dùng của hội thoại với một đội là `buyer`; người trong đội là `team`. */
  role: z.enum(['buyer', 'seller', 'team']),
  /** `gone` = bên kia đã xoá tài khoản: đọc được, không gửi được. Bên kia là đội: `accountId` null, tên là tên đội. */
  counterpart: z.object({
    kind: z.enum(['account', 'support', 'group_admins']),
    accountId: z.uuid().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    gone: z.boolean(),
  }),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int(),
  /** Có chặn giữa hai bên — cùng một cờ cho cả hai, không nói ai chặn (spec messaging/blocking). */
  locked: z.boolean(),
  canSend: z.boolean(),
  /** Người mua, gửi được, tin đang hiển thị, cho thương lượng, giá trên 0 (spec messaging/price-offers). */
  canOffer: z.boolean(),
  createdAt: iso,
  lastActivityAt: iso,
});

export const messageBodySchema = z
  .object({ body: z.string().trim().min(1).max(MESSAGE_MAX) })
  .strict();
export const offerBodySchema = z.object({ amount: offerAmountSchema }).strict();
export const conversationsQuerySchema = cursorQuerySchema;
export const messagesQuerySchema = cursorQuerySchema;

/** Hàng hỗ trợ trên bàn vận hành: `pending` = đang chờ đội trả lời; mặc định cả hàng, đang chờ lâu nhất trước. */
export const supportQueueQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['pending', 'all']).default('all'),
});

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
export type OfferBody = z.infer<typeof offerBodySchema>;
export type SupportQueueQuery = z.infer<typeof supportQueueQuerySchema>;
export type BlockedDto = z.infer<typeof blockedSchema>;
export type ConversationReportBody = z.infer<typeof conversationReportBodySchema>;
