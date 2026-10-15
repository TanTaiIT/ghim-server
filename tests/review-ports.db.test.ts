import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bandsOf, toStored } from '../src/modules/screening/calc/dhash.calc.js';
import { outboxEvents, prisma } from './db-helpers.js';
import { addMember, appointModerator, createActiveGroup } from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { buildTestApp, grantStaff, repositories, TEST_AUDIT, TEST_NOW } from './test-app.js';

/*
 * Cổng các module cài cho `review` (add-review-queues task 2.2, design mục 8): dùng chung máy, master, số tin sạch, lượt
 * máy gần nhất, ảnh trùng tính lại, chủ ảnh, người xử của nhóm, staff đang hoạt động theo danh mục, và sự kiện đổi quyền
 * staff của `platform`.
 */
const DAY_MS = 86_400_000;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const daysAgo = (days: number) => new Date(TEST_NOW.getTime() - days * DAY_MS);
const posted = (deviceHash: string, accountId: string, at: Date) =>
  prisma.devicePost.create({
    data: { deviceHash, accountId, firstPostedAt: at, lastPostedAt: at },
  });

const bandColumns = (hash: bigint) => {
  const bands = bandsOf(hash);
  const band = (index: number) => bands[index] ?? 0;
  return { band0: band(0), band1: band(1), band2: band(2), band3: band(3), band4: band(4) };
};
const checkedImage = (imageId: string, ownerAccountId: string, hash: bigint) =>
  prisma.imageCheck.create({
    data: {
      imageId,
      ownerAccountId,
      status: 'done',
      dhash: toStored(hash),
      ...bandColumns(hash),
      checkedAt: TEST_NOW,
    },
  });
const decidedRun = (listingId: string, accountId: string, imageIds: string[], hits: object[]) =>
  prisma.screeningRun.create({
    data: {
      listingId,
      listingVersion: 2,
      accountId,
      trigger: 'submission',
      startedAt: TEST_NOW,
      textResult: {},
      imageIds,
      decidedAt: TEST_NOW,
      outcome: 'hold',
      cause: 'gate',
      score: 40,
      band: 'medium',
      tier: 'T1',
      hits,
      configVersion: 1,
      ruleVersion: 1,
    },
  });

describe('identity', () => {
  it('sharedDeviceAccounts: tài khoản khác đã đăng tin từ cùng máy trong khung; không trả chính mình', async () => {
    const [a, b, old, other] = await Promise.all([
      seedAccount(),
      seedAccount(),
      seedAccount(),
      seedAccount(),
    ]);
    const device = `may-${randomUUID()}`;
    await posted(device, a.id, daysAgo(2));
    await posted(device, b.id, daysAgo(10));
    await posted(device, old.id, daysAgo(200));
    await posted(`may-${randomUUID()}`, other.id, daysAgo(1));
    expect(await app.modules.identity.sharedDeviceAccounts(a.id, daysAgo(180))).toEqual([b.id]);
  });

  it('masterIds: master đang hoạt động, không gồm master bị khoá', async () => {
    const active = await seedAccount({ role: 'master' });
    const locked = await seedAccount({ role: 'master', status: 'locked' });
    const ids = await app.modules.identity.masterIds();
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(locked.id);
  });
});

describe('trust', () => {
  it('cleanCount: chưa tính mức thì 0; đã tính thì số tin sạch đã đếm', async () => {
    const fresh = await seedAccount();
    const seller = await seedAccount();
    await prisma.trustTierResult.create({
      data: {
        accountId: seller.id,
        tier: 'T2',
        countedClean: 4,
        factsHash: 'h',
        configVersion: 1,
        computedAt: TEST_NOW,
      },
    });
    expect(await app.modules.trust.cleanCount(fresh.id)).toBe(0);
    expect(await app.modules.trust.cleanCount(seller.id)).toBe(4);
  });
});

describe('screening', () => {
  it('runOf: lượt đã kết luận gần nhất, chỉ mã luật đang bật; chưa có lượt thì null', async () => {
    const owner = await seedAccount();
    const listingId = randomUUID();
    await decidedRun(
      listingId,
      owner.id,
      [],
      [
        { code: 'off_platform_contact', weight: 20, mode: 'on' },
        { code: 'burst', weight: 10, mode: 'trial' },
      ],
    );
    expect(await app.modules.screening.runOf(listingId)).toEqual({
      listingVersion: 2,
      outcome: 'hold',
      cause: 'gate',
      score: 40,
      band: 'medium',
      tier: 'T1',
      hits: ['off_platform_contact'],
    });
    expect(await app.modules.screening.runOf(randomUUID())).toBeNull();
  });

  it('duplicateMatches: ảnh gần như giống hệt của tài khoản khác; ảnh trong danh sách trắng thì không', async () => {
    const [mine, theirs] = await Promise.all([seedAccount(), seedAccount()]);
    const hash = 0x0123_4567_89ab_cdefn;
    const [ownImage, matchImage] = [randomUUID(), randomUUID()];
    await checkedImage(ownImage, mine.id, hash);
    await checkedImage(matchImage, theirs.id, hash ^ 0b11n);
    const listingId = randomUUID();
    await decidedRun(listingId, mine.id, [ownImage], []);
    expect(await app.modules.screening.duplicateMatches(listingId)).toEqual([
      { imageId: ownImage, matchImageId: matchImage, accountId: theirs.id },
    ]);
    await prisma.imageWhitelistEntry.create({
      data: {
        dhash: toStored(hash),
        ...bandColumns(hash),
        sourceImageId: matchImage,
        addedBy: theirs.id,
        addedAt: TEST_NOW,
      },
    });
    expect(await app.modules.screening.duplicateMatches(listingId)).toEqual([]);
  });
});

describe('media', () => {
  it('ownersOf: chủ của từng ảnh', async () => {
    const uploader = await seedAccount();
    const listingId = randomUUID();
    const image = await prisma.image.create({
      data: {
        ownerKind: 'listing',
        ownerId: listingId,
        uploaderId: uploader.id,
        contentType: 'image/jpeg',
        byteSize: 10,
        createdAt: TEST_NOW,
      },
    });
    expect(await app.modules.media.ownersOf([image.id, randomUUID()])).toEqual(
      new Map([[image.id, { kind: 'listing', id: listingId }]]),
    );
  });
});

describe('group', () => {
  it('reviewersOf: nhóm còn cho điều hành, chủ nhóm, điều hành viên kèm phạm vi', async () => {
    const group = await createActiveGroup(app);
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator, null);
    expect(await app.modules.group.reviewersOf(group.groupId)).toEqual({
      moderationAllowed: true,
      ownerId: group.owner.id,
      moderators: [{ accountId: moderator.id, unitId: null }],
    });
    expect(await app.modules.group.reviewersOf(randomUUID())).toBeNull();
  });
});

describe('platform', () => {
  it('activeStaffByCategory: staff được giao danh mục, không gồm staff bị treo', async () => {
    const category = await seedCategory();
    const [active, suspended] = await Promise.all([seedAccount(), seedAccount()]);
    await grantStaff(active.id, [], [category]);
    await grantStaff(suspended.id, [], [category]);
    await repositories.platform.suspendStaff({
      accountId: suspended.id,
      reason: 'thử',
      at: TEST_NOW,
    });
    expect(await app.modules.platform.activeStaffByCategory([category])).toEqual(
      new Map([[category, [active.id]]]),
    );
  });

  it('cấp, treo, gỡ treo, thu quyền staff đều phát platform.staff.changed', async () => {
    const staff = await seedAccount();
    const changed = async () =>
      (await outboxEvents()).filter(
        (event) =>
          event.type === 'platform.staff.changed' &&
          (event.payload as { accountId: string }).accountId === staff.id,
      ).length;
    await grantStaff(staff.id, ['support'], []);
    await repositories.platform.suspendStaff({ accountId: staff.id, reason: 'thử', at: TEST_NOW });
    await repositories.platform.restoreStaff({
      accountId: staff.id,
      at: TEST_NOW,
      audit: TEST_AUDIT,
    });
    await repositories.platform.revokeStaff({
      accountId: staff.id,
      at: TEST_NOW,
      audit: TEST_AUDIT,
    });
    expect(await changed()).toBe(4);
  });
});
