import type { Actor } from '../../common/auth/actor.js';
import type { CursorQuery } from '../../common/schemas/cursor.js';
import { toCursorPage } from '../../common/schemas/cursor.js';
import type { ConversationTranscriptDto } from '../review/review.schema.js';
import type { Conversation, Message } from './messaging.repository.js';
import type { ConversationDto, MessageDto } from './messaging.schema.js';
import {
  conversationNotFound,
  DAY_MS,
  type MessagingServiceDeps,
  otherOf,
  type Side,
  sideOf,
} from './messaging.shared.js';

export interface InboxService {
  conversations(
    actor: Actor,
    query: CursorQuery,
  ): Promise<{ items: ConversationDto[]; nextCursor: string | null }>;
  conversation(actor: Actor, conversationId: string): Promise<ConversationDto>;
  /** Mới trước; con trỏ đi về quá khứ. */
  messages(
    actor: Actor,
    conversationId: string,
    query: CursorQuery,
  ): Promise<{ items: MessageDto[]; nextCursor: string | null }>;
  /** Cổng `BuyerInterest` của `trust`: có người mua đã nhắn, không dùng chung máy với người bán (TK 20). */
  hasInquiry(listingId: string): Promise<boolean>;
  /** Cổng cho `review`: bản ghi hội thoại đi kèm lượt báo — không phụ thuộc hai bên đã xoá phía mình. */
  transcripts(conversationIds: string[]): Promise<Map<string, ConversationTranscriptDto>>;
  /** Bên nghe `messaging.message.sent`: báo hiệu cho người nhận qua realtime — app tải lại qua HTTP. */
  signalMessage(input: { conversationId: string; messageId: string; recipientId: string }): void;
}

/** Bản ghi cho người xử cắt ở ngần này tin nhắn gần nhất (design, Risks). */
const TRANSCRIPT_MESSAGES = 500;

export const toMessageDto = (row: Message): MessageDto => ({
  id: row.id,
  conversationId: row.conversationId,
  senderId: row.senderId,
  body: row.body,
  createdAt: row.createdAt.toISOString(),
});

export function createInboxService(deps: MessagingServiceDeps): {
  service: InboxService;
  /** Dựng DTO cho một lô hội thoại như `accountId` thấy — `conversation.service` dùng lại khi mở hội thoại. */
  describe(rows: Conversation[], accountId: string): Promise<ConversationDto[]>;
} {
  const { repository, identity, listings, realtime, config, clock } = deps;

  const describe = async (rows: Conversation[], accountId: string): Promise<ConversationDto[]> => {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const others = [...new Set(rows.map((row) => otherOf(row, sideOf(row, accountId) ?? 'buyer')))];
    const [titles, summaries, last, unread, blocked] = await Promise.all([
      listings.titles([...new Set(rows.map((row) => row.listingId))]),
      identity.accountSummaries(others),
      repository.lastMessages(ids),
      repository.unreadCounts(ids, accountId),
      repository.blockedWith(accountId, others),
    ]);
    return rows.map((row) => {
      const side: Side = sideOf(row, accountId) ?? 'buyer';
      const other = otherOf(row, side);
      const summary = summaries.get(other);
      const gone = !summary || summary.status === 'deleted';
      const locked = blocked.has(other);
      const lastMessage = last.get(row.id);
      return {
        id: row.id,
        listing: { id: row.listingId, title: titles.get(row.listingId) ?? null },
        role: side,
        counterpart: { accountId: other, displayName: gone ? null : summary.displayName, gone },
        lastMessage: lastMessage ? toMessageDto(lastMessage) : null,
        unreadCount: unread.get(row.id) ?? 0,
        locked,
        canSend: !locked && !gone,
        createdAt: row.createdAt.toISOString(),
        lastActivityAt: row.lastActivityAt.toISOString(),
      };
    });
  };

  /** Hội thoại của người này; người ngoài nhận 404 như không có (spec conversations). */
  const owned = async (actor: Actor, conversationId: string) => {
    const row = await repository.find(conversationId);
    const side = row ? sideOf(row, actor.accountId) : null;
    if (!row || !side) throw conversationNotFound();
    return { row, side };
  };

  return {
    describe,
    service: {
      async conversations(actor, query) {
        const rows = await repository.listFor(actor.accountId, query.cursor, query.limit + 1);
        const page = toCursorPage(rows, query.limit, (row) => ({
          at: row.lastActivityAt,
          id: row.id,
        }));
        return { items: await describe(page.items, actor.accountId), nextCursor: page.nextCursor };
      },

      async conversation(actor, conversationId) {
        const { row } = await owned(actor, conversationId);
        const [dto] = await describe([row], actor.accountId);
        if (!dto) throw conversationNotFound();
        return dto;
      },

      async messages(actor, conversationId, query) {
        await owned(actor, conversationId);
        const rows = await repository.messages(conversationId, query.cursor, query.limit + 1);
        const page = toCursorPage(rows, query.limit, (row) => ({ at: row.createdAt, id: row.id }));
        return { items: page.items.map(toMessageDto), nextCursor: page.nextCursor };
      },

      async hasInquiry(listingId) {
        const found = await repository.inquiries(listingId);
        if (!found) return false;
        // Người hỏi mua dùng chung máy với người bán không tính (TK 20) — cùng cửa sổ dữ liệu thiết bị như `review`.
        const since = new Date(clock().getTime() - config.get('device.dataRetentionDays') * DAY_MS);
        const shared = new Set(await identity.sharedDeviceAccounts(found.sellerId, since));
        return found.buyerIds.some((buyerId) => !shared.has(buyerId));
      },

      async transcripts(conversationIds) {
        const rows = await repository.transcripts(
          [...new Set(conversationIds)],
          TRANSCRIPT_MESSAGES,
        );
        return new Map(
          rows.map((row) => [
            row.id,
            {
              id: row.id,
              listingId: row.listingId,
              buyerId: row.buyerId,
              sellerId: row.sellerId,
              messages: row.messages.map((message) => ({
                id: message.id,
                senderId: message.senderId,
                body: message.body,
                flagged: message.flagged,
                createdAt: message.createdAt.toISOString(),
              })),
            },
          ]),
        );
      },

      signalMessage({ conversationId, messageId, recipientId }) {
        realtime.emitToUser(recipientId, 'message:new', { conversationId, messageId });
      },
    },
  };
}
