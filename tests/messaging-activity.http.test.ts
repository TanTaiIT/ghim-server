import type { FastifyInstance } from 'fastify';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REALTIME_PATH } from '../src/common/realtime/realtime.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import type { ConversationDto } from '../src/modules/messaging/messaging.schema.js';
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
import { block, codeOf, conversationOf, dataOf, opened } from './messaging-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec messaging/activity-status và delta identity/profile của add-activity-status qua HTTP và socket thật: "đang hoạt
 * động" là đang có kết nối realtime; mốc lần cuối ghi lúc nối và lúc kết nối cuối cùng đóng, theo đồng hồ của app.
 */
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const PASSWORD = 'ghim-hoat-dong-2026!';
let now = TEST_NOW;
let app: FastifyInstance;
let baseUrl: string;
let passwordHash: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Không lấy được cổng');
  baseUrl = `http://127.0.0.1:${address.port}`;
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await app.close();
});

const at = (minutes: number) => new Date(TEST_NOW.getTime() + minutes * MINUTE_MS);
const lastSeenOf = async (user: TestUser) =>
  (await prisma.account.findUniqueOrThrow({ where: { id: user.id } })).lastSeenAt;

/** Chờ điều kiện của phía server (sự kiện ngắt kết nối tới sau lượt gọi của client). */
async function until(check: () => Promise<boolean>, deadline = Date.now() + 3000): Promise<void> {
  if (await check()) return;
  if (Date.now() > deadline) throw new Error('Hết giờ chờ');
  await new Promise((resolve) => setTimeout(resolve, 20));
  return until(check, deadline);
}

async function connect(user: TestUser): Promise<Socket> {
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

/** Hội thoại về tin giữa một người bán và một người mua. */
async function talking(seller?: TestUser) {
  const owner = seller ?? (await newUser(app));
  const listing = await seedListing(liveListing(owner.id, await seedCategory()));
  const buyer = await newUser(app);
  const conversation = await opened(app, buyer, listing.id);
  return { seller: owner, buyer, conversation };
}
const activityIn = async (viewer: TestUser, conversationId: string) =>
  dataOf<ConversationDto>(await conversationOf(app, viewer, conversationId)).counterpart.activity;
const setShowActivity = (user: TestUser, showActivity: unknown) =>
  api(app, 'PATCH', '/me', user.token, { showActivity });

describe('Hội thoại về tin cho biết người kia đang hoạt động', () => {
  it('người bán mở app: đang hoạt động, mốc ghi lúc nối', async () => {
    const { seller, buyer, conversation } = await talking();
    now = at(5);
    await connect(seller);
    await until(async () => (await lastSeenOf(seller))?.getTime() === now.getTime());
    expect(await activityIn(buyer, conversation.id)).toEqual({
      online: true,
      lastActiveAt: now.toISOString(),
    });
  });

  it('hai máy, đóng một: vẫn hoạt động, mốc chưa ghi lại; đóng cả hai lúc 9:41:30: xem lúc 9:50 thấy lần cuối 9:41', async () => {
    const { seller, buyer, conversation } = await talking();
    now = at(0);
    const [phone, tablet] = [await connect(seller), await connect(seller)];
    await until(async () => (await lastSeenOf(seller)) !== null);
    now = at(30);
    phone.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await activityIn(buyer, conversation.id))?.online).toBe(true);
    expect(await lastSeenOf(seller)).toEqual(at(0));

    now = new Date(at(41).getTime() + 30_000);
    tablet.disconnect();
    await until(async () => (await lastSeenOf(seller))?.getTime() === now.getTime());
    now = at(50);
    expect(await activityIn(buyer, conversation.id)).toEqual({
      online: false,
      lastActiveAt: at(41).toISOString(),
    });
  });

  it('lần cuối hoạt động 8 ngày trước: không hoạt động, không có lần cuối; chưa từng nối: cũng vậy', async () => {
    const old = await talking();
    await prisma.account.update({
      where: { id: old.seller.id },
      data: { lastSeenAt: new Date(TEST_NOW.getTime() - 8 * DAY_MS) },
    });
    expect(await activityIn(old.buyer, old.conversation.id)).toEqual({
      online: false,
      lastActiveAt: null,
    });
    const fresh = await talking();
    expect(await activityIn(fresh.buyer, fresh.conversation.id)).toEqual({
      online: false,
      lastActiveAt: null,
    });
  });
});

describe('Chỉ bên kia của hội thoại về tin thấy', () => {
  it('hồ sơ công khai không cho biết trạng thái hoạt động', async () => {
    const seller = await newUser(app);
    await connect(seller);
    const profile = (await api(app, 'GET', `/users/${seller.id}`)).json() as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(profile.data)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/activ|online|seen/i)]),
    );
  });

  it('có chặn: không bên nào thấy của bên kia', async () => {
    const { seller, buyer, conversation } = await talking();
    await Promise.all([connect(seller), connect(buyer)]);
    await block(app, seller, buyer.id);
    expect(await activityIn(buyer, conversation.id)).toBeNull();
    expect(await activityIn(seller, conversation.id)).toBeNull();
  });

  it('người kia đã xoá tài khoản: không có trạng thái; mốc hoạt động của họ không còn lưu', async () => {
    const row = await seedAccount({ passwordHash });
    const seller: TestUser = { id: row.id, email: row.email, token: await tokenFor(app, row.id) };
    const { buyer, conversation } = await talking(seller);
    await connect(seller);
    await until(async () => (await lastSeenOf(seller)) !== null);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: seller.email, password: PASSWORD },
    });
    const token = (login.json() as { data: { accessToken: string } }).data.accessToken;
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleted.statusCode).toBe(204);
    await deliverAll(app);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await lastSeenOf(seller)).toBeNull();
    expect(await activityIn(buyer, conversation.id)).toBeNull();
  });

  it('quản trị nhóm xem hội thoại của một người dùng đang mở app: không có trạng thái', async () => {
    const group = await createActiveGroup(app, { master: await newMaster(app) });
    const user = await addMember(app, group.groupId);
    const conversation = dataOf<ConversationDto>(
      await api(app, 'POST', `/groups/${group.groupId}/conversation`, user.token),
    );
    await connect(user);
    expect(await activityIn(group.owner, conversation.id)).toBeNull();
  });
});

describe('Tắt trạng thái hoạt động là tắt hai chiều', () => {
  it('người bán tắt: người mua không thấy; người mua tắt: không thấy người bán; bật lại thì thấy', async () => {
    const { seller, buyer, conversation } = await talking();
    await connect(seller);
    expect((await setShowActivity(seller, false)).statusCode).toBe(200);
    expect(await activityIn(buyer, conversation.id)).toBeNull();

    await setShowActivity(seller, true);
    await setShowActivity(buyer, false);
    expect(await activityIn(buyer, conversation.id)).toBeNull();

    await setShowActivity(buyer, true);
    expect((await activityIn(buyer, conversation.id))?.online).toBe(true);
  });
});

describe('Công tắc hiện trạng thái hoạt động', () => {
  it('mặc định bật; tắt → 200 và hồ sơ của tôi cho biết đang tắt; giá trị sai → 400, công tắc không đổi', async () => {
    const user = await newUser(app);
    const me = async () => (await api(app, 'GET', '/me', user.token)).json().data.showActivity;
    expect(await me()).toBe(true);
    const off = await setShowActivity(user, false);
    expect(off.statusCode).toBe(200);
    expect(off.json().data.showActivity).toBe(false);
    const bad = await setShowActivity(user, 'có');
    expect([bad.statusCode, codeOf(bad)]).toEqual([400, 'VALIDATION_ERROR']);
    expect(await me()).toBe(false);
  });
});
