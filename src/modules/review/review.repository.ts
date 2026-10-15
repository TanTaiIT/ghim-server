import { Prisma } from '@prisma/client';
import type { PrismaClient, ReviewCloseCause, ReviewTask } from '@prisma/client';

export type Tx = Prisma.TransactionClient;
export type { ReviewTask };

/** Hai lượt cùng sinh việc cho một tin: lượt thua chạm partial unique, đọc lại việc vừa mở rồi gộp vào (design mục 3). */
const UNIQUE_VIOLATION = 'P2002';
const MAX_ATTEMPTS = 3;
/** Một lượt xem hàng chờ đọc tối đa ngần này việc mở rồi mới lọc ai xử được (design mục 4, Risks). */
const OPEN_TASKS_CAP = 2000;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;

export interface ReviewRepository {
  /**
   * Một lượt ghi vào việc đang mở của một tin: khoá việc (nếu có) rồi để `write` thêm, sửa hay đóng. Có `tx` thì chạy
   * trong transaction của bên gọi (quyết định của người); không thì tự mở và thử lại khi hai lượt cùng sinh việc.
   */
  withOpenTask<T>(
    listingId: string,
    write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
    tx?: Tx,
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
}

/** Khoá việc đang mở của tin trong `tx` rồi trao cho `write` — lượt khác chạm cùng việc phải chờ lượt này xong. */
async function inTx<T>(
  listingId: string,
  write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
  tx: Tx,
): Promise<T> {
  await tx.$queryRaw`SELECT id FROM review_tasks
    WHERE listing_id = ${listingId}::uuid AND status = 'open' FOR UPDATE`;
  const open = await tx.reviewTask.findFirst({ where: { listingId, status: 'open' } });
  return write(tx, open);
}

export function createReviewRepository(prisma: PrismaClient): ReviewRepository {
  const withRetry = async <T>(
    listingId: string,
    write: (tx: Tx, open: ReviewTask | null) => Promise<T>,
    attempt = 1,
  ): Promise<T> => {
    try {
      return await prisma.$transaction((tx) => inTx(listingId, write, tx));
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_ATTEMPTS) throw error;
      return withRetry(listingId, write, attempt + 1);
    }
  };

  return {
    withOpenTask: (listingId, write, tx) =>
      tx ? inTx(listingId, write, tx) : withRetry(listingId, write),

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

    async addSampleCandidate(listingId, listingVersion, at) {
      await prisma.reviewSampleCandidate.upsert({
        where: { listingId_listingVersion: { listingId, listingVersion } },
        create: { listingId, listingVersion, wentLiveAt: at },
        update: {},
      });
    },
  };
}
