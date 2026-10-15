import { Prisma } from '@prisma/client';
import type {
  PrismaClient,
  ReviewCloseCause,
  ReviewDecision,
  ReviewReasonTemplate,
  ReviewSampleCandidate,
  ReviewTask,
} from '@prisma/client';

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
  insertTask(tx: Tx, data: Prisma.ReviewTaskUncheckedCreateInput): Promise<ReviewTask>;
  updateTask(tx: Tx, id: string, data: Prisma.ReviewTaskUncheckedUpdateInput): Promise<ReviewTask>;
  closeTask(tx: Tx, id: string, cause: ReviewCloseCause, at: Date): Promise<ReviewTask>;
  findTask(id: string): Promise<ReviewTask | null>;
  hasOpenTask(listingId: string): Promise<boolean>;
  openTasksInGroup(groupId: string): Promise<ReviewTask[]>;
  /** Việc đang mở mà người này đang giữ (chưa hết giờ) — xét lại khi họ mất vai hay mất quyền. */
  claimsOf(accountId: string, now: Date): Promise<ReviewTask[]>;
  /** Việc đang mở theo danh mục (staff), theo nhóm (điều hành), hay tất cả (master) — hạn sớm trước. */
  openTasks(filter: { categoryIds?: string[]; groupId?: string }): Promise<ReviewTask[]>;
  /**
   * Nhận việc: chỉ thắng khi việc còn mở và chưa ai giữ, hay người giữ đã hết giờ, hay chính người này nhận lại — hai
   * người nhận cùng lúc thì đúng một người thắng (spec review/task-handling).
   */
  claim(input: {
    id: string;
    accountId: string;
    now: Date;
    expiresAt: Date;
    listingVersion: number;
  }): Promise<boolean>;
  /** Tài khoản bị khoá, bị xoá: trả mọi việc người đó đang giữ. */
  releaseAllClaims(accountId: string): Promise<number>;
  /** Trả việc về hàng chờ; chỉ khi đúng người đó còn đang giữ. */
  releaseClaim(id: string, accountId: string): Promise<boolean>;
  addSampleCandidate(listingId: string, listingVersion: number, at: Date): Promise<void>;

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
  /** Việc hàng 5 khép lại trong `[from, to)`: xử xong và tự huỷ vì quá hạn — lý do huỷ khác không tính. */
  closedSamples(from: Date, to: Date): Promise<{ done: number; expired: number }>;

  /** Quyết định không đổi gì trên tin (bác việc nhóm chuyển lên) vẫn ghi việc và nhật ký trong một transaction. */
  inTransaction<T>(write: (tx: Tx) => Promise<T>): Promise<T>;
  insertDecision(tx: Tx, data: Prisma.ReviewDecisionUncheckedCreateInput): Promise<ReviewDecision>;
  findDecision(id: string): Promise<ReviewDecision | null>;
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

export function createReviewRepository(prisma: PrismaClient): ReviewRepository {
  const withRetry = async <T>(
    listingId: string,
    write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
    lockListing: (tx: Tx) => Promise<void>,
    attempt = 1,
  ): Promise<T> => {
    try {
      return await prisma.$transaction((tx) => inTx(listingId, write, lockListing, tx));
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_ATTEMPTS) throw error;
      return withRetry(listingId, write, lockListing, attempt + 1);
    }
  };

  return {
    withOpenTask: (listingId, write, { lockListing, tx }) =>
      tx ? inTx(listingId, write, lockListing, tx) : withRetry(listingId, write, lockListing),

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

    openTasks: ({ categoryIds, groupId }) =>
      prisma.reviewTask.findMany({
        where: {
          status: 'open',
          ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
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

    async addSampleCandidate(listingId, listingVersion, at) {
      await prisma.reviewSampleCandidate.upsert({
        where: { listingId_listingVersion: { listingId, listingVersion } },
        create: { listingId, listingVersion, wentLiveAt: at },
        update: {},
      });
    },

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

    async closedSamples(from, to) {
      const countOf = (closeCause: ReviewCloseCause) =>
        prisma.reviewTask.count({
          where: { queue: 5, closedAt: { gte: from, lt: to }, closeCause },
        });
      const [done, expired] = await Promise.all([countOf('decided'), countOf('expired')]);
      return { done, expired };
    },
  };
}
