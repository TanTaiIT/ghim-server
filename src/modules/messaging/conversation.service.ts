import type { Prisma } from '@prisma/client';

import { auditActor } from '../../common/audit/audit.js';
import type { Actor } from '../../common/auth/actor.js';
import { ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import { startOfDayVN } from '../../common/time/time.js';
import { takesOffers, toMessageDto, viewerOf } from './inbox.service.js';
import { MESSAGING_EVENTS, messagingEvent } from './messaging.outbox.js';
import type { Conversation, RetentionRow, TeamKind } from './messaging.repository.js';
import type { ConversationDto, MessageDto, OfferDecision } from './messaging.schema.js';
import {
  assertCanMessage,
  conversationClosed,
  conversationNotFound,
  DAY_MS,
  groupBanned,
  groupConversationClosed,
  groupNotActive,
  isTeam,
  listingNotLive,
  messageNotAllowed,
  messagingBlocked,
  type MessagingServiceDeps,
  newConversationLimit,
  offerAbovePrice,
  offerBuyerOnly,
  offerListingNotLive,
  offerNotFound,
  offerNotPending,
  offerSellerOnly,
  offersNotAccepted,
  OPEN_FOR_CONVERSATIONS,
  otherOf,
  ownedBy,
  ownGroup,
  ownListing,
  type Side,
  teamCannotDelete,
  VIEWING_TTL_MS,
} from './messaging.shared.js';

type Opened = { created: boolean; conversation: ConversationDto };

export interface ConversationService {
  /** `created = false`: hội thoại của cặp tin + người mua đã có — trả lại, bỏ ẩn phía mình, không tính hạn mức. */
  open(actor: Actor, listingId: string): Promise<Opened>;
  /** Một hội thoại hỗ trợ mỗi người (spec messaging/support-chat); mở lại thì bỏ ẩn phía mình. */
  openSupport(actor: Actor): Promise<Opened>;
  /** Một hội thoại mỗi người + nhóm (spec messaging/group-admin-chat); ai xem được hồ sơ nhóm thì mở được. */
  openGroup(actor: Actor, groupId: string): Promise<Opened>;
  send(actor: Actor, conversationId: string, body: string): Promise<MessageDto>;
  /** Staff hỗ trợ trả lời từ bàn vận hành: không qua bộ lọc cụm, không trả lời hội thoại của chính mình (cam kết 1). */
  replyAsSupport(actor: Actor, conversationId: string, body: string): Promise<MessageDto>;
  /** Người mua trả giá (spec messaging/price-offers): thay đề nghị đang chờ, tính như tin nhắn của người mua. */
  offer(actor: Actor, conversationId: string, amount: bigint): Promise<MessageDto>;
  /** Người bán chấp nhận / từ chối đề nghị đang chờ khi tin còn hiển thị — chấp nhận chỉ ghi nhận, tin không đổi. */
  answerOffer(
    actor: Actor,
    conversationId: string,
    messageId: string,
    decision: OfferDecision,
  ): Promise<MessageDto>;
  markRead(actor: Actor, conversationId: string): Promise<void>;
  /** Xoá hội thoại = ẩn phía mình; bên kia vẫn thấy đủ (spec conversation-deletion). Đội không xoá được. */
  remove(actor: Actor, conversationId: string): Promise<void>;
  /** Máy này đang mở hội thoại — tin nhắn của nó không đẩy lên máy này trong `VIEWING_TTL_MS` (add-notifications). */
  setViewing(actor: Actor, conversationId: string): Promise<void>;
  clearViewing(actor: Actor, conversationId: string): Promise<void>;
  /** Bên nghe `identity.account.deleted`: ẩn mọi hội thoại phía người xoá. */
  onAccountDeleted(accountId: string): Promise<number>;
  /**
   * `ops` dọn theo hạn lưu (add-data-retention): cả hai bên đã xoá phía mình (xoá tài khoản tính là đã xoá), hay quá
   * `idleBefore` không ai hoạt động. Điều kiện kiểm lại lúc xoá; tin nhắn, dấu đang mở đi theo. Hội thoại với một đội
   * không bao giờ "cả hai bên đã xoá" — đội không xoá — nên chỉ nhánh không ai hoạt động áp vào.
   */
  retentionDue(
    input: { idleBefore: Date },
    after: string | null,
    limit: number,
  ): Promise<RetentionRow[]>;
  purge(ids: string[], input: { idleBefore: Date }): Promise<number>;
  /** `ops` dọn nhóm đóng quá hạn lưu: hội thoại với quản trị của nhóm đó; \`ops\` bỏ trước hội thoại đang giữ làm bằng chứng. */
  groupConversations(groupId: string): Promise<RetentionRow[]>;
  deleteConversations(ids: string[]): Promise<number>;
}

const retentionWhere = ({ idleBefore }: { idleBefore: Date }): Prisma.ConversationWhereInput => ({
  OR: [
    { buyerHiddenAt: { not: null }, sellerHiddenAt: { not: null } },
    { lastActivityAt: { lt: idleBefore } },
  ],
});

/** Người nhận một tin nhắn và tin đó có qua tay đội không — đi theo sự kiện cho thông báo và realtime. */
interface Delivery {
  recipientIds: string[];
  fromTeam: boolean;
}

/**
 * Mở hội thoại và nhắn tin (design add-messaging mục 2, 3; add-team-conversations mục 3, 4). Hội thoại đã mở không hỏi
 * lại trạng thái tin: tin đã bán, hết hạn, bị gỡ, tạm ẩn hay một bên rời nhóm đều nhắn tiếp được (TK 24) — chỉ lượt
 * mở mới xét tin.
 */
export function createConversationService(
  deps: MessagingServiceDeps,
  describe: (rows: Conversation[], accountId: string) => Promise<ConversationDto[]>,
): ConversationService {
  const { repository, identity, listings, trust, screening, groups, config, clock } = deps;

  const dtoOf = async (row: Conversation, accountId: string): Promise<ConversationDto> => {
    const [dto] = await describe([row], accountId);
    if (!dto) throw conversationNotFound();
    return dto;
  };

  const isGone = async (accountId: string): Promise<boolean> => {
    const summary = (await identity.accountSummaries([accountId])).get(accountId);
    return !summary || summary.status === 'deleted';
  };

  /**
   * Luật chung của mọi lượt gửi — tin chữ, đề nghị, câu trả lời — và người nhận: hội thoại về tin thì bên kia còn ở Ghim,
   * không có chặn; hội thoại nhóm thì nhóm chưa đóng, người dùng không bị cấm (spec group-admin-chat); đội nhắn người
   * dùng đã rời Ghim thì không gửi được. Chặn không áp cho hội thoại với một đội (spec blocking).
   */
  const deliveryOf = async (actor: Actor, row: Conversation, side: Side): Promise<Delivery> => {
    if (row.kind === 'listing') {
      const other = otherOf(row, side);
      if (!other || (await isGone(other))) throw conversationClosed();
      if (await repository.blocked(actor.accountId, other)) throw messagingBlocked();
      return { recipientIds: [other], fromTeam: false };
    }
    const fromTeam = side === 'seller';
    if (fromTeam && (await isGone(row.buyerId))) throw conversationClosed();
    if (row.kind === 'support') {
      // Staff hỗ trợ nhận hàng trên bàn vận hành, không nhận hộp thư cho từng tin (spec notification/inbox).
      return { recipientIds: fromTeam ? [row.buyerId] : [], fromTeam };
    }
    const groupId = row.groupId ?? '';
    const group = (await groups.groupsByIds([groupId])).get(groupId);
    if (!group || group.state === 'closed') throw groupConversationClosed();
    if ((await groups.bannedAmong(groupId, [row.buyerId])).has(row.buyerId)) {
      throw fromTeam ? groupConversationClosed() : groupBanned();
    }
    if (fromTeam) return { recipientIds: [row.buyerId], fromTeam };
    const team = await groups.conversationTeam(groupId);
    return { recipientIds: team.filter((id) => id !== actor.accountId), fromTeam };
  };

  /** Ghi một tin chữ: khoá hội thoại, ghi, đẩy mốc hoạt động theo phía gửi, phát sự kiện cùng transaction. */
  const write = async (
    actor: Actor,
    row: Conversation,
    side: Side,
    input: { body: string; flagged: boolean; delivery: Delivery; audit?: boolean },
  ) => {
    const now = clock();
    return repository.inTransaction(async (tx) => {
      if (!(await repository.lock(tx, row.id))) throw conversationNotFound();
      const written = await repository.insertMessage(tx, {
        conversationId: row.id,
        senderId: actor.accountId,
        body: input.body,
        flagged: input.flagged,
        createdAt: now,
      });
      await repository.touch(tx, row.id, { from: side, at: now });
      await repository.emitIn(tx, [
        messagingEvent(MESSAGING_EVENTS.messageSent, {
          conversationId: row.id,
          messageId: written.id,
          kind: row.kind,
          listingId: row.listingId,
          groupId: row.groupId,
          senderId: actor.accountId,
          recipientIds: input.delivery.recipientIds,
          fromTeam: input.delivery.fromTeam,
        }),
      ]);
      if (input.audit) {
        // Nhật ký giữ mãi nên chỉ mang mã — không nội dung tin nhắn (cam kết 31).
        await repository.appendAuditIn(tx, {
          ...auditActor(actor),
          action: 'messaging.support.reply',
          targetType: 'conversation',
          targetId: row.id,
          details: { messageId: written.id },
        });
      }
      return written;
    });
  };

  const openTeam = async (
    actor: Actor,
    kind: TeamKind,
    groupId: string | null,
  ): Promise<Opened> => {
    const existing = await repository.findTeam(kind, actor.accountId, groupId);
    if (existing) {
      await repository.unhide(existing.id, 'buyer');
      return { created: false, conversation: await dtoOf(existing, actor.accountId) };
    }
    const inserted = await repository.insertTeam({
      kind,
      buyerId: actor.accountId,
      groupId,
      createdAt: clock(),
    });
    // Lượt mở song song thắng trước (partial unique) thì đọc lại đúng dòng đó — vẫn một hội thoại.
    const row = inserted ?? (await repository.findTeam(kind, actor.accountId, groupId));
    if (!row) throw conversationNotFound();
    return { created: inserted !== null, conversation: await dtoOf(row, actor.accountId) };
  };

  /** Tin của hội thoại còn hiển thị với người khác — đề nghị mới và câu trả lời đều cần (spec price-offers). */
  const liveCard = async (row: Conversation) => {
    const listingId = row.listingId ?? '';
    const card = (await listings.conversationCards([listingId])).get(listingId);
    if (!card?.visible) throw offerListingNotLive();
    return card;
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

    openSupport(actor) {
      assertCanMessage(actor);
      return openTeam(actor, 'support', null);
    },

    async openGroup(actor, groupId) {
      assertCanMessage(actor);
      const group = await groups.findGroup(groupId);
      if (!group) throw new NotFoundError('Không có nhóm này');
      // Mọi nhóm có thật đều xem được hồ sơ — người ngoài nhóm riêng tư chỉ thấy tên, vẫn nhắn được (spec).
      if (!OPEN_FOR_CONVERSATIONS.has(group.state)) throw groupNotActive();
      if ((await groups.bannedAmong(groupId, [actor.accountId])).has(actor.accountId)) {
        throw groupBanned();
      }
      if ((await groups.conversationTeam(groupId)).includes(actor.accountId)) throw ownGroup();
      return openTeam(actor, 'group', groupId);
    },

    async send(actor, conversationId, body) {
      assertCanMessage(actor);
      const { row, side } = await ownedBy(deps, actor, conversationId);
      const delivery = await deliveryOf(actor, row, side);
      // Cùng bộ lọc với tin đăng — kể cả quản trị nhóm trả lời thay nhóm; mức chắc không gửi, mức mơ hồ gửi kèm dấu
      // cho người xử (design add-messaging mục 4, cam kết 5).
      const verdict = await screening.phraseVerdict(body);
      if (verdict.blocked) throw messageNotAllowed();
      const message = await write(actor, row, side, { body, flagged: verdict.flagged, delivery });
      return toMessageDto(message, viewerOf(row, actor.accountId, side));
    },

    async replyAsSupport(actor, conversationId, body) {
      const row = await repository.find(conversationId);
      if (!row || row.kind !== 'support') throw conversationNotFound();
      if (row.buyerId === actor.accountId) {
        throw new ForbiddenError('Hội thoại hỗ trợ của chính bạn — để một staff khác trả lời');
      }
      const delivery = await deliveryOf(actor, row, 'seller');
      // Không qua bộ lọc cụm: staff cần nhắc đúng cụm lừa đảo để cảnh báo người dùng (spec conversations).
      const message = await write(actor, row, 'seller', {
        body,
        flagged: false,
        delivery,
        audit: true,
      });
      return toMessageDto(message, viewerOf(row, actor.accountId, 'seller'));
    },

    async offer(actor, conversationId, amount) {
      assertCanMessage(actor);
      const { row, side } = await ownedBy(deps, actor, conversationId);
      if (side !== 'buyer') throw offerBuyerOnly();
      if (isTeam(row)) throw offersNotAccepted();
      const { recipientIds } = await deliveryOf(actor, row, side);
      const card = await liveCard(row);
      if (!takesOffers(card)) throw offersNotAccepted();
      if (card.price !== null && amount > card.price) throw offerAbovePrice();
      const now = clock();
      const message = await repository.inTransaction(async (tx) => {
        if (!(await repository.lock(tx, row.id))) throw conversationNotFound();
        await repository.supersedePendingOffer(tx, row.id);
        const written = await repository.insertMessage(tx, {
          conversationId: row.id,
          senderId: actor.accountId,
          body: '',
          flagged: false,
          createdAt: now,
          offerAmount: amount,
        });
        // Như tin chữ của người mua: đếm vào "có người nhắn hỏi mua" của tin sạch (TK 20), đưa hội thoại lên đầu.
        await repository.touch(tx, row.id, { from: 'buyer', at: now });
        await repository.emitIn(tx, [
          messagingEvent(MESSAGING_EVENTS.messageSent, {
            conversationId: row.id,
            messageId: written.id,
            kind: row.kind,
            listingId: row.listingId,
            groupId: null,
            senderId: actor.accountId,
            recipientIds,
            fromTeam: false,
          }),
        ]);
        return written;
      });
      return toMessageDto(message, viewerOf(row, actor.accountId, side));
    },

    async answerOffer(actor, conversationId, messageId, decision) {
      assertCanMessage(actor);
      const { row, side } = await ownedBy(deps, actor, conversationId);
      const target = await repository.findMessage(messageId);
      if (!target || target.conversationId !== row.id || target.kind !== 'offer') {
        throw offerNotFound();
      }
      if (side !== 'seller') throw offerSellerOnly();
      const [buyer = row.buyerId] = (await deliveryOf(actor, row, side)).recipientIds;
      if (target.offerStatus !== 'pending') throw offerNotPending();
      await liveCard(row);
      const now = clock();
      const answered = await repository.inTransaction(async (tx) => {
        if (!(await repository.lock(tx, row.id))) throw conversationNotFound();
        // Ghi có điều kiện sau khoá: lượt trả giá mới vừa thay đề nghị này thì lượt trả lời thua (spec, ca cùng lúc).
        const updated = await repository.answerOffer(tx, {
          conversationId: row.id,
          messageId,
          status: decision,
          at: now,
        });
        if (!updated) throw offerNotPending();
        await repository.touchActivity(tx, row.id, now);
        await repository.emitIn(tx, [
          messagingEvent(MESSAGING_EVENTS.offerAnswered, {
            conversationId: row.id,
            messageId,
            listingId: row.listingId,
            sellerId: actor.accountId,
            buyerId: buyer,
            status: decision,
          }),
        ]);
        return updated;
      });
      return toMessageDto(answered, viewerOf(row, actor.accountId, side));
    },

    async markRead(actor, conversationId) {
      const { side } = await ownedBy(deps, actor, conversationId);
      await repository.markRead(conversationId, side, clock());
    },

    async remove(actor, conversationId) {
      const { row, side } = await ownedBy(deps, actor, conversationId);
      if (isTeam(row) && side === 'seller') throw teamCannotDelete();
      await repository.hide(conversationId, side, clock());
    },

    async setViewing(actor, conversationId) {
      await ownedBy(deps, actor, conversationId);
      await repository.setPresence(
        actor.sessionId,
        conversationId,
        new Date(clock().getTime() + VIEWING_TTL_MS),
      );
    },

    async clearViewing(actor, conversationId) {
      await ownedBy(deps, actor, conversationId);
      await repository.clearPresence(actor.sessionId, conversationId);
    },

    onAccountDeleted: (accountId) => repository.hideAllOf(accountId, clock()),

    retentionDue: (input, after, limit) =>
      repository.retentionDue(retentionWhere(input), after, limit),
    purge: (ids, input) => repository.purge(ids, retentionWhere(input)),
    groupConversations: (groupId) => repository.groupConversations(groupId),
    deleteConversations: (ids) => repository.deleteConversations(ids),
  };
}
