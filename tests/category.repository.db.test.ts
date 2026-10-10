import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/actor.js';
import { createCategoryRepository } from '../src/modules/category/category.repository.js';
import { createCategoryService } from '../src/modules/category/category.service.js';
import { prisma, truncateAll } from './db-helpers.js';

/* `category` trên Postgres thật: nạp khu vực + tìm bằng `search_text`, phiên bản cài đặt và mẫu. */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const repository = createCategoryRepository(prisma);
const service = createCategoryService({ repository, clock: () => NOW });

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

async function masterActor(): Promise<Actor> {
  const row = await prisma.account.create({
    data: {
      email: 'master@ghim.test',
      emailNormalized: 'master@ghim.test',
      emailHash: 'h',
      passwordHash: 'x',
      displayName: 'Master',
      status: 'active',
      role: 'master',
    },
  });
  return {
    accountId: row.id,
    role: 'master',
    sessionId: 's',
    secondFactorAt: NOW,
    emailVerified: true,
  };
}

const DEFAULTS = {
  priceCap: null,
  referencePrice: null,
  riskLevel: 'low' as const,
  alwaysManual: false,
  groupReview: 'group' as const,
};

describe('khu vực', () => {
  it('nạp regions.json một lượt: 34 tỉnh, 3.321 phường; nạp lần hai không thêm gì', async () => {
    expect(await service.seedRegionsIfEmpty()).toEqual({ provinces: 34, wards: 3321 });
    expect(await service.seedRegionsIfEmpty()).toEqual({ provinces: 0, wards: 0 });
    expect(await prisma.ward.count()).toBe(3321);
  });

  it('tìm "binh duong" ra Hồ Chí Minh; phường ghi rõ tỉnh chứa; không khớp thì rỗng', async () => {
    await service.seedRegionsIfEmpty();
    expect(await service.searchRegions('binh duong')).toContainEqual(
      expect.objectContaining({ kind: 'province', name: 'Hồ Chí Minh' }),
    );
    expect(await service.searchRegions('Bến Thành')).toContainEqual(
      expect.objectContaining({
        kind: 'ward',
        name: 'Phường Bến Thành',
        provinceName: 'Hồ Chí Minh',
      }),
    );
    expect(await service.searchRegions('zzqqxx')).toEqual([]);
  });

  it('tên cũ chia cho hai phường → tìm ra cả hai', async () => {
    await repository.seedRegions({
      provinces: [{ code: 1, name: 'Thử', fullName: 'Tỉnh Thử', formerNames: [], aliases: [] }],
      wards: [
        { code: 10, provinceCode: 1, name: 'Phường Mới A', formerNames: ['Phường Cũ Đông Hoà'] },
        { code: 11, provinceCode: 1, name: 'Phường Mới B', formerNames: ['Phường Cũ Đông Hoà'] },
      ],
    });
    expect((await service.searchRegions('dong hoa')).map((hit) => hit.name)).toEqual([
      'Phường Mới A',
      'Phường Mới B',
    ]);
  });
});

const draftAudit = (id: string) => ({
  actorId: '00000000-0000-7000-8000-00000000000a',
  actorRole: 'master' as const,
  action: 'category.template.save_draft' as const,
  targetType: 'category',
  targetId: id,
});

describe('cuộc đua trên bản nháp mẫu', () => {
  it('hai lượt lưu cùng lúc từ nháp số 1: đúng một lượt ghi được', async () => {
    const master = await masterActor();
    const phone = await service.create(master, { name: 'Điện thoại', ...DEFAULTS });
    const hang = { name: 'hang', label: 'Hãng', type: 'text' as const, required: true };
    await service.saveDraft(master, phone.id, { baseDraftVersion: 0, fields: [hang] });

    const save = (label: string) =>
      repository.saveDraft({
        id: phone.id,
        baseDraftVersion: 1,
        fields: [{ ...hang, label }],
        updatedBy: master.accountId,
        at: NOW,
        audit: { ...draftAudit(phone.id), actorId: master.accountId },
      });
    const results = await Promise.all([save('A'), save('B')]);

    expect(results.filter((row) => row !== null)).toHaveLength(1);
    expect(
      (await prisma.templateDraft.findUniqueOrThrow({ where: { categoryId: phone.id } }))
        .draftVersion,
    ).toBe(2);
  });

  it('phát hành với số nháp cũ: không ghi gì, nháp mới còn nguyên', async () => {
    const master = await masterActor();
    const phone = await service.create(master, { name: 'Điện thoại', ...DEFAULTS });
    const hang = { name: 'hang', label: 'Hãng', type: 'text' as const, required: true };
    await service.saveDraft(master, phone.id, { baseDraftVersion: 0, fields: [hang] });
    await service.saveDraft(master, phone.id, { baseDraftVersion: 1, fields: [hang] });

    const row = await repository.publishTemplate({
      id: phone.id,
      version: 1,
      draftVersion: 1,
      fields: [hang],
      publishedBy: master.accountId,
      at: NOW,
      audit: {
        ...draftAudit(phone.id),
        actorId: master.accountId,
        action: 'category.template.publish',
      },
    });

    expect(row).toBeNull();
    expect(await prisma.templateVersion.count()).toBe(0);
    expect(await prisma.templateDraft.count()).toBe(1);
  });
});

describe('danh mục', () => {
  it('cài đặt: phiên bản kế trong transaction, phiên bản cũ nguyên; bigint đi về nguyên vẹn', async () => {
    const master = await masterActor();
    const phone = await service.create(master, {
      name: 'Điện thoại',
      ...DEFAULTS,
      priceCap: 60_000_000n,
    });
    await service.updateSettings(master, phone.id, { ...DEFAULTS, priceCap: 70_000_000n });
    const v3 = await service.updateSettings(master, phone.id, {
      ...DEFAULTS,
      priceCap: 80_000_000n,
    });

    expect(v3.settings).toMatchObject({ version: 3, priceCap: 80_000_000n });
    expect((await service.getSettingsVersion(phone.id, 2)).priceCap).toBe(70_000_000n);
    expect(await prisma.auditLog.count({ where: { targetId: phone.id } })).toBe(3);
  });

  it('mẫu: nháp khoá lạc quan, phát hành tạo phiên bản và xoá nháp, phiên bản cũ đọc lại được', async () => {
    const master = await masterActor();
    const phone = await service.create(master, { name: 'Điện thoại', ...DEFAULTS });
    const hang = { name: 'hang', label: 'Hãng', type: 'text' as const, required: true };

    await service.saveDraft(master, phone.id, { baseDraftVersion: 0, fields: [hang] });
    await expect(
      service.saveDraft(master, phone.id, { baseDraftVersion: 0, fields: [] }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

    await service.publish(master, phone.id);
    expect(await prisma.templateDraft.count()).toBe(0);
    await service.saveDraft(master, phone.id, {
      baseDraftVersion: 0,
      fields: [{ ...hang, label: 'Thương hiệu' }],
    });
    await service.publish(master, phone.id);

    expect((await service.currentTemplate(phone.id)).fields[0]?.label).toBe('Thương hiệu');
    expect((await service.templateVersion(phone.id, 1)).fields[0]?.label).toBe('Hãng');
    expect(
      (await prisma.category.findUniqueOrThrow({ where: { id: phone.id } })).templateVersion,
    ).toBe(2);
  });
});
