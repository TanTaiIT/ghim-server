import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { createFakePush, type FakePush } from './fakes/push.fake.js';
import { api, deliverAll, newMaster, newUser, seedTier, type TestUser } from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { amnesty, appeal, decideStrike, staffOf, struck } from './strike-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec notification/trust-notices qua luồng thật (change add-trust-notices): staff ra gậy ở bàn vận hành → outbox của
 * `trust` → bên nghe của `notification` → hộp thư, rồi việc đẩy lên điện thoại (Expo giả). Câu từng dòng có test thuần ở
 * `notification-trust-matrix.test.ts`.
 */
let app: FastifyInstance;
let master: TestUser;
let push: FakePush;
let jobs: FakeJobs;
let seq = 0;

beforeAll(async () => {
  push = createFakePush();
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => TEST_NOW, screening: interimScreening, push, jobs });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  await app.modules.trust.ensureRuleArticles();
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
    where: { recipientId: user.id, category: 'trust_strikes' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

/** Người đăng có máy đã cho phép thông báo — để xem câu nào lên màn hình khoá. */
async function posterWithPhone(): Promise<{ poster: TestUser; token: string }> {
  const poster = await newUser(app);
  seq += 1;
  const token = `ExponentPushToken[trust-${seq}]`;
  expect((await api(app, 'PUT', '/me/push-token', poster.token, { token })).statusCode).toBe(204);
  return { poster, token };
}

async function fixture() {
  const categoryId = await seedCategory();
  const [issuer, reviewer] = [await staffOf(app, [categoryId]), await staffOf(app, [categoryId])];
  return { categoryId, issuer, reviewer };
}

describe('Báo người nhận gậy', () => {
  it('staff gỡ tin vì vi phạm: hộp thư có dòng nhắc ký "Ghim"; câu đẩy chỉ nói chuyện gì, điều luật và hạn chỉ trong app', async () => {
    const { categoryId, issuer } = await fixture();
    const { poster, token } = await posterWithPhone();
    const { strike, listing } = await struck(app, {
      staff: issuer,
      poster,
      categoryId,
      kind: 'normal',
    });
    await deliverAll(app);
    await jobs.runAll();
    const rows = (await inbox(poster)).filter((row) => row.type === 'trust.strike.issued');
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      title: 'Ghim',
      alert: true,
      data: { strikeId: strike.id, listingId: listing.id },
    });
    expect(row?.body).toMatch(/^Bạn nhận một cảnh cáo liên quan tới tin «.+»\.$/);
    expect(row?.detail).toMatch(
      /^Điều .+\. Cảnh cáo 1 điểm, hết hạn ngày \d{2}\/\d{2}\/\d{4}\. Đủ 3 điểm vi phạm thì tạm dừng đăng tin mới\. Khiếu nại được tới ngày/,
    );
    const sent = push.sent.filter((message) => message.to === token);
    expect(sent.map((message) => message.body)).toContain(row?.body);
    expect(sent.every((message) => !/Điều|hết hạn/.test(message.body))).toBe(true);
    // Không nêu ai ra gậy ở đâu cả.
    const issuerName = (await prisma.account.findUniqueOrThrow({ where: { id: issuer.id } }))
      .displayName;
    expect(`${row?.title} ${row?.body} ${row?.detail}`).not.toContain(issuerName);
  });

  it('tắt nhóm "mức tin cậy và gậy": vẫn vào hộp thư, không nhắc, không đẩy', async () => {
    const { categoryId, issuer } = await fixture();
    const { poster, token } = await posterWithPhone();
    const off = await api(app, 'PUT', '/me/notification-preferences/trust_strikes', poster.token, {
      enabled: false,
    });
    expect(off.statusCode, off.body).toBe(204);
    await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    await deliverAll(app);
    await jobs.runAll();
    const rows = (await inbox(poster)).filter((row) => row.type === 'trust.strike.issued');
    expect(rows).toMatchObject([{ alert: false }]);
    // Thông báo về tin (máy giữ, bị từ chối) vẫn đẩy — chỉ nhóm "mức tin cậy và gậy" đã tắt.
    const trustPushes = push.sent.filter(
      (message) => message.to === token && message.data['type']?.startsWith('trust.'),
    );
    expect(trustPushes).toEqual([]);
  });

  it('người T2 nhận gậy: mức xuống thì thêm dòng có nhắc "trust.tier.lowered"', async () => {
    const { categoryId, issuer } = await fixture();
    const poster = await newUser(app);
    await seedTier(poster.id, 'T2');
    await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    await deliverAll(app);
    const lowered = (await inbox(poster)).filter((row) => row.type === 'trust.tier.lowered');
    expect(lowered).toMatchObject([{ alert: true }]);
    expect(lowered[0]?.body).toMatch(/^Tài khoản đang ở mức T[01]\.$/);
  });
});

describe('Báo kết quả khiếu nại, gậy được huỷ', () => {
  it('khiếu nại thua: một dòng có nhắc, gậy vẫn hết hạn đúng ngày cũ', async () => {
    const { categoryId, issuer, reviewer } = await fixture();
    const poster = await newUser(app);
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const lost = await decideStrike(app, reviewer, strike.id, {
      outcome: 'keep',
      appeal: { verdict: 'lost' },
    });
    expect(lost.statusCode, lost.body).toBe(200);
    await deliverAll(app);
    expect(
      (await inbox(poster)).filter((row) => row.type === 'trust.appeal.decided'),
    ).toMatchObject([
      {
        alert: true,
        body: 'Khiếu nại không được chấp nhận.',
        detail: expect.stringMatching(/^Cảnh cáo vẫn hết hạn ngày/),
      },
    ]);
  });

  it('khiếu nại thắng: một dòng — không thêm dòng "gậy đã được huỷ"', async () => {
    const { categoryId, issuer, reviewer } = await fixture();
    const poster = await newUser(app);
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const won = await decideStrike(app, reviewer, strike.id, {
      outcome: 'keep',
      appeal: { verdict: 'won' },
    });
    expect(won.statusCode, won.body).toBe(200);
    await deliverAll(app);
    const rows = await inbox(poster);
    expect(rows.filter((row) => row.type === 'trust.appeal.decided')).toMatchObject([
      {
        body: 'Khiếu nại được chấp nhận — cảnh cáo đã xoá.',
        detail: expect.stringMatching(/được khôi phục\.$/),
      },
    ]);
    expect(rows.filter((row) => row.type === 'trust.strike.cancelled')).toEqual([]);
  });

  it('ân xá khi đang khiếu nại: đúng một thông báo "gậy đã được huỷ", không dòng kết quả khiếu nại', async () => {
    const { categoryId, issuer } = await fixture();
    const poster = await newUser(app);
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const res = await amnesty(app, master, poster.id, {
      strikeIds: [strike.id],
      reason: 'Nhầm điều luật',
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    const rows = (await inbox(poster)).filter(
      (row) => row.type !== 'trust.strike.issued' && !row.type.startsWith('trust.tier'),
    );
    expect(rows).toMatchObject([
      { type: 'trust.strike.cancelled', alert: true, body: 'Một cảnh cáo của bạn đã được xoá.' },
    ]);
    expect(`${rows[0]?.body} ${rows[0]?.detail}`).not.toContain('Nhầm điều luật');
  });
});
