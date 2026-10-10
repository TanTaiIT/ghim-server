import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';

/* Ràng buộc chỉ DB trả lời được của `category`: unique tên, PK phiên bản, CHECK giá, FK khu vực. */
const UNIQUE = 'P2002';
const FOREIGN_KEY = 'P2003';
const CHECK = '23514';
const NOW = new Date('2026-10-10T04:00:00.000Z');

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

let seq = 0;
async function master() {
  seq += 1;
  const email = `master${seq}@ghim.test`;
  return prisma.account.create({
    data: {
      email,
      emailNormalized: email,
      emailHash: 'h',
      passwordHash: 'x',
      displayName: 'Master',
      status: 'active',
      role: 'master',
    },
  });
}

describe('categories', () => {
  it('tên unique; settings_version từ 1; template_version null hoặc từ 1', async () => {
    const { id } = await master();
    await prisma.category.create({ data: { name: 'Điện thoại', createdBy: id } });
    await expect(
      prismaErrorCode(prisma.category.create({ data: { name: 'Điện thoại', createdBy: id } })),
    ).resolves.toBe(UNIQUE);
    await expect(
      sqlStateOf(
        prisma.category.create({ data: { name: 'A', createdBy: id, settingsVersion: 0 } }),
      ),
    ).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(
        prisma.category.create({ data: { name: 'B', createdBy: id, templateVersion: 0 } }),
      ),
    ).resolves.toBe(CHECK);
    await prisma.category.create({ data: { name: 'C', createdBy: id, templateVersion: null } });
  });
});

const settings = async (patch: {
  priceCap?: bigint | null;
  referencePrice?: bigint | null;
  version?: number;
}) => {
  const { id } = await master();
  const cat = await prisma.category.create({
    data: { name: `Danh mục ${Math.random()}`, createdBy: id },
  });
  return prisma.categorySettingVersion.create({
    data: {
      categoryId: cat.id,
      version: patch.version ?? 1,
      changedBy: id,
      priceCap: patch.priceCap ?? null,
      referencePrice: patch.referencePrice ?? null,
    },
  });
};
describe('category_setting_versions', () => {
  it('CHECK: giá không âm, giá tham chiếu không vượt trần; null thì không kiểm', async () => {
    await expect(sqlStateOf(settings({ priceCap: -1n }))).resolves.toBe(CHECK);
    await expect(sqlStateOf(settings({ referencePrice: -1n }))).resolves.toBe(CHECK);
    await expect(
      sqlStateOf(settings({ priceCap: 5_000_000n, referencePrice: 8_000_000n })),
    ).resolves.toBe(CHECK);
    await settings({ priceCap: null, referencePrice: 8_000_000n });
    await settings({ priceCap: 60_000_000n, referencePrice: 20_000_000n });
  });

  it('PK (category, version): phiên bản không ghi đè', async () => {
    const { id } = await master();
    const cat = await prisma.category.create({ data: { name: 'Xe máy', createdBy: id } });
    await prisma.categorySettingVersion.create({
      data: { categoryId: cat.id, version: 1, changedBy: id },
    });
    await expect(
      prismaErrorCode(
        prisma.categorySettingVersion.create({
          data: { categoryId: cat.id, version: 1, changedBy: id },
        }),
      ),
    ).resolves.toBe(UNIQUE);
  });
});

describe('template_drafts / template_versions', () => {
  it('một nháp mỗi danh mục với draft_version từ 1; phiên bản phát hành không ghi đè', async () => {
    const { id } = await master();
    const cat = await prisma.category.create({ data: { name: 'Thú cưng', createdBy: id } });
    await expect(
      sqlStateOf(
        prisma.templateDraft.create({
          data: { categoryId: cat.id, fields: [], draftVersion: 0, updatedBy: id, updatedAt: NOW },
        }),
      ),
    ).resolves.toBe(CHECK);
    await prisma.templateDraft.create({
      data: { categoryId: cat.id, fields: [], updatedBy: id, updatedAt: NOW },
    });
    await expect(
      prismaErrorCode(
        prisma.templateDraft.create({
          data: { categoryId: cat.id, fields: [], updatedBy: id, updatedAt: NOW },
        }),
      ),
    ).resolves.toBe(UNIQUE);

    await prisma.templateVersion.create({
      data: { categoryId: cat.id, version: 1, fields: [], publishedBy: id, publishedAt: NOW },
    });
    await expect(
      prismaErrorCode(
        prisma.templateVersion.create({
          data: { categoryId: cat.id, version: 1, fields: [], publishedBy: id, publishedAt: NOW },
        }),
      ),
    ).resolves.toBe(UNIQUE);
  });
});

describe('provinces / wards', () => {
  it('phường phải thuộc một tỉnh có thật; tên phường unique trong tỉnh', async () => {
    await prisma.province.create({
      data: {
        code: 79,
        name: 'Hồ Chí Minh',
        fullName: 'Thành phố Hồ Chí Minh',
        formerNames: ['Bình Dương'],
        aliases: ['Sài Gòn'],
        searchText: 'ho chi minh binh duong sai gon',
      },
    });
    const ward = {
      code: 1,
      provinceCode: 79,
      name: 'Phường Bến Thành',
      formerNames: [],
      searchText: 'phuong ben thanh',
    };
    await prisma.ward.create({ data: ward });
    await expect(prismaErrorCode(prisma.ward.create({ data: { ...ward, code: 2 } }))).resolves.toBe(
      UNIQUE,
    );
    await expect(
      prismaErrorCode(
        prisma.ward.create({ data: { ...ward, code: 3, name: 'Phường Khác', provinceCode: 1 } }),
      ),
    ).resolves.toBe(FOREIGN_KEY);
  });
});
