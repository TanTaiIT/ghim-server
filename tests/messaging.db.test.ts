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
