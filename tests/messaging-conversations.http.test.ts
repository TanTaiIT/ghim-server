import type { FastifyInstance } from 'fastify';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REALTIME_PATH } from '../src/common/realtime/realtime.js';
import { startOfDayVN } from '../src/common/time/time.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  api,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { listingApi, signedInAt } from './listing-http-helpers.js';
import {
  codeOf,
  conversationOf,
  conversationsOf,
  dataOf,
  messagesOf,
  openConversation,
  opened,
  sendMessage,
  sent,
} from './messaging-helpers.js';
import { unverifiedUser } from './report-helpers.js';
import { activePhrase } from './screening-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec messaging/conversations qua HTTP với `trust`, `screening` (bộ lọc cụm) thật và bên nghe thật. Tin dựng thẳng
 * qua DB ở các ca không bàn về luồng tin; ca "hội thoại tiếp tục" đổi trạng thái tin qua đường thật.
 */
const DAY_MS = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
let baseUrl: string;
const sockets: Socket[] = [];
const day = (n: number) => new Date(TEST_NOW.getTime() + n * DAY_MS);

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Không lấy được cổng');
  baseUrl = `http://127.0.0.1:${address.port}`;
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await app.close();
});

/** Tin đang hiển thị trên sàn chung của một người bán mới. */
async function listingOf(seller?: TestUser, overrides: Parameters<typeof liveListing>[2] = {}) {
  const owner = seller ?? (await newUser(app));
  const listing = await seedListing(liveListing(owner.id, await seedCategory(), overrides));
  return { owner, listing };
}

/** Mười tin đang hiển thị của mười người bán khác nhau. */
const tenListings = async () =>
  (await Promise.all(Array.from({ length: 10 }, () => listingOf()))).map(({ listing }) => listing);

describe('Mỗi tin và một người mua có đúng một hội thoại', () => {
  it('mở lần đầu → 201 với đúng hai bên; bấm lại → 200 cùng hội thoại; hai yêu cầu cùng lúc → một hội thoại', async () => {
    const { owner, listing } = await listingOf();
    const buyer = await newUser(app);
    const first = await openConversation(app, buyer, listing.id);
    expect(first.statusCode, first.body).toBe(201);
    const conversation = dataOf<{ id: string; role: string; counterpart: { accountId: string } }>(
      first,
    );
    expect(conversation).toMatchObject({ role: 'buyer', counterpart: { accountId: owner.id } });
    expect(
      await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } }),
    ).toMatchObject({ buyerId: buyer.id, sellerId: owner.id, listingId: listing.id });
    const again = await openConversation(app, buyer, listing.id);
    expect(again.statusCode).toBe(200);
    expect(dataOf<{ id: string }>(again).id).toBe(conversation.id);

    const other = await newUser(app);
    const { listing: second } = await listingOf();
    const both = await Promise.all([
      openConversation(app, other, second.id),
      openConversation(app, other, second.id),
    ]);
    expect(both.map((res) => res.statusCode).toSorted()).toEqual([200, 201]);
    expect(await prisma.conversation.count({ where: { listingId: second.id } })).toBe(1);
  });

  it('đã xoá hội thoại phía mình rồi bấm nhắn lại: không có hội thoại thứ hai, hội thoại cũ hiện lại', async () => {
    const { listing } = await listingOf();
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    expect(
      (await api(app, 'DELETE', `/me/conversations/${conversation.id}`, buyer.token)).statusCode,
    ).toBe(204);
    expect(await conversationsOf(app, buyer)).toEqual([]);
    const again = await openConversation(app, buyer, listing.id);
    expect(again.statusCode).toBe(200);
    expect(dataOf<{ id: string }>(again).id).toBe(conversation.id);
    expect((await conversationsOf(app, buyer)).map((row) => row.id)).toEqual([conversation.id]);
    expect(await prisma.conversation.count({ where: { listingId: listing.id } })).toBe(1);
  });
});

describe('Ai được nhắn tin', () => {
  it('khách → 401; chưa xác nhận email → 403 EMAIL_NOT_VERIFIED; master → 403 FORBIDDEN; không hội thoại nào được tạo', async () => {
    const { listing } = await listingOf();
    expect((await openConversation(app, null, listing.id)).statusCode).toBe(401);
    const pending = await openConversation(app, await unverifiedUser(app), listing.id);
    expect(pending.statusCode).toBe(403);
    expect(codeOf(pending)).toBe('EMAIL_NOT_VERIFIED');
    const byMaster = await openConversation(app, master, listing.id);
    expect(byMaster.statusCode).toBe(403);
    expect(codeOf(byMaster)).toBe('FORBIDDEN');
    expect(await prisma.conversation.count({ where: { listingId: listing.id } })).toBe(0);
  });
});

describe('Chỉ mở hội thoại mới với tin đang hiển thị mà mình xem được', () => {
  it('tin hiển thị hạn chế mở qua link → 201; đã bán / hết hạn → 409 LISTING_NOT_LIVE', async () => {
    const buyer = await newUser(app);
    const { listing: limited } = await listingOf(undefined, { restrictions: ['machine'] });
    expect((await openConversation(app, buyer, limited.id)).statusCode).toBe(201);
    const { listing: sold } = await listingOf(undefined, { state: 'sold' });
    const soldRes = await openConversation(app, buyer, sold.id);
    expect(soldRes.statusCode).toBe(409);
    expect(codeOf(soldRes)).toBe('LISTING_NOT_LIVE');
    const { listing: expired } = await listingOf(undefined, { state: 'expired' });
    expect(codeOf(await openConversation(app, buyer, expired.id))).toBe('LISTING_NOT_LIVE');
    expect(await prisma.conversation.count({ where: { buyerId: buyer.id } })).toBe(1);
  });

  it('tin "chỉ thành viên" với người ngoài nhóm, tin đang tạm ẩn, tin chờ duyệt → 404', async () => {
    const buyer = await newUser(app);
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const { listing: membersOnly } = await listingOf(member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect((await openConversation(app, buyer, membersOnly.id)).statusCode).toBe(404);
    const { listing: hidden } = await listingOf(undefined, { hideReasons: ['group_locked'] });
    expect((await openConversation(app, buyer, hidden.id)).statusCode).toBe(404);
    const { listing: pending } = await listingOf(undefined, {
      state: 'pending',
      firstLiveAt: null,
      expiresAt: null,
      shownSince: null,
    });
    expect((await openConversation(app, buyer, pending.id)).statusCode).toBe(404);
    expect(await prisma.conversation.count({ where: { buyerId: buyer.id } })).toBe(0);
  });

  it('người đăng bấm nhắn tin trên tin của mình → 403 CANNOT_MESSAGE_OWN_LISTING', async () => {
    const { owner, listing } = await listingOf();
    const res = await openConversation(app, owner, listing.id);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('CANNOT_MESSAGE_OWN_LISTING');
  });
});

describe('Gửi và đọc tin nhắn', () => {
  it('người mua gửi → 201; người bán thấy tin, hội thoại trong danh sách với 1 chưa đọc; đã đọc → 0; tin rỗng → 400', async () => {
    const { owner, listing } = await listingOf();
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    const message = await sent(app, buyer, conversation.id, 'Còn hàng không bạn?');
    expect(message).toMatchObject({ conversationId: conversation.id, senderId: buyer.id });
    expect((await messagesOf(app, owner, conversation.id)).map((row) => row.body)).toEqual([
      'Còn hàng không bạn?',
    ]);
    const [inbox] = await conversationsOf(app, owner);
    expect(inbox).toMatchObject({
      id: conversation.id,
      role: 'seller',
      counterpart: { accountId: buyer.id, gone: false },
      unreadCount: 1,
      lastMessage: { body: 'Còn hàng không bạn?' },
      locked: false,
      canSend: true,
    });
    expect(
      (await api(app, 'POST', `/me/conversations/${conversation.id}/read`, owner.token)).statusCode,
    ).toBe(204);
    expect((await conversationsOf(app, owner))[0]?.unreadCount).toBe(0);
    const empty = await sendMessage(app, buyer, conversation.id, '   ');
    expect(empty.statusCode).toBe(400);
    expect(codeOf(empty)).toBe('VALIDATION_ERROR');
    expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(1);
  });
});

describe('Hội thoại đã mở vẫn tiếp tục', () => {
  it('tin đã bán, tin hết hạn sau khi mở: hai bên vẫn nhắn được', async () => {
    const { owner, listing } = await listingOf();
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    const sold = await listingApi(app, 'POST', `/listings/${listing.id}/sold`, owner, {
      version: listing.version,
    });
    expect(sold.statusCode, sold.body).toBe(200);
    await deliverAll(app);
    expect((await sendMessage(app, buyer, conversation.id, 'Tiếc quá')).statusCode).toBe(201);
    expect((await sendMessage(app, owner, conversation.id, 'Lần sau nhé')).statusCode).toBe(201);

    const { owner: seller, listing: aging } = await listingOf();
    const shopper = await newUser(app);
    const second = await opened(app, shopper, aging.id);
    now = day(31);
    await app.modules.listing.expireDue();
    await deliverAll(app);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: aging.id } })).state).toBe(
      'expired',
    );
    const late = await signedInAt(app, shopper, now);
    expect((await sendMessage(app, late, second.id, 'Còn bán không?')).statusCode).toBe(201);
    expect(
      (await sendMessage(app, await signedInAt(app, seller, now), second.id, 'Hết rồi')).statusCode,
    ).toBe(201);
  });

  it('người mua rời nhóm: hội thoại tiếp tục nhưng không mở mới với tin "chỉ thành viên" khác; người đăng rời nhóm, tin tạm ẩn: vẫn tiếp tục', async () => {
    const group = await createActiveGroup(app, { master });
    const seller = await addMember(app, group.groupId);
    const buyer = await addMember(app, group.groupId);
    const inside = { placement: 'members_only' as const, groupId: group.groupId };
    const { listing } = await listingOf(seller, inside);
    const { listing: another } = await listingOf(seller, inside);
    const conversation = await opened(app, buyer, listing.id);
    expect((await api(app, 'POST', `/groups/${group.groupId}/leave`, buyer.token)).statusCode).toBe(
      204,
    );
    await deliverAll(app);
    expect((await sendMessage(app, buyer, conversation.id, 'Vẫn hỏi được')).statusCode).toBe(201);
    expect((await openConversation(app, buyer, another.id)).statusCode).toBe(404);

    const stayer = await addMember(app, group.groupId);
    const second = await opened(app, stayer, another.id);
    expect(
      (await api(app, 'POST', `/groups/${group.groupId}/leave`, seller.token)).statusCode,
    ).toBe(204);
    await deliverAll(app);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: another.id } })).hideReasons,
    ).toContain('left_group');
    expect((await sendMessage(app, stayer, second.id, 'Bạn còn bán không?')).statusCode).toBe(201);
    expect((await sendMessage(app, seller, second.id, 'Còn')).statusCode).toBe(201);
  });
});

describe('Giới hạn hội thoại mới mỗi ngày theo mức tin cậy', () => {
  it('T0 mở 10 trong ngày; lượt 11 → 429 NEW_CONVERSATION_LIMIT kèm 00:00 ngày mai; trả lời và mở lại không bị giới hạn; qua ngày mở tiếp được', async () => {
    const buyer = await newUser(app);
    const listings = await tenListings();
    // Mười lượt cùng lúc: khoá advisory theo người mở xếp hàng chúng rồi mới đếm hạn mức.
    const conversations = await Promise.all(
      listings.map((listing) => opened(app, buyer, listing.id)),
    );
    const { listing: eleventh } = await listingOf();
    const refused = await openConversation(app, buyer, eleventh.id);
    expect(refused.statusCode).toBe(429);
    expect(codeOf(refused)).toBe('NEW_CONVERSATION_LIMIT');
    expect(
      (refused.json() as { error: { details: { retryAt: string } } }).error.details.retryAt,
    ).toBe(new Date(startOfDayVN(now).getTime() + DAY_MS).toISOString());
    expect(await prisma.conversation.count({ where: { buyerId: buyer.id } })).toBe(10);
    const first = conversations[0];
    if (!first) throw new Error('Thiếu hội thoại');
    expect((await sendMessage(app, buyer, first.id, 'Vẫn trả lời được')).statusCode).toBe(201);
    expect((await openConversation(app, buyer, listings[0]?.id ?? '')).statusCode).toBe(200);
    now = new Date(startOfDayVN(TEST_NOW).getTime() + DAY_MS);
    expect((await openConversation(app, buyer, eleventh.id)).statusCode).toBe(201);
  });

  it('lượt bị từ chối không tính; người bán nhận nhiều hội thoại không bị trừ', async () => {
    const buyer = await newUser(app);
    const listings = (await tenListings()).slice(0, 9);
    await Promise.all(listings.map((listing) => opened(app, buyer, listing.id)));
    const { listing: sold } = await listingOf(undefined, { state: 'sold' });
    expect((await openConversation(app, buyer, sold.id)).statusCode).toBe(409);
    const { listing: tenth } = await listingOf();
    expect((await openConversation(app, buyer, tenth.id)).statusCode).toBe(201);

    const { owner: seller, listing: popular } = await listingOf();
    const shoppers = await Promise.all(Array.from({ length: 11 }, () => newUser(app)));
    await Promise.all(shoppers.map((shopper) => opened(app, shopper, popular.id)));
    expect(await prisma.conversation.count({ where: { listingId: popular.id } })).toBe(11);
    const { listing: elsewhere } = await listingOf();
    expect((await openConversation(app, seller, elsewhere.id)).statusCode).toBe(201);
  });
});

describe('Tin nhắn qua bộ lọc cụm từ cấm của tin đăng', () => {
  it('cụm mức chắc đang bật: 409 MESSAGE_NOT_ALLOWED không nêu cụm, không lưu, không gậy, mức không đổi; cụm mơ hồ: tới nơi kèm dấu; cụm chạy thử: như thường', async () => {
    await activePhrase(app, master, 'bán súng hoa cải', 'certain');
    await activePhrase(app, master, 'hàng xách tay', 'ambiguous');
    const trial = await api(app, 'POST', '/ops/screening/phrases', master.token, {
      text: 'giao tận nơi',
      level: 'certain',
      exceptions: [],
    });
    expect(trial.statusCode).toBe(201);
    const { listing } = await listingOf();
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    const blocked = await sendMessage(app, buyer, conversation.id, 'Có bán súng hoa cải không?');
    expect(blocked.statusCode).toBe(409);
    expect(codeOf(blocked)).toBe('MESSAGE_NOT_ALLOWED');
    expect(blocked.body).not.toContain('súng');
    expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await prisma.strike.count({ where: { accountId: buyer.id } })).toBe(0);
    expect(await app.modules.trust.tierOf(buyer.id)).toBe('T0');

    const flagged = await sent(app, buyer, conversation.id, 'Đây là hàng xách tay phải không?');
    expect((await prisma.message.findUniqueOrThrow({ where: { id: flagged.id } })).flagged).toBe(
      true,
    );
    const plain = await sent(app, buyer, conversation.id, 'Có giao tận nơi không?');
    expect((await prisma.message.findUniqueOrThrow({ where: { id: plain.id } })).flagged).toBe(
      false,
    );
  });
});

describe('Người ngoài hội thoại nhận "không tìm thấy"', () => {
  it('xem, đọc, gửi, xoá, báo cáo bởi người khác → 404 như mã không tồn tại; staff qua app cũng vậy', async () => {
    const { listing } = await listingOf();
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    await sent(app, buyer, conversation.id, 'Chào bạn');
    const stranger = await newUser(app);
    const staff = await newUser(app);
    await grantStaff(staff.id, ['user_reports'], []);
    await Promise.all(
      [stranger, staff].map(async (outsider) => {
        expect((await conversationOf(app, outsider, conversation.id)).statusCode).toBe(404);
        expect(
          (await api(app, 'GET', `/me/conversations/${conversation.id}/messages`, outsider.token))
            .statusCode,
        ).toBe(404);
        expect((await sendMessage(app, outsider, conversation.id, 'Lạ')).statusCode).toBe(404);
        expect(
          (await api(app, 'DELETE', `/me/conversations/${conversation.id}`, outsider.token))
            .statusCode,
        ).toBe(404);
        const reported = await api(
          app,
          'POST',
          `/me/conversations/${conversation.id}/reports`,
          outsider.token,
          { category: 'harassment' },
        );
        expect(reported.statusCode).toBe(404);
      }),
    );
    const missing = await conversationOf(app, stranger, '00000000-0000-7000-8000-000000000000');
    expect(missing.statusCode).toBe(404);
    expect(codeOf(await conversationOf(app, stranger, conversation.id))).toBe(codeOf(missing));
    expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(1);
    expect(await prisma.report.count()).toBe(0);
  });
});

describe('Báo hiệu realtime', () => {
  it('người nhận đang nối socket nhận `message:new` với mã hội thoại và mã tin nhắn sau khi sự kiện được giao', async () => {
    const { owner, listing } = await listingOf();
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    const socket = io(baseUrl, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      auth: { token: owner.token },
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const signal = new Promise<{ conversationId: string; messageId: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Không nhận được message:new')), 3000);
      socket.once('message:new', (payload: { conversationId: string; messageId: string }) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    const message = await sent(app, buyer, conversation.id, 'Alo');
    await deliverAll(app);
    expect(await signal).toEqual({ conversationId: conversation.id, messageId: message.id });
  });
});
