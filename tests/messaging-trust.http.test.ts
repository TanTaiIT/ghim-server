import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import { deliverAll, newUser, type TestUser } from './group-helpers.js';
import { listingApi, liveListingOf, signedInAt } from './listing-http-helpers.js';
import { opened, sent } from './messaging-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Dữ kiện "có người nhắn hỏi mua" của tin sạch lối "đã bán" (spec trust/trust-tiers) với `messaging` thật nối vào cổng
 * `BuyerInterest` của `trust`: mở hội thoại chưa đủ, phải có tin nhắn; người mua dùng chung máy với người bán không tính.
 */
const DAY_MS = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.ready();
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const cleanRows = (listingId: string) =>
  prisma.trustCleanListing.findMany({ where: { listingId } });

/** Người bán đánh dấu đã bán ở ngày 3 — tin đã hiện hơn 2 ngày — rồi giao sự kiện cho `trust`. */
async function soldOnDay3(seller: TestUser, listing: { id: string; version: number }) {
  now = new Date(TEST_NOW.getTime() + 2 * DAY_MS);
  const res = await listingApi(
    app,
    'POST',
    `/listings/${listing.id}/sold`,
    await signedInAt(app, seller, now),
    { version: listing.version },
  );
  if (res.statusCode !== 200)
    throw new Error(`Đánh dấu đã bán hỏng: ${res.statusCode} ${res.body}`);
  await deliverAll(app);
}

describe('Tin đã bán thành tin sạch khi có người nhắn hỏi mua', () => {
  it('người mua đã nhắn một tin: bán sau 2 ngày → tin sạch qua lối "đã bán"', async () => {
    const seller = await newUser(app);
    const listing = await liveListingOf(app, seller);
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    await sent(app, buyer, conversation.id, 'Còn không bạn?');
    await soldOnDay3(seller, listing);
    expect(await cleanRows(listing.id)).toEqual([expect.objectContaining({ via: 'sold' })]);
  });

  it('chỉ mở hội thoại mà chưa nhắn gì: không là tin sạch', async () => {
    const seller = await newUser(app);
    const listing = await liveListingOf(app, seller);
    await opened(app, await newUser(app), listing.id);
    await soldOnDay3(seller, listing);
    expect(await cleanRows(listing.id)).toEqual([]);
  });

  it('người hỏi mua dùng chung máy với người bán (đã đăng tin từ cùng máy): không tính', async () => {
    const seller = await newUser(app);
    const listing = await liveListingOf(app, seller);
    const housemate = await newUser(app);
    // Cùng mã máy mặc định của test với người bán — hai người đã đăng tin từ một máy.
    await liveListingOf(app, housemate);
    await deliverAll(app);
    const conversation = await opened(app, housemate, listing.id);
    await sent(app, housemate, conversation.id, 'Để cho mình nhé');
    await soldOnDay3(seller, listing);
    expect(await cleanRows(listing.id)).toEqual([]);
  });
});
