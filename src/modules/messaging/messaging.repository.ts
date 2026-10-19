import {
  type AccountBlock,
  type Conversation,
  type Message,
  type OfferStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

import { appendAudit, type AuditEntry } from '../../common/audit/audit.js';
import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';
import type { CursorKey } from '../../common/schemas/cursor.js';

export type Tx = Prisma.TransactionClient;
export type { AccountBlock, Conversation, Message };
type Side = 'buyer' | 'seller';

export type Transcript = Conversation & { messages: Message[] };
export type TeamKind = 'support' | 'group';
export type RetentionRow = Pick<Conversation, 'id' | 'kind' | 'listingId' | 'buyerId' | 'sellerId'>;

export interface MessagingRepository {
  inTransaction<T>(write: (tx: Tx) => Promise<T>): Promise<T>;
  /** Khoá advisory theo người mở: hai lượt mở cùng lúc của một người xếp hàng rồi mới đếm hạn mức ngày. */
  lockOpener(tx: Tx, accountId: string): Promise<void>;
  findPair(listingId: string, buyerId: string, tx?: Tx): Promise<Conversation | null>;
  /** Chỉ hội thoại về tin — hội thoại với một đội không tính hạn mức (add-team-conversations). */
  countOpenedSince(tx: Tx, buyerId: string, since: Date): Promise<number>;
  findTeam(kind: TeamKind, buyerId: string, groupId: string | null): Promise<Conversation | null>;
  /** `null` = lượt mở song song đã ghi trước (partial unique) — người gọi đọc lại dòng đó. */
  insertTeam(data: {
    kind: TeamKind;
    buyerId: string;
    groupId: string | null;
    createdAt: Date;
  }): Promise<Conversation | null>;
  insert(
    tx: Tx,
    data: { listingId: string; sellerId: string; buyerId: string; createdAt: Date },
  ): Promise<Conversation>;
  find(id: string): Promise<Conversation | null>;
  /** Khoá dòng hội thoại trong `tx` — bộ đếm và mốc hoạt động cập nhật theo thứ tự. */
  lock(tx: Tx, id: string): Promise<Conversation | null>;
  /**
   * Hội thoại chưa ẩn phía người này, cùng hội thoại với quản trị của `groupIds` (nhóm người này đang quản trị),
   * hoạt động gần nhất trước; `take` dòng kể từ sau con trỏ.
   */
  listFor(
    accountId: string,
    groupIds: string[],
    cursor: CursorKey | undefined,
    take: number,
  ): Promise<Conversation[]>;
  lastMessages(conversationIds: string[]): Promise<Map<string, Message>>;
  /** Tin nhắn của bên kia sau mốc đã đọc của người này, theo hội thoại — phía đội chỉ đếm tin của người dùng. */
  unreadCounts(conversationIds: string[], accountId: string): Promise<Map<string, number>>;
  messages(conversationId: string, cursor: CursorKey | undefined, take: number): Promise<Message[]>;
  insertMessage(
    tx: Tx,
    data: {
      conversationId: string;
      senderId: string;
      body: string;
      flagged: boolean;
      createdAt: Date;
      offerAmount?: bigint;
    },
  ): Promise<Message>;
  /** Đề nghị đang chờ của hội thoại thành "đã thay" — gọi trong `tx` đã khoá hội thoại, trước khi ghi đề nghị mới. */
  supersedePendingOffer(tx: Tx, conversationId: string): Promise<void>;
  /** Ghi có điều kiện: chỉ đề nghị đang chờ của đúng hội thoại; `null` = không còn chờ (hay không có). */
  answerOffer(
    tx: Tx,
    input: { conversationId: string; messageId: string; status: OfferStatus; at: Date },
  ): Promise<Message | null>;
  /** Sau một tin nhắn: mốc hoạt động, số tin của người mua, và bỏ ẩn phía người nhận. */
  touch(tx: Tx, id: string, input: { from: Side; at: Date }): Promise<void>;
  /** Câu trả lời đề nghị không phải tin mới: chỉ đưa hội thoại lên đầu và bỏ ẩn phía người mua. */
  touchActivity(tx: Tx, id: string, at: Date): Promise<void>;
  /** Hàng hỗ trợ: đang chờ đội trả lời trước, chờ lâu nhất trước; `pendingOnly` chỉ lấy hội thoại đang chờ. */
  supportQueue(query: {
    pendingOnly: boolean;
    skip: number;
    take: number;
  }): Promise<{ items: Conversation[]; total: number }>;
  pendingSupportCount(): Promise<number>;
  /** Hội thoại với quản trị của một nhóm — `ops` dọn cùng nhóm đóng quá hạn lưu. */
  groupConversations(groupId: string): Promise<RetentionRow[]>;
  deleteConversations(ids: string[]): Promise<number>;
  appendAuditIn(tx: Tx, entry: AuditEntry): Promise<void>;
  markRead(id: string, side: Side, at: Date): Promise<void>;
  hide(id: string, side: Side, at: Date): Promise<void>;
  unhide(id: string, side: Side): Promise<void>;
  /** Xoá tài khoản: ẩn mọi hội thoại phía người đó — chạy lại vô hại. */
  hideAllOf(accountId: string, at: Date): Promise<number>;
  /** Người bán và những người mua đã nhắn ít nhất một tin trong hội thoại về tin này — dữ kiện tin sạch (TK 20). */
  inquiries(listingId: string): Promise<{ sellerId: string; buyerIds: string[] } | null>;
  /** Bản ghi cho người xử: `messageLimit` tin nhắn gần nhất, trả theo thứ tự gửi. */
  transcripts(ids: string[], messageLimit: number): Promise<Transcript[]>;
  /** Có dòng chặn theo một trong hai chiều. */
  blocked(a: string, b: string): Promise<boolean>;
  /** Trong `others`, ai có chặn với người này (chiều nào cũng tính). */
  blockedWith(accountId: string, others: string[]): Promise<Set<string>>;
  block(blockerId: string, blockedId: string, at: Date): Promise<void>;
  unblock(blockerId: string, blockedId: string): Promise<void>;
  blocks(
    blockerId: string,
    page: { skip: number; take: number },
  ): Promise<{ items: AccountBlock[]; total: number }>;
  /** Máy (phiên) đang mở hội thoại, hiệu lực tới `expiresAt` (add-notifications). */
  setPresence(sessionId: string, conversationId: string, expiresAt: Date): Promise<void>;
  clearPresence(sessionId: string, conversationId: string): Promise<void>;
  viewingSessions(conversationId: string, now: Date): Promise<string[]>;
  findMessage(id: string): Promise<Message | null>;
  // ── HẠN LƯU (add-data-retention) ──
  /** Hội thoại khớp điều kiện xoá hẳn, theo trang con trỏ `id` (hội thoại đang tạm giữ bị bỏ qua nên trang không lùi). */
  retentionDue(
    where: Prisma.ConversationWhereInput,
    after: string | null,
    limit: number,
  ): Promise<RetentionRow[]>;
  /** Xoá hẳn các hội thoại trong `ids` còn khớp `where` lúc xoá — tin nhắn, dấu đang mở đi theo khoá ngoại. */
  purge(ids: string[], where: Prisma.ConversationWhereInput): Promise<number>;
  emitIn(tx: Tx, events: OutboxEventInput[]): Promise<void>;
}

const sideColumns = (side: Side) =>
  side === 'buyer'
    ? ({ hiddenAt: 'buyerHiddenAt', readAt: 'buyerReadAt' } as const)
    : ({ hiddenAt: 'sellerHiddenAt', readAt: 'sellerReadAt' } as const);

const uuids = (ids: string[]) => Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

export function createMessagingRepository(prisma: PrismaClient): MessagingRepository {
  return {
    inTransaction: (write) => prisma.$transaction((tx) => write(tx)),

    async lockOpener(tx, accountId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-open:${accountId}`}, 0))`;
    },

    findPair: (listingId, buyerId, tx) =>
      (tx ?? prisma).conversation.findUnique({
        where: { listingId_buyerId: { listingId, buyerId } },
      }),

    countOpenedSince: (tx, buyerId, since) =>
      tx.conversation.count({ where: { kind: 'listing', buyerId, createdAt: { gte: since } } }),

    findTeam: (kind, buyerId, groupId) =>
      prisma.conversation.findFirst({ where: { kind, buyerId, groupId } }),

    async insertTeam({ createdAt, ...data }) {
      try {
        return await prisma.conversation.create({
          data: { ...data, createdAt, lastActivityAt: createdAt },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return null;
        }
        throw error;
      }
    },

    insert: (tx, data) =>
      tx.conversation.create({ data: { ...data, lastActivityAt: data.createdAt } }),

    find: (id) => prisma.conversation.findUnique({ where: { id } }),

    async lock(tx, id) {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id}::uuid FOR UPDATE`;
      return tx.conversation.findUnique({ where: { id } });
    },

    listFor: (accountId, groupIds, cursor, take) =>
      prisma.conversation.findMany({
        where: {
          OR: [
            { buyerId: accountId, buyerHiddenAt: null },
            { sellerId: accountId, sellerHiddenAt: null },
            ...(groupIds.length > 0
              ? [{ kind: 'group' as const, groupId: { in: groupIds }, buyerId: { not: accountId } }]
              : []),
          ],
          ...(cursor
            ? {
                AND: [
                  {
                    OR: [
                      { lastActivityAt: { lt: cursor.at } },
                      { lastActivityAt: cursor.at, id: { lt: cursor.id } },
                    ],
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
        take,
      }),

    async lastMessages(conversationIds) {
      if (conversationIds.length === 0) return new Map();
      const rows = await prisma.$queryRaw<Message[]>`
        SELECT DISTINCT ON (conversation_id) id, conversation_id AS "conversationId", sender_id AS "senderId",
          kind, body, flagged, offer_amount AS "offerAmount", offer_status AS "offerStatus",
          offer_responded_at AS "offerRespondedAt", created_at AS "createdAt"
        FROM messages WHERE conversation_id IN (${uuids(conversationIds)})
        ORDER BY conversation_id, created_at DESC, id DESC`;
      return new Map(rows.map((row) => [row.conversationId, row]));
    },

    async unreadCounts(conversationIds, accountId) {
      if (conversationIds.length === 0) return new Map();
      const rows = await prisma.$queryRaw<{ id: string; count: number }[]>`
        SELECT c.id, COUNT(m.id)::int AS count
        FROM conversations c
        JOIN messages m ON m.conversation_id = c.id
          AND CASE WHEN c.buyer_id = ${accountId}::uuid
            THEN m.sender_id <> ${accountId}::uuid
              AND m.created_at > COALESCE(c.buyer_read_at, 'epoch'::timestamptz)
            -- Phía bán / phía đội: chỉ tin của người dùng là "chưa đọc", tin của người khác trong đội thì không.
            ELSE m.sender_id = c.buyer_id
              AND m.created_at > COALESCE(c.seller_read_at, 'epoch'::timestamptz)
          END
        WHERE c.id IN (${uuids(conversationIds)})
        GROUP BY c.id`;
      return new Map(rows.map((row) => [row.id, row.count]));
    },

    messages: (conversationId, cursor, take) =>
      prisma.message.findMany({
        where: {
          conversationId,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.at } },
                  { createdAt: cursor.at, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      }),

    insertMessage: (tx, { offerAmount, ...data }) =>
      tx.message.create({
        data:
          offerAmount === undefined
            ? data
            : { ...data, kind: 'offer', offerAmount, offerStatus: 'pending' },
      }),

    async supersedePendingOffer(tx, conversationId) {
      await tx.message.updateMany({
        where: { conversationId, offerStatus: 'pending' },
        data: { offerStatus: 'superseded' },
      });
    },

    async answerOffer(tx, { conversationId, messageId, status, at }) {
      const { count } = await tx.message.updateMany({
        where: { id: messageId, conversationId, offerStatus: 'pending' },
        data: { offerStatus: status, offerRespondedAt: at },
      });
      return count === 0 ? null : tx.message.findUnique({ where: { id: messageId } });
    },

    async touch(tx, id, { from, at }) {
      // `buyer_messages` chỉ là dữ kiện tin sạch của hội thoại về tin; `team_pending_since` chỉ của hội thoại với đội:
      // giữ mốc tin đầu tiên chưa được trả lời, đội gửi thì xoá (design add-team-conversations mục 1, 4).
      await (from === 'buyer'
        ? tx.$executeRaw`
            UPDATE conversations SET last_activity_at = ${at}, last_message_at = ${at}, seller_hidden_at = NULL,
              buyer_messages = buyer_messages + CASE WHEN kind = 'listing' THEN 1 ELSE 0 END,
              team_pending_since = CASE WHEN kind = 'listing' THEN NULL
                ELSE COALESCE(team_pending_since, ${at}) END
            WHERE id = ${id}::uuid`
        : tx.$executeRaw`
            UPDATE conversations SET last_activity_at = ${at}, last_message_at = ${at}, buyer_hidden_at = NULL,
              team_pending_since = NULL
            WHERE id = ${id}::uuid`);
    },

    async touchActivity(tx, id, at) {
      await tx.conversation.update({
        where: { id },
        data: { lastActivityAt: at, buyerHiddenAt: null },
      });
    },

    async supportQueue({ pendingOnly, skip, take }) {
      const where: Prisma.ConversationWhereInput = {
        kind: 'support',
        ...(pendingOnly ? { teamPendingSince: { not: null } } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.conversation.findMany({
          where,
          orderBy: [
            { teamPendingSince: { sort: 'asc', nulls: 'last' } },
            { lastActivityAt: 'desc' },
            { id: 'desc' },
          ],
          skip,
          take,
        }),
        prisma.conversation.count({ where }),
      ]);
      return { items, total };
    },

    pendingSupportCount: () =>
      prisma.conversation.count({ where: { kind: 'support', teamPendingSince: { not: null } } }),

    groupConversations: (groupId) =>
      prisma.conversation.findMany({
        where: { kind: 'group', groupId },
        select: { id: true, kind: true, listingId: true, buyerId: true, sellerId: true },
      }),

    async deleteConversations(ids) {
      if (ids.length === 0) return 0;
      const { count } = await prisma.conversation.deleteMany({ where: { id: { in: ids } } });
      return count;
    },

    appendAuditIn: (tx, entry) => appendAudit(tx, entry),

    async markRead(id, side, at) {
      await prisma.conversation.update({ where: { id }, data: { [sideColumns(side).readAt]: at } });
    },

    async hide(id, side, at) {
      await prisma.conversation.update({
        where: { id },
        data: { [sideColumns(side).hiddenAt]: at },
      });
    },

    async unhide(id, side) {
      await prisma.conversation.update({
        where: { id },
        data: { [sideColumns(side).hiddenAt]: null },
      });
    },

    async hideAllOf(accountId, at) {
      const [asBuyer, asSeller] = await Promise.all([
        prisma.conversation.updateMany({
          where: { buyerId: accountId, buyerHiddenAt: null },
          data: { buyerHiddenAt: at },
        }),
        prisma.conversation.updateMany({
          where: { sellerId: accountId, sellerHiddenAt: null },
          data: { sellerHiddenAt: at },
        }),
      ]);
      return asBuyer.count + asSeller.count;
    },

    async inquiries(listingId) {
      const rows = await prisma.conversation.findMany({
        where: { listingId, buyerMessages: { gt: 0 } },
        select: { sellerId: true, buyerId: true },
      });
      // Chỉ hội thoại về tin có `listing_id`, nên người bán luôn có (CHECK conversations_kind_check).
      const sellerId = rows.find((row) => row.sellerId !== null)?.sellerId;
      return sellerId ? { sellerId, buyerIds: rows.map((row) => row.buyerId) } : null;
    },

    async transcripts(ids, messageLimit) {
      if (ids.length === 0) return [];
      const rows = await prisma.conversation.findMany({
        where: { id: { in: ids } },
        include: {
          messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: messageLimit },
        },
      });
      return rows.map((row) => ({ ...row, messages: row.messages.toReversed() }));
    },

    async blocked(a, b) {
      const row = await prisma.accountBlock.findFirst({
        where: {
          OR: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
          ],
        },
        select: { blockerId: true },
      });
      return row !== null;
    },

    async blockedWith(accountId, others) {
      if (others.length === 0) return new Set();
      const rows = await prisma.accountBlock.findMany({
        where: {
          OR: [
            { blockerId: accountId, blockedId: { in: others } },
            { blockedId: accountId, blockerId: { in: others } },
          ],
        },
      });
      return new Set(
        rows.map((row) => (row.blockerId === accountId ? row.blockedId : row.blockerId)),
      );
    },

    async block(blockerId, blockedId, at) {
      await prisma.accountBlock.createMany({
        data: [{ blockerId, blockedId, createdAt: at }],
        skipDuplicates: true,
      });
    },

    async unblock(blockerId, blockedId) {
      await prisma.accountBlock.deleteMany({ where: { blockerId, blockedId } });
    },

    async blocks(blockerId, { skip, take }) {
      const [items, total] = await Promise.all([
        prisma.accountBlock.findMany({
          where: { blockerId },
          orderBy: [{ createdAt: 'desc' }, { blockedId: 'asc' }],
          skip,
          take,
        }),
        prisma.accountBlock.count({ where: { blockerId } }),
      ]);
      return { items, total };
    },

    async setPresence(sessionId, conversationId, expiresAt) {
      await prisma.conversationPresence.upsert({
        where: { sessionId },
        create: { sessionId, conversationId, expiresAt },
        update: { conversationId, expiresAt },
      });
    },

    async clearPresence(sessionId, conversationId) {
      await prisma.conversationPresence.deleteMany({ where: { sessionId, conversationId } });
    },

    async viewingSessions(conversationId, now) {
      const rows = await prisma.conversationPresence.findMany({
        where: { conversationId, expiresAt: { gt: now } },
        select: { sessionId: true },
      });
      return rows.map((row) => row.sessionId);
    },

    findMessage: (id) => prisma.message.findUnique({ where: { id } }),

    retentionDue: (where, after, limit) =>
      prisma.conversation.findMany({
        where: { ...where, ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: 'asc' },
        take: limit,
        select: { id: true, kind: true, listingId: true, buyerId: true, sellerId: true },
      }),

    async purge(ids, where) {
      if (ids.length === 0) return 0;
      const { count } = await prisma.conversation.deleteMany({
        where: { ...where, id: { in: ids } },
      });
      return count;
    },

    emitIn: (tx, events) => appendEvents(tx, events),
  };
}
