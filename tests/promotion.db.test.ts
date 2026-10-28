import { beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/*
 * Ràng buộc DB của gói đẩy tin (design add-promotions mục 2): CHECK gói và lượt mua, trigger bất biến của lượt mua (chỉ
 * bốn cột trạng thái về sau đổi được; xoá chỉ ở lượt dọn), unique khoá chống lặp.
 */
const CHECK = '23514';
const TRIGGER = 'P0001';
const UNIQUE = 'P2002';

beforeEach(truncateAll);

const product = (over: object = {}) =>
  prisma.promotionProduct.create({
    data: {
      code: 'featured_3d',
      name: 'Nổi bật 3 ngày',
      effect: 'featured',
      durationDays: 3,
      cooldownHours: 24,
      price: 2,
      minTier: 'T1',
      scope: 'both',
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
      ...over,
    },
  });

const purchase = async (accountId: string, over: object = {}) => {
  const row = await product();
  return prisma.promotionPurchase.create({
    data: {
      listingId: '00000000-0000-7000-8000-00000000aa01',
      accountId,
      productId: row.id,
      productCode: row.code,
      effect: 'featured',
      durationDays: 3,
      price: 2,
      walletTransactionId: '00000000-0000-7000-8000-00000000bb01',
      appliedAt: TEST_NOW,
      expiresAt: new Date(TEST_NOW.getTime() + 3 * 86_400_000),
      idempotencyKey: 'purchase:a:k1',
      ...over,
    },
  });
};

describe('CHECK của gói và lượt mua', () => {
  it('gói nổi bật thiếu thời hạn, gói đẩy lên đầu có thời hạn, giá 0 đều bị chặn', async () => {
    await expect(sqlStateOf(product({ durationDays: null }))).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(product({ code: 'top', effect: 'rank_to_top', durationDays: 1 })),
    ).resolves.toBe(CHECK);
    await expect(sqlStateOf(product({ price: 0 }))).resolves.toBe(CHECK);
    await expect(
      product({ code: 'top', effect: 'rank_to_top', durationDays: null, price: 1 }),
    ).resolves.toMatchObject({
      code: 'top',
    });
  });

  it('lượt mua nổi bật thiếu hạn bị chặn; khoá chống lặp trùng vấp unique', async () => {
    const { id } = await seedAccount();
    await expect(sqlStateOf(purchase(id, { expiresAt: null }))).resolves.toBe(CHECK);
    await truncateAll();
    const { id: again } = await seedAccount();
    await purchase(again);
    await expect(
      prismaErrorCode(
        prisma.promotionPurchase.create({
          data: {
            listingId: '00000000-0000-7000-8000-00000000aa02',
            accountId: again,
            productId: (await prisma.promotionProduct.findFirstOrThrow()).id,
            productCode: 'featured_3d',
            effect: 'rank_to_top',
            price: 1,
            walletTransactionId: '00000000-0000-7000-8000-00000000bb02',
            appliedAt: TEST_NOW,
            idempotencyKey: 'purchase:a:k1',
          },
        }),
      ),
    ).resolves.toBe(UNIQUE);
  });
});

describe('Lượt mua bất biến', () => {
  it('đổi giá hay tin bị trigger chặn; đặt mốc nhắc, hoàn thì được', async () => {
    const { id } = await seedAccount();
    const row = await purchase(id);
    await expect(
      sqlStateOf(prisma.promotionPurchase.update({ where: { id: row.id }, data: { price: 1 } })),
    ).resolves.toBe(TRIGGER);
    await expect(
      sqlStateOf(
        prisma.promotionPurchase.update({
          where: { id: row.id },
          data: { listingId: '00000000-0000-7000-8000-00000000aa09' },
        }),
      ),
    ).resolves.toBe(TRIGGER);
    await prisma.promotionPurchase.update({
      where: { id: row.id },
      data: { remindedAt: TEST_NOW },
    });
    await prisma.promotionPurchase.update({
      where: { id: row.id },
      data: {
        status: 'refunded',
        refundedAt: TEST_NOW,
        refundTransactionId: '00000000-0000-7000-8000-00000000bb03',
      },
    });
    expect(
      await prisma.promotionPurchase.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      status: 'refunded',
      remindedAt: TEST_NOW,
    });
  });

  it('xoá chỉ khi transaction đặt ghim.purge', async () => {
    const { id } = await seedAccount();
    const row = await purchase(id);
    await expect(
      sqlStateOf(prisma.promotionPurchase.delete({ where: { id: row.id } })),
    ).resolves.toBe(TRIGGER);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ghim.purge = 'on'`);
      await tx.promotionPurchase.deleteMany({ where: { accountId: id } });
    });
    expect(await prisma.promotionPurchase.count()).toBe(0);
  });
});
