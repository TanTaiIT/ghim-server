import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import {
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
import { buildTestApp } from './test-app.js';

/* Spec messaging/conversation-deletion qua HTTP và bên nghe thật: xoá hội thoại, xoá tài khoản chỉ ẩn phía người xoá. */
const PASSWORD = 'ghim-rao-vat-2026!';
let app: FastifyInstance;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  app = await buildTestApp({ screening: interimScreening });
  await app.ready();
});

afterAll(() => app.close());

async function realUser(): Promise<TestUser> {
  const row = await seedAccount({ passwordHash });
  return { id: row.id, email: row.email, token: await tokenFor(app, row.id) };
}

const deleteMe = async (user: TestUser) => {
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
};

/** Người bán, người mua, một hội thoại đã có hai tin nhắn. */
async function talking(seller?: TestUser, buyer?: TestUser) {
  const owner = seller ?? (await newUser(app));
  const shopper = buyer ?? (await newUser(app));
  const listing = await seedListing(liveListing(owner.id, await seedCategory()));
  const conversation = await opened(app, shopper, listing.id);
  await sent(app, shopper, conversation.id, 'Còn không?');
  await sent(app, owner, conversation.id, 'Còn');
  return { owner, shopper, listing, conversation };
}

describe('Xoá hội thoại chỉ ẩn ở phía mình', () => {
  it('người mua xoá: không còn trong danh sách của người mua, người bán vẫn thấy đủ tin nhắn; cả hai xoá: không bên nào thấy', async () => {
    const { owner, shopper, conversation } = await talking();
    expect(
      (await api(app, 'DELETE', `/me/conversations/${conversation.id}`, shopper.token)).statusCode,
    ).toBe(204);
    expect(await conversationsOf(app, shopper)).toEqual([]);
    expect((await conversationsOf(app, owner)).map((row) => row.id)).toEqual([conversation.id]);
    expect((await messagesOf(app, owner, conversation.id)).map((row) => row.body)).toEqual([
      'Còn',
      'Còn không?',
    ]);
    expect(
      (await api(app, 'DELETE', `/me/conversations/${conversation.id}`, owner.token)).statusCode,
    ).toBe(204);
    expect(await conversationsOf(app, owner)).toEqual([]);
    expect(await conversationsOf(app, shopper)).toEqual([]);
  });

  it('đã xoá phía mình mà bên kia nhắn tiếp: hội thoại hiện lại với đủ lịch sử cũ', async () => {
    const { owner, shopper, conversation } = await talking();
    await api(app, 'DELETE', `/me/conversations/${conversation.id}`, shopper.token);
    await sent(app, owner, conversation.id, 'Bạn còn quan tâm không?');
    expect((await conversationsOf(app, shopper)).map((row) => row.id)).toEqual([conversation.id]);
    expect((await messagesOf(app, shopper, conversation.id)).map((row) => row.body)).toEqual([
      'Bạn còn quan tâm không?',
      'Còn',
      'Còn không?',
    ]);
  });
});

describe('Xoá tài khoản ẩn hội thoại phía người xoá', () => {
  it('người bán xoá tài khoản: người mua vẫn mở và đọc đủ, thấy bên kia đã rời, gửi tiếp → 409 CONVERSATION_CLOSED', async () => {
    const { owner, shopper, conversation } = await talking(await realUser());
    await prisma.account.update({
      where: { id: owner.id },
      data: { avatarFromGoogle: true, googlePictureUrl: 'https://lh3.googleusercontent.com/a/x' },
    });
    await deleteMe(owner);
    const seen = await conversationOf(app, shopper, conversation.id);
    expect(seen.statusCode).toBe(200);
    expect(
      dataOf<{ counterpart: { gone: boolean; displayName: string | null }; canSend: boolean }>(
        seen,
      ),
    ).toMatchObject({
      counterpart: { gone: true, displayName: null, avatarUrl: null },
      canSend: false,
    });
    expect((await messagesOf(app, shopper, conversation.id)).map((row) => row.body)).toEqual([
      'Còn',
      'Còn không?',
    ]);
    const closed = await sendMessage(app, shopper, conversation.id, 'Alo?');
    expect(closed.statusCode).toBe(409);
    expect(codeOf(closed)).toBe('CONVERSATION_CLOSED');
  });

  it('người mua xoá tài khoản: người bán vẫn mở được hội thoại và đọc đủ tin nhắn cũ', async () => {
    const { owner, shopper, conversation } = await talking(undefined, await realUser());
    await deleteMe(shopper);
    expect((await conversationsOf(app, owner)).map((row) => row.id)).toEqual([conversation.id]);
    expect((await messagesOf(app, owner, conversation.id)).map((row) => row.body)).toEqual([
      'Còn',
      'Còn không?',
    ]);
  });
});
