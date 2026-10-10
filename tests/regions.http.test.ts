import { readFileSync } from 'node:fs';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RegionsFile } from '../src/cli/build-regions.js';
import { buildTestApp } from './fakes/app.js';
import { createFakeCategoryRepository } from './fakes/category-repository.fake.js';

/* Spec regions trên đúng file dữ liệu sẽ nạp ở production (`data/regions.json`). */
const regions = JSON.parse(
  readFileSync(new URL('../src/modules/category/data/regions.json', import.meta.url), 'utf8'),
) as RegionsFile;
const HCM = regions.provinces.find((row) => row.name === 'Hồ Chí Minh');

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  expect(await app.modules.category.seedRegionsIfEmpty()).toEqual({ provinces: 34, wards: 3321 });
});

afterAll(() => app.close());

type Hit = { kind: string; name: string; provinceCode: number };
const search = async (q: string): Promise<Hit[]> =>
  (
    await app.inject({ method: 'GET', url: `/api/v1/regions/search?q=${encodeURIComponent(q)}` })
  ).json().data;

describe('regions.json', () => {
  it('34 tỉnh, 3.321 phường; mã không trùng; mọi phường thuộc một tỉnh có thật', () => {
    expect(regions.provinces).toHaveLength(34);
    expect(regions.wards).toHaveLength(3321);
    const provinceCodes = new Set(regions.provinces.map((row) => row.code));
    expect(provinceCodes.size).toBe(34);
    expect(new Set(regions.wards.map((row) => row.code)).size).toBe(3321);
    expect(regions.wards.every((row) => provinceCodes.has(row.provinceCode))).toBe(true);
  });
});

describe('danh sách khu vực', () => {
  it('khách xem danh sách tỉnh → 200 với 34 tỉnh, thành', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/regions/provinces' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(34);
  });

  it('phường của TP.HCM: chỉ phường thuộc TP.HCM, có phường Bến Thành', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/regions/provinces/${HCM?.code}/wards`,
    });
    const wards = res.json().data as Array<{ name: string; provinceCode: number }>;
    expect(wards.every((row) => row.provinceCode === HCM?.code)).toBe(true);
    expect(wards.map((row) => row.name)).toContain('Phường Bến Thành');
  });

  it('mã tỉnh không tồn tại → 404 NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/regions/provinces/9999/wards' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('nạp lần hai không thêm gì', async () => {
    expect(await app.modules.category.seedRegionsIfEmpty()).toEqual({ provinces: 0, wards: 0 });
  });
});

describe('tìm khu vực', () => {
  it.each(['Bình Dương', 'binh duong', 'sài gòn'])('"%s" ra Thành phố Hồ Chí Minh', async (q) => {
    expect(await search(q)).toContainEqual(
      expect.objectContaining({ kind: 'province', name: 'Hồ Chí Minh' }),
    );
  });

  it('tỉnh đứng trước phường; phường ghi rõ tỉnh chứa', async () => {
    const hits = await search('ben thanh');
    const benThanh = hits.find((hit) => hit.name === 'Phường Bến Thành');
    expect(benThanh).toMatchObject({
      kind: 'ward',
      provinceCode: HCM?.code,
      provinceName: 'Hồ Chí Minh',
    });
    const kinds = (await search('ha')).map((hit) => hit.kind);
    expect(kinds.indexOf('ward')).toBeGreaterThan(kinds.lastIndexOf('province'));
  });

  it('không khớp tên nào → 200 với danh sách rỗng', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/regions/search?q=zzqqxx' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });
});

describe('tên cũ cấp phường', () => {
  // Chưa có nguồn tên cũ cấp phường (proposal): cơ chế kiểm bằng dữ liệu dựng.
  it('tên cũ chia cho hai phường mới → tìm ra cả hai', async () => {
    const categoryRepository = createFakeCategoryRepository();
    const local = await buildTestApp({ repositories: { category: categoryRepository } });
    await categoryRepository.seedRegions({
      provinces: [{ code: 1, name: 'Thử', fullName: 'Tỉnh Thử', formerNames: [], aliases: [] }],
      wards: [
        { code: 10, provinceCode: 1, name: 'Phường Mới A', formerNames: ['Phường Cũ Đông Hoà'] },
        { code: 11, provinceCode: 1, name: 'Phường Mới B', formerNames: ['Phường Cũ Đông Hoà'] },
        { code: 12, provinceCode: 1, name: 'Phường Khác', formerNames: [] },
      ],
    });
    const res = await local.inject({ method: 'GET', url: '/api/v1/regions/search?q=dong%20hoa' });
    expect(res.json().data.map((hit: { name: string }) => hit.name)).toEqual([
      'Phường Mới A',
      'Phường Mới B',
    ]);
    await local.close();
  });
});
