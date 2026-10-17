import {
  type AccountBlock,
  type Conversation,
  type Message,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';
import type { CursorKey } from '../../common/schemas/cursor.js';

export type Tx = Prisma.TransactionClient;
export type { AccountBlock, Conversation, Message };
type Side = 'buyer' | 'seller';

export type Transcript = Conversation & { messages: Message[] };

export interface MessagingRepository {
  inTransaction<T>(write: (tx: Tx) => Promise<T>): Promise<T>;
  /** Khoá advisory theo người mở: hai lượt mở cùng lúc của một người xếp hàng rồi mới đếm hạn mức ngày. */
  lockOpener(tx: Tx, accountId: string): Promise<void>;
  findPair(listingId: string, buyerId: string, tx?: Tx): Promise<Conversation | null>;
  countOpenedSince(tx: Tx, buyerId: string, since: Date): Promise<number>;
  insert(
    tx: Tx,
    data: { listingId: string; sellerId: string; buyerId: string; createdAt: Date },
  ): Promise<Conversation>;
  find(id: string): Promise<Conversation | null>;
  /** Khoá dòng hội thoại trong `tx` — bộ đếm và mốc hoạt động cập nhật theo thứ tự. */
  lock(tx: Tx, id: string): Promise<Conversation | null>;
  /** Hội thoại chưa ẩn phía người này, hoạt động gần nhất trước; `take` dòng kể từ sau con trỏ. */
  listFor(accountId: string, cursor: CursorKey | undefined, take: number): Promise<Conversation[]>;
  lastMessages(conversationIds: string[]): Promise<Map<string, Message>>;
  /** Tin nhắn của bên kia sau mốc đã đọc của người này, theo hội thoại. */
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
    },
  ): Promise<Message>;
  /** Sau một tin nhắn: mốc hoạt động, số tin của người mua, và bỏ ẩn phía người nhận. */
  touch(tx: Tx, id: string, input: { from: Side; at: Date }): Promise<void>;
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
      tx.conversation.count({ where: { buyerId, createdAt: { gte: since } } }),

    insert: (tx, data) =>
      tx.conversation.create({ data: { ...data, lastActivityAt: data.createdAt } }),

    find: (id) => prisma.conversation.findUnique({ where: { id } }),

    async lock(tx, id) {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id}::uuid FOR UPDATE`;
      return tx.conversation.findUnique({ where: { id } });
    },

    listFor: (accountId, cursor, take) =>
      prisma.conversation.findMany({
        where: {
          OR: [
            { buyerId: accountId, buyerHiddenAt: null },
            { sellerId: accountId, sellerHiddenAt: null },
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
          body, flagged, created_at AS "createdAt"
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
          AND m.sender_id <> ${accountId}::uuid
          AND m.created_at > COALESCE(
            CASE WHEN c.buyer_id = ${accountId}::uuid THEN c.buyer_read_at ELSE c.seller_read_at END,
            'epoch'::timestamptz)
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

    insertMessage: (tx, data) => tx.message.create({ data }),

    async touch(tx, id, { from, at }) {
      await tx.conversation.update({
        where: { id },
        data: {
          lastActivityAt: at,
          lastMessageAt: at,
          ...(from === 'buyer'
            ? { buyerMessages: { increment: 1 }, sellerHiddenAt: null }
            : { buyerHiddenAt: null }),
        },
      });
    },

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
      const [first] = rows;
      return first ? { sellerId: first.sellerId, buyerIds: rows.map((row) => row.buyerId) } : null;
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

    emitIn: (tx, events) => appendEvents(tx, events),
  };
}
