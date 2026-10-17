import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { listingApi } from './listing-http-helpers.js';
import { block, codeOf, dataOf, opened, sent } from './messaging-helpers.js';
import { aboutAccount, openTaskOf, opsClaim } from './report-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/* Delta review/reports của add-messaging qua HTTP: báo cáo từ hội thoại, người xử đọc được hội thoại. */
let app: FastifyInstance;
let safety: TestUser;

beforeAll(async () => {
  app = await buildTestApp({ screening: interimScreening });
  await app.ready();
  safety = await newUser(app);
  await grantStaff(safety.id, ['user_reports'], []);
});

afterAll(() => app.close());

const reportFrom = (user: TestUser, conversationId: string, body: object) =>
  api(app, 'POST', `/me/conversations/${conversationId}/reports`, user.token, body);

async function talking() {
  const [owner, shopper] = [await newUser(app), await newUser(app)];
  const listing = await seedListing(liveListing(owner.id, await seedCategory()));
  const conversation = await opened(app, shopper, listing.id);
  await sent(app, shopper, conversation.id, 'Giá bao nhiêu?');
  await sent(app, owner, conversation.id, 'Chuyển khoản trước đi rồi tính');
  return { owner, shopper, listing, conversation };
}

type Detail = {
  subjectKind: string;
  conversations: { id: string; buyerId: string; sellerId: string; messages: { body: string }[] }[];
  reports: { entries: { conversationId: string | null }[] }[];
};

/** Chi tiết việc về người bị báo, như staff việc an toàn thấy. */
async function detailOf(accountId: string): Promise<Detail> {
  const task = await openTaskOf(aboutAccount(accountId));
  const res = await api(app, 'GET', `/ops/review/tasks/${task.id}`, safety.token);
  if (res.statusCode !== 200) throw new Error(`Chi tiết việc hỏng: ${res.statusCode} ${res.body}`);
  return dataOf<Detail>(res);
}

describe('Báo cáo ngay từ hội thoại', () => {
  it('người mua báo người bán "quấy rối": 201, báo cáo về người kèm hội thoại; người xử thấy bản ghi; thiếu loại → 400', async () => {
    const { owner, shopper, conversation } = await talking();
    const res = await reportFrom(shopper, conversation.id, { category: 'harassment' });
    expect(res.statusCode, res.body).toBe(201);
    expect(dataOf<{ subjectKind: string; accountId: string }>(res)).toMatchObject({
      subjectKind: 'account',
      accountId: owner.id,
    });
    const entry = await prisma.reportEntry.findFirstOrThrow({ where: { reporterId: shopper.id } });
    expect(entry.conversationId).toBe(conversation.id);
    await deliverAll(app);
    const detail = await detailOf(owner.id);
    expect(detail.subjectKind).toBe('account');
    expect(detail.reports[0]?.entries).toMatchObject([{ conversationId: conversation.id }]);
    expect(detail.conversations).toMatchObject([
      {
        id: conversation.id,
        buyerId: shopper.id,
        sellerId: owner.id,
        messages: [{ body: 'Giá bao nhiêu?' }, { body: 'Chuyển khoản trước đi rồi tính' }],
      },
    ]);
    const blank = await reportFrom(shopper, conversation.id, {});
    expect(blank.statusCode).toBe(400);
    expect(codeOf(blank)).toBe('VALIDATION_ERROR');
    expect(await prisma.report.count({ where: { accountId: owner.id } })).toBe(1);
  });

  it('hội thoại về tin đã bán, hay đã chặn rồi mới báo: báo cáo vẫn được tạo kèm hội thoại', async () => {
    const { owner, shopper, listing, conversation } = await talking();
    expect(
      (
        await listingApi(app, 'POST', `/listings/${listing.id}/sold`, owner, {
          version: listing.version,
        })
      ).statusCode,
    ).toBe(200);
    expect((await reportFrom(shopper, conversation.id, { category: 'fraud' })).statusCode).toBe(
      201,
    );

    const second = await talking();
    expect((await block(app, second.shopper, second.owner.id)).statusCode).toBe(204);
    const res = await reportFrom(second.shopper, second.conversation.id, { category: 'fraud' });
    expect(res.statusCode, res.body).toBe(201);
    expect(
      (await prisma.reportEntry.findFirstOrThrow({ where: { reporterId: second.shopper.id } }))
        .conversationId,
    ).toBe(second.conversation.id);
  });
});

describe('Người xử đọc được hội thoại bị báo cáo', () => {
  it('người bị báo xoá hội thoại ngay sau khi bị báo, rồi cả hai bên xoá: người xử vẫn đọc đủ; nhận việc rồi vẫn thấy', async () => {
    const { owner, shopper, conversation } = await talking();
    await reportFrom(shopper, conversation.id, { category: 'harassment' });
    await deliverAll(app);
    await api(app, 'DELETE', `/me/conversations/${conversation.id}`, owner.token);
    expect((await detailOf(owner.id)).conversations[0]?.messages).toHaveLength(2);
    await api(app, 'DELETE', `/me/conversations/${conversation.id}`, shopper.token);
    const task = await openTaskOf(aboutAccount(owner.id));
    expect((await opsClaim(app, safety, task.id)).statusCode).toBe(200);
    expect((await detailOf(owner.id)).conversations[0]?.messages.map((row) => row.body)).toEqual([
      'Giá bao nhiêu?',
      'Chuyển khoản trước đi rồi tính',
    ]);
  });
});
