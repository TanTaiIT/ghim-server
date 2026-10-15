import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { applyHideEvent } from '../src/modules/listing/calc/hide.calc.js';
import { BATCH_SIZE, createListingRepository } from '../src/modules/listing/listing.repository.js';
import { outboxEvents, prisma, truncateAll } from './db-helpers.js';
import { liveListing, seedCategory, seedGroup, seedListing } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/*
 * Repository `listing` trên Postgres thật (task 4.1): ghi có điều kiện theo trạng thái và phiên bản, cột mới tính từ
 * dòng đã khoá, lô của bên nghe ghi một câu cho cả lô, chạy lại không đổi gì; con trỏ phân trang không lặp không sót.
 */
const repo = createListingRepository(prisma);

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

async function world() {
  const { id: ownerId } = await seedAccount();
  const categoryId = await seedCategory();
  return { ownerId, categoryId };
}

describe('change — ghi có điều kiện', () => {
  it('đúng trạng thái và phiên bản: ghi, thêm lượt gửi, phát sự kiện trong cùng transaction', async () => {
    const { ownerId, categoryId } = await world();
    const listing = await seedListing(liveListing(ownerId, categoryId, { state: 'pending' }));
    const result = await repo.change({
      id: listing.id,
      states: ['pending'],
      version: 1,
      data: (locked) => ({
        title: `${locked.title} (sửa)`,
        version: locked.version + 1,
        state: 'checking',
      }),
      submission: { kind: 'resubmit', accountId: ownerId, fromVersion: 1, at: TEST_NOW },
      events: (updated) => [
        {
          type: 'listing.listing.edited',
          payload: { listingId: updated.id, version: updated.version },
        },
      ],
    });
    expect(result?.after).toMatchObject({
      title: 'Xe đạp cũ (sửa)',
      version: 2,
      state: 'checking',
    });
    expect(await repo.findSubmission(listing.id, 1)).toMatchObject({ kind: 'resubmit' });
    expect((await outboxEvents()).map((event) => event.type)).toEqual(['listing.listing.edited']);
  });

  it('lệch trạng thái, lệch phiên bản, tin đã xoá: không ghi gì, trả null', async () => {
    const { ownerId, categoryId } = await world();
    const live = await seedListing(liveListing(ownerId, categoryId));
    const deleted = await seedListing(liveListing(ownerId, categoryId, { deletedAt: TEST_NOW }));
    const write = (id: string, states: ('live' | 'pending')[], version?: number) =>
      repo.change({ id, states, version, data: () => ({ title: 'đổi' }) });
    expect(await write(live.id, ['pending'])).toBeNull();
    expect(await write(live.id, ['live'], 7)).toBeNull();
    expect(await write(deleted.id, ['live'])).toBeNull();
    expect(await write(randomUUID(), ['live'])).toBeNull();
    expect((await repo.findById(live.id))?.title).toBe('Xe đạp cũ');
  });

  it('bước `before` ném: cả lượt quay lui, kể cả lượt gửi và sự kiện', async () => {
    const { ownerId, categoryId } = await world();
    const listing = await seedListing(liveListing(ownerId, categoryId, { state: 'draft' }));
    await expect(
      repo.change({
        id: listing.id,
        states: ['draft'],
        before: async () => {
          throw new Error('hạn mức đã đủ');
        },
        data: () => ({ state: 'checking' }),
        submission: { kind: 'submit', accountId: ownerId, fromVersion: 1, at: TEST_NOW },
      }),
    ).rejects.toThrow('hạn mức');
    expect((await repo.findById(listing.id))?.state).toBe('draft');
    expect(await repo.findSubmission(listing.id, 1)).toBeNull();
  });
});

describe('applyBatch — bên nghe theo lô', () => {
  it(`${BATCH_SIZE * 2 + 200} tin: đặt đủ lý do bằng vài câu, chạy lại không đổi gì, gỡ đủ`, async () => {
    const { ownerId, categoryId } = await world();
    const groupId = await seedGroup();
    const total = BATCH_SIZE * 2 + 200;
    await prisma.listing.createMany({
      data: Array.from({ length: total }, () =>
        liveListing(ownerId, categoryId, { placement: 'members_only', groupId }),
      ),
    });
    const lock = (kind: 'group_locked' | 'group_unlocked') =>
      repo.applyBatch({
        where: { groupId, deletedAt: null },
        at: TEST_NOW,
        compute: (rows) =>
          rows.flatMap((row) => {
            const change = applyHideEvent(row, { kind });
            return change ? [{ ...row, hideReasons: change.hideReasons }] : [];
          }),
        events: (changed) => [
          {
            type: 'listing.hidden.changed',
            payload: { groupId, count: changed.length, change: kind },
          },
        ],
      });

    expect(await lock('group_locked')).toBe(total);
    expect(await prisma.listing.count({ where: { hideReasons: { has: 'group_locked' } } })).toBe(
      total,
    );
    expect(await lock('group_locked')).toBe(0);
    expect(
      (await outboxEvents()).filter((event) => event.type === 'listing.hidden.changed'),
    ).toHaveLength(3);
    expect(await lock('group_unlocked')).toBe(total);
    expect(await prisma.listing.count({ where: { hideReasons: { isEmpty: true } } })).toBe(total);
  });

  it('ghi đủ mọi cột của lô: trạng thái, phiên bản, đồng hồ, nơi đăng, huy hiệu, đơn vị, mốc nhắc', async () => {
    const { ownerId, categoryId } = await world();
    const groupId = await seedGroup();
    const listing = await seedListing(
      liveListing(ownerId, categoryId, { badgeGroupId: groupId, restrictions: ['new_account'] }),
    );
    const remainder = 5n * 86_400_000n;
    await repo.applyBatch({
      where: { id: listing.id },
      at: TEST_NOW,
      compute: (rows) =>
        rows.map((row) => ({
          ...row,
          state: 'expired',
          version: row.version + 1,
          restrictions: [],
          badgeGroupId: null,
          expiresAt: null,
          clockRemainingMs: remainder,
          shownMs: 42n,
          shownSince: null,
          remindedFor: TEST_NOW,
        })),
    });
    expect(await repo.findById(listing.id)).toMatchObject({
      state: 'expired',
      version: 2,
      restrictions: [],
      badgeGroupId: null,
      expiresAt: null,
      clockRemainingMs: remainder,
      shownMs: 42n,
      shownSince: null,
      remindedFor: TEST_NOW,
    });
  });
});

const minutesAgo = (minutes: number) => new Date(TEST_NOW.getTime() - minutes * 60_000);

describe('list — phân trang con trỏ', () => {
  it('đi hết các trang theo first_live_at: không lặp, không sót, kể cả khi có tin mới chen lên đầu', async () => {
    const { ownerId, categoryId } = await world();
    const seeded = await Promise.all(
      [1, 2, 3, 4, 5].map((minutes) =>
        seedListing(liveListing(ownerId, categoryId, { firstLiveAt: minutesAgo(minutes) })),
      ),
    );
    const where = { state: 'live' as const };
    const first = await repo.list({ where, order: 'live', limit: 2 });
    expect(first).toHaveLength(3);
    const last = first[1];
    if (!last?.firstLiveAt) throw new Error('thiếu trang đầu');
    await seedListing(liveListing(ownerId, categoryId, { firstLiveAt: TEST_NOW }));
    const rest = await repo.list({
      where,
      order: 'live',
      cursor: { at: last.firstLiveAt, id: last.id },
      limit: 10,
    });
    const seen = [...first.slice(0, 2), ...rest].map((row) => row.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(new Set(seen)).toEqual(new Set(seeded.map((row) => row.id)));
  });
});

describe('countGroupPublic — đếm cho lượt đổi chế độ của nhóm', () => {
  it('chỉ tin "nhóm công khai" chưa xoá, khác nháp, chưa rời nhóm hẳn — mọi trạng thái khác đều tính', async () => {
    const { ownerId, categoryId } = await world();
    const groupId = await seedGroup();
    const inGroup = { placement: 'group_public' as const, groupId };
    await seedListing(liveListing(ownerId, categoryId, inGroup));
    await seedListing(liveListing(ownerId, categoryId, { ...inGroup, state: 'sold' }));
    await seedListing(liveListing(ownerId, categoryId, { ...inGroup, state: 'draft' }));
    await seedListing(liveListing(ownerId, categoryId, { ...inGroup, deletedAt: TEST_NOW }));
    await seedListing(
      liveListing(ownerId, categoryId, { ...inGroup, hideReasons: ['group_closed'] }),
    );
    await seedListing(
      liveListing(ownerId, categoryId, { ...inGroup, hideReasons: ['group_locked'] }),
    );
    await seedListing(liveListing(ownerId, categoryId, { placement: 'members_only', groupId }));
    expect(await prisma.$transaction((tx) => repo.countGroupPublic(tx, groupId))).toBe(3);
  });
});
