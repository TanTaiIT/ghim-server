import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/actor.js';
import { createOutboxDispatcher } from '../src/common/outbox/dispatcher.js';
import { createCategoryRepository } from '../src/modules/category/category.repository.js';
import { createCategoryService } from '../src/modules/category/category.service.js';
import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { registerPlatformListeners } from '../src/modules/platform/platform.events.js';
import { createPlatformRepository } from '../src/modules/platform/platform.repository.js';
import { createPlatformService } from '../src/modules/platform/platform.service.js';
import { prisma, truncateAll } from './db-helpers.js';
import { TEST_AUDIT } from './test-app.js';

/*
 * `platform` trên Postgres thật: phiên bản con số 1, "không ghi được nhật ký thì thay đổi không xảy
 * ra" (một transaction), và vòng khoá → treo đi qua outbox + bộ phát thật.
 */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const BROKEN_AUDIT = {
  actorId: 'khong-phai-uuid',
  actorRole: 'master' as const,
  action: 'test.audit.broken' as const,
  targetType: 'test',
  targetId: 'x',
};

const identityRepository = createIdentityRepository(prisma);
const platformRepository = createPlatformRepository(prisma);
const categoryService = createCategoryService({
  repository: createCategoryRepository(prisma),
  clock: () => NOW,
});
const platform = createPlatformService({
  repository: platformRepository,
  identity: {
    accountState: async (id) => {
      const row = await identityRepository.findAccountById(id);
      return row ? { role: row.role, status: row.status } : null;
    },
  },
  categories: categoryService,
  clock: () => NOW,
});

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

let seq = 0;
async function account(role: 'user' | 'master' = 'user') {
  seq += 1;
  const email = `tk${seq}@ghim.test`;
  return prisma.account.create({
    data: {
      email,
      emailNormalized: email,
      emailHash: `hash-${email}`,
      passwordHash: 'x',
      displayName: `Người ${seq}`,
      status: 'active',
      role,
    },
  });
}

const actorOf = (id: string, role: 'user' | 'master' = 'master'): Actor => ({
  accountId: id,
  role,
  sessionId: 's',
  emailVerified: true,
});

describe('bảng con số', () => {
  it('hai lượt đổi cùng lúc từ phiên bản 1: đúng một lượt thành, bảng có hai phiên bản', async () => {
    const master = await account('master');
    await platform.ensureConfigVersion();
    const results = await Promise.allSettled([
      platform.changeConfig(actorOf(master.id), {
        baseVersion: 1,
        changes: { 'quota.liveListingsT0': 11 },
      }),
      platform.changeConfig(actorOf(master.id), {
        baseVersion: 1,
        changes: { 'quota.liveListingsT0': 12 },
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.configVersion.count()).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'platform.config.change' } })).toBe(1);
  });
});

describe('khởi động đồng thời', () => {
  it('hai tiến trình nạp bảng con số cùng lúc: đúng một phiên bản 1, không lượt nào ném', async () => {
    const results = await Promise.all([
      platform.ensureConfigVersion(),
      platform.ensureConfigVersion(),
    ]);
    expect(results.filter((result) => result !== null)).toEqual([
      { version: 1, addedKeys: expect.any(Number) },
    ]);
    expect(await prisma.configVersion.count()).toBe(1);
  });

  it('phiên bản hiện hành thiếu khoá của sổ đăng ký: hai tiến trình cùng bổ sung → đúng một phiên bản 2', async () => {
    await prisma.configVersion.create({
      data: {
        version: 1,
        values: { 'quota.liveListingsT0': 10 },
        createdBy: '00000000-0000-0000-0000-000000000000',
      },
    });
    const results = await Promise.all([
      platform.ensureConfigVersion(),
      platform.ensureConfigVersion(),
    ]);
    expect(results.filter((result) => result !== null)).toHaveLength(1);
    const v2 = await prisma.configVersion.findUniqueOrThrow({ where: { version: 2 } });
    expect(v2.values).toMatchObject({
      'quota.liveListingsT0': 10,
      'group.applicationExpiresDays': 21,
    });
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe('không ghi được nhật ký thì thay đổi không xảy ra', () => {
  it('gắn quyền staff: nhật ký hỏng → không có quyền, không có grant', async () => {
    const master = await account('master');
    const hung = await account();
    const phone = await categoryService.create(actorOf(master.id), {
      name: 'Điện thoại',
      priceCap: null,
      referencePrice: null,
      riskLevel: 'low',
      alwaysManual: false,
      groupReview: 'group',
    });

    await expect(
      platformRepository.upsertStaff({
        accountId: hung.id,
        scopes: ['support'],
        categoryIds: [phone.id],
        grantedBy: master.id,
        at: NOW,
        audit: BROKEN_AUDIT,
      }),
    ).rejects.toThrow();
    expect(await prisma.staffPermission.count()).toBe(0);
    expect(await prisma.staffCategoryGrant.count()).toBe(0);
  });

  it('khoá tài khoản: nhật ký hỏng → tài khoản vẫn hoạt động, không có sự kiện outbox', async () => {
    const master = await account('master');
    const user = await account();
    await expect(
      identityRepository.lockAccount({
        accountId: user.id,
        reason: 'Thử',
        lockedBy: master.id,
        at: NOW,
        events: [{ type: 'identity.account.locked', payload: { accountId: user.id } }],
        audit: BROKEN_AUDIT,
      }),
    ).rejects.toThrow();
    expect((await prisma.account.findUniqueOrThrow({ where: { id: user.id } })).status).toBe(
      'active',
    );
    expect(await prisma.outboxEvent.count()).toBe(0);
  });
});

describe('xoá tài khoản → thu quyền qua outbox', () => {
  it('xoá mềm tài khoản staff: bộ phát thật thu quyền và grant theo danh mục', async () => {
    const master = await account('master');
    const hung = await account();
    const phone = await categoryService.create(actorOf(master.id), {
      name: 'Điện thoại',
      priceCap: null,
      referencePrice: null,
      riskLevel: 'low',
      alwaysManual: false,
      groupReview: 'group',
    });
    await platform.grantStaff(actorOf(master.id), hung.id, { scopes: [], categoryIds: [phone.id] });
    const dispatcher = createOutboxDispatcher(prisma);
    registerPlatformListeners(dispatcher, platform);

    await identityRepository.softDeleteAccount({
      accountId: hung.id,
      at: NOW,
      events: [{ type: 'identity.account.deleted', payload: { accountId: hung.id } }],
    });
    // Hai sự kiện chờ: `platform.staff.changed` của lượt cấp quyền (add-review-queues) và lượt xoá tài khoản.
    expect(await dispatcher.runOnce()).toEqual({ published: 2, failed: 0 });

    expect(await prisma.staffPermission.count({ where: { accountId: hung.id } })).toBe(0);
    expect(await prisma.staffCategoryGrant.count({ where: { accountId: hung.id } })).toBe(0);
  });
});

describe('tra nhật ký', () => {
  it('lọc theo người làm, đối tượng, khoảng thời gian; xếp theo thời gian', async () => {
    const master = await account('master');
    const [a, b] = await Promise.all([account(), account()]);
    const entry = (targetId: string, action: string, createdAt: Date) => ({
      actorId: master.id,
      actorRole: 'master' as const,
      action,
      targetType: 'account',
      targetId,
      createdAt,
    });
    await prisma.auditLog.createMany({
      data: [
        entry(a.id, 'identity.account.lock', new Date('2026-10-01T00:00:00Z')),
        entry(b.id, 'identity.account.lock', new Date('2026-10-02T00:00:00Z')),
        entry(a.id, 'identity.account.unlock', new Date('2026-10-03T00:00:00Z')),
      ],
    });

    const byTarget = await platform.queryAudit({
      targetType: 'account',
      targetId: a.id,
      page: 1,
      limit: 20,
    });
    expect(byTarget.items.map((row) => row.action)).toEqual([
      'identity.account.lock',
      'identity.account.unlock',
    ]);

    const window = await platform.queryAudit({
      from: '2026-10-02T00:00:00.000Z',
      to: '2026-10-02T23:59:59.000Z',
      page: 1,
      limit: 20,
    });
    expect(window.items.map((row) => row.targetId)).toEqual([b.id]);
    expect((await platform.queryAudit({ actorId: master.id, page: 1, limit: 2 })).total).toBe(3);
  });
});

describe('PlatformRepository', () => {
  it('phiên bản 1 chỉ nạp được khi bảng rỗng', async () => {
    expect(
      (await platformRepository.seedConfigVersion({ a: 1 }, TEST_AUDIT.actorId, NOW))?.version,
    ).toBe(1);
    expect(
      await platformRepository.seedConfigVersion({ a: 2 }, TEST_AUDIT.actorId, NOW),
    ).toBeNull();
  });

  it('phiên bản kế chỉ ghi từ phiên bản hiện hành; ghi từ phiên bản cũ trả null', async () => {
    await platformRepository.seedConfigVersion({ a: 1 }, TEST_AUDIT.actorId, NOW);
    const input = { values: { a: 2 }, note: null, createdBy: TEST_AUDIT.actorId, at: NOW };
    expect(
      await platformRepository.createConfigVersion({ ...input, baseVersion: 2, audit: null }),
    ).toBeNull();
    expect(
      (
        await platformRepository.createConfigVersion({
          ...input,
          baseVersion: 1,
          audit: TEST_AUDIT,
        })
      )?.version,
    ).toBe(2);
    expect(
      await platformRepository.createConfigVersion({ ...input, baseVersion: 1, audit: null }),
    ).toBeNull();
    expect((await platformRepository.findCurrentConfig())?.version).toBe(2);
  });

  it('gắn quyền thay cả gói; treo một lần; thu quyền không có trả false', async () => {
    const accountId = (await account()).id;
    const grant = (scopes: Array<'support' | 'user_reports'>) =>
      platformRepository.upsertStaff({
        accountId,
        scopes,
        categoryIds: [],
        grantedBy: TEST_AUDIT.actorId,
        at: NOW,
        audit: TEST_AUDIT,
      });
    expect(await platformRepository.findStaffGrant(accountId)).toBeNull();
    await grant(['support']);
    await grant(['user_reports']);
    expect((await platformRepository.findStaff(accountId))?.scopes).toEqual(['user_reports']);
    expect(await platformRepository.findStaffGrant(accountId)).toEqual({
      status: 'active',
      scopes: ['user_reports'],
      categoryIds: [],
    });

    const suspend = () => platformRepository.suspendStaff({ accountId, reason: 'khoá', at: NOW });
    expect(await suspend()).toBe(true);
    expect(await suspend()).toBe(false);
    expect((await platformRepository.findStaff(accountId))?.status).toBe('suspended');
    expect((await platformRepository.findStaffGrant(accountId))?.status).toBe('suspended');

    expect(await platformRepository.removeStaff(accountId)).toBe(true);
    expect(await platformRepository.removeStaff(accountId)).toBe(false);
    await grant(['support']);
    expect(await platformRepository.revokeStaff({ accountId, at: NOW, audit: TEST_AUDIT })).toBe(
      true,
    );
    expect(await platformRepository.revokeStaff({ accountId, at: NOW, audit: TEST_AUDIT })).toBe(
      false,
    );
  });
});
