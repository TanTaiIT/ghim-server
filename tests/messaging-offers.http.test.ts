import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import type { MessageDto } from '../src/modules/messaging/messaging.schema.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { listingApi, liveListingOf, signedInAt } from './listing-http-helpers.js';
import {
  block,
  codeOf,
  dataOf,
  messagesOf,
  opened,
  sendMessage,
  sent,
} from './messaging-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec messaging/price-offers qua HTTP với `trust` thật (hạn mức, tin sạch). Tin dựng thẳng qua DB, cho thương lượng, giá
 * 12.500.000 đồng; trạng thái tin đổi bằng ghi thẳng ở các ca chỉ bàn về luật trả giá, đường thật ở ca tin sạch.
 */
const DAY_MS = 86_400_000;
const PRICE = 12_500_000n;
const PASSWORD = 'ghim-tra-gia-2026!';
let now = TEST_NOW;
let app: FastifyInstance;
let passwordHash: string;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.ready();
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const offer = (user: TestUser, conversationId: string, amount: unknown) =>
  api(app, 'POST', `/me/conversations/${conversationId}/offers`, user.token, { amount });
const answer = (
  user: TestUser,
  conversationId: string,
  messageId: string,
  decision: 'accept' | 'decline',
) =>
  api(
    app,
    'POST',
    `/me/conversations/${conversationId}/offers/${messageId}/${decision}`,
    user.token,
  );

async function offered(user: TestUser, conversationId: string, amount: number) {
  const res = await offer(user, conversationId, amount);
  if (res.statusCode !== 201) throw new Error(`Trả giá hỏng: ${res.statusCode} ${res.body}`);
  return dataOf<MessageDto>(res);
}

/** Người bán có mật khẩu thật — ca "người bán xoá tài khoản" đi đường xoá thật. */
async function realUser(): Promise<TestUser> {
  const row = await seedAccount({ passwordHash });
  return { id: row.id, email: row.email, token: await tokenFor(app, row.id) };
}

/** Một hội thoại về tin cho thương lượng, giá 12.500.000 đồng (hay theo `overrides`). */
async function talking(
  overrides: Partial<Prisma.ListingUncheckedCreateInput> = {},
  seller?: TestUser,
) {
  const owner = seller ?? (await newUser(app));
  const listing = await seedListing(
    liveListing(owner.id, await seedCategory(), { negotiable: true, price: PRICE, ...overrides }),
  );
  const buyer = await newUser(app);
  const conversation = await opened(app, buyer, listing.id);
  return { seller: owner, buyer, listing, conversation };
}

const setListing = (id: string, data: Prisma.ListingUpdateInput) =>
  prisma.listing.update({ where: { id }, data });
const pendingCount = (conversationId: string) =>
  prisma.message.count({ where: { conversationId, offerStatus: 'pending' } });
const offerStatus = async (id: string) =>
  (await prisma.message.findUniqueOrThrow({ where: { id } })).offerStatus;

describe('Người mua trả giá trong hội thoại về tin', () => {
  it('trả 12.000.000 cho tin 12.500.000 → 201 đang chờ; người bán thấy trong dòng tin nhắn', async () => {
    const { seller, buyer, conversation } = await talking();
    const res = await offer(buyer, conversation.id, 12_000_000);
    expect(res.statusCode, res.body).toBe(201);
    const message = dataOf<MessageDto>(res);
    expect(message).toMatchObject({
      kind: 'offer',
      senderId: buyer.id,
      body: '',
      fromMe: true,
      offer: { amount: 12_000_000, status: 'pending', respondedAt: null },
    });
    expect(await messagesOf(app, seller, conversation.id)).toEqual([{ ...message, fromMe: false }]);
  });

  it('trả đúng giá đăng → 201 đang chờ', async () => {
    const { buyer, conversation } = await talking();
    expect((await offered(buyer, conversation.id, Number(PRICE))).offer?.status).toBe('pending');
  });

  it('người bán trả giá → 403 OFFER_BUYER_ONLY, không đề nghị nào được thêm', async () => {
    const { seller, conversation } = await talking();
    const res = await offer(seller, conversation.id, 12_000_000);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('OFFER_BUYER_ONLY');
    expect(await messagesOf(app, seller, conversation.id)).toEqual([]);
  });

  it('cao hơn giá đăng → 400 OFFER_ABOVE_PRICE', async () => {
    const { buyer, conversation } = await talking();
    const res = await offer(buyer, conversation.id, Number(PRICE) + 1);
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('OFFER_ABOVE_PRICE');
    expect(await messagesOf(app, buyer, conversation.id)).toEqual([]);
  });

  it('0 đồng, số âm, số không nguyên → 400 VALIDATION_ERROR', async () => {
    const { buyer, conversation } = await talking();
    const replies = await Promise.all(
      [0, -5, 1.5, '12000000'].map((amount) => offer(buyer, conversation.id, amount)),
    );
    expect(replies.map((res) => [res.statusCode, codeOf(res)])).toEqual(
      replies.map(() => [400, 'VALIDATION_ERROR']),
    );
    expect(await messagesOf(app, buyer, conversation.id)).toEqual([]);
  });
});

describe('Chỉ trả giá khi tin còn hiển thị và cho thương lượng', () => {
  it('tin không cho thương lượng, tin cho tặng → 409 OFFERS_NOT_ACCEPTED', async () => {
    const fixed = await talking({ negotiable: false });
    const free = await talking({ price: 0n });
    const replies = await Promise.all(
      [fixed, free].map(({ buyer, conversation }) => offer(buyer, conversation.id, 1)),
    );
    expect(replies.map((res) => [res.statusCode, codeOf(res)])).toEqual([
      [409, 'OFFERS_NOT_ACCEPTED'],
      [409, 'OFFERS_NOT_ACCEPTED'],
    ]);
  });

  it('tin đã bán → 409 LISTING_NOT_LIVE, nhưng tin nhắn chữ vẫn gửi được', async () => {
    const { buyer, listing, conversation } = await talking();
    await setListing(listing.id, { state: 'sold' });
    const res = await offer(buyer, conversation.id, 12_000_000);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('LISTING_NOT_LIVE');
    expect((await sendMessage(app, buyer, conversation.id, 'Bán rồi à?')).statusCode).toBe(201);
  });

  it('tin hết hạn, đang tạm ẩn, đã bị xoá → 409 LISTING_NOT_LIVE', async () => {
    const cases: Prisma.ListingUpdateInput[] = [
      { state: 'expired' },
      { hideReasons: ['group_locked'] },
      { deletedAt: TEST_NOW },
    ];
    const replies = await Promise.all(
      cases.map(async (data) => {
        const { buyer, listing, conversation } = await talking();
        await setListing(listing.id, data);
        return offer(buyer, conversation.id, 12_000_000);
      }),
    );
    expect(replies.map((res) => [res.statusCode, codeOf(res)])).toEqual(
      cases.map(() => [409, 'LISTING_NOT_LIVE']),
    );
  });
});

describe('Mỗi hội thoại một đề nghị đang chờ', () => {
  it('trả giá lần hai: đề nghị cũ "đã thay", đề nghị mới đang chờ, đúng một đang chờ', async () => {
    const { buyer, conversation } = await talking();
    const first = await offered(buyer, conversation.id, 11_000_000);
    const second = await offered(buyer, conversation.id, 11_500_000);
    expect(await offerStatus(first.id)).toBe('superseded');
    expect(second.offer?.status).toBe('pending');
    expect(await pendingCount(conversation.id)).toBe(1);
  });

  it('sau khi bị từ chối: đề nghị cũ vẫn "đã từ chối", đề nghị mới đang chờ', async () => {
    const { seller, buyer, conversation } = await talking();
    const first = await offered(buyer, conversation.id, 10_000_000);
    expect((await answer(seller, conversation.id, first.id, 'decline')).statusCode).toBe(200);
    const second = await offered(buyer, conversation.id, 11_000_000);
    expect(await offerStatus(first.id)).toBe('declined');
    expect(second.offer?.status).toBe('pending');
  });

  it('hai đề nghị cùng lúc: cả hai được thêm, đúng một còn đang chờ', async () => {
    const { buyer, conversation } = await talking();
    const replies = await Promise.all([
      offer(buyer, conversation.id, 11_000_000),
      offer(buyer, conversation.id, 11_200_000),
    ]);
    expect(replies.map((res) => res.statusCode)).toEqual([201, 201]);
    expect(await pendingCount(conversation.id)).toBe(1);
  });
});

describe('Người bán chấp nhận hay từ chối', () => {
  it('chấp nhận → 200 "đã chấp nhận", người mua thấy; từ chối → 200 "đã từ chối"', async () => {
    const { seller, buyer, conversation } = await talking();
    const first = await offered(buyer, conversation.id, 12_000_000);
    const accepted = await answer(seller, conversation.id, first.id, 'accept');
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(dataOf<MessageDto>(accepted).offer).toMatchObject({
      status: 'accepted',
      respondedAt: TEST_NOW.toISOString(),
    });
    const [seen] = await messagesOf(app, buyer, conversation.id);
    expect(seen?.offer?.status).toBe('accepted');

    const second = await offered(buyer, conversation.id, 11_000_000);
    const declined = await answer(seller, conversation.id, second.id, 'decline');
    expect(dataOf<MessageDto>(declined).offer?.status).toBe('declined');
  });

  it('trả lời đề nghị đã thay, hay trả lời lần hai → 409 OFFER_NOT_PENDING, trạng thái không đổi', async () => {
    const { seller, buyer, conversation } = await talking();
    const old = await offered(buyer, conversation.id, 11_000_000);
    const latest = await offered(buyer, conversation.id, 11_500_000);
    const stale = await answer(seller, conversation.id, old.id, 'accept');
    expect([stale.statusCode, codeOf(stale)]).toEqual([409, 'OFFER_NOT_PENDING']);
    expect(await offerStatus(old.id)).toBe('superseded');

    await answer(seller, conversation.id, latest.id, 'accept');
    const twice = await answer(seller, conversation.id, latest.id, 'decline');
    expect([twice.statusCode, codeOf(twice)]).toEqual([409, 'OFFER_NOT_PENDING']);
    expect(await offerStatus(latest.id)).toBe('accepted');
  });

  it('người mua tự chấp nhận đề nghị của mình → 403 OFFER_SELLER_ONLY', async () => {
    const { buyer, conversation } = await talking();
    const mine = await offered(buyer, conversation.id, 12_000_000);
    const res = await answer(buyer, conversation.id, mine.id, 'accept');
    expect([res.statusCode, codeOf(res)]).toEqual([403, 'OFFER_SELLER_ONLY']);
    expect(await offerStatus(mine.id)).toBe('pending');
  });

  it('tin đã bán khi đề nghị còn chờ → 409 LISTING_NOT_LIVE, đề nghị vẫn đang chờ', async () => {
    const { seller, buyer, listing, conversation } = await talking();
    const pending = await offered(buyer, conversation.id, 12_000_000);
    await setListing(listing.id, { state: 'sold' });
    const res = await answer(seller, conversation.id, pending.id, 'accept');
    expect([res.statusCode, codeOf(res)]).toEqual([409, 'LISTING_NOT_LIVE']);
    expect(await offerStatus(pending.id)).toBe('pending');
  });

  it('chấp nhận đúng lúc người mua trả giá mới: đề nghị cũ chỉ có một kết cục', async () => {
    const { seller, buyer, conversation } = await talking();
    const old = await offered(buyer, conversation.id, 11_000_000);
    const [accepted, again] = await Promise.all([
      answer(seller, conversation.id, old.id, 'accept'),
      offer(buyer, conversation.id, 11_800_000),
    ]);
    expect(again.statusCode).toBe(201);
    const status = await offerStatus(old.id);
    if (status === 'accepted') {
      expect(accepted.statusCode).toBe(200);
    } else {
      expect(status).toBe('superseded');
      expect([accepted.statusCode, codeOf(accepted)]).toEqual([409, 'OFFER_NOT_PENDING']);
    }
    expect(await pendingCount(conversation.id)).toBe(1);
  });

  it('mã của tin nhắn chữ, hay của đề nghị ở hội thoại khác → 404 NOT_FOUND', async () => {
    const { seller, buyer, conversation } = await talking(undefined);
    const text = await sent(app, buyer, conversation.id, 'Còn không?');
    const elsewhere = await talking(undefined, seller);
    const foreign = await offered(elsewhere.buyer, elsewhere.conversation.id, 12_000_000);
    const replies = await Promise.all(
      [text.id, foreign.id].map((id) => answer(seller, conversation.id, id, 'accept')),
    );
    expect(replies.map((res) => [res.statusCode, codeOf(res)])).toEqual([
      [404, 'NOT_FOUND'],
      [404, 'NOT_FOUND'],
    ]);
    expect(await offerStatus(foreign.id)).toBe('pending');
  });
});

describe('Chấp nhận chỉ là ghi nhận', () => {
  it('tin vẫn hiển thị với giá cũ, trên bảng tin; người mua khác vẫn trả giá được', async () => {
    const { seller, buyer, listing, conversation } = await talking();
    const accepted = await offered(buyer, conversation.id, 12_000_000);
    await answer(seller, conversation.id, accepted.id, 'accept');

    const detail = await listingApi(app, 'GET', `/listings/${listing.id}`, null);
    expect(detail.json().data).toMatchObject({ state: 'live', price: Number(PRICE) });
    const feed = await listingApi(app, 'GET', `/listings?categoryId=${listing.categoryId}`, null);
    expect((feed.json().data.items as { id: string }[]).map((item) => item.id)).toContain(
      listing.id,
    );

    const other = await newUser(app);
    const theirs = await opened(app, other, listing.id);
    expect((await offered(other, theirs.id, 11_000_000)).offer?.status).toBe('pending');
  });
});

describe('Trả giá theo luật của hội thoại', () => {
  it('người ngoài trả giá → 404 NOT_FOUND giống hệt mã hội thoại không tồn tại', async () => {
    const { conversation } = await talking();
    const stranger = await newUser(app);
    const real = await offer(stranger, conversation.id, 12_000_000);
    const missing = await offer(stranger, '01a1312e-959f-7011-aed7-98a4ad9322d8', 12_000_000);
    expect(real.statusCode).toBe(404);
    expect(real.json()).toEqual(missing.json());
  });

  it('người bán đã chặn người mua → người mua trả giá 403 MESSAGING_BLOCKED', async () => {
    const { seller, buyer, conversation } = await talking();
    await block(app, seller, buyer.id);
    const res = await offer(buyer, conversation.id, 12_000_000);
    expect([res.statusCode, codeOf(res)]).toEqual([403, 'MESSAGING_BLOCKED']);
    expect(await pendingCount(conversation.id)).toBe(0);
  });

  it('người mua chặn người bán khi có đề nghị chờ → người bán chấp nhận 403, đề nghị vẫn chờ', async () => {
    const { seller, buyer, conversation } = await talking();
    const pending = await offered(buyer, conversation.id, 12_000_000);
    await block(app, buyer, seller.id);
    const res = await answer(seller, conversation.id, pending.id, 'accept');
    expect([res.statusCode, codeOf(res)]).toEqual([403, 'MESSAGING_BLOCKED']);
    expect(await offerStatus(pending.id)).toBe('pending');
  });

  it('người bán đã xoá tài khoản → 409 CONVERSATION_CLOSED', async () => {
    const seller = await realUser();
    const { buyer, conversation } = await talking({}, seller);
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
    const res = await offer(buyer, conversation.id, 12_000_000);
    expect([res.statusCode, codeOf(res)]).toEqual([409, 'CONVERSATION_CLOSED']);
  });

  it('T0 hết lượt hội thoại mới vẫn trả giá trong hội thoại đã có', async () => {
    const { buyer, conversation } = await talking();
    const others = await Promise.all(
      Array.from({ length: 9 }, async () =>
        seedListing(liveListing((await newUser(app)).id, await seedCategory())),
      ),
    );
    await Promise.all(others.map((listing) => opened(app, buyer, listing.id)));
    const extra = await seedListing(liveListing((await newUser(app)).id, await seedCategory()));
    const refused = await api(app, 'POST', `/listings/${extra.id}/conversation`, buyer.token);
    expect(codeOf(refused)).toBe('NEW_CONVERSATION_LIMIT');
    expect((await offer(buyer, conversation.id, 12_000_000)).statusCode).toBe(201);
  });

  it('chỉ một đề nghị giá, bán sau 2 ngày → tin có người nhắn hỏi mua (tin sạch)', async () => {
    const seller = await newUser(app);
    const listing = await liveListingOf(app, seller, { negotiable: true });
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    await offered(buyer, conversation.id, 1_000_000);
    now = new Date(TEST_NOW.getTime() + 2 * DAY_MS);
    const sold = await listingApi(
      app,
      'POST',
      `/listings/${listing.id}/sold`,
      await signedInAt(app, seller, now),
      { version: listing.version },
    );
    expect(sold.statusCode, sold.body).toBe(200);
    await deliverAll(app);
    expect(
      await prisma.trustCleanListing.findMany({ where: { listingId: listing.id } }),
    ).toHaveLength(1);
  });
});
