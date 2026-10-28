import type { Prisma, PrismaClient, PromotionProduct, PromotionPurchase } from '@prisma/client';

import { appendAudit, type AuditEntry } from '../../common/audit/audit.js';
import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';
import type { StarterProduct } from './calc/catalog.calc.js';

export type Tx = Prisma.TransactionClient;

export interface NewPurchase {
  id: string;
  listingId: string;
  accountId: string;
  groupId: string | null;
  product: PromotionProduct;
  walletTransactionId: string;
  appliedAt: Date;
  expiresAt: Date | null;
  idempotencyKey: string;
}

export interface PromotionRepository {
  listProducts(input: { includeInactive: boolean }): Promise<PromotionProduct[]>;
  findProduct(code: string): Promise<PromotionProduct | null>;
  createProduct(
    data: Prisma.PromotionProductUncheckedCreateInput,
    audit: AuditEntry,
  ): Promise<PromotionProduct>;
  updateProduct(
    code: string,
    data: Prisma.PromotionProductUncheckedUpdateInput,
    audit: AuditEntry,
  ): Promise<PromotionProduct>;
  /** Bộ khởi đầu khi bảng trống; có gói rồi thì không đụng (master đã sửa thì giữ bản của master). */
  seedProductsIfEmpty(
    products: readonly StarterProduct[],
    defaults: { minTier: PromotionProduct['minTier']; cooldownHours: number; at: Date },
  ): Promise<number>;

  inTransaction<T>(run: (tx: Tx) => Promise<T>): Promise<T>;
  /** Xếp hàng mọi lượt mua của một người trong transaction — thời gian chờ và trần ngày đếm đúng khi bấm song song. */
  lockAccount(tx: Tx, accountId: string): Promise<void>;
  findPurchaseByKey(idempotencyKey: string, tx?: Tx): Promise<PromotionPurchase | null>;
  lastPurchase(listingId: string, productCode: string, tx?: Tx): Promise<PromotionPurchase | null>;
  countSince(accountId: string, since: Date, tx?: Tx): Promise<number>;
  insertPurchase(
    tx: Tx,
    input: NewPurchase,
    events: OutboxEventInput[],
  ): Promise<PromotionPurchase>;
  /** Lượt `featured` còn hạn gần nhất của tin. */
  runningOf(listingId: string, now: Date): Promise<PromotionPurchase | null>;
  /** Lượt `featured` còn hạn, chưa hoàn, của tin — hoàn khi tin hiện lại nhờ khiếu nại thắng / ân xá. */
  refundable(listingId: string, now: Date): Promise<PromotionPurchase[]>;
  markRefunded(
    tx: Tx,
    id: string,
    input: { refundedAt: Date; refundTransactionId: string },
  ): Promise<void>;
  /**
   * Lượt nổi bật sắp hết hạn chưa nhắc: đặt `reminded_at` có điều kiện rồi phát sự kiện cùng transaction — chạy lại không
   * nhắc lại. Trả số lượt vừa nhắc.
   */
  claimExpiring(input: {
    now: Date;
    before: Date;
    events: (rows: PromotionPurchase[]) => OutboxEventInput[];
  }): Promise<number>;
  /** Lượt dọn tài khoản đã xoá (`ops`): transaction `SET LOCAL ghim.purge = 'on'`. */
  purgeAccount(accountId: string): Promise<void>;
}

/** Trần một lượt nhắc sắp hết hạn — job chạy mỗi giờ, dư thì lượt sau lấy tiếp. */
const REMIND_BATCH = 500;

export function createPromotionRepository(prisma: PrismaClient): PromotionRepository {
  const lastPurchase = (listingId: string, productCode: string, tx: Tx | PrismaClient = prisma) =>
    tx.promotionPurchase.findFirst({
      where: { listingId, productCode },
      orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
    });

  return {
    listProducts: ({ includeInactive }) =>
      prisma.promotionProduct.findMany({
        where: includeInactive ? {} : { active: true },
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      }),

    findProduct: (code) => prisma.promotionProduct.findUnique({ where: { code } }),

    createProduct: (data, audit) =>
      prisma.$transaction(async (tx) => {
        const row = await tx.promotionProduct.create({ data });
        await appendAudit(tx, audit);
        return row;
      }),

    updateProduct: (code, data, audit) =>
      prisma.$transaction(async (tx) => {
        const row = await tx.promotionProduct.update({ where: { code }, data });
        await appendAudit(tx, audit);
        return row;
      }),

    async seedProductsIfEmpty(products, defaults) {
      if ((await prisma.promotionProduct.count()) > 0) return 0;
      const result = await prisma.promotionProduct.createMany({
        data: products.map((product) => ({
          ...product,
          minTier: defaults.minTier,
          cooldownHours: defaults.cooldownHours,
          createdBy: null,
          createdAt: defaults.at,
          updatedAt: defaults.at,
        })),
        skipDuplicates: true,
      });
      return result.count;
    },

    inTransaction: (run) => prisma.$transaction(run),

    async lockAccount(tx, accountId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`promotion:${accountId}`}, 0))`;
    },

    findPurchaseByKey: (idempotencyKey, tx = prisma) =>
      tx.promotionPurchase.findUnique({ where: { idempotencyKey } }),

    lastPurchase: (listingId, productCode, tx) => lastPurchase(listingId, productCode, tx),

    countSince: (accountId, since, tx = prisma) =>
      tx.promotionPurchase.count({ where: { accountId, appliedAt: { gte: since } } }),

    async insertPurchase(tx, input, events) {
      const { product } = input;
      const row = await tx.promotionPurchase.create({
        data: {
          id: input.id,
          listingId: input.listingId,
          accountId: input.accountId,
          groupId: input.groupId,
          productId: product.id,
          productCode: product.code,
          effect: product.effect,
          durationDays: product.durationDays,
          price: product.price,
          walletTransactionId: input.walletTransactionId,
          appliedAt: input.appliedAt,
          expiresAt: input.expiresAt,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await appendEvents(tx, events);
      return row;
    },

    runningOf: (listingId, now) =>
      prisma.promotionPurchase.findFirst({
        where: { listingId, effect: 'featured', status: 'applied', expiresAt: { gt: now } },
        orderBy: [{ expiresAt: 'desc' }, { id: 'desc' }],
      }),

    refundable: (listingId, now) =>
      prisma.promotionPurchase.findMany({
        where: { listingId, effect: 'featured', status: 'applied', expiresAt: { gt: now } },
        orderBy: [{ appliedAt: 'asc' }, { id: 'asc' }],
      }),

    async markRefunded(tx, id, input) {
      await tx.promotionPurchase.update({
        where: { id },
        data: { status: 'refunded', ...input },
      });
    },

    claimExpiring: ({ now, before, events }) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.promotionPurchase.findMany({
          where: {
            status: 'applied',
            effect: 'featured',
            remindedAt: null,
            expiresAt: { gt: now, lte: before },
          },
          orderBy: { expiresAt: 'asc' },
          take: REMIND_BATCH,
        });
        if (rows.length === 0) return 0;
        const claimed = await tx.promotionPurchase.updateMany({
          where: { id: { in: rows.map((row) => row.id) }, remindedAt: null },
          data: { remindedAt: now },
        });
        if (claimed.count !== rows.length) {
          // Lượt job khác vừa nhắc một phần: chỉ phát cho dòng mình vừa đặt mốc.
          const fresh = await tx.promotionPurchase.findMany({
            where: { id: { in: rows.map((row) => row.id) }, remindedAt: now },
          });
          await appendEvents(tx, events(fresh));
          return fresh.length;
        }
        await appendEvents(tx, events(rows));
        return rows.length;
      }),

    purgeAccount: (accountId) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ghim.purge = 'on'`);
        await tx.promotionPurchase.deleteMany({ where: { accountId } });
      }),
  };
}
