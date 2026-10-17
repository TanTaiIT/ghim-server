import { randomUUID } from 'node:crypto';

import type { GroupMode, Listing, Prisma } from '@prisma/client';

import { fold } from '../src/common/text/fold.js';
import { prisma } from './db-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/**
 * Dữ liệu nền cho test tin đăng ở mức DB — ghi thẳng bằng Prisma, không qua route, để dựng nhanh mọi tổ hợp trạng thái,
 * nơi đăng, lý do tạm ẩn mà luồng thật phải đi nhiều bước mới tới. Luồng thật có test HTTP riêng.
 */
const DAY_MS = 86_400_000;
let seq = 0;

/** Tên duy nhất kể cả khi gọi song song (`Promise.all`): số lấy trước `await`, không đọc lại `seq` sau đó. */
const uniqueName = (prefix: string): string => {
  seq += 1;
  return `${prefix} ${seq}`;
};

/** Danh mục kèm phiên bản cài đặt 1 như bàn vận hành tạo — máy duyệt đọc cài đặt đó lúc chấm (`settingsOf`). */
export async function seedCategory(
  settings: Omit<
    Prisma.CategorySettingVersionUncheckedCreateInput,
    'categoryId' | 'version' | 'changedBy'
  > = {},
): Promise<string> {
  const name = uniqueName('Danh mục thử');
  const { id: createdBy } = await seedAccount();
  return (
    await prisma.category.create({
      data: {
        name,
        createdBy,
        settingVersions: { create: { version: 1, changedBy: createdBy, ...settings } },
      },
    })
  ).id;
}

export async function seedGroup(mode: GroupMode = 'public_review'): Promise<string> {
  const name = uniqueName('Nhóm thử');
  const { id: createdBy } = await seedAccount();
  return (
    await prisma.group.create({
      data: {
        name,
        nameFolded: fold(name),
        kind: 'school',
        mode,
        state: 'active',
        createdBy,
      },
    })
  ).id;
}

export async function seedMember(groupId: string, accountId: string): Promise<void> {
  await prisma.groupMember.create({
    data: { groupId, accountId, joinedVia: 'approved', joinedAt: TEST_NOW },
  });
}

/** Một tin đang hiển thị trên sàn chung, đủ mọi trường; mỗi ca chỉ đổi đúng chỗ đang kiểm. */
export function liveListing(
  ownerId: string,
  categoryId: string,
  overrides: Partial<Prisma.ListingUncheckedCreateInput> = {},
): Prisma.ListingUncheckedCreateInput {
  const merged: Prisma.ListingUncheckedCreateInput = {
    ownerId,
    state: 'live',
    placement: 'marketplace',
    categoryId,
    title: 'Xe đạp cũ',
    searchFolded: 'XE DAP CU',
    price: 1_200_000n,
    imageIds: [randomUUID()],
    firstLiveAt: TEST_NOW,
    expiresAt: new Date(TEST_NOW.getTime() + 30 * DAY_MS),
    shownSince: TEST_NOW,
    ...overrides,
  };
  // Vị trí đi cùng mốc lên bảng (CHECK `listings_rank_check`) — ca nào cố ý tách hai cột thì tự ghi `rankAt`.
  return { rankAt: merged.firstLiveAt ?? null, ...merged };
}

export const seedListing = (data: Prisma.ListingUncheckedCreateInput): Promise<Listing> =>
  prisma.listing.create({ data });
