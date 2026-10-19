import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf } from './db-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/* Ràng buộc DB của design add-messaging mục 1: một tin một người mua một hội thoại; hai bên khác nhau; không tự chặn. */
const CHECK = '23514';

async function pair() {
  const [seller, buyer] = await Promise.all([seedAccount(), seedAccount()]);
  const listing = await seedListing(liveListing(seller.id, await seedCategory()));
  return { seller, buyer, listing };
}

const conversation = (listingId: string, sellerId: string, buyerId: string) =>
  prisma.conversation.create({
    data: { listingId, sellerId, buyerId, createdAt: TEST_NOW, lastActivityAt: TEST_NOW },
  });

describe('conversations', () => {
  it('cặp tin + người mua là unique — lượt thứ hai P2002', async () => {
    const { seller, buyer, listing } = await pair();
    await conversation(listing.id, seller.id, buyer.id);
    expect(await prismaErrorCode(conversation(listing.id, seller.id, buyer.id))).toBe('P2002');
  });

  it('hai bên phải là hai người: CHECK conversations_parties_check', async () => {
    const { seller, listing } = await pair();
    expect(await sqlStateOf(conversation(listing.id, seller.id, seller.id))).toBe(CHECK);
  });
});

/* Ràng buộc DB của design add-price-offers mục 1: tin nhắn chữ có chữ; đề nghị giá đúng hình; một đề nghị đang chờ. */
async function thread() {
  const { seller, buyer, listing } = await pair();
  return { buyer, row: await conversation(listing.id, seller.id, buyer.id) };
}
type Draft = {
  kind?: 'text' | 'offer';
  body?: string;
  offerAmount?: bigint | null;
  offerStatus?: 'pending' | 'accepted' | 'declined' | 'superseded' | null;
  offerRespondedAt?: Date | null;
};
const write = (conversationId: string, senderId: string, data: Draft) =>
  prisma.message.create({
    data: { conversationId, senderId, body: '', createdAt: TEST_NOW, ...data },
  });
const offer = (status: Draft['offerStatus'] = 'pending'): Draft => ({
  kind: 'offer',
  offerAmount: 12_000_000n,
  offerStatus: status,
});

describe('messages: tin nhắn chữ và đề nghị giá', () => {
  it('tin nhắn chữ rỗng, hay mang cột đề nghị: CHECK messages_kind_check', async () => {
    const { buyer, row } = await thread();
    expect(await sqlStateOf(write(row.id, buyer.id, { body: '' }))).toBe(CHECK);
    expect(await sqlStateOf(write(row.id, buyer.id, { body: 'Chào', offerAmount: 1n }))).toBe(
      CHECK,
    );
    await expect(write(row.id, buyer.id, { body: 'Chào' })).resolves.toMatchObject({
      kind: 'text',
    });
  });

  it('đề nghị thiếu số tiền, số tiền 0, có chữ, hay thiếu trạng thái: CHECK messages_kind_check', async () => {
    const { buyer, row } = await thread();
    const bad: Draft[] = [
      { ...offer(), offerAmount: null },
      { ...offer(), offerAmount: 0n },
      { ...offer(), body: 'Giá này' },
      { ...offer(), offerStatus: null },
    ];
    const states = await Promise.all(bad.map((data) => sqlStateOf(write(row.id, buyer.id, data))));
    expect(states).toEqual(bad.map(() => CHECK));
  });

  it('lúc trả lời có đúng khi đã chấp nhận / từ chối: CHECK messages_kind_check', async () => {
    const { buyer, row } = await thread();
    expect(await sqlStateOf(write(row.id, buyer.id, offer('accepted')))).toBe(CHECK);
    expect(
      await sqlStateOf(
        write(row.id, buyer.id, { ...offer('superseded'), offerRespondedAt: TEST_NOW }),
      ),
    ).toBe(CHECK);
    await expect(
      write(row.id, buyer.id, { ...offer('declined'), offerRespondedAt: TEST_NOW }),
    ).resolves.toMatchObject({ offerStatus: 'declined' });
  });

  it('hai đề nghị đang chờ cùng hội thoại: partial unique messages_one_pending_offer — P2002', async () => {
    const { buyer, row } = await thread();
    await write(row.id, buyer.id, offer());
    expect(await prismaErrorCode(write(row.id, buyer.id, offer()))).toBe('P2002');
    await expect(write(row.id, buyer.id, offer('superseded'))).resolves.toBeDefined();
  });
});

/* Ràng buộc DB của design add-team-conversations mục 1: mỗi loại hội thoại đúng hình; một hội thoại hỗ trợ mỗi người,
 * một hội thoại mỗi người + nhóm. Không khoá ngoại sang `groups`, nên mã nhóm ngẫu nhiên là đủ. */
const team = (data: Partial<Prisma.ConversationUncheckedCreateInput> & { buyerId: string }) =>
  prisma.conversation.create({ data: { createdAt: TEST_NOW, lastActivityAt: TEST_NOW, ...data } });

describe('conversations: ba loại hội thoại', () => {
  it('mỗi nhánh của CHECK conversations_kind_check chặn dòng sai loại', async () => {
    const { seller, buyer, listing } = await pair();
    const shapes: Omit<Prisma.ConversationUncheckedCreateInput, 'createdAt' | 'lastActivityAt'>[] =
      [
        { kind: 'listing', buyerId: buyer.id, sellerId: seller.id },
        {
          kind: 'listing',
          buyerId: buyer.id,
          sellerId: seller.id,
          listingId: listing.id,
          groupId: randomUUID(),
        },
        {
          kind: 'listing',
          buyerId: buyer.id,
          sellerId: seller.id,
          listingId: listing.id,
          teamPendingSince: TEST_NOW,
        },
        { kind: 'support', buyerId: buyer.id, listingId: listing.id },
        { kind: 'support', buyerId: buyer.id, sellerId: seller.id },
        { kind: 'support', buyerId: buyer.id, groupId: randomUUID() },
        { kind: 'group', buyerId: buyer.id },
        { kind: 'group', buyerId: buyer.id, groupId: randomUUID(), sellerId: seller.id },
      ];
    const bad = shapes.map((row) => ({ createdAt: TEST_NOW, lastActivityAt: TEST_NOW, ...row }));
    const states = await Promise.all(
      bad.map((data) => sqlStateOf(prisma.conversation.create({ data }))),
    );
    expect(states).toEqual(bad.map(() => CHECK));
  });

  it('hội thoại hỗ trợ thứ hai của cùng người: P2002; người khác thì được', async () => {
    const [one, two] = await Promise.all([seedAccount(), seedAccount()]);
    await team({ kind: 'support', buyerId: one.id, teamPendingSince: TEST_NOW });
    expect(await prismaErrorCode(team({ kind: 'support', buyerId: one.id }))).toBe('P2002');
    await expect(team({ kind: 'support', buyerId: two.id })).resolves.toMatchObject({
      kind: 'support',
    });
  });

  it('hai hội thoại cùng người + nhóm: P2002; nhóm khác thì được', async () => {
    const user = await seedAccount();
    const groupId = randomUUID();
    await team({ kind: 'group', buyerId: user.id, groupId });
    expect(await prismaErrorCode(team({ kind: 'group', buyerId: user.id, groupId }))).toBe('P2002');
    await expect(
      team({ kind: 'group', buyerId: user.id, groupId: randomUUID() }),
    ).resolves.toMatchObject({ kind: 'group' });
  });

  it('hội thoại về tin như trước vẫn hợp lệ, mặc định loại `listing`', async () => {
    const { seller, buyer, listing } = await pair();
    await expect(conversation(listing.id, seller.id, buyer.id)).resolves.toMatchObject({
      kind: 'listing',
      groupId: null,
      teamPendingSince: null,
    });
  });
});

describe('account_blocks', () => {
  it('không tự chặn mình: CHECK account_blocks_self_check', async () => {
    const me = await seedAccount();
    expect(
      await sqlStateOf(
        prisma.accountBlock.create({
          data: { blockerId: me.id, blockedId: me.id, createdAt: TEST_NOW },
        }),
      ),
    ).toBe(CHECK);
  });
});
