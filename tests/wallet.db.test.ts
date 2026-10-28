import { beforeEach, describe, expect, it } from 'vitest';

import { ConflictError } from '../src/common/errors/app-error.js';
import {
  createWalletRepository,
  type LedgerEntry,
} from '../src/modules/wallet/wallet.repository.js';
import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/*
 * Ràng buộc DB của ví (design add-wallet mục 2, 3) trên Postgres thật: CHECK số dư và dòng sổ cái, trigger không sửa
 * không xoá (trừ lượt dọn), unique khoá chống lặp, và `apply` giữ số dư bằng tổng sổ cái kể cả hai lượt trừ song song.
 */
const CHECK = '23514';
const TRIGGER = 'P0001';
const UNIQUE = 'P2002';

beforeEach(truncateAll);

const repository = createWalletRepository(prisma);

const entryOf = (
  accountId: string,
  amount: number,
  over: Partial<LedgerEntry> = {},
): LedgerEntry => ({
  accountId,
  amount,
  type: 'admin_adjust',
  refs: {},
  note: 'thử',
  actorId: null,
  idempotencyKey: `test:${accountId}:${amount}:${Math.random().toString(36).slice(2, 10)}`,
  at: TEST_NOW,
  ...over,
});
const apply = (entry: LedgerEntry) => repository.inTransaction((tx) => repository.apply(tx, entry));

describe('CHECK và trigger của ví', () => {
  it('số dư âm, số 0, số dư sau âm đều bị CHECK chặn', async () => {
    const { id } = await seedAccount();
    await expect(
      sqlStateOf(
        prisma.wallet.create({ data: { accountId: id, balance: -1, updatedAt: TEST_NOW } }),
      ),
    ).resolves.toBe(CHECK);
    const row = (amount: number, balanceAfter: number) =>
      prisma.walletTransaction.create({
        data: {
          accountId: id,
          amount,
          type: 'admin_adjust',
          balanceAfter,
          idempotencyKey: `k-${amount}-${balanceAfter}`,
          createdAt: TEST_NOW,
        },
      });
    await expect(sqlStateOf(row(0, 0))).resolves.toBe(CHECK);
    await expect(sqlStateOf(row(-1, -1))).resolves.toBe(CHECK);
  });

  it('dòng sổ cái không sửa được; xoá chỉ khi transaction đặt ghim.purge', async () => {
    const { id } = await seedAccount();
    const { transaction } = await apply(entryOf(id, 5));
    await expect(
      sqlStateOf(
        prisma.walletTransaction.update({ where: { id: transaction.id }, data: { note: 'sửa' } }),
      ),
    ).resolves.toBe(TRIGGER);
    await expect(
      sqlStateOf(prisma.walletTransaction.delete({ where: { id: transaction.id } })),
    ).resolves.toBe(TRIGGER);
    expect(await prisma.walletTransaction.count({ where: { accountId: id } })).toBe(1);

    await repository.purgeAccount(id);
    expect(await prisma.walletTransaction.count({ where: { accountId: id } })).toBe(0);
    expect(await prisma.wallet.count({ where: { accountId: id } })).toBe(0);
  });

  it('khoá chống lặp trùng vấp unique', async () => {
    const { id } = await seedAccount();
    await apply(entryOf(id, 5, { idempotencyKey: 'adjust:m:abcdefgh' }));
    await expect(
      prismaErrorCode(
        prisma.walletTransaction.create({
          data: {
            accountId: id,
            amount: 1,
            type: 'refund',
            balanceAfter: 6,
            idempotencyKey: 'adjust:m:abcdefgh',
            createdAt: TEST_NOW,
          },
        }),
      ),
    ).resolves.toBe(UNIQUE);
  });
});

describe('apply', () => {
  it('cộng tạo ví lười, trừ có điều kiện; số dư luôn bằng tổng sổ cái; dòng mang số dư sau', async () => {
    const { id } = await seedAccount();
    expect(await repository.balanceOf(id)).toBe(0);
    const granted = await apply(entryOf(id, 5));
    expect(granted).toMatchObject({ replayed: false, transaction: { balanceAfter: 5 } });
    const spent = await apply(
      entryOf(id, -3, { type: 'product_purchase', refs: { productCode: 'top' } }),
    );
    expect(spent.transaction).toMatchObject({ balanceAfter: 2, refs: { productCode: 'top' } });
    await expect(apply(entryOf(id, -3))).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await repository.balanceOf(id)).toBe(2);
    expect(await repository.sumOf(id)).toBe(2);
    // Ví chưa có dòng: trừ là thiếu Xu như ví 0, không tạo ví.
    const { id: other } = await seedAccount();
    await expect(apply(entryOf(other, -1))).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.wallet.count({ where: { accountId: other } })).toBe(0);
  });

  it('cùng khoá: cùng số trả dòng cũ không ghi gì thêm; khác số 409 IDEMPOTENCY_CONFLICT', async () => {
    const { id } = await seedAccount();
    const first = await apply(entryOf(id, 5, { idempotencyKey: 'adjust:m:same-key-1' }));
    const again = await apply(entryOf(id, 5, { idempotencyKey: 'adjust:m:same-key-1' }));
    expect(again).toEqual({ transaction: first.transaction, replayed: true });
    expect(await repository.balanceOf(id)).toBe(5);
    expect(await prisma.outboxEvent.count({ where: { type: 'wallet.balance.changed' } })).toBe(1);
    await expect(
      apply(entryOf(id, 7, { idempotencyKey: 'adjust:m:same-key-1' })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('hai lượt trừ 4 Xu song song trên ví 4 Xu: đúng một thành công, số dư 0', async () => {
    const { id } = await seedAccount();
    await apply(entryOf(id, 4));
    const results = await Promise.allSettled([apply(entryOf(id, -4)), apply(entryOf(id, -4))]);
    expect(results.map((r) => r.status).toSorted()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected && rejected.reason).toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await repository.balanceOf(id)).toBe(0);
    expect(await repository.sumOf(id)).toBe(0);
  });
});
