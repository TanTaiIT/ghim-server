import type { ConversationKind, OfferStatus } from '@prisma/client';

import type { Actor } from '../../common/auth/actor.js';
import type { CursorQuery } from '../../common/schemas/cursor.js';
import { toCursorPage } from '../../common/schemas/cursor.js';
import { formatMoneyVN } from '../../common/schemas/money.js';
import type { ConversationCard } from '../listing/listing.ports.js';
import type { ConversationTranscriptDto } from '../review/review.schema.js';
import type { Conversation, Message } from './messaging.repository.js';
import type { ConversationDto, MessageDto } from './messaging.schema.js';
import {
  conversationNotFound,
  DAY_MS,
  groupTeamName,
  isTeam,
  type MessagingServiceDeps,
  otherOf,
  ownedBy,
  type Side,
  SUPPORT_TEAM_NAME,
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
  /** Cổng cho `notification`: phiên đang mở hội thoại này — máy đó không nhận push tin nhắn của nó. */
  viewingSessions(conversationId: string): Promise<string[]>;
  /** Cổng cho `notification`: nội dung và người gửi của một tin nhắn cho câu thông báo (TK 30). */
  previewOf(messageId: string): Promise<MessagePreview | null>;
  /**
   * Bên nghe `messaging.message.sent`: báo hiệu cho người nhận qua realtime — app tải lại qua HTTP. Tin của hội thoại hỗ
   * trợ báo thêm số hội thoại đang chờ cho staff hỗ trợ (spec notification/realtime).
   */
  signalMessage(input: {
    conversationId: string;
    messageId: string;
    recipientIds: string[];
    kind: ConversationKind;
  }): Promise<void>;
  /** Bên nghe `messaging.offer.answered`: tin nhắn đã có vừa đổi — app tải lại (add-price-offers). */
  signalMessageUpdated(input: { conversationId: string; messageId: string; buyerId: string }): void;
}

export interface MessagePreview {
  conversationId: string;
  senderId: string;
  body: string;
  offer: { amount: bigint; status: OfferStatus } | null;
  /** Câu thông báo ký theo phía gửi: tên người, hay tên đội (add-team-conversations). */
  conversation: { kind: ConversationKind; groupId: string | null; buyerId: string };
}

/** Bản ghi cho người xử cắt ở ngần này tin nhắn gần nhất (design, Risks). */
const TRANSCRIPT_MESSAGES = 500;

const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  pending: 'đang chờ',
  accepted: 'đã chấp nhận',
  declined: 'đã từ chối',
  superseded: 'đã có giá mới',
};

const offerOf = (row: Message): MessageDto['offer'] =>
  row.kind === 'offer' && row.offerAmount !== null && row.offerStatus !== null
    ? {
        amount: row.offerAmount,
        status: row.offerStatus,
        respondedAt: row.offerRespondedAt?.toISOString() ?? null,
      }
    : null;

/** Ai đang đọc tin nhắn: người dùng của hội thoại với một đội không thấy ai trong đội viết (spec support-chat). */
export interface MessageViewer {
  accountId: string;
  buyerId: string;
  maskTeam: boolean;
}

export const viewerOf = (row: Conversation, accountId: string, side: Side): MessageViewer => ({
  accountId,
  buyerId: row.buyerId,
  maskTeam: isTeam(row) && side === 'buyer',
});

export const toMessageDto = (row: Message, viewer: MessageViewer): MessageDto => ({
  id: row.id,
  conversationId: row.conversationId,
  senderId: viewer.maskTeam && row.senderId !== viewer.buyerId ? null : row.senderId,
  fromMe: row.senderId === viewer.accountId,
  kind: row.kind,
  body: row.body,
  offer: offerOf(row),
  createdAt: row.createdAt.toISOString(),
});

/** Người xử đọc bản ghi bằng chữ: đề nghị giá không có `body`, nên viết thành một câu. */
const transcriptBody = (row: Message): string => {
  const offer = offerOf(row);
  return offer
    ? `Trả giá ${formatMoneyVN(offer.amount)} (${OFFER_STATUS_LABEL[offer.status]})`
    : row.body;
};

/** Spec messaging/price-offers: chỉ trả giá với tin đang hiển thị, cho thương lượng, giá trên 0. */
export const takesOffers = (card: ConversationCard | undefined): boolean =>
  card !== undefined && card.visible && card.negotiable && card.price !== null && card.price > 0n;

const present = <T>(values: (T | null)[]): T[] => [
  ...new Set(values.filter((value): value is T => value !== null)),
];

const MINUTE_MS = 60_000;
/** Làm tròn xuống phút: tới giây là đủ để dò thói quen của một người, mà chat không cần. */
const toMinute = (at: Date): string =>
  new Date(Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS).toISOString();

export function createInboxService(deps: MessagingServiceDeps): {
  service: InboxService;
  /**
   * DTO cho một lô hội thoại như `viewerId` thấy — `conversation.service` dùng lại khi mở hội thoại. `asTeam`: người
   * xem đứng ở phía đội dù là ai (staff hỗ trợ trên bàn vận hành, kể cả với hội thoại hỗ trợ của chính mình).
   */
  describe(
    rows: Conversation[],
    viewerId: string,
    options?: { asTeam?: boolean },
  ): Promise<ConversationDto[]>;
} {
  const { repository, identity, listings, groups, platform, realtime, config, clock } = deps;

  const describe = async (
    rows: Conversation[],
    viewerId: string,
    options: { asTeam?: boolean } = {},
  ): Promise<ConversationDto[]> => {
    if (rows.length === 0) return [];
    const sideIn = (row: Conversation): Side =>
      options.asTeam || row.buyerId !== viewerId ? 'seller' : 'buyer';
    const ids = rows.map((row) => row.id);
    const others = present(rows.map((row) => otherOf(row, sideIn(row))));
    const listingOthers = present(
      rows.filter((row) => row.kind === 'listing').map((row) => otherOf(row, sideIn(row))),
    );
    const groupIds = present(rows.map((row) => row.groupId));
    // Trạng thái hoạt động chỉ trong hội thoại về tin, và tắt là hai chiều: người xem cũng phải đang bật.
    const visibleSince = clock().getTime() - config.get('messaging.activityVisibleDays') * DAY_MS;
    const online = realtime.onlineAmong(listingOthers);
    const [cards, summaries, avatars, last, unread, blocked, groupInfo, bannedBy, activity] =
      await Promise.all([
        listings.conversationCards(present(rows.map((row) => row.listingId))),
        identity.accountSummaries(others),
        identity.avatarUrls(others),
        repository.lastMessages(ids),
        repository.unreadCounts(ids, viewerId),
        repository.blockedWith(viewerId, listingOthers),
        groups.groupsByIds(groupIds),
        Promise.all(
          groupIds.map(
            async (groupId) =>
              [
                groupId,
                await groups.bannedAmong(
                  groupId,
                  rows.filter((row) => row.groupId === groupId).map((row) => row.buyerId),
                ),
              ] as const,
          ),
        ).then((entries) => new Map(entries)),
        listingOthers.length > 0
          ? identity.activityOf([viewerId, ...listingOthers])
          : Promise.resolve(new Map<string, { showActivity: boolean; lastSeenAt: Date | null }>()),
      ]);
    const viewerShows = activity.get(viewerId)?.showActivity ?? false;
    const activityOf = (other: string): { online: boolean; lastActiveAt: string | null } | null => {
      const theirs = activity.get(other);
      if (!viewerShows || !theirs?.showActivity) return null;
      const seen = theirs.lastSeenAt;
      return {
        online: online.has(other),
        lastActiveAt: seen && seen.getTime() >= visibleSince ? toMinute(seen) : null,
      };
    };
    return rows.map((row) => {
      const side = sideIn(row);
      const other = otherOf(row, side);
      const summary = other ? summaries.get(other) : undefined;
      const gone = other !== null && (!summary || summary.status === 'deleted');
      const group = row.groupId ? groupInfo.get(row.groupId) : undefined;
      const banned = row.groupId ? (bannedBy.get(row.groupId)?.has(row.buyerId) ?? false) : false;
      // Nhóm đã dọn khỏi DB (hạn lưu) như nhóm đã đóng: hội thoại chỉ còn để đọc.
      const closed = row.kind === 'group' && (!group || group.state === 'closed');
      const locked = row.kind === 'listing' && other !== null && blocked.has(other);
      const canSend =
        row.kind === 'listing'
          ? !locked && !gone
          : !closed && !banned && !(side === 'seller' && gone);
      const card = row.listingId ? cards.get(row.listingId) : undefined;
      const lastMessage = last.get(row.id);
      return {
        id: row.id,
        kind: row.kind,
        listing: row.listingId
          ? {
              id: row.listingId,
              title: card?.title ?? null,
              price: card?.price ?? null,
              negotiable: card?.negotiable ?? false,
              // Tin đã xoá hẳn khỏi DB (hạn lưu) không còn trạng thái nào — với người xem nó là tin đã gỡ khỏi Ghim.
              state: card?.state ?? 'removed',
              cover: card?.cover ?? null,
            }
          : null,
        group: row.groupId ? { id: row.groupId, name: group?.name ?? '' } : null,
        role: row.kind === 'listing' || side === 'buyer' ? side : 'team',
        counterpart:
          other !== null
            ? {
                kind: 'account' as const,
                accountId: other,
                displayName: gone ? null : (summary?.displayName ?? null),
                avatarUrl: gone ? null : (avatars.get(other) ?? null),
                gone,
                activity: row.kind === 'listing' && !gone && !locked ? activityOf(other) : null,
              }
            : {
                kind: row.kind === 'support' ? ('support' as const) : ('group_admins' as const),
                accountId: null,
                displayName:
                  row.kind === 'support' ? SUPPORT_TEAM_NAME : groupTeamName(group?.name ?? ''),
                avatarUrl: null,
                gone: false,
                activity: null,
              },
        lastMessage: lastMessage ? toMessageDto(lastMessage, viewerOf(row, viewerId, side)) : null,
        unreadCount: unread.get(row.id) ?? 0,
        locked,
        canSend,
        canOffer: row.kind === 'listing' && side === 'buyer' && canSend && takesOffers(card),
        createdAt: row.createdAt.toISOString(),
        lastActivityAt: row.lastActivityAt.toISOString(),
      };
    });
  };

  const signalSupportQueue = async (): Promise<void> => {
    const [count, staff] = await Promise.all([
      repository.pendingSupportCount(),
      platform.activeStaffWithScope('support'),
    ]);
    for (const accountId of staff) realtime.emitToUser(accountId, 'support:pending', { count });
  };

  return {
    describe,
    service: {
      async conversations(actor, query) {
        const managed = await groups.managedGroupIds(actor.accountId);
        const rows = await repository.listFor(
          actor.accountId,
          managed,
          query.cursor,
          query.limit + 1,
        );
        const page = toCursorPage(rows, query.limit, (row) => ({
          at: row.lastActivityAt,
          id: row.id,
        }));
        return { items: await describe(page.items, actor.accountId), nextCursor: page.nextCursor };
      },

      async conversation(actor, conversationId) {
        const { row } = await ownedBy(deps, actor, conversationId);
        const [dto] = await describe([row], actor.accountId);
        if (!dto) throw conversationNotFound();
        return dto;
      },

      async messages(actor, conversationId, query) {
        const { row, side } = await ownedBy(deps, actor, conversationId);
        const rows = await repository.messages(conversationId, query.cursor, query.limit + 1);
        const page = toCursorPage(rows, query.limit, (message) => ({
          at: message.createdAt,
          id: message.id,
        }));
        const viewer = viewerOf(row, actor.accountId, side);
        return {
          items: page.items.map((message) => toMessageDto(message, viewer)),
          nextCursor: page.nextCursor,
        };
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
        // Chỉ hội thoại về tin có lượt báo (hội thoại với một đội chưa báo cáo được — CONVERSATION_NOT_REPORTABLE).
        return new Map(
          rows.flatMap((row) =>
            row.listingId && row.sellerId
              ? [
                  [
                    row.id,
                    {
                      id: row.id,
                      listingId: row.listingId,
                      buyerId: row.buyerId,
                      sellerId: row.sellerId,
                      messages: row.messages.map((message) => ({
                        id: message.id,
                        senderId: message.senderId,
                        body: transcriptBody(message),
                        flagged: message.flagged,
                        createdAt: message.createdAt.toISOString(),
                      })),
                    },
                  ] as const,
                ]
              : [],
          ),
        );
      },

      viewingSessions: (conversationId) => repository.viewingSessions(conversationId, clock()),

      async previewOf(messageId) {
        const row = await repository.findMessage(messageId);
        const conversation = row ? await repository.find(row.conversationId) : null;
        if (!row || !conversation) return null;
        const offer = offerOf(row);
        return {
          conversationId: row.conversationId,
          senderId: row.senderId,
          body: row.body,
          offer: offer ? { amount: offer.amount, status: offer.status } : null,
          conversation: {
            kind: conversation.kind,
            groupId: conversation.groupId,
            buyerId: conversation.buyerId,
          },
        };
      },

      async signalMessage({ conversationId, messageId, recipientIds, kind }) {
        for (const recipientId of recipientIds) {
          realtime.emitToUser(recipientId, 'message:new', { conversationId, messageId });
        }
        if (kind === 'support') await signalSupportQueue();
      },

      signalMessageUpdated({ conversationId, messageId, buyerId }) {
        realtime.emitToUser(buyerId, 'message:updated', { conversationId, messageId });
      },
    },
  };
}
