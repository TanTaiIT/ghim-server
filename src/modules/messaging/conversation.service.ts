import type { Actor } from '../../common/auth/actor.js';
import { startOfDayVN } from '../../common/time/time.js';
import { toMessageDto } from './inbox.service.js';
import { MESSAGING_EVENTS, messagingEvent } from './messaging.outbox.js';
import type { Conversation } from './messaging.repository.js';
import type { ConversationDto, MessageDto } from './messaging.schema.js';
import {
  assertCanMessage,
  conversationClosed,
  conversationNotFound,
  DAY_MS,
  listingNotLive,
  messageNotAllowed,
  messagingBlocked,
  type MessagingServiceDeps,
  newConversationLimit,
  otherOf,
  ownListing,
  sideOf,
  VIEWING_TTL_MS,
} from './messaging.shared.js';

export interface ConversationService {
  /** `created = false`: hội thoại của cặp tin + người mua đã có — trả lại, bỏ ẩn phía mình, không tính hạn mức. */
  open(
    actor: Actor,
    listingId: string,
  ): Promise<{ created: boolean; conversation: ConversationDto }>;
  send(actor: Actor, conversationId: string, body: string): Promise<MessageDto>;
  markRead(actor: Actor, conversationId: string): Promise<void>;
  /** Xoá hội thoại = ẩn phía mình; bên kia vẫn thấy đủ (spec conversation-deletion). */
  remove(actor: Actor, conversationId: string): Promise<void>;
  /** Máy này đang mở hội thoại — tin nhắn của nó không đẩy lên máy này trong `VIEWING_TTL_MS` (add-notifications). */
  setViewing(actor: Actor, conversationId: string): Promise<void>;
  clearViewing(actor: Actor, conversationId: string): Promise<void>;
  /** Bên nghe `identity.account.deleted`: ẩn mọi hội thoại phía người xoá. */
  onAccountDeleted(accountId: string): Promise<number>;
}

/**
 * Mở hội thoại và nhắn tin (design add-messaging mục 2, 3). Hội thoại đã mở không hỏi lại trạng thái tin: tin đã bán,
 * hết hạn, bị gỡ, tạm ẩn hay một bên rời nhóm đều nhắn tiếp được (TK 24) — chỉ lượt mở mới xét tin.
 */
export function createConversationService(
  deps: MessagingServiceDeps,
  describe: (rows: Conversation[], accountId: string) => Promise<ConversationDto[]>,
): ConversationService {
  const { repository, identity, listings, trust, screening, config, clock } = deps;

  const dtoOf = async (row: Conversation, accountId: string): Promise<ConversationDto> => {
    const [dto] = await describe([row], accountId);
    if (!dto) throw conversationNotFound();
    return dto;
  };

  const owned = async (actor: Actor, conversationId: string) => {
    const row = await repository.find(conversationId);
    const side = row ? sideOf(row, actor.accountId) : null;
    if (!row || !side) throw conversationNotFound();
    return { row, side };
  };

  return {
    async open(actor, listingId) {
      assertCanMessage(actor);
      const target = await listings.reportTarget(actor, listingId);
      if (!target) throw conversationNotFound();
      if (target.ownerId === actor.accountId) throw ownListing();
      // Hội thoại cũ không bị cắt: trả lại trước khi xét tin còn hiển thị không.
      const existing = await repository.findPair(listingId, actor.accountId);
      if (existing) {
        await repository.unhide(existing.id, 'buyer');
        return { created: false, conversation: await dtoOf(existing, actor.accountId) };
      }
      if (target.state !== 'live') throw listingNotLive();
      if (!target.visible) throw conversationNotFound();
      if (await repository.blocked(actor.accountId, target.ownerId)) throw messagingBlocked();
      const tier = await trust.tierOf(actor.accountId);
      const cap = config.get(`quota.newConversationsPerDay${tier}`);
      const now = clock();
      const dayStart = startOfDayVN(now);
      const opened = await repository.inTransaction(async (tx) => {
        await repository.lockOpener(tx, actor.accountId);
        const again = await repository.findPair(listingId, actor.accountId, tx);
        if (again) return { row: again, created: false };
        if ((await repository.countOpenedSince(tx, actor.accountId, dayStart)) >= cap) {
          throw newConversationLimit(cap, new Date(dayStart.getTime() + DAY_MS));
        }
        const row = await repository.insert(tx, {
          listingId,
          sellerId: target.ownerId,
          buyerId: actor.accountId,
          createdAt: now,
        });
        await repository.emitIn(tx, [
          messagingEvent(MESSAGING_EVENTS.conversationOpened, {
            conversationId: row.id,
            listingId,
            buyerId: actor.accountId,
            sellerId: target.ownerId,
          }),
        ]);
        return { row, created: true };
      });
      return { created: opened.created, conversation: await dtoOf(opened.row, actor.accountId) };
    },

    async send(actor, conversationId, body) {
      assertCanMessage(actor);
      const { row, side } = await owned(actor, conversationId);
      const other = otherOf(row, side);
      const summary = (await identity.accountSummaries([other])).get(other);
      if (!summary || summary.status === 'deleted') throw conversationClosed();
      if (await repository.blocked(actor.accountId, other)) throw messagingBlocked();
      // Cùng bộ lọc với tin đăng; mức chắc không gửi, mức mơ hồ gửi kèm dấu cho người xử (design mục 4, cam kết 5).
      const verdict = await screening.phraseVerdict(body);
      if (verdict.blocked) throw messageNotAllowed();
      const now = clock();
      const message = await repository.inTransaction(async (tx) => {
        if (!(await repository.lock(tx, row.id))) throw conversationNotFound();
        const written = await repository.insertMessage(tx, {
          conversationId: row.id,
          senderId: actor.accountId,
          body,
          flagged: verdict.flagged,
          createdAt: now,
        });
        await repository.touch(tx, row.id, { from: side, at: now });
        await repository.emitIn(tx, [
          messagingEvent(MESSAGING_EVENTS.messageSent, {
            conversationId: row.id,
            messageId: written.id,
            listingId: row.listingId,
            senderId: actor.accountId,
            recipientId: other,
          }),
        ]);
        return written;
      });
      return toMessageDto(message);
    },

    async markRead(actor, conversationId) {
      const { side } = await owned(actor, conversationId);
      await repository.markRead(conversationId, side, clock());
    },

    async remove(actor, conversationId) {
      const { side } = await owned(actor, conversationId);
      await repository.hide(conversationId, side, clock());
    },

    async setViewing(actor, conversationId) {
      await owned(actor, conversationId);
      await repository.setPresence(
        actor.sessionId,
        conversationId,
        new Date(clock().getTime() + VIEWING_TTL_MS),
      );
    },

    async clearViewing(actor, conversationId) {
      await owned(actor, conversationId);
      await repository.clearPresence(actor.sessionId, conversationId);
    },

    onAccountDeleted: (accountId) => repository.hideAllOf(accountId, clock()),
  };
}
