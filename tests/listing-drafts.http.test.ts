import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { imageKey } from '../src/lib/storage/storage.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import { newMaster, newUser } from './group-helpers.js';
import {
  createDraft,
  getOwn,
  listingApi,
  liveListingOf,
  patch,
  readyDraft,
  submit,
  submitted,
  uploadFor,
  uploadMany,
} from './listing-http-helpers.js';
import { firstByteAt, requestUpload, uploadImage } from './media-helpers.js';
import { storageOf } from './storage-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/* Spec `listing/drafts`, `listing/deletion` qua HTTP, Postgres và kho ảnh thật. */
let app: FastifyInstance;
const storage = storageOf(process.env.STORAGE_URL ?? '');

beforeAll(async () => {
  // T1: tin lên bảng ở mức đầy đủ, để ca xoá kiểm được tin biến khỏi bảng tin chứ không phải chưa từng ở đó.
  app = await buildTestApp({ trust: createInterimTrust('T1'), screening: interimScreening });
  await app.ready();
});

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const imageRow = (id: string) => prisma.image.findUniqueOrThrow({ where: { id } });

describe('Tạo nháp', () => {
  it('người dùng đã đăng nhập: 201, tin mới ở trạng thái nháp', async () => {
    const user = await newUser(app);
    const res = await listingApi(app, 'POST', '/listings', user, { title: 'Bàn học' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().data).toMatchObject({ state: 'draft', title: 'Bàn học', ownerId: user.id });
  });

  it('khách chưa đăng nhập: 401 UNAUTHORIZED', async () => {
    const res = await listingApi(app, 'POST', '/listings', null, {});
    expect(res.statusCode).toBe(401);
    expect(codeOf(res)).toBe('UNAUTHORIZED');
  });

  it('người khác mở hoặc sửa nháp: 404 NOT_FOUND', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const draft = await createDraft(app, owner, { title: 'Nháp riêng' });
    const read = await listingApi(app, 'GET', `/listings/${draft.id}`, other);
    expect(read.statusCode).toBe(404);
    const edit = await patch(app, other, draft, { title: 'Sửa trộm' });
    expect(edit.statusCode).toBe(404);
    expect(codeOf(edit)).toBe('NOT_FOUND');
    expect((await getOwn(app, owner, draft.id)).title).toBe('Nháp riêng');
  });

  it('master: 403 FORBIDDEN', async () => {
    const master = await newMaster(app);
    const res = await listingApi(app, 'POST', '/listings', master, {});
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
  });

  it('tài khoản mang quyền staff: tạo như mọi người dùng', async () => {
    const staff = await newUser(app);
    await grantStaff(staff.id, ['user_reports']);
    expect((await createDraft(app, staff)).state).toBe('draft');
  });
});

describe('Nháp lưu được khi chưa đủ thông tin', () => {
  it('chỉ có tiêu đề: lưu được, vẫn là nháp', async () => {
    const user = await newUser(app);
    const draft = await createDraft(app, user);
    const res = await patch(app, user, draft, { title: 'Chỉ có tiêu đề' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ state: 'draft', price: null, placement: null });
  });

  it('gửi khi chưa chọn nơi đăng: 400 VALIDATION_ERROR, vẫn là nháp', async () => {
    const user = await newUser(app);
    const draft = await readyDraft(app, user, { placement: null });
    const res = await submit(app, user, draft);
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect(res.json().error.message).toContain('nơi đăng');
    expect((await getOwn(app, user, draft.id)).state).toBe('draft');
  });
});

const draftWithImages = async (count: number) => {
  const user = await newUser(app);
  const draft = await createDraft(app, user);
  return { user, draft, images: await uploadMany(app, user, draft.id, count) };
};

describe('Tối đa 6 ảnh, ảnh đầu là ảnh bìa', () => {
  it('ảnh thứ sáu: nháp có 6 ảnh; ảnh thứ bảy: 400 TOO_MANY_IMAGES, giữ 6 ảnh cũ', async () => {
    const { user, draft, images } = await draftWithImages(7);
    const six = await patch(app, user, draft, { imageIds: images.slice(0, 6) });
    expect(six.statusCode, six.body).toBe(200);
    expect(six.json().data.images).toHaveLength(6);
    const seven = await patch(app, user, six.json().data, { imageIds: images });
    expect(seven.statusCode).toBe(400);
    expect(codeOf(seven)).toBe('TOO_MANY_IMAGES');
    expect((await getOwn(app, user, draft.id)).images.map((image) => image.id)).toEqual(
      images.slice(0, 6),
    );
  });

  it('chuyển ảnh thứ ba lên đầu: ảnh đó thành ảnh bìa', async () => {
    const { user, draft, images } = await draftWithImages(3);
    const saved = (await patch(app, user, draft, { imageIds: images })).json().data;
    const [a, b, c] = images;
    const res = await patch(app, user, saved, { imageIds: [c, a, b] });
    expect(res.json().data.images[0].id).toBe(c);
    expect(await firstByteAt(res.json().data.images[0].url)).toBe(3);
  });

  it('sửa tin đang hiển thị có 6 ảnh lên 7: 400 TOO_MANY_IMAGES, tin không đổi', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user, {}, 6);
    const seventh = await uploadFor(app, user, live.id, 7);
    const res = await patch(app, user, live, {
      imageIds: [...live.images.map((image) => image.id), seventh],
    });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('TOO_MANY_IMAGES');
    expect(await getOwn(app, user, live.id)).toMatchObject({
      state: 'live',
      version: live.version,
      images: live.images.map(({ id }) => expect.objectContaining({ id })),
    });
  });
});

describe('Ảnh của nháp nằm trong kho và thuộc về chính nháp', () => {
  it('xin tải ảnh cho nháp của mình: 201, ảnh tải xong thuộc về nháp', async () => {
    const user = await newUser(app);
    const draft = await createDraft(app, user);
    const imageId = await uploadFor(app, user, draft.id);
    expect(await imageRow(imageId)).toMatchObject({
      ownerKind: 'listing',
      ownerId: draft.id,
      confirmedAt: null,
    });
  });

  it('xin tải cho nháp của người khác hay nháp không có: 404 như nhau', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const draft = await createDraft(app, owner);
    const theirs = await requestUpload(app, other, { ownerKind: 'listing', ownerId: draft.id });
    const missing = await requestUpload(app, other, {
      ownerKind: 'listing',
      ownerId: randomUUID(),
    });
    expect([theirs.statusCode, missing.statusCode]).toEqual([404, 404]);
    expect(theirs.json().error).toEqual(missing.json().error);
  });

  it.each([
    ['đường link ngoài kho', () => Promise.resolve('https://example.com/anh.jpg')],
    ['mã ảnh không tồn tại', () => Promise.resolve(randomUUID())],
  ])('%s: 400 IMAGE_NOT_IN_STORAGE, nháp giữ nguyên', async (_name, imageOf) => {
    const user = await newUser(app);
    const draft = await createDraft(app, user, { title: 'Trước' });
    const res = await patch(app, user, draft, { title: 'Sau', imageIds: [await imageOf()] });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('IMAGE_NOT_IN_STORAGE');
    expect(await getOwn(app, user, draft.id)).toMatchObject({
      title: 'Trước',
      version: draft.version,
    });
  });

  it('ảnh đã xin quyền nhưng chưa tải lên kho: 400 IMAGE_NOT_IN_STORAGE', async () => {
    const user = await newUser(app);
    const draft = await createDraft(app, user);
    const grant = await requestUpload(app, user, { ownerKind: 'listing', ownerId: draft.id });
    const res = await patch(app, user, draft, { imageIds: [grant.json().data.imageId] });
    expect(codeOf(res)).toBe('IMAGE_NOT_IN_STORAGE');
  });

  it('ảnh do người khác tải: giống hệt mã ảnh không tồn tại', async () => {
    const [user, other] = [await newUser(app), await newUser(app)];
    const draft = await createDraft(app, user);
    const theirs = await uploadFor(app, other, (await createDraft(app, other)).id);
    const res = await patch(app, user, draft, { imageIds: [theirs] });
    const missing = await patch(app, user, draft, { imageIds: [randomUUID()] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual(missing.json().error);
  });

  it('ảnh tải cho nháp khác của chính mình: 400 — không dùng lại giữa các nháp', async () => {
    const user = await newUser(app);
    const [first, second] = [await createDraft(app, user), await createDraft(app, user)];
    const image = await uploadFor(app, user, first.id);
    expect(codeOf(await patch(app, user, second, { imageIds: [image] }))).toBe(
      'IMAGE_NOT_IN_STORAGE',
    );
  });

  it('ảnh đại diện Google: 400 — ngoại lệ chỉ dành cho ảnh đại diện', async () => {
    const user = await newUser(app);
    const draft = await createDraft(app, user);
    const res = await patch(app, user, draft, {
      imageIds: ['https://lh3.googleusercontent.com/a/cua-toi'],
    });
    expect(codeOf(res)).toBe('IMAGE_NOT_IN_STORAGE');
  });

  it('ảnh hồ sơ của chính mình: 400 — ảnh thuộc về chủ khác', async () => {
    const user = await newUser(app);
    const draft = await createDraft(app, user);
    const avatar = await uploadImage(app, user);
    expect(codeOf(await patch(app, user, draft, { imageIds: [avatar] }))).toBe(
      'IMAGE_NOT_IN_STORAGE',
    );
  });

  it('ảnh của chính nháp: lưu cùng ảnh, ảnh hết nhãn "chưa xác nhận"', async () => {
    const user = await newUser(app);
    const draft = await createDraft(app, user);
    const image = await uploadFor(app, user, draft.id, 0x21);
    const res = await patch(app, user, draft, { imageIds: [image] });
    expect(res.statusCode, res.body).toBe(200);
    expect(await firstByteAt(res.json().data.images[0].url)).toBe(0x21);
    expect((await imageRow(image)).confirmedAt).not.toBeNull();
  });

  it('lưu bị từ chối 400 VALIDATION_ERROR: ảnh vẫn mang nhãn "chưa xác nhận"', async () => {
    const user = await newUser(app);
    const draft = await createDraft(app, user);
    const image = await uploadFor(app, user, draft.id);
    const res = await patch(app, user, draft, { imageIds: [image], provinceCode: 999_999 });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect((await imageRow(image)).confirmedAt).toBeNull();
  });

  it('thay ảnh: ảnh thay vào là ảnh mới, nội dung ảnh cũ trong kho không đổi', async () => {
    const user = await newUser(app);
    const draft = await createDraft(app, user);
    const old = await uploadFor(app, user, draft.id, 0x31);
    const saved = (await patch(app, user, draft, { imageIds: [old] })).json().data;
    const replacement = await uploadFor(app, user, draft.id, 0x32);
    const res = await patch(app, user, saved, { imageIds: [replacement] });
    expect(res.json().data.images.map((image: { id: string }) => image.id)).toEqual([replacement]);
    expect(replacement).not.toBe(old);
    expect(await storage.head(imageKey(old))).toMatchObject({ byteSize: 2048 });
  });
});

describe('Người đăng xoá mềm tin của mình', () => {
  it('xoá tin đang hiển thị: người khác 404; không còn trên bảng tin, tìm kiếm, hồ sơ', async () => {
    const [owner, viewer] = [await newUser(app), await newUser(app)];
    const live = await liveListingOf(app, owner, { title: 'Tủ lạnh xoá được' });
    const surfaces = [
      `/listings?categoryId=${live.categoryId}`,
      `/listings?q=${encodeURIComponent('tủ lạnh xoá')}`,
      `/users/${owner.id}/listings`,
    ];
    const idsOn = async () =>
      (await Promise.all(surfaces.map((url) => listingApi(app, 'GET', url, viewer)))).map((res) =>
        res.json().data.items.map((item: { id: string }) => item.id),
      );
    expect(await idsOn()).toEqual([[live.id], [live.id], [live.id]]);
    const removed = await listingApi(app, 'DELETE', `/listings/${live.id}`, owner);
    expect(removed.statusCode, removed.body).toBe(204);
    expect((await listingApi(app, 'GET', `/listings/${live.id}`, viewer)).statusCode).toBe(404);
    expect(await idsOn()).toEqual([[], [], []]);
  });

  it('xoá tin chờ duyệt: tin bị xoá', async () => {
    const owner = await newUser(app);
    const checking = await submitted(app, owner);
    await app.modules.listing.applyMachineOutcome({
      listingId: checking.id,
      listingVersion: checking.version,
      outcome: 'hold',
      restrictMachine: false,
    });
    expect((await getOwn(app, owner, checking.id)).state).toBe('pending');
    expect((await listingApi(app, 'DELETE', `/listings/${checking.id}`, owner)).statusCode).toBe(
      204,
    );
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: checking.id } })).deletedAt,
    ).not.toBeNull();
  });

  it('xoá nháp: không còn trong danh sách tin của tôi', async () => {
    const owner = await newUser(app);
    const draft = await createDraft(app, owner);
    await listingApi(app, 'DELETE', `/listings/${draft.id}`, owner);
    const mine = await listingApi(app, 'GET', '/me/listings', owner);
    expect(mine.json().data.items).toEqual([]);
  });

  it('sửa hay gia hạn tin đã xoá: 404 NOT_FOUND', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await listingApi(app, 'DELETE', `/listings/${live.id}`, owner);
    expect((await patch(app, owner, live, { title: 'Sửa' })).statusCode).toBe(404);
    const renew = await listingApi(app, 'POST', `/listings/${live.id}/renew`, owner, {
      version: live.version,
    });
    expect(renew.statusCode).toBe(404);
  });
});

describe('Chỉ người đăng xoá được tin', () => {
  it('người khác xoá tin đang hiển thị: 403 FORBIDDEN, tin vẫn hiển thị', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const live = await liveListingOf(app, owner);
    const res = await listingApi(app, 'DELETE', `/listings/${live.id}`, other);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect((await listingApi(app, 'GET', `/listings/${live.id}`, other)).statusCode).toBe(200);
  });

  it('người khác xoá nháp: 404 NOT_FOUND, nháp không đổi', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const draft = await createDraft(app, owner);
    const res = await listingApi(app, 'DELETE', `/listings/${draft.id}`, other);
    expect(res.statusCode).toBe(404);
    expect((await getOwn(app, owner, draft.id)).state).toBe('draft');
  });
});

const reconcile = () => app.modules.media.reconcile({ budgetMs: 60_000 });

describe('Ảnh đi theo tin', () => {
  it('nháp bị xoá hẳn: cả ảnh đã lưu lẫn ảnh còn nhãn "chưa xác nhận" bị xoá khỏi kho', async () => {
    const owner = await newUser(app);
    const draft = await createDraft(app, owner);
    const saved = [
      await uploadFor(app, owner, draft.id, 1),
      await uploadFor(app, owner, draft.id, 2),
      await uploadFor(app, owner, draft.id, 3),
    ];
    await patch(app, owner, draft, { imageIds: saved });
    const fresh = await uploadFor(app, owner, draft.id, 4);
    await prisma.listing.delete({ where: { id: draft.id } });
    await reconcile();
    const left = await Promise.all([...saved, fresh].map((id) => storage.head(imageKey(id))));
    expect(left).toEqual([null, null, null, null]);
    expect(await prisma.image.count({ where: { ownerId: draft.id } })).toBe(0);
  });

  it('tin bị xoá mềm: ảnh còn trong kho qua lượt đối chiếu', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await listingApi(app, 'DELETE', `/listings/${live.id}`, owner);
    await reconcile();
    expect(await storage.head(imageKey(live.images[0]?.id ?? ''))).not.toBeNull();
  });

  it('ảnh bị bỏ khỏi nháp: lượt đối chiếu xoá khỏi kho', async () => {
    const owner = await newUser(app);
    const draft = await createDraft(app, owner);
    const [kept, dropped] = [
      await uploadFor(app, owner, draft.id, 1),
      await uploadFor(app, owner, draft.id, 2),
    ];
    const saved = (await patch(app, owner, draft, { imageIds: [kept, dropped] })).json().data;
    await patch(app, owner, saved, { imageIds: [kept] });
    await reconcile();
    expect(await storage.head(imageKey(dropped))).toBeNull();
    expect(await storage.head(imageKey(kept))).not.toBeNull();
  });
});
