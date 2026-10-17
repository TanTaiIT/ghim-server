import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { interimScreening } from './fakes/listing-ports.fake.js';
import { outboxEvents, prisma } from './db-helpers.js';
import { api, deliverAll, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import {
  block,
  codeOf,
  conversationOf,
  dataOf,
  messagesOf,
  openConversation,
  opened,
  sendMessage,
  sent,
  unblock,
} from './messaging-helpers.js';
import { buildTestApp } from './test-app.js';

/* Spec messaging/blocking qua HTTP: chặn hai chiều, hội thoại cũ ngừng nhận tin, phản hồi giống hệt nhau cho hai bên. */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({ screening: interimScreening });
  await app.ready();
});

afterAll(() => app.close());

async function listingOf(owner: TestUser) {
  return seedListing(liveListing(owner.id, await seedCategory()));
}

/** A và B, mỗi người một tin đang hiển thị. */
async function twoPeople() {
  const [a, b] = [await newUser(app), await newUser(app)];
  return { a, b, listingOfA: await listingOf(a), listingOfB: await listingOf(b) };
}

type Shape = { statusCode: number; code: string; message: string };
const shapeOf = (res: { statusCode: number; json(): unknown }): Shape => {
  const { code, message } = (res.json() as { error: { code: string; message: string } }).error;
  return { statusCode: res.statusCode, code, message };
};

describe('Chặn một người', () => {
  it('A chặn B: B mở hội thoại với tin của A → 403 MESSAGING_BLOCKED; A mở với tin của B → cùng lỗi; không hội thoại nào được tạo', async () => {
    const { a, b, listingOfA, listingOfB } = await twoPeople();
    expect((await block(app, a, b.id)).statusCode).toBe(204);
    const byB = await openConversation(app, b, listingOfA.id);
    const byA = await openConversation(app, a, listingOfB.id);
    expect(shapeOf(byB)).toEqual({
      statusCode: 403,
      code: 'MESSAGING_BLOCKED',
      message: expect.any(String),
    });
    expect(shapeOf(byA)).toEqual(shapeOf(byB));
    expect(await prisma.conversation.count({ where: { buyerId: { in: [a.id, b.id] } } })).toBe(0);
  });

  it('tự chặn mình → 400 VALIDATION_ERROR; tài khoản không tồn tại → 404; chặn lại → vẫn 204', async () => {
    const a = await newUser(app);
    const self = await block(app, a, a.id);
    expect(self.statusCode).toBe(400);
    expect(codeOf(self)).toBe('VALIDATION_ERROR');
    expect((await block(app, a, randomUUID())).statusCode).toBe(404);
    const b = await newUser(app);
    expect((await block(app, a, b.id)).statusCode).toBe(204);
    expect((await block(app, a, b.id)).statusCode).toBe(204);
    const list = await api(app, 'GET', '/me/blocks', a.token);
    expect(dataOf<{ items: { accountId: string }[] }>(list).items).toMatchObject([
      { accountId: b.id },
    ]);
  });
});

describe('Hội thoại cũ ngừng nhận tin khi có chặn', () => {
  it('A chặn B: cả hai gửi tin vào hội thoại cũ → hai response giống hệt nhau, không tin nào tới; chặn áp cho mọi hội thoại; tin cũ vẫn đọc được; gỡ chặn thì nhắn lại được', async () => {
    const { a, b, listingOfA, listingOfB } = await twoPeople();
    const first = await opened(app, b, listingOfA.id);
    const second = await opened(app, a, listingOfB.id);
    await sent(app, b, first.id, 'Trước khi chặn');
    expect((await block(app, a, b.id)).statusCode).toBe(204);

    const fromB = await sendMessage(app, b, first.id, 'Sau khi chặn');
    const fromA = await sendMessage(app, a, first.id, 'Sau khi chặn');
    expect(shapeOf(fromB)).toEqual({
      statusCode: 403,
      code: 'MESSAGING_BLOCKED',
      message: expect.any(String),
    });
    expect(shapeOf(fromA)).toEqual(shapeOf(fromB));
    expect(fromA.body).not.toContain(a.id);
    expect((await sendMessage(app, b, second.id, 'Hội thoại kia')).statusCode).toBe(403);
    expect(
      await prisma.message.count({ where: { conversationId: { in: [first.id, second.id] } } }),
    ).toBe(1);

    const seenByA = dataOf<{ locked: boolean; canSend: boolean }>(
      await conversationOf(app, a, first.id),
    );
    const seenByB = dataOf<{ locked: boolean; canSend: boolean }>(
      await conversationOf(app, b, first.id),
    );
    expect(seenByA).toMatchObject({ locked: true, canSend: false });
    expect(seenByB).toEqual(expect.objectContaining({ locked: true, canSend: false }));
    expect((await messagesOf(app, a, first.id)).map((row) => row.body)).toEqual(['Trước khi chặn']);
    expect((await messagesOf(app, b, first.id)).map((row) => row.body)).toEqual(['Trước khi chặn']);

    expect((await unblock(app, a, b.id)).statusCode).toBe(204);
    expect((await sendMessage(app, b, first.id, 'Gỡ rồi')).statusCode).toBe(201);
  });

  it('không báo cho người bị chặn: không thông báo, không sự kiện nào mang tên người chặn', async () => {
    const { a, b } = await twoPeople();
    const before = (await outboxEvents()).length;
    await block(app, a, b.id);
    await deliverAll(app);
    expect(await outboxEvents()).toHaveLength(before);
    expect(await prisma.notification.count({ where: { recipientId: b.id } })).toBe(0);
  });
});
