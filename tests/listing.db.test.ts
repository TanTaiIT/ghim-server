import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';

/*
 * Ràng buộc chỉ DB trả lời được của migration `init_listing`: mỗi CHECK viết tay (23514), unique lượt gửi theo
 * phiên bản, unique "đã chuyển lên sàn chung", PK chặn gắn lại huy hiệu, và các khoá ngoại. Ghi thẳng bằng Prisma
 * những dòng repository không bao giờ tạo — design add-listings mục 19 dựa vào chính các ràng buộc này.
 */
const UNIQUE = 'P2002';
const FOREIGN_KEY = 'P2003';
const CHECK = '23514';
const NOW = new Date('2026-10-12T04:00:00.000Z');
const LATER = new Date('2026-11-11T04:00:00.000Z');
const IMAGE = '0199c3a0-0000-7000-8000-000000000001';

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

let seq = 0;

async function account() {
  seq += 1;
  const email = `tin${seq}@ghim.test`;
  return prisma.account.create({
    data: {
      email,
      emailNormalized: email,
      emailHash: `hash-${email}`,
      passwordHash: 'argon2id-gia',
      displayName: `Người thử ${seq}`,
      status: 'active',
    },
  });
}

async function world() {
  const owner = await account();
  const category = await prisma.category.create({
    data: { name: `Danh mục ${seq}`, createdBy: owner.id },
  });
  const group = await prisma.group.create({
    data: {
      name: `Nhóm ${seq}`,
      nameFolded: `NHOM ${seq}`,
      kind: 'school',
      mode: 'public_review',
      state: 'active',
      createdBy: owner.id,
    },
  });
  return { owner, category, group };
}

/** Một tin đang hiển thị trên sàn chung, đủ mọi trường — mỗi ca chỉ đổi đúng chỗ đang kiểm. */
function liveData(
  ownerId: string,
  categoryId: string,
  overrides: Partial<Prisma.ListingUncheckedCreateInput> = {},
): Prisma.ListingUncheckedCreateInput {
  return {
    ownerId,
    state: 'live',
    placement: 'marketplace',
    categoryId,
    title: 'Xe đạp cũ',
    price: 1_200_000n,
    imageIds: [IMAGE],
    firstLiveAt: NOW,
    expiresAt: LATER,
    shownSince: NOW,
    ...overrides,
  };
}

describe('listings — CHECK', () => {
  it('listings_arrays_check: mảng ảnh, lý do tạm ẩn, lý do hạn chế không được null', async () => {
    const { owner, category } = await world();
    const listing = await prisma.listing.create({ data: liveData(owner.id, category.id) });
    const states = await Promise.all(
      ['image_ids', 'hide_reasons', 'restrictions'].map((column) =>
        sqlStateOf(
          prisma.$executeRawUnsafe(
            `UPDATE listings SET ${column} = NULL WHERE id = $1::uuid`,
            listing.id,
          ),
        ),
      ),
    );
    expect(states).toEqual([CHECK, CHECK, CHECK]);
  });

  it('listings_version_check: phiên bản từ 1', async () => {
    const { owner, category } = await world();
    await expect(
      sqlStateOf(prisma.listing.create({ data: liveData(owner.id, category.id, { version: 0 }) })),
    ).resolves.toBe(CHECK);
  });

  it('listings_price_check: giá không âm, 0 là cho tặng', async () => {
    const { owner, category } = await world();
    await expect(
      sqlStateOf(prisma.listing.create({ data: liveData(owner.id, category.id, { price: -1n }) })),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(prisma.listing.create({ data: liveData(owner.id, category.id, { price: 0n }) })),
    ).resolves.toBeNull();
  });

  it('listings_placement_group_check: sàn chung không có nhóm, tin trong nhóm phải có nhóm', async () => {
    const { owner, category, group } = await world();
    await expect(
      sqlStateOf(
        prisma.listing.create({ data: liveData(owner.id, category.id, { groupId: group.id }) }),
      ),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, { placement: 'members_only' }),
        }),
      ),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, { placement: 'members_only', groupId: group.id }),
        }),
      ),
    ).resolves.toBeNull();
    // Nháp chưa chọn nơi đăng thì nhóm để trống hay đã chọn đều được.
    await expect(
      sqlStateOf(prisma.listing.create({ data: { ownerId: owner.id, groupId: group.id } })),
    ).resolves.toBeNull();
  });

  it('listings_submitted_check: rời nháp thì phải đủ nơi đăng, tiêu đề, giá, danh mục, ít nhất 1 ảnh', async () => {
    const { owner, category } = await world();
    const missing: Partial<Prisma.ListingUncheckedCreateInput>[] = [
      { placement: null },
      { title: null },
      { price: null },
      { categoryId: null },
      { imageIds: [] },
    ];
    const states = await Promise.all(
      missing.map((gap) =>
        sqlStateOf(prisma.listing.create({ data: liveData(owner.id, category.id, gap) })),
      ),
    );
    expect(states).toEqual(missing.map(() => CHECK));
    // Nháp lưu được khi còn thiếu (spec drafts).
    await expect(
      sqlStateOf(prisma.listing.create({ data: { ownerId: owner.id, title: 'Chỉ có tiêu đề' } })),
    ).resolves.toBeNull();
  });

  it('listings_badge_check: huy hiệu chỉ ở tin sàn chung', async () => {
    const { owner, category, group } = await world();
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, {
            placement: 'group_public',
            groupId: group.id,
            badgeGroupId: group.id,
          }),
        }),
      ),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, { badgeGroupId: group.id }),
        }),
      ),
    ).resolves.toBeNull();
  });

  it('listings_ward_check: có phường thì phải có tỉnh', async () => {
    const { owner, category } = await world();
    await prisma.province.create({
      data: {
        code: 79,
        name: 'Hồ Chí Minh',
        fullName: 'Thành phố Hồ Chí Minh',
        formerNames: [],
        aliases: [],
        searchText: 'ho chi minh',
      },
    });
    await prisma.ward.create({
      data: {
        code: 1,
        provinceCode: 79,
        name: 'Phường Bến Thành',
        formerNames: [],
        searchText: 'ben thanh',
      },
    });
    await expect(
      sqlStateOf(prisma.listing.create({ data: liveData(owner.id, category.id, { wardCode: 1 }) })),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, { provinceCode: 79, wardCode: 1 }),
        }),
      ),
    ).resolves.toBeNull();
  });

  it('listings_clock_check: đồng hồ hoặc đang chạy hoặc đang dừng, không cả hai', async () => {
    const { owner, category } = await world();
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, { clockRemainingMs: 86_400_000n }),
        }),
      ),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, { expiresAt: null, clockRemainingMs: 86_400_000n }),
        }),
      ),
    ).resolves.toBeNull();
  });

  it('listings_clock_started_check: chưa từng lên bảng thì không có đồng hồ, không có khoảng được thấy', async () => {
    const { owner, category } = await world();
    const neverLive = { state: 'checking', firstLiveAt: null } as const;
    const clocks = [
      { expiresAt: LATER, shownSince: null },
      { expiresAt: null, clockRemainingMs: 1n, shownSince: null },
      { expiresAt: null, shownSince: NOW },
    ];
    const states = await Promise.all(
      clocks.map((clock) =>
        sqlStateOf(
          prisma.listing.create({
            data: liveData(owner.id, category.id, { ...neverLive, ...clock }),
          }),
        ),
      ),
    );
    expect(states).toEqual(clocks.map(() => CHECK));
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, {
            ...neverLive,
            expiresAt: null,
            shownSince: null,
          }),
        }),
      ),
    ).resolves.toBeNull();
  });

  it('listings_shown_check: thời gian được thấy không âm', async () => {
    const { owner, category } = await world();
    await expect(
      sqlStateOf(
        prisma.listing.create({ data: liveData(owner.id, category.id, { shownMs: -1n }) }),
      ),
    ).resolves.toBe(CHECK);
  });

  it('listings_renewal_check: dấu gia hạn chỉ sống khi tin chưa lên bảng lại', async () => {
    const { owner, category } = await world();
    await expect(
      sqlStateOf(
        prisma.listing.create({ data: liveData(owner.id, category.id, { renewal: 'early' }) }),
      ),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, { state: 'checking', renewal: 'expired' }),
        }),
      ),
    ).resolves.toBeNull();
  });

  it('listings_fault_check: sai sót hay vi phạm chỉ ở tin bị từ chối, bị gỡ', async () => {
    const { owner, category } = await world();
    await expect(
      sqlStateOf(
        prisma.listing.create({ data: liveData(owner.id, category.id, { fault: 'mistake' }) }),
      ),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.listing.create({
          data: liveData(owner.id, category.id, {
            state: 'removed',
            fault: 'violation',
            expiresAt: null,
            clockRemainingMs: 86_400_000n,
            shownSince: null,
          }),
        }),
      ),
    ).resolves.toBeNull();
  });
});

describe('listings — unique, khoá ngoại', () => {
  it('mỗi tin chỉ chuyển lên sàn chung một lần', async () => {
    const { owner, category } = await world();
    const old = await prisma.listing.create({ data: liveData(owner.id, category.id) });
    await prisma.listing.create({
      data: liveData(owner.id, category.id, { movedFromListingId: old.id }),
    });
    await expect(
      prismaErrorCode(
        prisma.listing.create({
          data: liveData(owner.id, category.id, { movedFromListingId: old.id }),
        }),
      ),
    ).resolves.toBe(UNIQUE);
  });

  it('tin cũ bị xoá hẳn thì tin đã chuyển vẫn còn, chỉ mất dấu "chuyển từ đâu"', async () => {
    const { owner, category } = await world();
    const old = await prisma.listing.create({ data: liveData(owner.id, category.id) });
    const moved = await prisma.listing.create({
      data: liveData(owner.id, category.id, { movedFromListingId: old.id }),
    });
    await prisma.listing.delete({ where: { id: old.id } });
    await expect(
      prisma.listing.findUniqueOrThrow({ where: { id: moved.id } }),
    ).resolves.toMatchObject({ movedFromListingId: null });
  });

  it('nhóm, danh mục đang có tin thì không xoá được', async () => {
    const { owner, category, group } = await world();
    await prisma.listing.create({
      data: liveData(owner.id, category.id, { placement: 'members_only', groupId: group.id }),
    });
    await expect(prismaErrorCode(prisma.group.delete({ where: { id: group.id } }))).resolves.toBe(
      FOREIGN_KEY,
    );
    await expect(
      prismaErrorCode(prisma.category.delete({ where: { id: category.id } })),
    ).resolves.toBe(FOREIGN_KEY);
  });

  it('xoá hẳn tài khoản thì tin, lượt gửi đi theo', async () => {
    const { owner, category } = await world();
    const listing = await prisma.listing.create({ data: liveData(owner.id, category.id) });
    await prisma.listingSubmission.create({
      data: { listingId: listing.id, accountId: owner.id, kind: 'submit', fromVersion: 1, at: NOW },
    });
    await prisma.account.delete({ where: { id: owner.id } });
    await expect(prisma.listing.count()).resolves.toBe(0);
    await expect(prisma.listingSubmission.count()).resolves.toBe(0);
  });
});

describe('listing_submissions', () => {
  it('một phiên bản của tin chỉ gửi được một lần — chặn bấm Đăng hai lần', async () => {
    const { owner, category } = await world();
    const listing = await prisma.listing.create({ data: liveData(owner.id, category.id) });
    const row = {
      listingId: listing.id,
      accountId: owner.id,
      kind: 'submit',
      fromVersion: 1,
      at: NOW,
    } as const;
    await prisma.listingSubmission.create({ data: row });
    await expect(prismaErrorCode(prisma.listingSubmission.create({ data: row }))).resolves.toBe(
      UNIQUE,
    );
    await expect(
      prismaErrorCode(prisma.listingSubmission.create({ data: { ...row, fromVersion: 2 } })),
    ).resolves.toBeNull();
  });
});

describe('listing_badge_blocks', () => {
  it('nhóm gỡ huy hiệu khỏi một tin thì chỉ một dòng chặn cho cặp (tin, nhóm)', async () => {
    const { owner, category, group } = await world();
    const listing = await prisma.listing.create({ data: liveData(owner.id, category.id) });
    const block = { listingId: listing.id, groupId: group.id, removedBy: owner.id, removedAt: NOW };
    await prisma.listingBadgeBlock.create({ data: block });
    await expect(prismaErrorCode(prisma.listingBadgeBlock.create({ data: block }))).resolves.toBe(
      UNIQUE,
    );
  });
});
