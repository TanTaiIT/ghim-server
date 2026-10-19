import type { FastifyInstance } from 'fastify';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REALTIME_PATH } from '../src/common/realtime/realtime.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import type { ConversationDto, MessageDto } from '../src/modules/messaging/messaging.schema.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { auditOf, prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import {
  block,
  codeOf,
  conversationOf,
  conversationsOf,
  dataOf,
  messagesOf,
  opened,
  sendMessage,
  sent,
} from './messaging-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { unverifiedUser } from './report-helpers.js';
import { activePhrase } from './screening-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec messaging/support-chat qua HTTP, cùng các delta của add-team-conversations chạm hội thoại hỗ trợ (bộ lọc, chặn, xoá,
 * đọc chung, thông báo, báo hiệu hàng). Bên nghe thật; bàn vận hành đi đúng route `/ops/support/*` với quyền `support`.
 */
const MINUTE_MS = 60_000;
const PASSWORD = 'ghim-ho-tro-2026!';
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
let baseUrl: string;
let passwordHash: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Không lấy được cổng');
  baseUrl = `http://127.0.0.1:${address.port}`;
  master = await newMaster(app);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await app.close();
});

const openSupport = (user: TestUser | null) =>
  api(app, 'POST', '/me/support/conversation', user?.token);
async function supportOf(user: TestUser): Promise<ConversationDto> {
  const res = await openSupport(user);
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`Mở hội thoại hỗ trợ hỏng: ${res.statusCode} ${res.body}`);
  }
  return dataOf<ConversationDto>(res);
}
async function supportStaff(): Promise<TestUser> {
  const staff = await newUser(app);
  await grantStaff(staff.id, ['support']);
  return staff;
}
const reply = (staff: TestUser, conversationId: string, body: string) =>
  api(app, 'POST', `/ops/support/conversations/${conversationId}/messages`, staff.token, { body });
const queue = async (staff: TestUser, status: 'pending' | 'all' = 'all') => {
  const res = await api(app, 'GET', `/ops/support/conversations?status=${status}`, staff.token);
  if (res.statusCode !== 200) throw new Error(`Hàng hỗ trợ hỏng: ${res.statusCode} ${res.body}`);
  return dataOf<{ items: ConversationDto[] }>(res).items.map((item) => item.id);
};
const teamPendingSince = async (id: string) =>
  (await prisma.conversation.findUniqueOrThrow({ where: { id } })).teamPendingSince;

/** Người dùng có mật khẩu thật — ca xoá tài khoản đi đường xoá thật. */
async function realUser(): Promise<TestUser> {
  const row = await seedAccount({ passwordHash });
  return { id: row.id, email: row.email, token: await tokenFor(app, row.id) };
}
async function deleteMe(user: TestUser): Promise<void> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: user.email, password: PASSWORD },
  });
  const token = (login.json() as { data: { accessToken: string } }).data.accessToken;
  const res = await app.inject({
    method: 'DELETE',
    url: '/api/v1/me',
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.statusCode !== 204) throw new Error(`Xoá tài khoản hỏng: ${res.statusCode} ${res.body}`);
  await deliverAll(app);
}

async function connected(user: TestUser): Promise<Socket> {
  const socket = io(baseUrl, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    auth: { token: user.token },
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}
const nextSignal = <T>(socket: Socket, event: string, ms = 3000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Không nhận được ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

describe('Mỗi người dùng một hội thoại với Hỗ trợ Ghim', () => {
  it('mở lần đầu → 201 với Hỗ trợ Ghim; mở lại → 200 cùng hội thoại và tin cũ', async () => {
    const user = await newUser(app);
    const first = await openSupport(user);
    expect(first.statusCode, first.body).toBe(201);
    const conversation = dataOf<ConversationDto>(first);
    expect(conversation).toMatchObject({
      kind: 'support',
      listing: null,
      group: null,
      role: 'buyer',
      counterpart: { kind: 'support', accountId: null, displayName: 'Hỗ trợ Ghim', gone: false },
      canSend: true,
      canOffer: false,
    });
    await sent(app, user, conversation.id, 'Mình không đăng được tin');
    const again = await openSupport(user);
    expect(again.statusCode).toBe(200);
    expect(dataOf<ConversationDto>(again).id).toBe(conversation.id);
    expect((await messagesOf(app, user, conversation.id)).map((m) => m.body)).toEqual([
      'Mình không đăng được tin',
    ]);
  });

  it('đã xoá phía mình rồi mở lại: hội thoại cũ hiện lại, không có hội thoại thứ hai; hai lượt cùng lúc ra một', async () => {
    const user = await newUser(app);
    const [a, b] = await Promise.all([openSupport(user), openSupport(user)]);
    const ids = [a, b].map((res) => dataOf<ConversationDto>(res).id);
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.conversation.count({ where: { kind: 'support', buyerId: user.id } })).toBe(
      1,
    );
    await api(app, 'DELETE', `/me/conversations/${ids[0]}`, user.token);
    expect(await conversationsOf(app, user)).toEqual([]);
    expect((await supportOf(user)).id).toBe(ids[0]);
    expect((await conversationsOf(app, user)).map((row) => row.id)).toEqual([ids[0]]);
  });

  it('chưa xác nhận email → 403 EMAIL_NOT_VERIFIED; khách → 401; master → 403 FORBIDDEN', async () => {
    const unverified = await openSupport(await unverifiedUser(app));
    expect([unverified.statusCode, codeOf(unverified)]).toEqual([403, 'EMAIL_NOT_VERIFIED']);
    expect((await openSupport(null)).statusCode).toBe(401);
    const asMaster = await openSupport(master);
    expect([asMaster.statusCode, codeOf(asMaster)]).toEqual([403, 'FORBIDDEN']);
  });

  it('T0 đã mở 10 hội thoại mới về tin trong ngày vẫn mở hội thoại hỗ trợ lần đầu', async () => {
    const user = await newUser(app);
    const listings = await Promise.all(
      Array.from({ length: 10 }, async () =>
        seedListing(liveListing((await newUser(app)).id, await seedCategory())),
      ),
    );
    await Promise.all(listings.map((listing) => opened(app, user, listing.id)));
    expect((await openSupport(user)).statusCode).toBe(201);
  });
});

describe('Người dùng thấy Hỗ trợ Ghim, không thấy staff', () => {
  it('hai staff lần lượt trả lời: người dùng thấy cả hai từ Hỗ trợ Ghim, không mã người viết; staff thấy ai viết', async () => {
    const user = await newUser(app);
    const conversation = await supportOf(user);
    await sent(app, user, conversation.id, 'Cho mình hỏi');
    const [one, two] = [await supportStaff(), await supportStaff()];
    expect((await reply(one, conversation.id, 'Chào bạn')).statusCode).toBe(201);
    expect((await reply(two, conversation.id, 'Bạn cần gì?')).statusCode).toBe(201);
    const seen = await messagesOf(app, user, conversation.id);
    expect(seen.map((m) => [m.body, m.senderId, m.fromMe])).toEqual([
      ['Bạn cần gì?', null, false],
      ['Chào bạn', null, false],
      ['Cho mình hỏi', user.id, true],
    ]);
    const desk = await api(
      app,
      'GET',
      `/ops/support/conversations/${conversation.id}/messages`,
      one.token,
    );
    expect(dataOf<{ items: MessageDto[] }>(desk).items.map((m) => [m.senderId, m.fromMe])).toEqual([
      [two.id, false],
      [one.id, true],
      [user.id, false],
    ]);
  });
});

describe('Staff hỗ trợ trả lời từ bàn vận hành', () => {
  it('hàng: đang chờ trước, chờ lâu nhất trước; trả lời thì rời nhóm chờ; người dùng nhắn tiếp thì về chờ từ tin đó', async () => {
    await prisma.conversation.deleteMany({ where: { kind: 'support' } });
    const staff = await supportStaff();
    const [a, b] = [await newUser(app), await newUser(app)];
    const [ca, cb] = [await supportOf(a), await supportOf(b)];
    now = new Date(TEST_NOW.getTime() + 60 * MINUTE_MS);
    await sent(app, a, ca.id, 'A hỏi lúc 9 giờ');
    now = new Date(TEST_NOW.getTime() + 120 * MINUTE_MS);
    await sent(app, b, cb.id, 'B hỏi lúc 10 giờ');
    now = new Date(TEST_NOW.getTime() + 125 * MINUTE_MS);
    expect((await reply(staff, cb.id, 'Đã trả lời B')).statusCode).toBe(201);
    expect(await queue(staff)).toEqual([ca.id, cb.id]);
    expect(await queue(staff, 'pending')).toEqual([ca.id]);

    now = new Date(TEST_NOW.getTime() + 130 * MINUTE_MS);
    await sent(app, b, cb.id, 'B nhắn tiếp');
    expect(await teamPendingSince(cb.id)).toEqual(now);
    expect(await queue(staff, 'pending')).toEqual([ca.id, cb.id]);
  });

  it('nhật ký ghi lượt trả lời của staff, không chứa nội dung', async () => {
    const user = await newUser(app);
    const conversation = await supportOf(user);
    const staff = await supportStaff();
    const res = await reply(staff, conversation.id, 'Nội dung riêng tư');
    const [entry] = await auditOf(conversation.id);
    expect(entry).toMatchObject({
      actorId: staff.id,
      action: 'messaging.support.reply',
      details: { messageId: dataOf<MessageDto>(res).id },
    });
    expect(JSON.stringify(entry)).not.toContain('Nội dung riêng tư');
  });

  it('staff chỉ mang quyền duyệt giấy tờ → 403; staff bị treo quyền → 403', async () => {
    const idReviewer = await newUser(app);
    await grantStaff(idReviewer.id, ['id_verification']);
    const res = await api(app, 'GET', '/ops/support/conversations', idReviewer.token);
    expect([res.statusCode, codeOf(res)]).toEqual([403, 'FORBIDDEN']);

    const suspended = await supportStaff();
    await prisma.staffPermission.update({
      where: { accountId: suspended.id },
      data: { status: 'suspended', suspendedAt: TEST_NOW, suspendedReason: 'Nhận gậy' },
    });
    expect((await api(app, 'GET', '/ops/support/conversations', suspended.token)).statusCode).toBe(
      403,
    );
  });

  it('staff trả lời hội thoại hỗ trợ của chính mình → 403, hội thoại vẫn chờ staff khác', async () => {
    const staff = await supportStaff();
    const own = await supportOf(staff);
    await sent(app, staff, own.id, 'Mình cũng cần hỗ trợ');
    const res = await reply(staff, own.id, 'Tự trả lời');
    expect([res.statusCode, codeOf(res)]).toEqual([403, 'FORBIDDEN']);
    expect(await teamPendingSince(own.id)).not.toBeNull();
    expect((await reply(await supportStaff(), own.id, 'Staff khác trả lời')).statusCode).toBe(201);
  });

  it('staff mở hội thoại hỗ trợ của người khác qua app → 404', async () => {
    const conversation = await supportOf(await newUser(app));
    const staff = await supportStaff();
    const res = await conversationOf(app, staff, conversation.id);
    expect([res.statusCode, codeOf(res)]).toEqual([404, 'NOT_FOUND']);
  });

  it('người dùng xoá tài khoản: staff vẫn đọc, thấy người dùng đã rời, gửi → 409 CONVERSATION_CLOSED', async () => {
    const user = await realUser();
    const conversation = await supportOf(user);
    await sent(app, user, conversation.id, 'Giúp mình với');
    await deleteMe(user);
    const staff = await supportStaff();
    const seen = await api(
      app,
      'GET',
      `/ops/support/conversations/${conversation.id}`,
      staff.token,
    );
    expect(dataOf<ConversationDto>(seen)).toMatchObject({
      role: 'team',
      counterpart: { kind: 'account', accountId: user.id, gone: true },
      canSend: false,
    });
    const res = await reply(staff, conversation.id, 'Alo?');
    expect([res.statusCode, codeOf(res)]).toEqual([409, 'CONVERSATION_CLOSED']);
  });

  it('tin nhắn rỗng → 400 VALIDATION_ERROR', async () => {
    const conversation = await supportOf(await newUser(app));
    const res = await reply(await supportStaff(), conversation.id, '   ');
    expect([res.statusCode, codeOf(res)]).toEqual([400, 'VALIDATION_ERROR']);
  });
});

describe('Hội thoại hỗ trợ theo luật chung của hội thoại', () => {
  it('staff cảnh báo bằng đúng cụm lừa đảo mức chắc: 201, người dùng nhận được', async () => {
    await activePhrase(app, master, 'chuyển khoản đặt cọc trước', 'certain');
    const user = await newUser(app);
    const conversation = await supportOf(user);
    const res = await reply(
      await supportStaff(),
      conversation.id,
      'Đừng chuyển khoản đặt cọc trước',
    );
    expect(res.statusCode, res.body).toBe(201);
    expect((await messagesOf(app, user, conversation.id))[0]?.body).toBe(
      'Đừng chuyển khoản đặt cọc trước',
    );
    const own = await sendMessage(app, user, conversation.id, 'Họ bảo chuyển khoản đặt cọc trước');
    expect([own.statusCode, codeOf(own)]).toEqual([409, 'MESSAGE_NOT_ALLOWED']);
  });

  it('người dùng đã chặn một tài khoản tình cờ là staff hỗ trợ: hội thoại hỗ trợ vẫn nhận tin hai phía', async () => {
    const user = await newUser(app);
    const staff = await supportStaff();
    await block(app, user, staff.id);
    const conversation = await supportOf(user);
    expect((await sendMessage(app, user, conversation.id, 'Alo')).statusCode).toBe(201);
    expect((await reply(staff, conversation.id, 'Chào bạn')).statusCode).toBe(201);
    expect((await conversationOf(app, user, conversation.id)).json().data).toMatchObject({
      locked: false,
      canSend: true,
    });
  });

  it('người dùng xoá phía mình: staff vẫn đọc đủ; đội trả lời thì hiện lại ở phía người dùng', async () => {
    const user = await newUser(app);
    const conversation = await supportOf(user);
    await sent(app, user, conversation.id, 'Hỏi');
    await api(app, 'DELETE', `/me/conversations/${conversation.id}`, user.token);
    const staff = await supportStaff();
    const desk = await api(
      app,
      'GET',
      `/ops/support/conversations/${conversation.id}/messages`,
      staff.token,
    );
    expect(dataOf<{ items: MessageDto[] }>(desk).items).toHaveLength(1);
    await reply(staff, conversation.id, 'Trả lời');
    expect((await conversationsOf(app, user)).map((row) => row.id)).toEqual([conversation.id]);
  });

  it('một staff đọc là cả đội đã đọc, nhưng hội thoại vẫn đang chờ trả lời', async () => {
    const user = await newUser(app);
    const conversation = await supportOf(user);
    await sent(app, user, conversation.id, 'Một');
    await sent(app, user, conversation.id, 'Hai');
    const [one, two] = [await supportStaff(), await supportStaff()];
    const read = await api(
      app,
      'POST',
      `/ops/support/conversations/${conversation.id}/read`,
      one.token,
    );
    expect(read.statusCode).toBe(204);
    const seen = await api(app, 'GET', `/ops/support/conversations/${conversation.id}`, two.token);
    expect(dataOf<ConversationDto>(seen).unreadCount).toBe(0);
    expect(await queue(two, 'pending')).toContain(conversation.id);
  });

  it('báo cáo từ hội thoại hỗ trợ → 409 CONVERSATION_NOT_REPORTABLE', async () => {
    const user = await newUser(app);
    const conversation = await supportOf(user);
    const res = await api(app, 'POST', `/me/conversations/${conversation.id}/reports`, user.token, {
      category: 'harassment',
    });
    expect([res.statusCode, codeOf(res)]).toEqual([409, 'CONVERSATION_NOT_REPORTABLE']);
  });
});

const inbox = (user: TestUser) =>
  prisma.notification.findMany({
    where: { recipientId: user.id },
    orderBy: { createdAt: 'asc' },
  });

describe('Thông báo và báo hiệu của hội thoại hỗ trợ', () => {
  it('người dùng nhận trả lời ở nhóm "hỗ trợ" ký Hỗ trợ Ghim; staff không nhận hộp thư khi người dùng nhắn', async () => {
    const user = await newUser(app);
    const staff = await supportStaff();
    const conversation = await supportOf(user);
    await sent(app, user, conversation.id, 'Mình cần giúp');
    await reply(staff, conversation.id, 'Chào bạn, mình xem ngay');
    await deliverAll(app);
    expect(await inbox(user)).toEqual([
      expect.objectContaining({
        category: 'support',
        title: 'Hỗ trợ Ghim',
        body: 'Chào bạn, mình xem ngay',
      }),
    ]);
    expect(await inbox(staff)).toEqual([]);
  });

  it('staff hỗ trợ đang nối realtime nhận số đang chờ khi có hội thoại mới chờ và khi đội vừa trả lời; staff khác thì không', async () => {
    await prisma.conversation.deleteMany({ where: { kind: 'support' } });
    const staff = await supportStaff();
    const idReviewer = await newUser(app);
    await grantStaff(idReviewer.id, ['id_verification']);
    const [desk, other] = [await connected(staff), await connected(idReviewer)];
    let leaked = false;
    other.on('support:pending', () => {
      leaked = true;
    });

    const user = await newUser(app);
    const conversation = await supportOf(user);
    const waiting = nextSignal<{ count: number }>(desk, 'support:pending');
    await sent(app, user, conversation.id, 'Có ai không?');
    await deliverAll(app);
    expect(await waiting).toEqual({ count: 1 });

    const answered = nextSignal<{ count: number }>(desk, 'support:pending');
    await reply(staff, conversation.id, 'Có đây');
    await deliverAll(app);
    expect(await answered).toEqual({ count: 0 });
    expect(leaked).toBe(false);
  });
});
