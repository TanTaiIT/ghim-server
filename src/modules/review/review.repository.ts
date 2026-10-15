import { Prisma } from '@prisma/client';
import type { PrismaClient, ReviewCloseCause, ReviewTask } from '@prisma/client';

export type Tx = Prisma.TransactionClient;
export type { ReviewTask };

/** Hai lượt cùng sinh việc cho một tin: lượt thua chạm partial unique, đọc lại việc vừa mở rồi gộp vào (design mục 3). */
const UNIQUE_VIOLATION = 'P2002';
const MAX_ATTEMPTS = 3;

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
