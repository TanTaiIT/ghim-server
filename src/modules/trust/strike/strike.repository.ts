import type {
  AppealChannel,
  AppealStatus,
  Prisma,
  PrismaClient,
  ReviewActorRole,
  RuleArticle,
  SeriousDecision,
  Strike,
  StrikeAppeal,
  StrikeCancelCause,
  StrikeComment,
  StrikeKind,
} from '@prisma/client';

import { appendAudit, type AuditEntry } from '../../../common/audit/audit.js';
import { appendEvents, type OutboxEventInput } from '../../../common/outbox/outbox.js';

type Tx = Prisma.TransactionClient;
export type { RuleArticle, Strike, StrikeAppeal, StrikeComment };

export type StrikeWithRelations = Strike & {
  appeal: StrikeAppeal | null;
  comments: StrikeComment[];
  article: RuleArticle;
};

export interface NewStrike {
  accountId: string;
  kind: StrikeKind;
  points: number;
  ruleArticleId: string;
  ruleText: string;
  issuedBy: string;
  issuedByRole: ReviewActorRole;
  categoryId: string | null;
  fromReport: boolean;
  listingId: string | null;
  decisionId: string | null;
  emailHashes: string[];
  inheritedFromId: string | null;
  issuedAt: Date;
  expiresAt: Date | null;
}

export interface StrikeRepository {
  inTransaction<T>(write: (tx: Tx) => Promise<T>): Promise<T>;
  /** Khoá advisory theo tài khoản: hai lượt ghi gậy của một người xếp hàng (kế thừa chen với ra gậy). */
  lockAccount(tx: Tx, accountId: string): Promise<void>;
  insert(tx: Tx, data: NewStrike): Promise<Strike>;
  find(id: string, tx?: Tx): Promise<StrikeWithRelations | null>;
  /** Khoá dòng gậy trong `tx` rồi trả — mọi lượt quyết trên một gậy xếp hàng. */
  lock(tx: Tx, id: string): Promise<StrikeWithRelations | null>;
  listOf(accountId: string, tx?: Tx): Promise<Strike[]>;
  /** Gậy đang hiệu lực (theo `status`, hạn đọc lại ở service) của nhiều tài khoản. */
  activeOf(accountIds: string[]): Promise<Strike[]>;
  /** Gậy `active` mang dấu băm email này — kế thừa khi lập lại tài khoản. */
  activeByEmailHash(hash: string): Promise<Strike[]>;
  hasPermanentByEmailHash(hash: string): Promise<boolean>;
  /** Gậy nghiêm trọng đang chờ quyết hay đã khoá vĩnh viễn của tài khoản — lý do nó đang bị khoá. */
  seriousLockOf(accountId: string): Promise<Strike | null>;
  addEmailHash(accountId: string, hash: string): Promise<void>;
  update(tx: Tx, id: string, data: Prisma.StrikeUncheckedUpdateInput): Promise<Strike>;
  /** Đánh dấu hết hạn có điều kiện (còn `active`), trả các gậy vừa hết. */
  expireDue(tx: Tx, now: Date): Promise<Strike[]>;
  permanentReviewDue(now: Date): Promise<Strike[]>;
  // ── HẠN LƯU (add-data-retention) ──
  /** Gậy của các tin kèm trạng thái khiếu nại, mới trước — `ops` tính tạm giữ và mốc xoá tin vi phạm. */
  ofListings(
    listingIds: string[],
  ): Promise<(Strike & { appeal: Pick<StrikeAppeal, 'status'> | null })[]>;
  /** Gậy chưa ẩn danh đã đóng trước mốc (hết hạn, huỷ), hay đã gỡ khoá vĩnh viễn mà ngày khoá trước mốc. */
  anonymizeDue(closedBefore: Date, limit: number): Promise<Pick<Strike, 'id' | 'accountId'>[]>;
  /** Thay người nhận bằng mã giả, bỏ dấu băm email, xoá lời khiếu nại — chỉ khi chưa ẩn danh. */
  anonymize(
    tx: Tx,
    input: { id: string; accountId: string; pseudonym: string; at: Date },
  ): Promise<boolean>;
  /** Khoá vĩnh viễn đã gỡ: dấu băm email giữ vì khoá đó bị xoá (spec data-retention). */
  dropLiftedEmailHashes(): Promise<number>;
  /** Đăng ký dở dang bị dọn (`identity.account.purged`): gậy đã kế thừa của các tài khoản đó đi theo. */
  deleteOfAccounts(accountIds: string[]): Promise<number>;

  createAppeal(
    tx: Tx,
    data: {
      strikeId: string;
      accountId: string;
      channel: AppealChannel;
      statement: string;
      filedAt: Date;
    },
  ): Promise<StrikeAppeal>;
  updateAppeal(
    tx: Tx,
    strikeId: string,
    data: { status: AppealStatus; decidedAt: Date; decidedBy: string | null },
  ): Promise<StrikeAppeal | null>;
  addComment(data: {
    strikeId: string;
    authorId: string;
    body: string;
    createdAt: Date;
  }): Promise<StrikeComment>;

  listArticles(input: { includeInactive: boolean }): Promise<RuleArticle[]>;
  findArticle(id: string): Promise<RuleArticle | null>;
  createArticle(data: {
    code: string;
    title: string;
    text: string;
    sort: number;
  }): Promise<RuleArticle>;
  updateArticle(
    id: string,
    data: { title?: string; text?: string; active?: boolean; sort?: number },
  ): Promise<RuleArticle | null>;
  /** Chèn bộ khởi đầu khi bảng trống; hai tiến trình khởi động cùng lúc: dòng trùng mã bị bỏ qua. */
  seedArticlesIfEmpty(
    articles: readonly { code: string; title: string; text: string }[],
  ): Promise<number>;

  emitIn(tx: Tx, events: OutboxEventInput[]): Promise<void>;
  auditIn(tx: Tx, entry: AuditEntry): Promise<void>;
}

const withRelations = {
  appeal: true,
  comments: { orderBy: { createdAt: 'asc' } },
  article: true,
} as const;

export function createStrikeRepository(prisma: PrismaClient): StrikeRepository {
  return {
    inTransaction: (write) => prisma.$transaction((tx) => write(tx)),

    async lockAccount(tx, accountId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`strike:${accountId}`}, 0))`;
    },

    insert: (tx, data) => tx.strike.create({ data }),

    find: (id, tx) => (tx ?? prisma).strike.findUnique({ where: { id }, include: withRelations }),

    async lock(tx, id) {
      await tx.$queryRaw`SELECT id FROM strikes WHERE id = ${id}::uuid FOR UPDATE`;
      return tx.strike.findUnique({ where: { id }, include: withRelations });
    },

    listOf: (accountId, tx) =>
      (tx ?? prisma).strike.findMany({
        where: { accountId },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      }),

    activeOf: (accountIds) =>
      prisma.strike.findMany({ where: { accountId: { in: accountIds }, status: 'active' } }),

    activeByEmailHash: (hash) =>
      prisma.strike.findMany({ where: { status: 'active', emailHashes: { has: hash } } }),

    async hasPermanentByEmailHash(hash) {
      const row = await prisma.strike.findFirst({
        where: { status: 'permanent', emailHashes: { has: hash } },
        select: { id: true },
      });
      return row !== null;
    },

    seriousLockOf: (accountId) =>
      prisma.strike.findFirst({
        where: { accountId, kind: 'serious', status: { in: ['active', 'permanent'] } },
        orderBy: { issuedAt: 'desc' },
      }),

    async addEmailHash(accountId, hash) {
      const rows = await prisma.strike.findMany({
        where: { accountId, status: 'active', NOT: { emailHashes: { has: hash } } },
        select: { id: true },
      });
      await Promise.all(
        rows.map((row) =>
          prisma.strike.update({ where: { id: row.id }, data: { emailHashes: { push: hash } } }),
        ),
      );
    },

    update: (tx, id, data) => tx.strike.update({ where: { id }, data }),

    async expireDue(tx, now) {
      return tx.strike.updateManyAndReturn({
        where: { status: 'active', expiresAt: { lte: now } },
        data: { status: 'expired' },
      });
    },

    permanentReviewDue: (now) =>
      prisma.strike.findMany({
        where: { status: 'permanent', permanentReviewAt: { lte: now } },
        orderBy: { permanentReviewAt: 'asc' },
      }),

    ofListings: (listingIds) =>
      listingIds.length === 0
        ? Promise.resolve([])
        : prisma.strike.findMany({
            where: { listingId: { in: listingIds } },
            include: { appeal: { select: { status: true } } },
            orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
          }),

    anonymizeDue: (closedBefore, limit) =>
      prisma.strike.findMany({
        where: {
          anonymizedAt: null,
          OR: [
            { status: 'expired', expiresAt: { lt: closedBefore } },
            { status: 'cancelled', cancelledAt: { lt: closedBefore } },
            { status: 'lifted', issuedAt: { lt: closedBefore } },
          ],
        },
        orderBy: { issuedAt: 'asc' },
        take: limit,
        select: { id: true, accountId: true },
      }),

    async anonymize(tx, { id, accountId, pseudonym, at }) {
      const { count } = await tx.strike.updateMany({
        where: { id, accountId, anonymizedAt: null },
        data: { accountId: pseudonym, emailHashes: [], anonymizedAt: at },
      });
      if (count === 0) return false;
      await tx.strikeAppeal.updateMany({
        where: { strikeId: id },
        data: { accountId: pseudonym, statement: '' },
      });
      return true;
    },

    async dropLiftedEmailHashes() {
      const { count } = await prisma.strike.updateMany({
        where: { status: 'lifted', NOT: { emailHashes: { isEmpty: true } } },
        data: { emailHashes: [] },
      });
      return count;
    },

    async deleteOfAccounts(accountIds) {
      if (accountIds.length === 0) return 0;
      const { count } = await prisma.strike.deleteMany({
        where: { accountId: { in: accountIds } },
      });
      return count;
    },

    createAppeal: (tx, data) => tx.strikeAppeal.create({ data }),

    async updateAppeal(tx, strikeId, data) {
      const rows = await tx.strikeAppeal.updateManyAndReturn({
        where: { strikeId, status: 'pending' },
        data,
      });
      return rows[0] ?? null;
    },

    addComment: (data) => prisma.strikeComment.create({ data }),

    listArticles: ({ includeInactive }) =>
      prisma.ruleArticle.findMany({
        where: includeInactive ? {} : { active: true },
        orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      }),

    findArticle: (id) => prisma.ruleArticle.findUnique({ where: { id } }),

    createArticle: (data) => prisma.ruleArticle.create({ data }),

    async updateArticle(id, data) {
      const { count } = await prisma.ruleArticle.updateMany({ where: { id }, data });
      return count === 0 ? null : prisma.ruleArticle.findUnique({ where: { id } });
    },

    async seedArticlesIfEmpty(articles) {
      if ((await prisma.ruleArticle.count()) > 0) return 0;
      const { count } = await prisma.ruleArticle.createMany({
        data: articles.map((article, index) => ({ ...article, sort: index + 1 })),
        skipDuplicates: true,
      });
      return count;
    },

    emitIn: (tx, events) => appendEvents(tx, events),
    auditIn: (tx, entry) => appendAudit(tx, entry),
  };
}

export type { StrikeCancelCause, SeriousDecision };
