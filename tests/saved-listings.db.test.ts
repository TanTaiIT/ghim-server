import { beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, truncateAll } from './db-helpers.js';
import { seedListing } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/*
 * Ràng buộc DB của `saved_listings` (design add-saved-listings mục 1): khoá chính một dòng mỗi cặp (người, tin), khoá ngoại
 * xoá theo khi tin bị xoá cứng (dọn dữ liệu) — hai điều chỉ DB trả lời được.
 */
beforeEach(truncateAll);

const pair = async () => {
  const owner = await seedAccount();
  const saver = await seedAccount();
  const listing = await seedListing({ ownerId: owner.id, state: 'draft' });
  return { saver, listing };
};

describe('saved_listings', () => {
  it('cùng cặp (người, tin) lần thứ hai → P2002', async () => {
    const { saver, listing } = await pair();
    const row = { accountId: saver.id, listingId: listing.id, savedAt: TEST_NOW };
    await prisma.savedListing.create({ data: row });
    expect(await prismaErrorCode(prisma.savedListing.create({ data: row }))).toBe('P2002');
  });

  it('tin bị xoá cứng kéo theo dòng lưu', async () => {
    const { saver, listing } = await pair();
    await prisma.savedListing.create({
      data: { accountId: saver.id, listingId: listing.id, savedAt: TEST_NOW },
    });
    await prisma.listing.delete({ where: { id: listing.id } });
    expect(await prisma.savedListing.count({ where: { accountId: saver.id } })).toBe(0);
  });
});
