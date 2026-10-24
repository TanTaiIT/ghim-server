import { Prisma } from '@prisma/client';
import type {
  PrismaClient,
  ReviewCloseCause,
  ReviewDecision,
  ReviewReasonTemplate,
  ReviewSampleCandidate,
  ReviewTask,
} from '@prisma/client';

import type { DayDecisions } from '../ops/calc/daily-stats.calc.js';
import { SHOP_TIME_ZONE } from '../../common/time/time.js';
import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';

export type Tx = Prisma.TransactionClient;
export type { ReviewDecision, ReviewReasonTemplate, ReviewTask };

/** Hai lượt cùng sinh việc cho một tin: lượt thua chạm partial unique, đọc lại việc vừa mở rồi gộp vào (design mục 3). */
const UNIQUE_VIOLATION = 'P2002';
const MAX_ATTEMPTS = 3;
/** Một lượt xem hàng chờ đọc tối đa ngần này việc mở rồi mới lọc ai xử được (design mục 4, Risks). */
const OPEN_TASKS_CAP = 2000;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;

export interface ReviewRepository {
  /**
   * Một lượt ghi vào việc đang mở của một tin: khoá dòng tin (`lockListing`), khoá việc (nếu có), rồi để `write` thêm,
   * sửa hay đóng. Có `tx` thì chạy trong transaction của bên gọi (quyết định của người); không thì tự mở và thử lại khi
   * hai lượt cùng sinh việc. Khoá tin trước việc là thứ tự của lượt đổi tin — ngược lại thì hai lượt chờ nhau.
   */
  withOpenTask<T>(
    listingId: string,
    write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
    options: { lockListing: (tx: Tx) => Promise<void>; tx?: Tx | undefined },
  ): Promise<T>;
  /** Như `withOpenTask` cho việc về một người (add-reports): khoá việc mở của tài khoản, không có dòng tin để khoá. */
  withOpenAccountTask<T>(
    accountId: string,
    write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
    tx?: Tx,
  ): Promise<T>;
  /** Như `withOpenAccountTask` cho việc về một gậy (add-strikes). */
  withOpenStrikeTask<T>(
    strikeId: string,
    write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
    tx?: Tx,
  ): Promise<T>;
  insertTask(tx: Tx, data: Prisma.ReviewTaskUncheckedCreateInput): Promise<ReviewTask>;
  updateTask(tx: Tx, id: string, data: Prisma.ReviewTaskUncheckedUpdateInput): Promise<ReviewTask>;
  closeTask(tx: Tx, id: string, cause: ReviewCloseCause, at: Date): Promise<ReviewTask>;
  findTask(id: string): Promise<ReviewTask | null>;
  hasOpenTask(listingId: string): Promise<boolean>;
  openTasksInGroup(groupId: string): Promise<ReviewTask[]>;
  /** Việc mở có người này trong danh sách loại trừ — gồm mọi việc về tin của họ (người đăng luôn bị loại). */
  openTasksExcluding(accountId: string): Promise<ReviewTask[]>;
  /** Việc đang mở mà người này đang giữ (chưa hết giờ) — xét lại khi họ mất vai hay mất quyền. */
  claimsOf(accountId: string, now: Date): Promise<ReviewTask[]>;
  /**
   * Việc đang mở theo danh mục (staff), việc về người (staff việc an toàn), theo nhóm (điều hành), hay tất cả (master)
   * — hạn sớm trước.
   */
  openTasks(filter: {
    categoryIds?: string[];
    accountTasks?: boolean;
    groupId?: string;
  }): Promise<ReviewTask[]>;
  /**
   * Nhận việc: chỉ thắng khi việc còn mở và chưa ai giữ, hay người giữ đã hết giờ, hay chính người này nhận lại — hai
   * người nhận cùng lúc thì đúng một người thắng (spec review/task-handling).
   */
  claim(input: {
    id: string;
    accountId: string;
    now: Date;
    expiresAt: Date;
    /** `null` với việc về một người — không có phiên bản tin để giữ. */
    listingVersion: number | null;
  }): Promise<boolean>;
  /** Tài khoản bị khoá, bị xoá: trả mọi việc người đó đang giữ. */
  releaseAllClaims(accountId: string): Promise<number>;
  /** Trả việc về hàng chờ; chỉ khi đúng người đó còn đang giữ. */
  releaseClaim(id: string, accountId: string): Promise<boolean>;
  /** `approvedBy` = người cho đạt / khôi phục (ghi trong transaction quyết định); lượt ghi sau không đổi dòng đã có. */
  addSampleCandidate(
    input: { listingId: string; listingVersion: number; at: Date; approvedBy?: string },
    tx?: Tx,
  ): Promise<void>;
  /**
   * Đóng việc vì quyết định chỉ khi việc còn mở, đúng người giữ, chưa hết giờ, chưa chuyển chỗ, đúng phiên bản đã nhận —
   * một việc một quyết định (fix-audit-review, T6). `false` = không đóng được.
   */
  closeDecided(
    tx: Tx,
    input: {
      id: string;
      actorId: string;
      claimedVersion: number | null;
      escalatedAt: Date | null;
      now: Date;
    },
  ): Promise<boolean>;
  findTaskIn(tx: Tx, id: string): Promise<ReviewTask | null>;

  // ── VIỆC THEO LỊCH ──
  /** Việc mở đã quá hạn xử mà chưa chuyển master. */
  overdueTasks(now: Date): Promise<ReviewTask[]>;
  /** Chuyển master: ghi `escalated_at`, trả việc người đang giữ — chỉ khi việc còn mở và chưa chuyển. */
  escalateTask(id: string, now: Date): Promise<boolean>;
  /** Dọn cột nhận việc đã hết giờ — đọc đã coi như chưa ai nhận, đây chỉ cho gọn. */
  sweepClaims(now: Date): Promise<number>;
  sampleCandidates(limit: number): Promise<ReviewSampleCandidate[]>;
  removeCandidates(keys: { listingId: string; listingVersion: number }[]): Promise<void>;
  /** Ghi đã nhắc cho các việc và phát sự kiện nhắc trong cùng transaction. */
  markReminded(ids: string[], now: Date, event: OutboxEventInput): Promise<void>;
  emit(event: OutboxEventInput): Promise<void>;
  /** Phát sự kiện trong `tx` của bên gọi — quyết định cuộn lại thì sự kiện cũng mất. */
  emitIn(tx: Tx, events: OutboxEventInput[]): Promise<void>;
  /** Việc hàng 5 khép lại trong `[from, to)`: xử xong và tự huỷ vì quá hạn — lý do huỷ khác không tính. */
  closedSamples(from: Date, to: Date): Promise<{ done: number; expired: number }>;

  // ── SỐ LIỆU CHO MASTER ──
  /** Quyết định "đạt" đã được hậu kiểm (việc mẫu người duyệt đã có quyết định), kèm người ra và có bị lật không. */
  postcheckedPasses(): Promise<{ actorId: string; overturned: boolean }[]>;
  /** Quyết định của người về việc máy giữ: luật máy đã trúng, kết quả, nhận định "máy quá tay". */
  heldDecisions(): Promise<Pick<ReviewDecision, 'machineHits' | 'outcome' | 'machineJudgment'>[]>;

  /** Quyết định không đổi gì trên tin (bác việc nhóm chuyển lên) vẫn ghi việc và nhật ký trong một transaction. */
  inTransaction<T>(write: (tx: Tx) => Promise<T>): Promise<T>;
  insertDecision(tx: Tx, data: Prisma.ReviewDecisionUncheckedCreateInput): Promise<ReviewDecision>;
  /** Gậy quyết định này ra — ghi sau khi `trust` chèn gậy trỏ về quyết định (add-strikes). */
  linkIssuedStrike(tx: Tx, decisionId: string, strikeId: string): Promise<void>;
  /** Ẩn danh hoá gậy (add-data-retention): quyết định về gậy đó hay ra gậy đó thôi nêu người — chỉ còn mã giả. */
  pseudonymizeDecisions(
    tx: Tx,
    input: { strikeId: string; accountId: string; pseudonym: string },
  ): Promise<number>;
  findDecision(id: string): Promise<ReviewDecision | null>;
  /** Quyết định về tin trong `[from, to)` theo ngày Việt Nam: đạt, và từ chối = reject / remove / violation (add-ops-daily-stats). */
  decisionsByDay(from: Date, to: Date): Promise<DayDecisions[]>;
  /** Lý do mẫu: master thấy cả lý do đã tắt, người xử chỉ thấy lý do đang bật. */
  listTemplates(input: { includeInactive: boolean }): Promise<ReviewReasonTemplate[]>;
  findTemplate(id: string): Promise<ReviewReasonTemplate | null>;
  createTemplate(data: {
    text: string;
    sort: number;
    createdBy: string;
  }): Promise<ReviewReasonTemplate>;
  updateTemplate(
    id: string,
    data: { text?: string; active?: boolean; sort?: number },
  ): Promise<ReviewReasonTemplate | null>;
  /**
   * Chèn lý do khởi đầu khi bảng trống, trả số dòng đã chèn. Bảng có dòng thì thôi — master có thể đã sửa câu hay tắt
   * lý do, không chèn lại. Hai tiến trình khởi động cùng lúc: dòng trùng câu bị bỏ qua.
   */
  seedTemplatesIfEmpty(texts: readonly string[]): Promise<number>;
}

/** Khoá tin rồi việc đang mở của tin trong `tx`, trao cho `write` — lượt khác chạm cùng việc chờ lượt này xong. */
async function inTx<T>(
  listingId: string,
  write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
  lockListing: (tx: Tx) => Promise<void>,
  tx: Tx,
): Promise<T> {
  await lockListing(tx);
  await tx.$queryRaw`SELECT id FROM review_tasks
    WHERE listing_id = ${listingId}::uuid AND status = 'open' FOR UPDATE`;
  const open = await tx.reviewTask.findFirst({ where: { listingId, status: 'open' } });
  return write(tx, open);
}

async function inAccountTx<T>(
  accountId: string,
  write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
  tx: Tx,
): Promise<T> {
  await tx.$queryRaw`SELECT id FROM review_tasks
    WHERE account_id = ${accountId}::uuid AND status = 'open' FOR UPDATE`;
  const open = await tx.reviewTask.findFirst({ where: { accountId, status: 'open' } });
  return write(tx, open);
}

async function inStrikeTx<T>(
  strikeId: string,
  write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
  tx: Tx,
): Promise<T> {
  await tx.$queryRaw`SELECT id FROM review_tasks
    WHERE strike_id = ${strikeId}::uuid AND status = 'open' FOR UPDATE`;
  const open = await tx.reviewTask.findFirst({ where: { strikeId, status: 'open' } });
  return write(tx, open);
}

export function createReviewRepository(prisma: PrismaClient): ReviewRepository {
  const withRetry = async <T>(run: (tx: Tx) => Promise<T>, attempt = 1): Promise<T> => {
    try {
      return await prisma.$transaction(run);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_ATTEMPTS) throw error;
      return withRetry(run, attempt + 1);
    }
  };

  return {
    withOpenTask: (listingId, write, { lockListing, tx }) =>
      tx
        ? inTx(listingId, write, lockListing, tx)
        : withRetry((locking) => inTx(listingId, write, lockListing, locking)),

    withOpenAccountTask: (accountId, write, tx) =>
      tx
        ? inAccountTx(accountId, write, tx)
        : withRetry((locking) => inAccountTx(accountId, write, locking)),

    withOpenStrikeTask: (strikeId, write, tx) =>
      tx
        ? inStrikeTx(strikeId, write, tx)
        : withRetry((locking) => inStrikeTx(strikeId, write, locking)),

    insertTask: (tx, data) => tx.reviewTask.create({ data }),

    updateTask: (tx, id, data) => tx.reviewTask.update({ where: { id }, data }),

    closeTask: (tx, id, cause, at) =>
      tx.reviewTask.update({
        where: { id },
        data: {
          status: cause === 'decided' ? 'decided' : 'cancelled',
          closeCause: cause,
          closedAt: at,
          claimedBy: null,
          claimExpiresAt: null,
          claimedVersion: null,
        },
      }),

    findTask: (id) => prisma.reviewTask.findUnique({ where: { id } }),

    openTasksExcluding: (accountId) =>
      prisma.reviewTask.findMany({ where: { status: 'open', excludedIds: { has: accountId } } }),

    async hasOpenTask(listingId) {
      const row = await prisma.reviewTask.findFirst({
        where: { listingId, status: 'open' },
        select: { id: true },
      });
      return row !== null;
    },

    openTasksInGroup: (groupId) =>
      prisma.reviewTask.findMany({ where: { groupId, status: 'open' } }),

    claimsOf: (accountId, now) =>
      prisma.reviewTask.findMany({
        where: { status: 'open', claimedBy: accountId, claimExpiresAt: { gt: now } },
      }),

    openTasks: ({ categoryIds, accountTasks, groupId }) =>
      prisma.reviewTask.findMany({
        where: {
          status: 'open',
          ...(categoryIds || accountTasks
            ? {
                OR: [
                  ...(categoryIds ? [{ categoryId: { in: categoryIds } }] : []),
                  ...(accountTasks ? [{ accountId: { not: null } }] : []),
                ],
              }
            : {}),
          ...(groupId ? { groupId } : {}),
        },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        take: OPEN_TASKS_CAP,
      }),

    async claim({ id, accountId, now, expiresAt, listingVersion }) {
      const { count } = await prisma.reviewTask.updateMany({
        where: {
          id,
          status: 'open',
          OR: [{ claimedBy: null }, { claimExpiresAt: { lte: now } }, { claimedBy: accountId }],
        },
        data: { claimedBy: accountId, claimExpiresAt: expiresAt, claimedVersion: listingVersion },
      });
      return count > 0;
    },

    async releaseAllClaims(accountId) {
      const { count } = await prisma.reviewTask.updateMany({
        where: { status: 'open', claimedBy: accountId },
        data: { claimedBy: null, claimExpiresAt: null, claimedVersion: null },
      });
      return count;
    },

    async releaseClaim(id, accountId) {
      const { count } = await prisma.reviewTask.updateMany({
        where: { id, status: 'open', claimedBy: accountId },
        data: { claimedBy: null, claimExpiresAt: null, claimedVersion: null },
      });
      return count > 0;
    },

    inTransaction: (write) => prisma.$transaction((tx) => write(tx)),

    insertDecision: (tx, data) => tx.reviewDecision.create({ data }),

    async linkIssuedStrike(tx, decisionId, strikeId) {
      await tx.reviewDecision.update({
        where: { id: decisionId },
        data: { issuedStrikeId: strikeId },
      });
    },

    decisionsByDay: (from, to) =>
      prisma.$queryRaw<DayDecisions[]>`
        SELECT to_char((decided_at AT TIME ZONE ${SHOP_TIME_ZONE})::date, 'YYYY-MM-DD') AS day,
               count(*) FILTER (WHERE outcome = 'pass')::int AS passed,
               count(*) FILTER (WHERE outcome IN ('reject', 'remove', 'violation'))::int AS rejected
          FROM review_decisions
         WHERE listing_id IS NOT NULL AND decided_at >= ${from} AND decided_at < ${to}
         GROUP BY 1
         ORDER BY 1`,

    async pseudonymizeDecisions(tx, { strikeId, accountId, pseudonym }) {
      const { count } = await tx.reviewDecision.updateMany({
        where: { accountId, OR: [{ strikeId }, { issuedStrikeId: strikeId }] },
        data: { accountId: pseudonym },
      });
      return count;
    },

    findDecision: (id) => prisma.reviewDecision.findUnique({ where: { id } }),

    listTemplates: ({ includeInactive }) =>
      prisma.reviewReasonTemplate.findMany({
        where: includeInactive ? {} : { active: true },
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      }),

    findTemplate: (id) => prisma.reviewReasonTemplate.findUnique({ where: { id } }),

    createTemplate: (data) => prisma.reviewReasonTemplate.create({ data }),

    async updateTemplate(id, data) {
      const { count } = await prisma.reviewReasonTemplate.updateMany({ where: { id }, data });
      return count === 0 ? null : prisma.reviewReasonTemplate.findUnique({ where: { id } });
    },

    async seedTemplatesIfEmpty(texts) {
      if ((await prisma.reviewReasonTemplate.count()) > 0) return 0;
      const { count } = await prisma.reviewReasonTemplate.createMany({
        data: texts.map((text, index) => ({ text, sort: index + 1 })),
        skipDuplicates: true,
      });
      return count;
    },

    async addSampleCandidate({ listingId, listingVersion, at, approvedBy }, tx) {
      await (tx ?? prisma).reviewSampleCandidate.upsert({
        where: { listingId_listingVersion: { listingId, listingVersion } },
        create: { listingId, listingVersion, wentLiveAt: at, approvedBy: approvedBy ?? null },
        update: {},
      });
    },

    async closeDecided(tx, { id, actorId, claimedVersion, escalatedAt, now }) {
      const { count } = await tx.reviewTask.updateMany({
        where: {
          id,
          status: 'open',
          claimedBy: actorId,
          claimExpiresAt: { gt: now },
          claimedVersion,
          escalatedAt,
        },
        data: {
          status: 'decided',
          closeCause: 'decided',
          closedAt: now,
          claimedBy: null,
          claimExpiresAt: null,
          claimedVersion: null,
        },
      });
      return count === 1;
    },

    findTaskIn: (tx, id) => tx.reviewTask.findUnique({ where: { id } }),

    overdueTasks: (now) =>
      prisma.reviewTask.findMany({
        where: { status: 'open', escalatedAt: null, dueAt: { lte: now } },
        orderBy: { dueAt: 'asc' },
      }),

    async escalateTask(id, now) {
      const { count } = await prisma.reviewTask.updateMany({
        where: { id, status: 'open', escalatedAt: null },
        data: {
          escalatedAt: now,
          claimedBy: null,
          claimExpiresAt: null,
          claimedVersion: null,
          updatedAt: now,
        },
      });
      return count === 1;
    },

    async sweepClaims(now) {
      const { count } = await prisma.reviewTask.updateMany({
        where: { status: 'open', claimExpiresAt: { lte: now } },
        data: { claimedBy: null, claimExpiresAt: null, claimedVersion: null },
      });
      return count;
    },

    sampleCandidates: (limit) =>
      prisma.reviewSampleCandidate.findMany({ orderBy: { wentLiveAt: 'asc' }, take: limit }),

    async removeCandidates(keys) {
      if (keys.length === 0) return;
      await prisma.reviewSampleCandidate.deleteMany({ where: { OR: keys } });
    },

    markReminded: (ids, now, event) =>
      prisma.$transaction(async (tx) => {
        await tx.reviewTask.updateMany({
          where: { id: { in: ids }, status: 'open' },
          data: { remindedAt: now },
        });
        await appendEvents(tx, [event]);
      }),

    emit: (event) => prisma.$transaction((tx) => appendEvents(tx, [event])),
    emitIn: (tx, events) => appendEvents(tx, events),

    async closedSamples(from, to) {
      const countOf = (closeCause: ReviewCloseCause) =>
        prisma.reviewTask.count({
          where: { queue: 5, closedAt: { gte: from, lt: to }, closeCause },
        });
      const [done, expired] = await Promise.all([countOf('decided'), countOf('expired')]);
      return { done, expired };
    },

    async postcheckedPasses() {
      const sampledIds = (
        await prisma.reviewTask.findMany({
          where: { sampledDecisionId: { not: null }, status: 'decided' },
          select: { sampledDecisionId: true },
        })
      ).flatMap((task) => task.sampledDecisionId ?? []);
      if (sampledIds.length === 0) return [];
      const [passes, overturning] = await Promise.all([
        prisma.reviewDecision.findMany({
          where: { id: { in: sampledIds } },
          select: { id: true, actorId: true },
        }),
        prisma.reviewDecision.findMany({
          where: { overturnsDecisionId: { in: sampledIds } },
          select: { overturnsDecisionId: true },
        }),
      ]);
      const overturned = new Set(overturning.map((row) => row.overturnsDecisionId));
      return passes.map((pass) => ({ actorId: pass.actorId, overturned: overturned.has(pass.id) }));
    },

    heldDecisions: () =>
      prisma.reviewDecision.findMany({
        where: {
          taskReasons: { has: 'machine_hold' },
          outcome: { in: ['pass', 'reject', 'remove', 'detach'] },
        },
        select: { machineHits: true, outcome: true, machineJudgment: true },
      }),
  };
}
