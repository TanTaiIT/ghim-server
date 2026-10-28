import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { aboutAccount, reported } from './report-helpers.js';
import { day } from './retention-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Design add-wallet mục 8: ví theo hạn lưu của tài khoản — lượt dọn tài khoản đã xoá xoá sổ cái và ví (trigger mở khi
 * transaction đặt ghim.purge), sau kiểm tạm giữ; tài khoản đang tạm giữ vì báo cáo giữ nguyên ví. Nhật ký vận hành của
 * lượt cấp vẫn còn theo hạn của nhật ký.
 */
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
let seq = 0;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  await app.modules.trust.ensureRuleArticles();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const retention = () => app.modules.ops.runRetention({ budgetMs: 60_000 });

const granted = async (): Promise<TestUser> => {
  const user = await newUser(app);
  seq += 1;
  const res = await api(app, 'POST', `/ops/wallets/${user.id}/adjust`, master.token, {
    amount: 5,
    reason: 'xin qua Hỗ trợ Ghim',
    idempotencyKey: `retention-${seq.toString().padStart(6, '0')}`,
  });
  expect(res.statusCode, res.body).toBe(200);
  return user;
};

const deleted = async (user: TestUser) => {
  await repositories.identity.softDeleteAccount({
    accountId: user.id,
    at: now,
    events: [{ type: 'identity.account.deleted', payload: { accountId: user.id } }],
  });
  await deliverAll(app);
};

const walletRows = async (accountId: string) => ({
  wallets: await prisma.wallet.count({ where: { accountId } }),
  transactions: await prisma.walletTransaction.count({ where: { accountId } }),
  audits: await prisma.auditLog.count({
    where: { action: 'wallet.wallet.adjust', targetId: accountId },
  }),
});

describe('Ví theo hạn lưu của tài khoản', () => {
  it('tài khoản đã xoá quá hạn: lượt dọn xoá ví và sổ cái, nhật ký của lượt cấp vẫn còn', async () => {
    const user = await granted();
    await deleted(user);
    now = day(91);
    const result = await retention();
    expect(result.counts.deletedAccounts).toBe(1);
    expect(await walletRows(user.id)).toEqual({ wallets: 0, transactions: 0, audits: 1 });
    expect((await prisma.account.findUniqueOrThrow({ where: { id: user.id } })).purgedAt).toEqual(
      now,
    );
  });

  it('tài khoản đang tạm giữ vì báo cáo mở: ví còn nguyên', async () => {
    const user = await granted();
    const reporter = await newUser(app);
    await reported(app, reporter, aboutAccount(user.id), 'fraud');
    await deliverAll(app);
    await deleted(user);
    now = day(91);
    await retention();
    expect(await walletRows(user.id)).toEqual({ wallets: 1, transactions: 1, audits: 1 });
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: user.id } })).purgedAt,
    ).toBeNull();
    expect(await repositories.wallet.balanceOf(user.id)).toBe(5);
  });
});
