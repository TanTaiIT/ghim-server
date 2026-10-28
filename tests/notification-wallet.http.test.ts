import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { createFakePush, type FakePush } from './fakes/push.fake.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * N59 — nhóm "ví Xu" (change add-wallet, delta notification/preferences) qua luồng thật: master cấp ở bàn vận hành →
 * outbox của `wallet` → ma trận của `notification` → hộp thư và việc đẩy lên điện thoại (Expo giả). Câu nhắc không có
 * lý do, không nêu master; người dùng tự mua gói thì không báo.
 */
let app: FastifyInstance;
let master: TestUser;
let push: FakePush;
let jobs: FakeJobs;
let seq = 0;

beforeAll(async () => {
  push = createFakePush();
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => TEST_NOW, push, jobs });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(async () => {
  await deliverAll(app);
  await jobs.runAll();
  push.sent.length = 0;
});

afterAll(() => app.close());

const inbox = (user: TestUser) =>
  prisma.notification.findMany({
    where: { recipientId: user.id, category: 'wallet' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

async function userWithPhone(): Promise<{ user: TestUser; token: string }> {
  const user = await newUser(app);
  seq += 1;
  const token = `ExponentPushToken[wallet-${seq}]`;
  expect((await api(app, 'PUT', '/me/push-token', user.token, { token })).statusCode).toBe(204);
  return { user, token };
}

const adjust = async (accountId: string, amount: number) => {
  seq += 1;
  const res = await api(app, 'POST', `/ops/wallets/${accountId}/adjust`, master.token, {
    amount,
    reason: 'xin qua Hỗ trợ Ghim',
    idempotencyKey: `notice-${seq.toString().padStart(6, '0')}`,
  });
  expect(res.statusCode, res.body).toBe(200);
  await deliverAll(app);
  await jobs.runAll();
  return (res.json() as { data: { transaction: { id: string } } }).data.transaction.id;
};

const ledger = async (accountId: string, amount: number, type: 'product_purchase' | 'refund') => {
  seq += 1;
  await repositories.wallet.inTransaction((tx) =>
    repositories.wallet.apply(tx, {
      accountId,
      amount,
      type,
      refs: { productCode: 'featured_7d' },
      idempotencyKey: `${type}:${accountId}:${seq}`,
      at: TEST_NOW,
    }),
  );
  await deliverAll(app);
  await jobs.runAll();
};

describe('Nhóm "ví Xu"', () => {
  it('master cấp 5 Xu: một dòng ký "Ghim" nêu số Xu và số dư, có nhắc, mở được dòng sổ cái; không lý do, không tên master', async () => {
    const { user, token } = await userWithPhone();
    const transactionId = await adjust(user.id, 5);
    const rows = await inbox(user);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'wallet.admin_adjust',
      title: 'Ghim',
      body: 'Ghim cấp cho bạn 5 Xu · số dư 5 Xu',
      alert: true,
      data: { transactionId },
      groupId: null,
    });
    const sent = push.sent.filter((message) => message.to === token);
    expect(sent.map((message) => message.body)).toEqual(['Ghim cấp cho bạn 5 Xu · số dư 5 Xu']);
    const masterName = (await prisma.account.findUniqueOrThrow({ where: { id: master.id } }))
      .displayName;
    expect(`${rows[0]?.body} ${rows[0]?.detail ?? ''}`).not.toMatch(/xin qua|Hỗ trợ/);
    expect(rows[0]?.body).not.toContain(masterName);
  });

  it('trừ và hoàn có câu riêng; tự mua gói không báo', async () => {
    const { user } = await userWithPhone();
    await adjust(user.id, 5);
    await adjust(user.id, -2);
    await ledger(user.id, -1, 'product_purchase');
    await ledger(user.id, 4, 'refund');
    expect((await inbox(user)).map((row) => row.body)).toEqual([
      'Ghim cấp cho bạn 5 Xu · số dư 5 Xu',
      'Ghim trừ 2 Xu trong ví · số dư 3 Xu',
      'Hoàn 4 Xu · số dư 6 Xu',
    ]);
  });

  it('tắt nhóm "ví Xu": vẫn vào hộp thư, không nhắc, không đẩy; danh sách nhóm có "wallet" mặc định bật', async () => {
    const { user, token } = await userWithPhone();
    const prefs = (await api(app, 'GET', '/me/notification-preferences', user.token)).json().data;
    expect(prefs.categories).toContainEqual({ category: 'wallet', enabled: true });
    const off = await api(app, 'PUT', '/me/notification-preferences/wallet', user.token, {
      enabled: false,
    });
    expect(off.statusCode, off.body).toBeLessThan(300);

    await adjust(user.id, 3);
    const rows = await inbox(user);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ body: 'Ghim cấp cho bạn 3 Xu · số dư 3 Xu', alert: false });
    expect(push.sent.filter((message) => message.to === token)).toEqual([]);
  });
});
