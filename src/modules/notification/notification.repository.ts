import type { Notification, Prisma, PrismaClient, PushTicket } from '@prisma/client';

import type { NotificationCategory } from './notification.schema.js';

/** Một dòng sắp ghi, đã có văn bản và cờ nhắc. */
export interface NotificationRow {
  recipientId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  detail: string | null;
  data: Record<string, string | null>;
  groupId: string | null;
  collapseKey: string | null;
  alert: boolean;
}

export interface NotificationRepository {
  /** Ghi theo lô; dòng trùng (cùng sự kiện, cùng người nhận) bị bỏ qua. Trả dòng thật sự được ghi. */
  insertMany(rows: NotificationRow[], sourceEventId: string, at: Date): Promise<Notification[]>;
  /** Dòng gộp chưa đọc của người nhận với khoá này, nếu có. */
  findOpenCollapsed(recipientId: string, collapseKey: string): Promise<Notification | null>;
  /** Cập nhật dòng gộp; bỏ qua khi sự kiện này đã áp rồi (giao trùng). */
  bumpCollapsed(input: {
    id: string;
    sourceEventId: string;
    title: string;
    body: string;
    alert: boolean;
    at: Date;
  }): Promise<Notification | null>;
  list(
    recipientId: string,
    page: { skip: number; take: number },
  ): Promise<{ items: Notification[]; total: number }>;
  unreadCounts(recipientIds: string[]): Promise<Map<string, number>>;
  /** `null` = có mã không thuộc người này (báo 404 như mã không tồn tại). */
  markRead(recipientId: string, ids: string[] | 'all', at: Date): Promise<number | null>;
  disabledCategories(accountIds: string[]): Promise<Map<string, Set<NotificationCategory>>>;
  setPreference(accountId: string, category: NotificationCategory, enabled: boolean): Promise<void>;
  mutedGroups(accountId: string): Promise<string[]>;
  /** Người trong danh sách đang tắt tiếng nhóm này. */
  mutedAmong(groupId: string, accountIds: string[]): Promise<Set<string>>;
  setMute(accountId: string, groupId: string, muted: boolean, at: Date): Promise<void>;

  // ── PUSH (add-notifications) ──
  findByIds(ids: string[]): Promise<Notification[]>;
  savePushTickets(
    rows: { id: string; sessionId: string; token: string; createdAt: Date }[],
  ): Promise<void>;
  /** Ticket cũ hơn `before`, cũ nhất trước — đọc biên nhận theo lô. */
  pushTicketsBefore(before: Date, limit: number): Promise<PushTicket[]>;
  deletePushTickets(ids: string[]): Promise<void>;
  /** Hạn lưu (add-data-retention): xoá tối đa `limit` dòng cập nhật lần cuối trước mốc; trả số đã xoá. */
  deleteBefore(updatedBefore: Date, limit: number): Promise<number>;
}

export function createNotificationRepository(prisma: PrismaClient): NotificationRepository {
  return {
    async insertMany(rows, sourceEventId, at) {
      if (rows.length === 0) return [];
      return prisma.notification.createManyAndReturn({
        data: rows.map((row) => ({
          ...row,
          data: row.data as Prisma.InputJsonObject,
          sourceEventId,
          createdAt: at,
          updatedAt: at,
          alertedAt: row.alert ? at : null,
        })),
        skipDuplicates: true,
      });
    },

    findOpenCollapsed: (recipientId, collapseKey) =>
      prisma.notification.findFirst({
        where: { recipientId, collapseKey, readAt: null },
        orderBy: { updatedAt: 'desc' },
      }),

    async bumpCollapsed({ id, sourceEventId, title, body, alert, at }) {
      const rows = await prisma.notification.updateManyAndReturn({
        where: { id, readAt: null, sourceEventId: { not: sourceEventId } },
        data: {
          count: { increment: 1 },
          title,
          body,
          alert,
          sourceEventId,
          updatedAt: at,
          ...(alert ? { alertedAt: at } : {}),
        },
      });
      return rows[0] ?? null;
    },

    async list(recipientId, { skip, take }) {
      const where = { recipientId };
      const [items, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        }),
        prisma.notification.count({ where }),
      ]);
      return { items, total };
    },

    async unreadCounts(recipientIds) {
      if (recipientIds.length === 0) return new Map();
      const rows = await prisma.$queryRaw<{ recipient_id: string; unread: number }[]>`
        SELECT recipient_id::text, count(*)::int AS unread FROM notifications
        WHERE recipient_id = ANY(${recipientIds}::uuid[]) AND read_at IS NULL
        GROUP BY recipient_id`;
      const counts = new Map(recipientIds.map((id) => [id, 0]));
      for (const row of rows) counts.set(row.recipient_id, row.unread);
      return counts;
    },

    markRead: (recipientId, ids, at) =>
      prisma.$transaction(async (tx) => {
        if (ids !== 'all') {
          const owned = await tx.notification.count({ where: { id: { in: ids }, recipientId } });
          if (owned !== new Set(ids).size) return null;
        }
        const { count } = await tx.notification.updateMany({
          where: { recipientId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
          data: { readAt: at },
        });
        return count;
      }),

    async disabledCategories(accountIds) {
      if (accountIds.length === 0) return new Map();
      const rows = await prisma.notificationPreference.findMany({
        where: { accountId: { in: accountIds }, enabled: false },
      });
      const result = new Map<string, Set<NotificationCategory>>();
      for (const row of rows) {
        const set = result.get(row.accountId) ?? new Set<NotificationCategory>();
        set.add(row.category);
        result.set(row.accountId, set);
      }
      return result;
    },

    async setPreference(accountId, category, enabled) {
      // Bật lại = về mặc định: xoá dòng để bảng chỉ giữ chỗ người dùng đã tắt.
      if (enabled) {
        await prisma.notificationPreference.deleteMany({ where: { accountId, category } });
        return;
      }
      await prisma.notificationPreference.upsert({
        where: { accountId_category: { accountId, category } },
        create: { accountId, category, enabled: false },
        update: { enabled: false },
      });
    },

    async mutedGroups(accountId) {
      const rows = await prisma.groupNotificationMute.findMany({
        where: { accountId },
        select: { groupId: true },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((row) => row.groupId);
    },

    async mutedAmong(groupId, accountIds) {
      if (accountIds.length === 0) return new Set();
      const rows = await prisma.groupNotificationMute.findMany({
        where: { groupId, accountId: { in: accountIds } },
        select: { accountId: true },
      });
      return new Set(rows.map((row) => row.accountId));
    },

    findByIds: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.notification.findMany({ where: { id: { in: ids } } }),

    async savePushTickets(rows) {
      if (rows.length === 0) return;
      await prisma.pushTicket.createMany({ data: rows, skipDuplicates: true });
    },

    pushTicketsBefore: (before, limit) =>
      prisma.pushTicket.findMany({
        where: { createdAt: { lt: before } },
        orderBy: { createdAt: 'asc' },
        take: limit,
      }),

    async deletePushTickets(ids) {
      if (ids.length === 0) return;
      await prisma.pushTicket.deleteMany({ where: { id: { in: ids } } });
    },

    deleteBefore: (updatedBefore, limit) =>
      prisma.$executeRaw`
        DELETE FROM notifications WHERE id IN (
          SELECT id FROM notifications WHERE updated_at < ${updatedBefore} LIMIT ${limit})`,

    async setMute(accountId, groupId, muted, at) {
      if (!muted) {
        await prisma.groupNotificationMute.deleteMany({ where: { accountId, groupId } });
        return;
      }
      await prisma.groupNotificationMute.upsert({
        where: { accountId_groupId: { accountId, groupId } },
        create: { accountId, groupId, createdAt: at },
        update: {},
      });
    },
  };
}
