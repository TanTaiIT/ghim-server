import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WalletRepository } from '../src/modules/wallet/wallet.repository.js';
import { prisma } from './db-helpers.js';
import { api, newMaster, newUser, type TestUser } from './group-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { buildTestApp, grantStaff, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec wallet/ledger qua HTTP (change add-wallet): ví lười, master cấp / trừ kèm lý do và nhật ký, người dùng đọc ví
 * mình, khoá chống lặp (tuần tự và song song), hai lượt trừ song song, tài khoản đã xoá, không có đường nạp / rút.
 * Ràng buộc DB ở `wallet.db.test.ts`.
 */
let app: FastifyInstance;
let master: TestUser;
let seq = 0;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
type Tx = { id: string; amount: number; type: string; balanceAfter: number; note: string | null };
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;
const codeOf = (res: Res) => (res.json() as { error: { code: string } }).error.code;
const key = () => `k${(seq += 1).toString().padStart(8, '0')}`;

const adjust = (by: TestUser, accountId: string, amount: number, over: object = {}) =>
  api(app, 'POST', `/ops/wallets/${accountId}/adjust`, by.token, {
    amount,
    reason: 'xin qua Hỗ trợ Ghim',
    idempotencyKey: key(),
    ...over,
  });
const grant = async (accountId: string, amount: number) => {
  const res = await adjust(master, accountId, amount);
  if (res.statusCode !== 200) throw new Error(`cấp hỏng: ${res.statusCode} ${res.body}`);
  return dataOf<{ balance: number; transaction: Tx }>(res);
};
const myWallet = async (user: TestUser) =>
  dataOf<{ balance: number }>(await api(app, 'GET', '/me/wallet', user.token));
const myHistory = async (user: TestUser) =>
  dataOf<{ items: Tx[]; nextCursor: string | null }>(
    await api(app, 'GET', '/me/wallet/transactions', user.token),
  );
const auditOf = (accountId: string) =>
  prisma.auditLog.findMany({
    where: { action: 'wallet.wallet.adjust', targetType: 'account', targetId: accountId },
  });

describe('Số dư là tổng của sổ cái', () => {
  it('tài khoản mới: 0 Xu, lịch sử rỗng; không có route nạp hay rút', async () => {
    const user = await newUser(app);
    expect(await myWallet(user)).toEqual({ balance: 0 });
    expect(await myHistory(user)).toEqual({ items: [], nextCursor: null });
    const missing = await Promise.all(
      ['/me/wallet/topup', '/me/wallet/withdraw'].map((path) =>
        api(app, 'POST', path, user.token, { amount: 1 }),
      ),
    );
    expect(missing.map((res) => res.statusCode)).toEqual([404, 404]);
  });

  it('cấp 5 rồi mua gói 4: lịch sử mới trước với số dư sau từng dòng và lý do; tổng bằng số dư', async () => {
    const user = await newUser(app);
    await grant(user.id, 5);
    await repositories.wallet.inTransaction((tx) =>
      repositories.wallet.apply(tx, {
        accountId: user.id,
        amount: -4,
        type: 'product_purchase',
        refs: { productCode: 'featured_7d' },
        idempotencyKey: `purchase:${user.id}:${key()}`,
        at: new Date(TEST_NOW.getTime() + 1000),
      }),
    );
    const { items } = await myHistory(user);
    expect(
      items.map(({ amount, type, balanceAfter, note }) => [amount, type, balanceAfter, note]),
    ).toEqual([
      [-4, 'product_purchase', 1, null],
      [5, 'admin_adjust', 5, 'xin qua Hỗ trợ Ghim'],
    ]);
    expect(await myWallet(user)).toEqual({ balance: 1 });
    expect(await repositories.wallet.sumOf(user.id)).toBe(1);
  });

  it('hai lượt trừ 4 Xu song song trên ví 4 Xu: đúng một thành công, số dư 0', async () => {
    const user = await newUser(app);
    await grant(user.id, 4);
    const results = await Promise.all([adjust(master, user.id, -4), adjust(master, user.id, -4)]);
    expect(results.map((r) => r.statusCode).toSorted()).toEqual([200, 409]);
    expect(await myWallet(user)).toEqual({ balance: 0 });
  });
});

describe('Chỉ master cấp hay trừ Xu', () => {
  it('cấp 5 Xu kèm lý do: ví tăng, sổ cái có dòng admin_adjust, một dòng nhật ký ghi master, tài khoản, số Xu, lý do', async () => {
    const user = await newUser(app);
    const result = await grant(user.id, 5);
    expect(result).toMatchObject({
      balance: 5,
      transaction: {
        amount: 5,
        type: 'admin_adjust',
        balanceAfter: 5,
        note: 'xin qua Hỗ trợ Ghim',
      },
    });
    const [entry, ...rest] = await auditOf(user.id);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorId: master.id,
      actorRole: 'master',
      details: {
        amount: 5,
        balanceAfter: 5,
        transactionId: result.transaction.id,
        reason: 'xin qua Hỗ trợ Ghim',
      },
    });
  });

  it('trừ quá số dư → 409 INSUFFICIENT_BALANCE, ví không đổi, không ghi nhật ký', async () => {
    const user = await newUser(app);
    await grant(user.id, 2);
    const res = await adjust(master, user.id, -3);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('INSUFFICIENT_BALANCE');
    expect(await myWallet(user)).toEqual({ balance: 2 });
    expect(await auditOf(user.id)).toHaveLength(1);
  });

  it('staff và người dùng thường gọi cấp → 403; người dùng không có đường đọc ví người khác', async () => {
    const user = await newUser(app);
    const staff = await newUser(app);
    await grantStaff(staff.id, ['support'], []);
    const denied = await Promise.all([staff, user].map((caller) => adjust(caller, user.id, 5)));
    expect(denied.map((res) => [res.statusCode, codeOf(res)])).toEqual([
      [403, 'FORBIDDEN'],
      [403, 'FORBIDDEN'],
    ]);
    expect(await myWallet(user)).toEqual({ balance: 0 });
    expect((await api(app, 'GET', `/ops/wallets/${user.id}`, staff.token)).statusCode).toBe(403);
    expect((await api(app, 'GET', `/users/${user.id}/wallet`, staff.token)).statusCode).toBe(404);
  });

  it('master xem ví trước khi cấp: số dư và các dòng gần nhất', async () => {
    const user = await newUser(app);
    await grant(user.id, 3);
    const res = await api(app, 'GET', `/ops/wallets/${user.id}`, master.token);
    expect(res.statusCode).toBe(200);
    expect(dataOf<{ balance: number; transactions: Tx[] }>(res)).toMatchObject({
      balance: 3,
      transactions: [{ amount: 3, balanceAfter: 3 }],
    });
  });

  it('bấm cấp hai lần cùng khoá: ví tăng một lần, cùng dòng, một dòng nhật ký; cùng khoá khác số → 409', async () => {
    const user = await newUser(app);
    const idempotencyKey = key();
    const first = await adjust(master, user.id, 5, { idempotencyKey });
    const again = await adjust(master, user.id, 5, { idempotencyKey });
    expect(again.statusCode).toBe(200);
    expect(dataOf<{ transaction: Tx }>(again).transaction.id).toBe(
      dataOf<{ transaction: Tx }>(first).transaction.id,
    );
    expect(await myWallet(user)).toEqual({ balance: 5 });
    expect(await auditOf(user.id)).toHaveLength(1);

    const other = await adjust(master, user.id, 7, { idempotencyKey });
    expect(other.statusCode).toBe(409);
    expect(codeOf(other)).toBe('IDEMPOTENCY_CONFLICT');
    // Khoá có tiền tố theo master: master khác dùng cùng chuỗi là lượt khác.
    const second = await newMaster(app);
    expect((await adjust(second, user.id, 5, { idempotencyKey })).statusCode).toBe(200);
    expect(await myWallet(user)).toEqual({ balance: 10 });
  });

  it('hai lượt cùng khoá song song: cả hai nhận 200 cùng dòng, ví tăng một lần', async () => {
    // Bọc repository: giữ cả hai lượt tới khi cùng vào `apply`, để cả hai đi qua bước tìm khoá trước khi lượt nào ghi.
    const real = repositories.wallet;
    let waiting: (() => void)[] = [];
    const gated: WalletRepository = {
      ...real,
      apply: (tx, entry) =>
        new Promise<void>((resolve) => {
          waiting.push(resolve);
          if (waiting.length === 2) {
            for (const go of waiting) go();
            waiting = [];
          }
        }).then(() => real.apply(tx, entry)),
    };
    const raceApp = await buildTestApp({ repositories: { wallet: gated } });
    await raceApp.ready();
    try {
      const user = await newUser(raceApp);
      const idempotencyKey = key();
      const body = { amount: 5, reason: 'song song', idempotencyKey };
      const results = await Promise.all([
        api(raceApp, 'POST', `/ops/wallets/${user.id}/adjust`, master.token, body),
        api(raceApp, 'POST', `/ops/wallets/${user.id}/adjust`, master.token, body),
      ]);
      expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
      const ids = results.map((r) => dataOf<{ transaction: Tx }>(r).transaction.id);
      expect(ids[0]).toBe(ids[1]);
      expect(await repositories.wallet.balanceOf(user.id)).toBe(5);
      expect(await auditOf(user.id)).toHaveLength(1);
    } finally {
      await raceApp.close();
    }
  });

  it('tài khoản bị khoá vẫn được cấp; đã xoá hay không có → 404; số 0, quá trần, khoá ngắn → 400', async () => {
    const locked = await seedAccount({ status: 'locked' });
    expect((await adjust(master, locked.id, 5)).statusCode).toBe(200);

    const gone = await newUser(app);
    await repositories.identity.softDeleteAccount({
      accountId: gone.id,
      at: TEST_NOW,
      events: [{ type: 'identity.account.deleted', payload: { accountId: gone.id } }],
    });
    expect((await adjust(master, gone.id, 5)).statusCode).toBe(404);
    expect((await adjust(master, '00000000-0000-7000-8000-00000000dead', 5)).statusCode).toBe(404);

    const user = await newUser(app);
    const invalid = await Promise.all(
      [{ amount: 0 }, { amount: 1001 }, { idempotencyKey: 'short' }].map((over) =>
        adjust(master, user.id, 5, over),
      ),
    );
    expect(invalid.map((res) => res.statusCode)).toEqual([400, 400, 400]);
  });
});
