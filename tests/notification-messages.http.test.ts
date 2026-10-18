import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEVICE_NOT_REGISTERED } from '../src/common/push/expo-push.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { createFakePush, type FakePush } from './fakes/push.fake.js';
import { outboxEvents, prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { block, opened, sendMessage, sent } from './messaging-helpers.js';
import { tokenFor } from './ops-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Delta notification/inbox của add-notifications qua HTTP, bên nghe thật, việc nền giả và Expo giả: báo tin nhắn mới
 * (N47), đẩy lên điện thoại theo token của phiên, không đẩy hội thoại đang mở, quên token máy đã gỡ app.
 */
const MINUTE_MS = 60_000;
let now = TEST_NOW;
let app: FastifyInstance;
let push: FakePush;
let jobs: FakeJobs;

beforeAll(async () => {
  push = createFakePush();
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => now, screening: interimScreening, push, jobs });
  await app.ready();
});

beforeEach(() => {
  now = TEST_NOW;
  push.sent.length = 0;
  push.rejected.clear();
  push.receiptErrors.clear();
});

afterAll(() => app.close());

const inbox = (user: TestUser) =>
  prisma.notification.findMany({
    where: { recipientId: user.id, category: 'messages' },
    orderBy: { createdAt: 'asc' },
  });
const nameOf = async (user: TestUser) =>
  (await prisma.account.findUniqueOrThrow({ where: { id: user.id } })).displayName;
const allow = (user: TestUser, token: string) =>
  api(app, 'PUT', '/me/push-token', user.token, { token });
/** Gửi, giao sự kiện cho `notification`, rồi chạy việc đẩy — đường một tin nhắn đi tới điện thoại. */
async function sendAndDeliver(from: TestUser, conversationId: string, body: string) {
  const message = await sent(app, from, conversationId, body);
  await deliverAll(app);
  await jobs.runAll();
  return message;
}

async function talking(overrides: Parameters<typeof liveListing>[2] = {}) {
  const [seller, buyer] = [await newUser(app), await newUser(app)];
  const listing = await seedListing(liveListing(seller.id, await seedCategory(), overrides));
  const conversation = await opened(app, buyer, listing.id);
  return { seller, buyer, listing, conversation };
}

describe('Báo tin nhắn mới cho bên nhận', () => {
  it('người bán được một dòng nhóm "tin nhắn" mang tên người gửi và đầu tin nhắn; người gửi không nhận; tin thứ hai gộp vào dòng đó mà vẫn nhắc', async () => {
    const { seller, buyer, conversation } = await talking();
    await sendAndDeliver(buyer, conversation.id, 'Còn hàng không bạn?');
    const [first] = await inbox(seller);
    expect(first).toMatchObject({
      category: 'messages',
      type: 'messaging.message.received',
      title: await nameOf(buyer),
      body: 'Còn hàng không bạn?',
      alert: true,
      count: 1,
      data: { conversationId: conversation.id },
    });
    expect(await inbox(buyer)).toEqual([]);

    await sendAndDeliver(buyer, conversation.id, 'Mình lấy luôn nhé');
    const rows = await inbox(seller);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first?.id,
      count: 2,
      body: `${await nameOf(buyer)} gửi 2 tin nhắn mới.`,
      alert: true,
    });
  });

  it('tin nhắn bị từ chối vì đã chặn nhau: không ai nhận thông báo, không có sự kiện tin nhắn', async () => {
    const { seller, buyer, conversation } = await talking();
    expect((await block(app, seller, buyer.id)).statusCode).toBe(204);
    const before = (await outboxEvents()).length;
    expect((await sendMessage(app, buyer, conversation.id, 'Alo')).statusCode).toBe(403);
    await deliverAll(app);
    expect(await outboxEvents()).toHaveLength(before);
    expect(await inbox(seller)).toEqual([]);
    expect(await inbox(buyer)).toEqual([]);
  });
});

/** Tin cho thương lượng, và lượt trả giá đã giao sự kiện cho `notification` (add-price-offers). */
const negotiable = { negotiable: true, price: 12_500_000n };
const offer = async (buyer: TestUser, conversationId: string, amount: number) => {
  const res = await api(app, 'POST', `/me/conversations/${conversationId}/offers`, buyer.token, {
    amount,
  });
  if (res.statusCode !== 201) throw new Error(`Trả giá hỏng: ${res.statusCode} ${res.body}`);
  await deliverAll(app);
  return (res.json() as { data: { id: string } }).data;
};

describe('Báo đề nghị giá và câu trả lời', () => {
  it('người bán được báo đề nghị kèm số tiền; người mua không nhận gì về đề nghị của mình', async () => {
    const { seller, buyer, conversation } = await talking(negotiable);
    await offer(buyer, conversation.id, 12_000_000);
    expect(await inbox(seller)).toEqual([
      expect.objectContaining({
        type: 'messaging.message.received',
        title: await nameOf(buyer),
        body: 'Trả giá 12.000.000 ₫',
        data: expect.objectContaining({ conversationId: conversation.id }),
      }),
    ]);
    expect(await inbox(buyer)).toEqual([]);
  });

  it('người bán chấp nhận: người mua được báo kết quả và số tiền; người bán không tự nhận', async () => {
    const { seller, buyer, conversation } = await talking(negotiable);
    const pending = await offer(buyer, conversation.id, 12_000_000);
    const before = (await inbox(seller)).length;
    const res = await api(
      app,
      'POST',
      `/me/conversations/${conversation.id}/offers/${pending.id}/accept`,
      seller.token,
    );
    expect(res.statusCode).toBe(200);
    await deliverAll(app);
    expect(await inbox(buyer)).toEqual([
      expect.objectContaining({
        type: 'messaging.offer.answered',
        title: await nameOf(seller),
        body: 'Đã chấp nhận giá 12.000.000 ₫',
      }),
    ]);
    expect(await inbox(seller)).toHaveLength(before);
  });

  it('đề nghị bị thay không có thông báo riêng: người bán chỉ thấy một dòng gộp, không sự kiện nào cho đề nghị cũ', async () => {
    const { seller, buyer, conversation } = await talking(negotiable);
    await offer(buyer, conversation.id, 11_000_000);
    const before = (await outboxEvents()).length;
    await offer(buyer, conversation.id, 11_500_000);
    const events = (await outboxEvents()).slice(before);
    expect(events.map((event) => event.type)).toEqual(['messaging.message.sent']);
    const rows = await inbox(seller);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('messaging.message.received');
  });
});

describe('Hiện thông báo lên màn hình điện thoại khi được cho phép', () => {
  it('đã cho phép: push mang tiêu đề, nội dung, mã thông báo và hội thoại; chưa cho phép: chỉ vào hộp thư', async () => {
    const { seller, buyer, conversation } = await talking();
    expect((await allow(seller, 'ExponentPushToken[ban]')).statusCode).toBe(204);
    await sendAndDeliver(buyer, conversation.id, 'Còn không?');
    const [row] = await inbox(seller);
    expect(push.sent).toMatchObject([
      {
        to: 'ExponentPushToken[ban]',
        title: await nameOf(buyer),
        body: 'Còn không?',
        data: {
          notificationId: row?.id,
          conversationId: conversation.id,
          type: 'messaging.message.received',
        },
      },
    ]);

    const quiet = await talking();
    await sendAndDeliver(quiet.buyer, quiet.conversation.id, 'Không ai cho phép');
    expect(await inbox(quiet.seller)).toHaveLength(1);
    expect(push.sent).toHaveLength(1);
  });

  it('máy đã đăng xuất không hiện; master khoá tài khoản thì không máy nào hiện', async () => {
    const { seller, buyer, conversation } = await talking();
    const phone = { ...seller, token: await tokenFor(app, seller.id) };
    await allow(phone, 'ExponentPushToken[dien-thoai]');
    expect((await api(app, 'POST', '/auth/logout', phone.token)).statusCode).toBeLessThan(300);
    await sendAndDeliver(buyer, conversation.id, 'Sau khi đăng xuất');
    expect(push.sent).toEqual([]);

    const tablet = { ...seller, token: await tokenFor(app, seller.id) };
    await allow(tablet, 'ExponentPushToken[may-tinh-bang]');
    const master = await newMaster(app);
    expect(
      (await api(app, 'POST', `/ops/accounts/${seller.id}/lock`, master.token, { reason: 'Thử' }))
        .statusCode,
    ).toBe(204);
    await deliverAll(app);
    await sendAndDeliver(buyer, conversation.id, 'Sau khi khoá');
    expect(push.sent).toEqual([]);
  });
});

describe('Không đẩy tin nhắn của hội thoại đang mở', () => {
  it('máy đang mở đúng hội thoại không nhận push (vẫn vào hộp thư); hội thoại khác vẫn đẩy; đóng rồi thì đẩy lại', async () => {
    const { seller, buyer, conversation } = await talking();
    await allow(seller, 'ExponentPushToken[dang-mo]');
    expect(
      (await api(app, 'PUT', `/me/conversations/${conversation.id}/viewing`, seller.token))
        .statusCode,
    ).toBe(204);
    await sendAndDeliver(buyer, conversation.id, 'Đang mở');
    expect(push.sent).toEqual([]);
    expect(await inbox(seller)).toHaveLength(1);

    const other = await newUser(app);
    const another = await seedListing(liveListing(seller.id, await seedCategory()));
    const second = await opened(app, other, another.id);
    await sendAndDeliver(other, second.id, 'Hội thoại khác');
    expect(push.sent.map((item) => item.body)).toEqual(['Hội thoại khác']);

    expect(
      (await api(app, 'DELETE', `/me/conversations/${conversation.id}/viewing`, seller.token))
        .statusCode,
    ).toBe(204);
    await sendAndDeliver(buyer, conversation.id, 'Đã đóng');
    // Dòng hộp thư của hội thoại đã gộp hai tin (tin đầu không đẩy vì đang mở) — push mang đúng câu của dòng đó.
    expect(push.sent.map((item) => item.body)).toEqual([
      'Hội thoại khác',
      `${await nameOf(buyer)} gửi 2 tin nhắn mới.`,
    ]);
  });

  it('dấu "đang mở" tự hết sau 10 phút nếu app không gọi lại', async () => {
    const { seller, buyer, conversation } = await talking();
    await allow(seller, 'ExponentPushToken[het-han]');
    await api(app, 'PUT', `/me/conversations/${conversation.id}/viewing`, seller.token);
    now = new Date(TEST_NOW.getTime() + 11 * MINUTE_MS);
    await sendAndDeliver(buyer, conversation.id, 'Mười một phút sau');
    expect(push.sent.map((item) => item.body)).toEqual(['Mười một phút sau']);
  });
});

describe('Máy đã gỡ app', () => {
  it('Expo báo DeviceNotRegistered lúc gửi: quên token ngay; biên nhận báo sau 15 phút: cũng quên, ticket được dọn', async () => {
    const { seller, buyer, conversation } = await talking();
    await allow(seller, 'ExponentPushToken[da-go]');
    push.rejected.add('ExponentPushToken[da-go]');
    await sendAndDeliver(buyer, conversation.id, 'Gửi vào máy đã gỡ');
    expect(await app.modules.identity.pushTargets([seller.id])).toEqual([]);

    const late = await talking();
    await allow(late.seller, 'ExponentPushToken[go-sau]');
    await sendAndDeliver(late.buyer, late.conversation.id, 'Nhận được');
    const ticket = push.sent.at(-1)?.ticketId ?? '';
    expect(await prisma.pushTicket.findMany({ where: { id: ticket } })).toHaveLength(1);
    push.receiptErrors.set(ticket, DEVICE_NOT_REGISTERED);
    expect(await app.modules.notification.pushReceipts()).toEqual({ checked: 0, forgotten: 0 });
    now = new Date(TEST_NOW.getTime() + 16 * MINUTE_MS);
    expect(await app.modules.notification.pushReceipts()).toMatchObject({ forgotten: 1 });
    expect(await app.modules.identity.pushTargets([late.seller.id])).toEqual([]);
    expect(await prisma.pushTicket.findMany({ where: { id: ticket } })).toEqual([]);
  });
});
