import { randomUUID } from 'node:crypto';

import type { Listing, Prisma } from '@prisma/client';

import { prisma } from './db-helpers.js';
import { liveListing, seedListing } from './listing-helpers.js';
import { TEST_NOW } from './test-app.js';

/* Dựng nhanh cho test hạn lưu (add-data-retention): dòng ở DB ghi mốc TEST_NOW, test đẩy đồng hồ app tới trước. */
export const DAY_MS = 86_400_000;
export const YEAR_MS = 365 * DAY_MS;
export const day = (n: number): Date => new Date(TEST_NOW.getTime() + n * DAY_MS);

/** Nháp: không đồng hồ, không nơi đăng (CHECK `listings_clock_started_check`). */
export const draftOf = (
  ownerId: string,
  categoryId: string,
  overrides: Partial<Prisma.ListingUncheckedCreateInput> = {},
): Promise<Listing> =>
  seedListing({
    ownerId,
    state: 'draft',
    categoryId,
    title: 'Nháp bỏ dở',
    updatedAt: TEST_NOW,
    ...overrides,
  });

/** Tin đã qua duyệt rồi dừng (từ chối, gỡ): từng lên bảng, đồng hồ dừng. */
export const stoppedOf = (
  ownerId: string,
  categoryId: string,
  overrides: Partial<Prisma.ListingUncheckedCreateInput> = {},
): Promise<Listing> =>
  seedListing(
    liveListing(ownerId, categoryId, {
      expiresAt: null,
      clockRemainingMs: 10n * BigInt(DAY_MS),
      shownSince: null,
      updatedAt: TEST_NOW,
      ...overrides,
    }),
  );

/** Tin đã bán / đã xoá mềm ở mốc TEST_NOW — `updated_at` là "lúc đánh dấu đã bán" của luật hạn lưu. */
export const agedOf = (
  ownerId: string,
  categoryId: string,
  overrides: Partial<Prisma.ListingUncheckedCreateInput> = {},
): Promise<Listing> =>
  seedListing(liveListing(ownerId, categoryId, { updatedAt: TEST_NOW, ...overrides }));

/** Ảnh đã xác nhận của một chủ, kèm dấu ảnh của `screening` — để thấy ảnh và dấu ảnh đi theo chủ khi xoá hẳn. */
export async function imageOf(
  owner: { kind: 'listing' | 'profile'; id: string },
  uploaderId: string,
): Promise<string> {
  const image = await prisma.image.create({
    data: {
      ownerKind: owner.kind,
      ownerId: owner.id,
      uploaderId,
      contentType: 'image/jpeg',
      byteSize: 1024,
      createdAt: TEST_NOW,
      uploadedAt: TEST_NOW,
      confirmedAt: TEST_NOW,
    },
  });
  await prisma.imageCheck.create({
    data: { imageId: image.id, ownerAccountId: uploaderId, status: 'pending' },
  });
  return image.id;
}

export const listingExists = async (id: string): Promise<boolean> =>
  (await prisma.listing.findUnique({ where: { id }, select: { id: true } })) !== null;

export const imageExists = async (id: string): Promise<boolean> =>
  (await prisma.image.findUnique({ where: { id }, select: { id: true } })) !== null;

export const imageCheckExists = async (id: string): Promise<boolean> =>
  (await prisma.imageCheck.findUnique({ where: { imageId: id } })) !== null;

export const conversationExists = async (id: string): Promise<boolean> =>
  (await prisma.conversation.findUnique({ where: { id }, select: { id: true } })) !== null;

/** Lượt máy đã kết luận, hai luật trúng — dữ liệu cho bước gộp thành số liệu. */
export const decidedRun = (
  accountId: string,
  overrides: Partial<Prisma.ScreeningRunUncheckedCreateInput> = {},
): Prisma.ScreeningRunUncheckedCreateInput => ({
  listingId: randomUUID(),
  listingVersion: 2,
  accountId,
  trigger: 'submission',
  startedAt: TEST_NOW,
  decidedAt: TEST_NOW,
  outcome: 'hold',
  cause: 'score',
  score: 70,
  band: 'high',
  tier: 'T0',
  textResult: {},
  imageIds: [],
  hits: [
    { code: 'price_low', weight: 40, mode: 'on' },
    { code: 'new_account', weight: 30, mode: 'on' },
  ],
  configVersion: 1,
  ruleVersion: 1,
  ...overrides,
});

export const noticeOf = (
  recipientId: string,
  at: Date,
): Prisma.NotificationUncheckedCreateInput => ({
  recipientId,
  category: 'your_listings',
  type: 'listing.expiry.reminder',
  title: 'Tin sắp hết hạn',
  body: 'Gia hạn để tin tiếp tục hiện.',
  data: {},
  alert: true,
  sourceEventId: randomUUID(),
  createdAt: at,
  updatedAt: at,
});
