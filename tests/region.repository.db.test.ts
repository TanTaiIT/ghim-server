import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createRegionRepository } from '../src/modules/region/region.repository.js';
import { createRegionService } from '../src/modules/region/region.service.js';
import { prisma, truncateAll } from './db-helpers.js';

/* `region` trên Postgres thật: nạp khu vực + tìm bằng `search_text` (spec category/regions). */
const repository = createRegionRepository(prisma);
const service = createRegionService({ repository });

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

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

  it('kiểm cặp tỉnh / phường cho tin đăng: mã lạ, phường không thuộc tỉnh, cặp đúng', async () => {
    await service.seedRegionsIfEmpty();
    const ward = await prisma.ward.findFirstOrThrow({ orderBy: { code: 'asc' } });
    const other = await prisma.province.findFirstOrThrow({
      where: { code: { not: ward.provinceCode } },
    });
    expect(await service.validateRegion(ward.provinceCode, ward.code)).toBeNull();
    expect(await service.validateRegion(ward.provinceCode, null)).toBeNull();
    expect(await service.validateRegion(other.code, ward.code)).toMatch(/không thuộc/);
    expect(await service.validateRegion(99_999, null)).toMatch(/Không có tỉnh/);
    expect(await service.validateRegion(ward.provinceCode, 99_999_999)).toMatch(/Không có phường/);
  });
});
