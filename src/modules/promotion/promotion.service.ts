import { randomUUID } from 'node:crypto';

import {
  Prisma,
  type PromotionProduct,
  type PromotionPurchase,
  type TrustTier,
} from '@prisma/client';

import { auditActor, type AuditDetails } from '../../common/audit/audit.js';
import type { Actor } from '../../common/auth/actor.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '../../common/errors/app-error.js';
import { startOfDayVN } from '../../common/time/time.js';
import { boostBlock } from '../listing/calc/boost.calc.js';
import type { ReviewSubject } from '../listing/listing.ports.js';
import { productIssue, STARTER_PRODUCTS, tierAt } from './calc/catalog.calc.js';
import {
  expiryOf,
  type PurchaseBlock,
  purchaseBlock,
  type PurchaseFacts,
  scopeFits,
} from './calc/purchase.calc.js';
import { PROMOTION_EVENTS, promotionEvent } from './promotion.outbox.js';
import type {
  PromotionGroupPort,
  PromotionListingPort,
  PromotionTrustPort,
  PromotionWalletPort,
} from './promotion.ports.js';
import type { PromotionRepository } from './promotion.repository.js';
import type {
  CreateProductBody,
  ListingPromotionsDto,
  OpsProductDto,
  OwnerProductDto,
  PurchaseBody,
  PurchaseDto,
  UpdateProductBody,
} from './promotion.schema.js';

export interface PromotionServiceDeps {
  repository: PromotionRepository;
  listings: PromotionListingPort;
  wallet: PromotionWalletPort;
  trust: PromotionTrustPort;
  groups: PromotionGroupPort;
  config: RuntimeConfig;
  clock: () => Date;
}

export interface PromotionService {
  /** Gói cho một tin của mình: mua được không và vì sao chưa; gói nổi bật đang chạy; số dư. */
  productsFor(actor: Actor, listingId: string): Promise<ListingPromotionsDto>;
  /** Mua gói — một transaction (design add-promotions mục 3). Gửi lại cùng khoá trả cùng lượt. */
  purchase(actor: Actor, listingId: string, body: PurchaseBody): Promise<PurchaseDto>;
  /** Bên nghe: tin hiện lại nhờ khiếu nại thắng / ân xá → hoàn đủ giá gói nổi bật còn hạn, mỗi lượt một lần. */
  refundOnRestore(listingId: string): Promise<number>;
  /** Job mỗi giờ: nhắc gói nổi bật sắp hết hạn, một lần mỗi lượt mua. */
  remindExpiring(): Promise<number>;
  opsProducts(): Promise<OpsProductDto[]>;
  createProduct(actor: Actor, body: CreateProductBody): Promise<OpsProductDto>;
  updateProduct(actor: Actor, code: string, body: UpdateProductBody): Promise<OpsProductDto>;
  /** Bước khởi động: bộ khởi đầu khi bảng trống. */
  ensureProducts(): Promise<{ promotionProducts: number }>;
  /** Cổng hạn lưu cho `ops`: lượt mua đi cùng tài khoản đã xoá. */
  purgeAccount(accountId: string): Promise<void>;
}

const isDuplicateKey = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const toOpsProduct = (row: PromotionProduct): OpsProductDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  effect: row.effect,
  durationDays: row.durationDays,
  cooldownHours: row.cooldownHours,
  price: row.price,
  minTier: row.minTier,
  scope: row.scope,
  active: row.active,
  sort: row.sort,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toPurchaseDto = (row: PromotionPurchase): PurchaseDto => ({
  id: row.id,
  listingId: row.listingId,
  productCode: row.productCode,
  effect: row.effect,
  price: row.price,
  appliedAt: row.appliedAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString() ?? null,
  status: row.status,
  refundedAt: row.refundedAt?.toISOString() ?? null,
});

/** Lỗi HTTP cho một lý do chưa mua được (spec promotion/purchase). */
function blockError(block: PurchaseBlock): Error {
  const details = block.retryAt ? { retryAt: block.retryAt.toISOString() } : undefined;
  switch (block.code) {
    case 'NOT_FOUND':
      return new NotFoundError('Không có gói này cho tin');
    case 'PROMOTION_COOLDOWN':
    case 'PROMOTION_DAILY_LIMIT':
      return new TooManyRequestsError(block.message, block.code, details);
    default:
      return new ConflictError(block.message, block.code, details);
  }
}

const factsFor = (
  product: PromotionProduct,
  subject: ReviewSubject,
  shared: Omit<PurchaseFacts, 'product' | 'placement' | 'lastPurchaseAt'>,
  lastPurchaseAt: Date | null,
): PurchaseFacts => ({
  ...shared,
  product,
  placement: subject.placement,
  lastPurchaseAt,
});

const purchaseKey = (actor: Actor, body: PurchaseBody) =>
  `purchase:${actor.accountId}:${body.idempotencyKey}`;

const auditOf = (
  actor: Actor,
  action: 'promotion.product.create' | 'promotion.product.update',
  row: PromotionProduct,
  details: AuditDetails,
) => ({
  ...auditActor(actor),
  action,
  targetType: 'promotion_product',
  targetId: row.id,
  details: { code: row.code, ...details },
});

export function createPromotionService(deps: PromotionServiceDeps): PromotionService {
  const { repository, listings, wallet, trust, groups, config, clock } = deps;

  /** Tin của chính người gọi; không có / đã xoá → 404, của người khác → 403. */
  const ownSubject = async (actor: Actor, listingId: string): Promise<ReviewSubject> => {
    const subject = await listings.reviewSubject(listingId);
    if (!subject) throw new NotFoundError('Không có tin này');
    if (subject.ownerId !== actor.accountId) throw new ForbiddenError('Đây không phải tin của bạn');
    return subject;
  };

  /** Dữ kiện chung của mọi gói với một tin — đọc một lượt, không khoá. */
  const factsOf = async (actor: Actor, subject: ReviewSubject, now: Date) => {
    const [tier, postingLockedUntil, group, balance, purchasesToday] = await Promise.all([
      trust.tierOf(actor.accountId),
      trust.postingLockedUntil(actor.accountId),
      subject.placement !== 'marketplace' && subject.groupId
        ? groups.findGroup(subject.groupId)
        : Promise.resolve(null),
      wallet.balanceOf(actor.accountId),
      repository.countSince(actor.accountId, startOfDayVN(now)),
    ]);
    return {
      tier,
      postingLockedUntil,
      groupAllows:
        subject.placement !== 'marketplace' && subject.groupId
          ? (group?.allowPromotions ?? false)
          : null,
      listingBlock: boostBlock(subject),
      balance,
      purchasesToday,
      maxPerDay: config.get('promotion.maxBumpsPerDay'),
      now,
    };
  };

  return {
    async productsFor(actor, listingId) {
      const subject = await ownSubject(actor, listingId);
      const now = clock();
      const [products, shared, running] = await Promise.all([
        repository.listProducts({ includeInactive: false }),
        factsOf(actor, subject, now),
        repository.runningOf(listingId, now),
      ]);
      const fitting = products.filter((product) => scopeFits(product.scope, subject.placement));
      const items = await Promise.all(
        fitting.map(async (product): Promise<OwnerProductDto> => {
          const last = await repository.lastPurchase(listingId, product.code);
          const block = purchaseBlock(factsFor(product, subject, shared, last?.appliedAt ?? null));
          return {
            code: product.code,
            name: product.name,
            description: product.description,
            effect: product.effect,
            durationDays: product.durationDays,
            price: product.price,
            minTier: product.minTier,
            purchasable: block === null,
            reason: block?.message ?? null,
            retryAt: block?.retryAt?.toISOString() ?? null,
          };
        }),
      );
      return {
        products: items,
        running: running ? toPurchaseDto(running) : null,
        balance: shared.balance,
      };
    },

    async purchase(actor, listingId, body) {
      const subject = await ownSubject(actor, listingId);
      const product = await repository.findProduct(body.productCode);
      if (!product?.active) throw new NotFoundError('Không có gói này');
      const key = purchaseKey(actor, body);
      const existing = await repository.findPurchaseByKey(key);
      if (existing) return toPurchaseDto(existing);

      const now = clock();
      const shared = await factsOf(actor, subject, now);
      // Thiếu Xu kiểm ở bước trừ trong transaction; ngoài này chỉ các lý do rẻ (design mục 3).
      const early = purchaseBlock(
        factsFor(product, subject, { ...shared, balance: Number.POSITIVE_INFINITY }, null),
      );
      if (early) throw blockError(early);

      const run = () =>
        repository.inTransaction(async (tx) => {
          await repository.lockAccount(tx, actor.accountId);
          // Hai lượt cùng khoá bấm song song: lượt sau chờ ở khoá, tới lượt thì thấy lượt trước — trả lại nó thay vì vấp
          // thời gian chờ của chính gói mình vừa mua.
          const earlier = await repository.findPurchaseByKey(key, tx);
          if (earlier) return earlier;
          const [last, today] = await Promise.all([
            repository.lastPurchase(listingId, product.code, tx),
            repository.countSince(actor.accountId, startOfDayVN(now), tx),
          ]);
          const block = purchaseBlock(
            factsFor(
              product,
              subject,
              { ...shared, purchasesToday: today, balance: Number.POSITIVE_INFINITY },
              last?.appliedAt ?? null,
            ),
          );
          if (block) throw blockError(block);
          const expiresAt =
            product.effect === 'featured' && product.durationDays !== null
              ? expiryOf(now, product.durationDays)
              : null;
          await listings.applyPromotion(tx, {
            listingId,
            version: subject.version,
            effect: product.effect,
            ...(expiresAt ? { until: expiresAt } : {}),
            at: now,
          });
          const purchaseId = randomUUID();
          const { transaction } = await wallet.apply(tx, {
            accountId: actor.accountId,
            amount: -product.price,
            type: 'product_purchase',
            refs: { listingId, purchaseId, productCode: product.code },
            idempotencyKey: key,
            at: now,
          });
          return repository.insertPurchase(
            tx,
            {
              id: purchaseId,
              listingId,
              accountId: actor.accountId,
              groupId: subject.placement === 'marketplace' ? null : subject.groupId,
              product,
              walletTransactionId: transaction.id,
              appliedAt: now,
              expiresAt,
              idempotencyKey: key,
            },
            [
              promotionEvent(PROMOTION_EVENTS.purchaseApplied, {
                purchaseId,
                listingId,
                accountId: actor.accountId,
                productCode: product.code,
                effect: product.effect,
                expiresAt: expiresAt?.toISOString() ?? null,
              }),
            ],
          );
        });

      try {
        return toPurchaseDto(await run());
      } catch (error) {
        // Hai lượt cùng khoá song song: lượt sau vấp unique, cả transaction quay lui — trả lượt của lượt trước.
        if (!isDuplicateKey(error)) throw error;
        const earlier = await repository.findPurchaseByKey(key);
        if (!earlier) throw error;
        return toPurchaseDto(earlier);
      }
    },

    async refundOnRestore(listingId) {
      const now = clock();
      const rows = await repository.refundable(listingId, now);
      let refunded = 0;
      for (const row of rows) {
        const entry = {
          accountId: row.accountId,
          amount: row.price,
          type: 'refund' as const,
          refs: { listingId, purchaseId: row.id, productCode: row.productCode },
          idempotencyKey: `refund:${row.id}`,
          at: now,
        };
        // Khoá tự nhiên theo lượt mua: sự kiện phát lại không hoàn hai lần, và lượt đã hoàn mà chưa kịp đánh dấu thì
        // đánh dấu nốt.
        // oxlint-disable-next-line no-await-in-loop
        await repository.inTransaction(async (tx) => {
          const { transaction } = await wallet.apply(tx, entry);
          await repository.markRefunded(tx, row.id, {
            refundedAt: now,
            refundTransactionId: transaction.id,
          });
        });
        refunded += 1;
      }
      return refunded;
    },

    remindExpiring() {
      const now = clock();
      const hours = config.get('promotion.featuredReminderHours');
      return repository.claimExpiring({
        now,
        before: new Date(now.getTime() + hours * 3_600_000),
        events: (rows) =>
          rows.map((row) =>
            promotionEvent(PROMOTION_EVENTS.purchaseExpiring, {
              purchaseId: row.id,
              listingId: row.listingId,
              accountId: row.accountId,
              productCode: row.productCode,
              expiresAt: row.expiresAt?.toISOString() ?? null,
            }),
          ),
      });
    },

    async opsProducts() {
      return (await repository.listProducts({ includeInactive: true })).map(toOpsProduct);
    },

    async createProduct(actor, body) {
      const durationDays = body.durationDays ?? null;
      const issue = productIssue(
        { effect: body.effect, durationDays },
        config.get('promotion.featuredMaxDays'),
      );
      if (issue) throw new BadRequestError(issue, 'VALIDATION_ERROR');
      if (await repository.findProduct(body.code)) {
        throw new ConflictError('Mã gói đã có', 'CONFLICT');
      }
      const now = clock();
      const data = {
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        effect: body.effect,
        durationDays,
        cooldownHours: body.cooldownHours,
        price: body.price,
        minTier: body.minTier,
        scope: body.scope,
        sort: body.sort ?? 0,
        createdBy: actor.accountId,
        createdAt: now,
        updatedAt: now,
      };
      const row = await repository.createProduct(data, {
        ...auditActor(actor),
        action: 'promotion.product.create',
        targetType: 'promotion_product',
        targetId: body.code,
        details: {
          code: body.code,
          effect: body.effect,
          durationDays,
          cooldownHours: body.cooldownHours,
          price: body.price,
          minTier: body.minTier,
          scope: body.scope,
        },
      });
      return toOpsProduct(row);
    },

    async updateProduct(actor, code, body) {
      const current = await repository.findProduct(code);
      if (!current) throw new NotFoundError('Không có gói này');
      const durationDays =
        body.durationDays === undefined ? current.durationDays : body.durationDays;
      const issue = productIssue(
        { effect: current.effect, durationDays },
        config.get('promotion.featuredMaxDays'),
      );
      if (issue) throw new BadRequestError(issue, 'VALIDATION_ERROR');
      const changed: AuditDetails = {};
      for (const [field, value] of Object.entries(body)) {
        if (value !== undefined) changed[field] = value;
      }
      const row = await repository.updateProduct(
        code,
        { ...(changed as Prisma.PromotionProductUncheckedUpdateInput), updatedAt: clock() },
        auditOf(actor, 'promotion.product.update', current, changed),
      );
      return toOpsProduct(row);
    },

    async ensureProducts() {
      const minTier: TrustTier = tierAt(config.get('promotion.minTier'));
      const promotionProducts = await repository.seedProductsIfEmpty(STARTER_PRODUCTS, {
        minTier,
        cooldownHours: config.get('promotion.bumpCooldownHours'),
        at: clock(),
      });
      return { promotionProducts };
    },

    purgeAccount: (accountId) => repository.purgeAccount(accountId),
  };
}
