import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createListingRepository } from '../src/modules/listing/listing.repository.js';
import { createTrustRepository, type TierWrite } from '../src/modules/trust/trust.repository.js';
import { prisma, truncateAll } from './db-helpers.js';
import { liveListing, seedCategory, seedGroup, seedListing } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';

/*
 * Repository của `trust` và cổng dữ kiện của `listing` trên Postgres thật (task 3.1, 4.1): ghi tin sạch một lần, void /
 * gỡ void, ghi mức có điều kiện, tập tài khoản tính lại hằng ngày; mỗi dòng bảng tranh chấp design mục 13 chạy hai
 * lượt song song.
 */
const NOW = new Date('2026-10-12T05:00:00.000Z');
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const trust = createTrustRepository(prisma);
const listings = createListingRepository(prisma);

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

const rowOf = (listingId: string) => prisma.trustCleanListing.findUnique({ where: { listingId } });
const write = (accountId: string, overrides: Partial<TierWrite> = {}): TierWrite => ({
  accountId,
  expectHash: null,
  fromTier: 'T0',
  tier: 'T1',
  countedClean: 1,
  factsHash: 'dau-1',
  configVersion: 1,
  at: NOW,
  ...overrides,
});

describe('Tin sạch: ghi một lần, void, gỡ void', () => {
  it('ghi lần hai cùng tin (lối khác) không đổi gì', async () => {
    const { id } = await seedAccount();
    const listingId = randomUUID();
    expect(await trust.addClean({ listingId, accountId: id, via: 'shown', at: NOW })).toBe(true);
    const later = new Date(NOW.getTime() + DAY_MS);
    expect(await trust.addClean({ listingId, accountId: id, via: 'sold', at: later })).toBe(false);
    expect(await rowOf(listingId)).toMatchObject({ via: 'shown', cleanAt: NOW });
  });

  it('void rồi gỡ void: tin thôi được tính rồi được tính lại với mốc cũ', async () => {
    const { id } = await seedAccount();
    const listingId = randomUUID();
    await trust.addClean({ listingId, accountId: id, via: 'shown', at: NOW });
    await trust.voidClean({ listingId, accountId: id, cause: 'violation', at: NOW });
    expect(await trust.validClean(id)).toEqual([]);
    await trust.unvoidClean(listingId, 'violation');
    expect(await trust.validClean(id)).toEqual([{ listingId, cleanAt: NOW }]);
  });

  it('gỡ void sai lý do không gỡ gì; dòng chỉ mang dấu void thì gỡ là xoá hẳn', async () => {
    const { id } = await seedAccount();
    const [voided, onlyVoid] = [randomUUID(), randomUUID()];
    await trust.addClean({ listingId: voided, accountId: id, via: 'shown', at: NOW });
    await trust.voidClean({ listingId: voided, accountId: id, cause: 'report', at: NOW });
    await trust.unvoidClean(voided, 'violation');
    expect((await rowOf(voided))?.voidCause).toBe('report');
    await trust.voidClean({ listingId: onlyVoid, accountId: id, cause: 'violation', at: NOW });
    await trust.unvoidClean(onlyVoid, 'violation');
    expect(await rowOf(onlyVoid)).toBeNull();
  });

  it('tin đã có dòng (sạch hay đang void) nằm trong tập đã biết', async () => {
    const { id } = await seedAccount();
    const [clean, voided, unknown] = [randomUUID(), randomUUID(), randomUUID()];
    await trust.addClean({ listingId: clean, accountId: id, via: 'shown', at: NOW });
    await trust.voidClean({ listingId: voided, accountId: id, cause: 'violation', at: NOW });
    expect(await trust.knownListings([clean, voided, unknown])).toEqual(new Set([clean, voided]));
  });
});

describe('Tranh chấp đồng thời (design mục 13)', () => {
  it('một tin vừa sạch theo lối 7 ngày vừa bán: đúng một dòng, đúng một lượt ghi được', async () => {
    const { id } = await seedAccount();
    const listingId = randomUUID();
    const results = await Promise.all([
      trust.addClean({ listingId, accountId: id, via: 'shown', at: NOW }),
      trust.addClean({ listingId, accountId: id, via: 'sold', at: NOW }),
    ]);
    expect(results.toSorted()).toEqual([false, true]);
    expect(await prisma.trustCleanListing.count({ where: { listingId } })).toBe(1);
  });

  it('gỡ vì vi phạm đua với lượt phát hiện sạch: thứ tự nào cũng ra một dòng vừa có mốc vừa bị void', async () => {
    const { id } = await seedAccount();
    const [a, b] = [randomUUID(), randomUUID()];
    await Promise.all([
      trust.voidClean({ listingId: a, accountId: id, cause: 'violation', at: NOW }),
      trust.addClean({ listingId: a, accountId: id, via: 'shown', at: NOW }),
    ]);
    await trust.addClean({ listingId: b, accountId: id, via: 'shown', at: NOW });
    await trust.voidClean({ listingId: b, accountId: id, cause: 'violation', at: NOW });
    const rows = await prisma.trustCleanListing.findMany({ where: { listingId: { in: [a, b] } } });
    expect(rows.map((row) => [row.cleanAt, row.voidCause])).toEqual([
      [NOW, 'violation'],
      [NOW, 'violation'],
    ]);
    expect(await trust.validClean(id)).toEqual([]);
  });

  it('hai lượt ghi mức cùng đọc một dấu: một lượt ghi được, lượt kia "stale"', async () => {
    const { id } = await seedAccount();
    expect(await trust.writeTier(write(id))).toBe('written');
    const results = await Promise.all([
      trust.writeTier(
        write(id, { expectHash: 'dau-1', fromTier: 'T1', tier: 'T2', factsHash: 'dau-2' }),
      ),
      trust.writeTier(
        write(id, { expectHash: 'dau-1', fromTier: 'T1', tier: 'T0', factsHash: 'dau-3' }),
      ),
    ]);
    expect(results.toSorted()).toEqual(['stale', 'written']);
    expect(await prisma.trustTierChange.count({ where: { accountId: id } })).toBe(2);
  });
});

describe('Ghi mức', () => {
  it('chưa có dòng: thêm; có rồi mà vẫn coi như chưa có: "stale"', async () => {
    const { id } = await seedAccount();
    expect(await trust.writeTier(write(id))).toBe('written');
    expect(await trust.writeTier(write(id))).toBe('stale');
  });

  it('mức đổi: ghi lịch sử và sự kiện cùng transaction; mức không đổi: chỉ cập nhật kết quả', async () => {
    const { id } = await seedAccount();
    await trust.writeTier(write(id));
    await trust.writeTier(
      write(id, {
        expectHash: 'dau-1',
        fromTier: 'T1',
        tier: 'T1',
        countedClean: 2,
        factsHash: 'dau-2',
      }),
    );
    expect(await prisma.trustTierChange.findMany({ where: { accountId: id } })).toEqual([
      expect.objectContaining({
        fromTier: 'T0',
        toTier: 'T1',
        configVersion: 1,
        factsHash: 'dau-1',
      }),
    ]);
    const events = await prisma.outboxEvent.findMany({ where: { type: 'trust.tier.changed' } });
    expect(events.map((event) => event.payload)).toEqual([
      { accountId: id, from: 'T0', to: 'T1', configVersion: 1 },
    ]);
    expect(await trust.findTier(id)).toMatchObject({
      tier: 'T1',
      countedClean: 2,
      factsHash: 'dau-2',
    });
  });
});

describe('Tài khoản lượt hằng ngày tính lại', () => {
  it('có tin sạch hay đã có kết quả, trừ T3 theo bảng con số hiện hành; theo trang', async () => {
    const [cleanOnly, t1, t3Current, t3Old, nothing] = await Promise.all([
      seedAccount(),
      seedAccount(),
      seedAccount(),
      seedAccount(),
      seedAccount(),
    ]);
    await trust.addClean({
      listingId: randomUUID(),
      accountId: cleanOnly.id,
      via: 'shown',
      at: NOW,
    });
    await trust.writeTier(write(t1.id));
    await trust.writeTier(write(t3Current.id, { tier: 'T3', configVersion: 2 }));
    await trust.writeTier(write(t3Old.id, { tier: 'T3', configVersion: 1 }));
    const all = await trust.recomputeCandidates({ configVersion: 2, after: null, take: 10 });
    expect(new Set(all)).toEqual(new Set([cleanOnly.id, t1.id, t3Old.id]));
    expect(all).not.toContain(nothing.id);
    const first = await trust.recomputeCandidates({ configVersion: 2, after: null, take: 2 });
    const rest = await trust.recomputeCandidates({
      configVersion: 2,
      after: first.at(-1) ?? null,
      take: 2,
    });
    expect([...first, ...rest]).toEqual(all);
  });
});

describe('Cổng dữ kiện của listing cho trust (task 3.1)', () => {
  it('tin sống: đang kiểm, chờ duyệt, đang hiển thị không tạm ẩn — không gồm nháp, tạm ẩn, đã xong, đã xoá', async () => {
    const owner = await seedAccount();
    const categoryId = await seedCategory();
    const groupId = await seedGroup();
    const live = (overrides = {}) => seedListing(liveListing(owner.id, categoryId, overrides));
    await Promise.all([
      live(),
      live({ placement: 'members_only', groupId }),
      live({ state: 'checking', firstLiveAt: null, expiresAt: null, shownSince: null }),
      live({ state: 'pending', firstLiveAt: null, expiresAt: null, shownSince: null }),
      live({ hideReasons: ['group_locked'] }),
      live({ state: 'sold', expiresAt: null, shownSince: null }),
      live({ state: 'expired', expiresAt: null, shownSince: null }),
      live({
        state: 'rejected',
        firstLiveAt: null,
        expiresAt: null,
        shownSince: null,
        fault: 'mistake',
      }),
      live({ deletedAt: NOW }),
      seedListing({ ownerId: owner.id, state: 'draft' }),
    ]);
    const facts = await listings.quotaFacts(null, {
      accountId: owner.id,
      since: new Date(NOW.getTime() - HOUR_MS),
      groupId,
    });
    expect(facts).toMatchObject({ live: 4, liveInGroup: 1 });
    const occupying = await prisma.$transaction((tx) => listings.occupying(tx, owner.id));
    expect(occupying.map((row) => row.state).toSorted()).toEqual([
      'checking',
      'live',
      'live',
      'pending',
    ]);
  });

  it('lượt gửi trong một giờ: chỉ lượt sau mốc, chỉ của người đó', async () => {
    const [owner, other] = [await seedAccount(), await seedAccount()];
    const listing = await seedListing({ ownerId: owner.id, state: 'draft' });
    const foreign = await seedListing({ ownerId: other.id, state: 'draft' });
    const at = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
    await prisma.listingSubmission.createMany({
      data: [
        { listingId: listing.id, accountId: owner.id, kind: 'submit', fromVersion: 1, at: at(70) },
        {
          listingId: listing.id,
          accountId: owner.id,
          kind: 'resubmit',
          fromVersion: 2,
          at: at(20),
        },
        { listingId: foreign.id, accountId: other.id, kind: 'submit', fromVersion: 1, at: at(5) },
      ],
    });
    const facts = await listings.quotaFacts(null, {
      accountId: owner.id,
      since: new Date(NOW.getTime() - HOUR_MS),
      groupId: null,
    });
    expect(facts).toEqual({ live: 0, submittedAt: [at(20)], liveInGroup: null });
  });

  it('tin đủ thời gian được thấy: khoảng đang mở cộng tại chỗ; khoảng đã đóng chỉ khi đóng gần đây', async () => {
    const owner = await seedAccount();
    const categoryId = await seedCategory();
    const sevenDays = 7 * DAY_MS;
    const openLongEnough = await seedListing(
      liveListing(owner.id, categoryId, {
        shownMs: 0n,
        shownSince: new Date(NOW.getTime() - sevenDays),
      }),
    );
    await seedListing(
      liveListing(owner.id, categoryId, {
        shownMs: 0n,
        shownSince: new Date(NOW.getTime() - DAY_MS),
      }),
    );
    const closedRecently = await seedListing(
      liveListing(owner.id, categoryId, {
        state: 'sold',
        shownMs: BigInt(sevenDays),
        shownSince: null,
      }),
    );
    const rows = await listings.shownCandidates({
      minShownMs: sevenDays,
      since: new Date(NOW.getTime() - 2 * DAY_MS),
      now: NOW,
    });
    expect(new Set(rows.map((row) => row.id))).toEqual(
      new Set([openLongEnough.id, closedRecently.id]),
    );
    const muchLater = new Date(NOW.getTime() + 30 * DAY_MS);
    const later = await listings.shownCandidates({
      minShownMs: sevenDays,
      since: new Date(muchLater.getTime() - 2 * DAY_MS),
      now: muchLater,
    });
    expect(later.map((row) => row.id)).not.toContain(closedRecently.id);
  });
});
