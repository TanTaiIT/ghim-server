import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';

/*
 * Ràng buộc chỉ DB trả lời được của `platform` và của `audit_log` dùng chung: CHECK treo quyền,
 * PK / FK của grant theo danh mục, phiên bản con số ≥ 1, và trigger chặn sửa / xoá nhật ký.
 */
const UNIQUE = 'P2002';
const FOREIGN_KEY = 'P2003';
const CHECK = '23514';
const RAISED = 'P0001';
const NOW = new Date('2026-10-10T04:00:00.000Z');

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

let seq = 0;
async function account() {
  seq += 1;
  const email = `tk${seq}@ghim.test`;
  return prisma.account.create({
    data: {
      email,
      emailNormalized: email,
      emailHash: `hash-${email}`,
      passwordHash: 'argon2id-gia',
      displayName: 'Người thử',
      status: 'active',
    },
  });
}

const category = (name: string, createdBy: string) =>
  prisma.category.create({ data: { name, createdBy } });

describe('staff_permissions', () => {
  it('CHECK: treo phải có cả mốc lẫn lý do; hoạt động thì không có', async () => {
    const { id } = await account();
    const base = { accountId: id, scopes: ['support' as const], grantedBy: id, grantedAt: NOW };
    await expect(
      sqlStateOf(prisma.staffPermission.create({ data: { ...base, status: 'suspended' } })),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.staffPermission.create({ data: { ...base, status: 'suspended', suspendedAt: NOW } }),
      ),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(prisma.staffPermission.create({ data: { ...base, suspendedAt: NOW } })),
    ).resolves.toBe(CHECK);
    await prisma.staffPermission.create({
      data: { ...base, status: 'suspended', suspendedAt: NOW, suspendedReason: 'Thử' },
    });
  });

  it('một dòng mỗi tài khoản; grant theo danh mục là PK (account, category) và FK tới categories', async () => {
    const { id } = await account();
    const data = { accountId: id, scopes: [], grantedBy: id, grantedAt: NOW };
    await prisma.staffPermission.create({ data });
    await expect(prismaErrorCode(prisma.staffPermission.create({ data }))).resolves.toBe(UNIQUE);

    const cat = await category('Điện thoại', id);
    await prisma.staffCategoryGrant.create({ data: { accountId: id, categoryId: cat.id } });
    await expect(
      prismaErrorCode(
        prisma.staffCategoryGrant.create({ data: { accountId: id, categoryId: cat.id } }),
      ),
    ).resolves.toBe(UNIQUE);
    await expect(
      prismaErrorCode(
        prisma.staffCategoryGrant.create({
          data: { accountId: id, categoryId: '00000000-0000-7000-8000-000000000000' },
        }),
      ),
    ).resolves.toBe(FOREIGN_KEY);
  });

  it('thu quyền (xoá dòng) kéo theo grant theo danh mục; xoá tài khoản kéo theo quyền', async () => {
    const { id } = await account();
    const cat = await category('Xe máy', id);
    await prisma.staffPermission.create({
      data: { accountId: id, scopes: [], grantedBy: id, grantedAt: NOW },
    });
    await prisma.staffCategoryGrant.create({ data: { accountId: id, categoryId: cat.id } });
    await prisma.staffPermission.delete({ where: { accountId: id } });
    expect(await prisma.staffCategoryGrant.count({ where: { accountId: id } })).toBe(0);
  });
});

describe('config_versions', () => {
  it('CHECK: phiên bản từ 1; khoá chính là số phiên bản', async () => {
    const { id } = await account();
    await expect(
      sqlStateOf(prisma.configVersion.create({ data: { version: 0, values: {}, createdBy: id } })),
    ).resolves.toBe(CHECK);
    await prisma.configVersion.create({ data: { version: 1, values: { a: 1 }, createdBy: id } });
    await expect(
      prismaErrorCode(
        prisma.configVersion.create({ data: { version: 1, values: {}, createdBy: id } }),
      ),
    ).resolves.toBe(UNIQUE);
  });
});

describe('audit_log', () => {
  it('ghi được; UPDATE và DELETE bị trigger từ chối', async () => {
    const { id } = await account();
    const row = await prisma.auditLog.create({
      data: {
        actorId: id,
        actorRole: 'master',
        action: 'identity.account.lock',
        targetType: 'account',
        targetId: id,
      },
    });
    await expect(
      sqlStateOf(prisma.auditLog.update({ where: { id: row.id }, data: { reason: 'sửa' } })),
    ).resolves.toBe(RAISED);
    await expect(sqlStateOf(prisma.auditLog.delete({ where: { id: row.id } }))).resolves.toBe(
      RAISED,
    );
    expect(await prisma.auditLog.count()).toBe(1);
  });
});

describe('outbox_events', () => {
  it('attempts mặc định 0, last_error trống', async () => {
    const event = await prisma.outboxEvent.create({ data: { type: 'x.y.z', payload: {} } });
    expect(event).toMatchObject({ attempts: 0, lastError: null, publishedAt: null });
  });
});
