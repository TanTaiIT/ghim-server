import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import {
  addMember,
  createActiveGroup,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  createCategory,
  listingApi,
  liveListingOf,
  publishTemplate,
} from './listing-http-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Delta `listing/visibility` của change add-listing-filters qua HTTP: tin dựng với `attributes` thật qua mẫu danh mục
 * đã phát hành. App ở T1 để tin lên bảng tin danh mục ở mức đầy đủ; mỗi ca một danh mục riêng nên không lẫn tin.
 */
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(async () => {
  await app.close();
});

const HANG = {
  name: 'hang',
  label: 'Hãng',
  type: 'single_choice',
  required: true,
  options: ['Apple', 'Samsung', 'Xiaomi'],
};
const MAU = {
  name: 'mau',
  label: 'Màu',
  type: 'multi_choice',
  required: false,
  options: ['Đen', 'Bạc', 'Trắng'],
};
const DUNG_LUONG = {
  name: 'dung_luong',
  label: 'Dung lượng',
  type: 'single_choice',
  required: false,
  options: ['128GB', '256GB'],
};
const NAM = { name: 'nam_san_xuat', label: 'Năm sản xuất', type: 'number', required: false };
const GHI_CHU = { name: 'ghi_chu', label: 'Ghi chú', type: 'text', required: false };

const url = (categoryId: string | null, attrs: unknown): string =>
  `/listings?${categoryId ? `categoryId=${categoryId}&` : ''}attrs=${encodeURIComponent(
    typeof attrs === 'string' ? attrs : JSON.stringify(attrs),
  )}`;

const idsAt = async (path: string): Promise<string[]> => {
  const res = await listingApi(app, 'GET', path, null);
  expect(res.statusCode, `${path} ${res.body}`).toBe(200);
  return (res.json().data.items as { id: string }[]).map((item) => item.id);
};

const rejects = async (path: string): Promise<Record<string, unknown> | undefined> => {
  const res = await listingApi(app, 'GET', path, null);
  expect(res.statusCode, `${path} ${res.body}`).toBe(400);
  expect(res.json().error.code).toBe('VALIDATION_ERROR');
  return res.json().error.details as Record<string, unknown> | undefined;
};

/** Danh mục Điện thoại với mẫu đầy đủ; mỗi ca gọi một lần. */
async function phoneCategory(fields: object[] = [HANG, MAU, DUNG_LUONG, NAM, GHI_CHU]) {
  const categoryId = await createCategory(app, master);
  await publishTemplate(app, master, categoryId, fields);
  return categoryId;
}

/** Tin đang hiển thị kèm thông tin theo mẫu; đồng hồ nhích một giây để thứ tự trên bảng tin xác định. */
async function phone(categoryId: string, attributes: Record<string, unknown>, owner?: TestUser) {
  now = new Date(now.getTime() + 1000);
  return liveListingOf(app, owner ?? (await newUser(app)), { categoryId, attributes });
}

describe('Lọc theo mẫu thông tin của danh mục', () => {
  it('chọn một: một giá trị, hay hai giá trị khớp một trong hai', async () => {
    const categoryId = await phoneCategory();
    const apple = await phone(categoryId, { hang: 'Apple' });
    const samsung = await phone(categoryId, { hang: 'Samsung' });
    await phone(categoryId, { hang: 'Xiaomi' });
    expect(await idsAt(url(categoryId, { hang: ['Apple'] }))).toEqual([apple.id]);
    expect(await idsAt(url(categoryId, { hang: ['Apple', 'Samsung'] }))).toEqual([
      samsung.id,
      apple.id,
    ]);
  });

  it('chọn nhiều: khớp khi tin có một trong các giá trị đã chọn', async () => {
    const categoryId = await phoneCategory();
    const denTrang = await phone(categoryId, { hang: 'Apple', mau: ['Đen', 'Trắng'] });
    await phone(categoryId, { hang: 'Apple', mau: ['Trắng'] });
    expect(await idsAt(url(categoryId, { mau: ['Đen', 'Bạc'] }))).toEqual([denTrang.id]);
  });

  it('khoảng số: kể cả hai đầu; một đầu cũng được', async () => {
    const categoryId = await phoneCategory();
    await phone(categoryId, { hang: 'Apple', nam_san_xuat: 2017 });
    const y2018 = await phone(categoryId, { hang: 'Apple', nam_san_xuat: 2018 });
    const y2020 = await phone(categoryId, { hang: 'Apple', nam_san_xuat: 2020 });
    const y2021 = await phone(categoryId, { hang: 'Apple', nam_san_xuat: 2021 });
    expect(await idsAt(url(categoryId, { nam_san_xuat: { min: 2018, max: 2020 } }))).toEqual([
      y2020.id,
      y2018.id,
    ]);
    expect(await idsAt(url(categoryId, { nam_san_xuat: { min: 2020 } }))).toEqual([
      y2021.id,
      y2020.id,
    ]);
  });

  it('tin đăng theo mẫu cũ không có mục đang lọc: không hiện; nhiều mục ghép AND', async () => {
    const categoryId = await phoneCategory([HANG]);
    const old = await phone(categoryId, { hang: 'Apple' });
    await publishTemplate(app, master, categoryId, [HANG, DUNG_LUONG]);
    const fresh = await phone(categoryId, { hang: 'Apple', dung_luong: '128GB' });
    expect(await idsAt(url(categoryId, { dung_luong: ['128GB'] }))).toEqual([fresh.id]);
    expect(await idsAt(url(categoryId, { hang: ['Apple'] }))).toEqual([fresh.id, old.id]);
    expect(await idsAt(url(categoryId, { hang: ['Apple'], dung_luong: ['256GB'] }))).toEqual([]);
  });

  it('kết quả lọc vẫn theo luật hiển thị và thứ tự: tin "nhóm công khai" không có, tin mới lên đầu', async () => {
    const categoryId = await phoneCategory();
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    now = new Date(now.getTime() + 1000);
    await liveListingOf(app, member, {
      categoryId,
      placement: 'group_public',
      groupId: group.groupId,
      attributes: { hang: 'Apple' },
    });
    const first = await phone(categoryId, { hang: 'Apple' });
    const second = await phone(categoryId, { hang: 'Apple' });
    const unfiltered = await idsAt(`/listings?categoryId=${categoryId}`);
    expect(unfiltered).toEqual([second.id, first.id]);
    expect(await idsAt(url(categoryId, { hang: ['Apple'] }))).toEqual(unfiltered);
  });
});

describe('Bộ lọc theo mẫu phải đúng mẫu hiện hành', () => {
  it('lọc mà chưa chọn danh mục: 400 VALIDATION_ERROR', async () => {
    await rejects(url(null, { hang: ['Apple'] }));
  });

  it('mục chữ hoặc mục không có trong mẫu: 400 nêu mục đó', async () => {
    const categoryId = await phoneCategory();
    expect(await rejects(url(categoryId, { ghi_chu: ['tốt'] }))).toEqual({ field: 'ghi_chu' });
    expect(await rejects(url(categoryId, { so_km: { max: 1000 } }))).toEqual({ field: 'so_km' });
  });

  it('giá trị không có trong lựa chọn: 400 nêu mục hãng, tin không lọc được', async () => {
    const categoryId = await phoneCategory();
    await phone(categoryId, { hang: 'Apple' });
    const res = await listingApi(app, 'GET', url(categoryId, { hang: ['Nokia'] }), null);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('Nokia'),
      details: { field: 'hang' },
    });
  });

  it('JSON hỏng, khoảng số rỗng hay ngược đầu, quá 20 giá trị: 400 từ tầng HTTP', async () => {
    const categoryId = await phoneCategory();
    await rejects(url(categoryId, '{hang:'));
    await rejects(url(categoryId, { nam_san_xuat: {} }));
    await rejects(url(categoryId, { nam_san_xuat: { min: 2020, max: 2018 } }));
    await rejects(url(categoryId, { hang: Array.from({ length: 21 }, () => 'Apple') }));
    // Bộ lọc rỗng là không lọc: không cần danh mục.
    const res = await listingApi(app, 'GET', url(null, {}), null);
    expect(res.statusCode).toBe(200);
  });
});
