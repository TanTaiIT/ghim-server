import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditOf, outboxEvents } from './db-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, repositories } from './test-app.js';

/* Spec category-catalog qua HTTP; staff được gắn quyền bằng route thật của `platform`. */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const MILLION = 1_000_000;

const categoryRepository = repositories.category;
let app: FastifyInstance;
let masterToken: string;
let userToken: string;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = await buildTestApp({ clock: () => NOW });
  await app.ready();
  const master = await seedAccount({ role: 'master' }, NOW);
  masterToken = await tokenFor(app, master.id);
  userToken = await tokenFor(app, (await seedAccount({}, NOW)).id);
});

afterAll(() => app.close());

let seq = 0;
async function createCategory(payload: object = {}, token = masterToken) {
  seq += 1;
  return app.inject({
    method: 'POST',
    url: '/api/v1/ops/categories',
    headers: auth(token),
    payload: { name: `Danh mục ${seq}`, ...payload },
  });
}

async function newCategoryId(payload: object = {}): Promise<string> {
  return (await createCategory(payload)).json().data.id as string;
}

/** Staff phụ trách đúng các danh mục này, gắn qua `PUT /ops/staff`. */
async function staffOf(...categoryIds: string[]): Promise<string> {
  const staff = await seedAccount({}, NOW);
  const res = await app.inject({
    method: 'PUT',
    url: `/api/v1/ops/staff/${staff.id}`,
    headers: auth(masterToken),
    payload: { scopes: [], categoryIds },
  });
  expect(res.statusCode).toBe(200);
  return tokenFor(app, staff.id);
}

const settings = (id: string, payload: object, token = masterToken) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/ops/categories/${id}/settings`,
    headers: auth(token),
    payload,
  });

const FULL = {
  priceCap: 60 * MILLION,
  referencePrice: null,
  riskLevel: 'medium',
  alwaysManual: false,
  groupReview: 'group',
};

describe('tạo danh mục và cài đặt', () => {
  it('master tạo Điện thoại với trần 60 triệu, rủi ro vừa → 201, đang bật, đúng cài đặt', async () => {
    const res = await createCategory({
      name: 'Điện thoại',
      priceCap: 60 * MILLION,
      riskLevel: 'medium',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      name: 'Điện thoại',
      status: 'active',
      templateVersion: null,
      settings: { version: 1, priceCap: 60 * MILLION, riskLevel: 'medium', alwaysManual: false },
    });
  });

  it('không đặt gì → không trần, rủi ro thấp, luôn duyệt tay tắt, tin nhóm do nhóm duyệt', async () => {
    const res = await createCategory({ name: 'Quần áo' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.settings).toMatchObject({
      priceCap: null,
      referencePrice: null,
      riskLevel: 'low',
      alwaysManual: false,
      groupReview: 'group',
    });
  });

  it('người dùng tạo → 403', async () => {
    expect((await createCategory({}, userToken)).statusCode).toBe(403);
  });

  it('tên trùng → 409', async () => {
    await createCategory({ name: 'Xe đạp' });
    expect((await createCategory({ name: 'Xe đạp' })).statusCode).toBe(409);
  });

  it.each([
    ['trần giá âm', { ...FULL, priceCap: -1 }],
    ['giá có phần lẻ', { ...FULL, referencePrice: 1_500_000.5 }],
    ['mức rủi ro không có', { ...FULL, riskLevel: 'very_high' }],
    ['người duyệt tin nhóm không có', { ...FULL, groupReview: 'owner' }],
    ['giá tham chiếu vượt trần', { ...FULL, priceCap: 5 * MILLION, referencePrice: 8 * MILLION }],
    ['thiếu một mục (không gửi trọn bộ)', { priceCap: 1 }],
  ])('%s → 400 VALIDATION_ERROR, cài đặt không đổi', async (_case, payload) => {
    const id = await newCategoryId();
    const res = await settings(id, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect((await categoryRepository.findById(id))?.settingsVersion).toBe(1);
  });

  it('đổi trần 60 → 70 → 80 triệu: phiên bản 3, tra phiên bản 2 thấy 70 triệu', async () => {
    const id = await newCategoryId({ priceCap: 60 * MILLION });
    await settings(id, { ...FULL, priceCap: 70 * MILLION });
    const third = await settings(id, { ...FULL, priceCap: 80 * MILLION });
    expect(third.json().data.settings).toMatchObject({ version: 3, priceCap: 80 * MILLION });

    const v2 = await app.inject({
      method: 'GET',
      url: `/api/v1/ops/categories/${id}/settings/versions/2`,
      headers: auth(masterToken),
    });
    expect(v2.json().data).toMatchObject({ version: 2, priceCap: 70 * MILLION });
  });

  it('ba cài đặt giữ tin tách riêng: đổi một cái, hai cái kia giữ nguyên', async () => {
    const id = await newCategoryId({ riskLevel: 'medium' });
    const high = await settings(id, { ...FULL, priceCap: null, riskLevel: 'high' });
    expect(high.json().data.settings).toMatchObject({
      riskLevel: 'high',
      alwaysManual: false,
      groupReview: 'group',
    });
    const manual = await settings(id, {
      ...FULL,
      priceCap: null,
      riskLevel: 'high',
      alwaysManual: true,
    });
    expect(manual.json().data.settings).toMatchObject({ riskLevel: 'high', alwaysManual: true });
    const platform = await settings(id, {
      ...FULL,
      priceCap: null,
      riskLevel: 'high',
      alwaysManual: true,
      groupReview: 'platform',
    });
    expect(platform.json().data.settings).toMatchObject({
      riskLevel: 'high',
      alwaysManual: true,
      groupReview: 'platform',
    });
  });

  it('staff phụ trách sửa trần giá → 403, trần không đổi; tắt luôn duyệt tay → 403', async () => {
    const id = await newCategoryId({ priceCap: 60 * MILLION, alwaysManual: true });
    const staff = await staffOf(id);
    expect((await settings(id, { ...FULL, priceCap: 1 }, staff)).statusCode).toBe(403);
    expect((await settings(id, { ...FULL, alwaysManual: false }, staff)).statusCode).toBe(403);
    expect((await categoryRepository.findById(id))?.settings).toMatchObject({
      priceCap: 60_000_000n,
      alwaysManual: true,
    });
  });

  it('mỗi thay đổi cài đặt ghi một dòng nhật ký', async () => {
    const id = await newCategoryId();
    await settings(id, FULL);
    expect((await auditOf(id)).map((row) => row.action)).toEqual([
      'category.category.create',
      'category.settings.change',
    ]);
  });
});

describe('bật, tắt, không xoá', () => {
  it('tắt: khách không thấy, master thấy ở trạng thái tắt; bật lại giữ nguyên cài đặt', async () => {
    const id = await newCategoryId({ name: 'Thú cưng', riskLevel: 'high', alwaysManual: true });
    const disable = await app.inject({
      method: 'POST',
      url: `/api/v1/ops/categories/${id}/disable`,
      headers: auth(masterToken),
    });
    expect(disable.json().data.status).toBe('disabled');

    const publicList = (await app.inject({ method: 'GET', url: '/api/v1/categories' })).json().data;
    expect(publicList.map((row: { id: string }) => row.id)).not.toContain(id);
    const adminList = (
      await app.inject({ method: 'GET', url: '/api/v1/ops/categories', headers: auth(masterToken) })
    ).json().data;
    expect(adminList.find((row: { id: string }) => row.id === id)?.status).toBe('disabled');

    const enable = await app.inject({
      method: 'POST',
      url: `/api/v1/ops/categories/${id}/enable`,
      headers: auth(masterToken),
    });
    expect(enable.json().data).toMatchObject({
      status: 'active',
      settings: { version: 1, riskLevel: 'high', alwaysManual: true },
    });
  });

  it('tắt / bật phát category.status.changed cùng transaction; bấm lại trạng thái cũ không phát gì', async () => {
    const id = await newCategoryId();
    const toggle = (action: 'disable' | 'enable') =>
      app.inject({
        method: 'POST',
        url: `/api/v1/ops/categories/${id}/${action}`,
        headers: auth(masterToken),
      });
    const eventsOf = async () =>
      (await outboxEvents())
        .filter((event) => event.type === 'category.status.changed')
        .map((event) => event.payload)
        .filter((payload) => (payload as { categoryId: string }).categoryId === id);

    await toggle('disable');
    await toggle('disable');
    await toggle('enable');
    expect(await eventsOf()).toEqual([
      { categoryId: id, enabled: false },
      { categoryId: id, enabled: true },
    ]);
    expect((await app.modules.category.statusOf([id])).get(id)).toEqual({
      enabled: true,
      templateVersion: null,
    });
  });

  it('xoá → 404 NOT_FOUND vì không có thao tác đó, danh mục vẫn còn', async () => {
    const id = await newCategoryId();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/ops/categories/${id}`,
      headers: auth(masterToken),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(await categoryRepository.findById(id)).not.toBeNull();
  });

  it('staff phụ trách tắt danh mục → 403', async () => {
    const id = await newCategoryId();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/ops/categories/${id}/disable`,
      headers: auth(await staffOf(id)),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('giữ lại có hạn', () => {
  it('danh sách danh mục và mẫu hiện hành: 5 phút; phiên bản mẫu đã phát hành: mãi', async () => {
    const id = await newCategoryId();
    await app.inject({
      method: 'PUT',
      url: `/api/v1/ops/categories/${id}/template/draft`,
      headers: auth(masterToken),
      payload: { baseDraftVersion: 0, fields: [hang] },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/ops/categories/${id}/template/publish`,
      headers: auth(masterToken),
    });

    const list = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    const current = await app.inject({ method: 'GET', url: `/api/v1/categories/${id}/template` });
    const v1 = await app.inject({
      method: 'GET',
      url: `/api/v1/categories/${id}/template/versions/1`,
    });
    expect(list.headers['cache-control']).toBe('public, max-age=300');
    expect(current.headers['cache-control']).toBe('public, max-age=300');
    expect(v1.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('bàn vận hành và lỗi cấm giữ lại', async () => {
    const ops = await app.inject({
      method: 'GET',
      url: '/api/v1/ops/categories',
      headers: auth(masterToken),
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/categories/00000000-0000-7000-8000-0000000000ff/template',
    });
    expect(ops.statusCode).toBe(200);
    expect(ops.headers['cache-control']).toBe('no-store');
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['cache-control']).toBe('no-store');
  });
});

describe('cài đặt không công khai', () => {
  it('khách đọc danh sách: mỗi danh mục chỉ có mã, tên, số phiên bản mẫu', async () => {
    await createCategory({
      priceCap: 60 * MILLION,
      referencePrice: 20 * MILLION,
      riskLevel: 'high',
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(res.statusCode).toBe(200);
    for (const row of res.json().data as object[]) {
      expect(Object.keys(row).toSorted()).toEqual(['id', 'name', 'templateVersion']);
    }
  });

  it('master xem bàn vận hành: đủ cài đặt, kể cả danh mục tắt', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ops/categories',
      headers: auth(masterToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toHaveProperty('settings.priceCap');
  });
});

const hang = {
  name: 'hang',
  label: 'Hãng',
  type: 'single_choice',
  required: true,
  options: ['Apple'],
};
const dungLuong = { name: 'dung_luong', label: 'Dung lượng', type: 'text', required: false };

const saveDraft = (id: string, token: string, payload: object) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/ops/categories/${id}/template/draft`,
    headers: auth(token),
    payload,
  });
const publish = (id: string, token = masterToken) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/ops/categories/${id}/template/publish`,
    headers: auth(token),
  });
const template = (id: string, version?: number) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/categories/${id}/template${version === undefined ? '' : `/versions/${version}`}`,
  });

describe('mẫu thông tin', () => {
  it('staff phụ trách soạn nháp → lưu; mẫu app đọc vẫn như trước', async () => {
    const id = await newCategoryId();
    const res = await saveDraft(id, await staffOf(id), {
      baseDraftVersion: 0,
      fields: [hang, dungLuong],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.draftVersion).toBe(1);
    expect((await template(id)).json().data).toMatchObject({ version: null, fields: [] });
  });

  it('staff chỉ phụ trách danh mục khác → 403', async () => {
    const phone = await newCategoryId();
    const motorbike = await newCategoryId();
    const res = await saveDraft(phone, await staffOf(motorbike), {
      baseDraftVersion: 0,
      fields: [hang],
    });
    expect(res.statusCode).toBe(403);
  });

  it('hai mục trùng tên, mục chọn không có lựa chọn → 400 VALIDATION_ERROR', async () => {
    const id = await newCategoryId();
    const results = await Promise.all(
      [[dungLuong, dungLuong], [{ ...hang, options: [] }]].map((fields) =>
        saveDraft(id, masterToken, { baseDraftVersion: 0, fields }),
      ),
    );
    for (const res of results) {
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('hai người cùng sửa bản nháp số 1: người lưu sau nhận 409 CONFLICT, nháp vẫn của người trước', async () => {
    const id = await newCategoryId();
    const hung = await staffOf(id);
    await saveDraft(id, hung, { baseDraftVersion: 0, fields: [hang] });
    const first = await saveDraft(id, hung, { baseDraftVersion: 1, fields: [hang, dungLuong] });
    expect(first.json().data.draftVersion).toBe(2);

    const late = await saveDraft(id, masterToken, { baseDraftVersion: 1, fields: [dungLuong] });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('CONFLICT');
    const draft = await app.inject({
      method: 'GET',
      url: `/api/v1/ops/categories/${id}/template/draft`,
      headers: auth(masterToken),
    });
    expect(draft.json().data.fields.map((field: { name: string }) => field.name)).toEqual([
      'hang',
      'dung_luong',
    ]);
  });

  it('master bỏ bản nháp: không còn nháp, mẫu hiện hành không đổi; bỏ lần hai → 404', async () => {
    const id = await newCategoryId();
    await saveDraft(id, masterToken, { baseDraftVersion: 0, fields: [hang] });
    const discard = () =>
      app.inject({
        method: 'DELETE',
        url: `/api/v1/ops/categories/${id}/template/draft`,
        headers: auth(masterToken),
      });
    expect((await discard()).statusCode).toBe(204);
    expect((await discard()).statusCode).toBe(404);
    expect((await template(id)).json().data.version).toBeNull();
  });

  it('staff phát hành → 403; master phát hành lần đầu → phiên bản 1 thành mẫu hiện hành', async () => {
    const id = await newCategoryId();
    const staff = await staffOf(id);
    await saveDraft(id, staff, { baseDraftVersion: 0, fields: [hang, dungLuong] });

    expect((await publish(id, staff)).statusCode).toBe(403);
    expect((await template(id)).json().data.version).toBeNull();

    const published = await publish(id);
    expect(published.statusCode).toBe(201);
    expect(published.json().data.version).toBe(1);
    const current = (await template(id)).json().data;
    expect(current.version).toBe(1);
    expect(current.fields.map((field: { name: string }) => field.name)).toEqual([
      'hang',
      'dung_luong',
    ]);
    const listed = (await app.inject({ method: 'GET', url: '/api/v1/categories' })).json().data;
    expect(listed.find((row: { id: string }) => row.id === id)?.templateVersion).toBe(1);
  });

  it('vòng đời tên mục: đổi nhãn được, đổi tên / đổi kiểu bị khoá, bỏ mục được, phiên bản cũ đọc lại nguyên', async () => {
    const id = await newCategoryId();
    await saveDraft(id, masterToken, { baseDraftVersion: 0, fields: [hang, dungLuong] });
    await publish(id);

    const relabelled = { ...dungLuong, label: 'Bộ nhớ trong' };
    await saveDraft(id, masterToken, { baseDraftVersion: 0, fields: [hang, relabelled] });
    expect((await publish(id)).json().data.fields[1]).toMatchObject({
      name: 'dung_luong',
      label: 'Bộ nhớ trong',
    });

    const renamed = await saveDraft(id, masterToken, {
      baseDraftVersion: 0,
      fields: [hang, { ...relabelled, name: 'bo_nho' }],
    });
    expect(renamed.statusCode).toBe(409);
    expect(renamed.json().error.code).toBe('TEMPLATE_FIELD_NAME_LOCKED');

    const retyped = await saveDraft(id, masterToken, {
      baseDraftVersion: 0,
      fields: [hang, { ...dungLuong, type: 'number' }],
    });
    expect(retyped.json().error.code).toBe('TEMPLATE_FIELD_NAME_LOCKED');

    await saveDraft(id, masterToken, { baseDraftVersion: 0, fields: [hang] });
    expect((await publish(id)).json().data.version).toBe(3);
    expect((await template(id)).json().data.fields).toHaveLength(1);
    const v1 = (await template(id, 1)).json().data;
    expect(v1.fields[1]).toMatchObject({ name: 'dung_luong', label: 'Dung lượng' });
  });

  it('gửi thay đổi nhắm vào phiên bản đã phát hành → 409 TEMPLATE_PUBLISHED, phiên bản không đổi', async () => {
    const id = await newCategoryId();
    await saveDraft(id, masterToken, { baseDraftVersion: 0, fields: [hang] });
    await publish(id);
    const res = await saveDraft(id, await staffOf(id), {
      baseDraftVersion: 0,
      version: 1,
      fields: [hang, dungLuong],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TEMPLATE_PUBLISHED');
    expect((await template(id, 1)).json().data.fields).toHaveLength(1);
  });

  it('danh mục không tồn tại → 404 ở mẫu hiện hành và phiên bản', async () => {
    const missing = '00000000-0000-7000-8000-0000000000ff';
    expect((await template(missing)).statusCode).toBe(404);
    expect((await template(missing, 1)).statusCode).toBe(404);
  });
});

describe('lỗi trùng khoá của DB đi qua error handler', () => {
  it('tên trùng lọt qua kiểm trước (hai lượt chen nhau) → 409 CONFLICT, không phải 500', async () => {
    // Lượt chen: lúc kiểm trước chưa thấy tên, tới lúc ghi thì unique của DB chặn.
    const racing = await buildTestApp({
      repositories: { category: { ...categoryRepository, findIdByName: async () => null } },
      clock: () => NOW,
    });
    await racing.ready();
    const post = () =>
      racing.inject({
        method: 'POST',
        url: '/api/v1/ops/categories',
        headers: auth(masterToken),
        payload: { name: 'Trùng' },
      });

    expect((await post()).statusCode).toBe(201);
    const duplicate = await post();
    await racing.close();
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('CONFLICT');
  });
});

describe('Swagger', () => {
  it('route công khai không có bearerAuth; Ops · Categories thì có', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as {
      paths: Record<string, Record<string, { tags?: string[]; security?: unknown[] }>>;
    };
    const ops = Object.values(doc.paths).flatMap((methods) => Object.values(methods));
    const tagged = (tag: string) => ops.filter((op) => op.tags?.includes(tag));
    expect(tagged('Categories').length).toBe(3);
    expect(tagged('Regions').length).toBe(3);
    for (const op of [...tagged('Categories'), ...tagged('Regions')])
      expect(op.security).toBeUndefined();
    for (const op of tagged('Ops · Categories')) expect(op.security).toEqual([{ bearerAuth: [] }]);
  });
});
