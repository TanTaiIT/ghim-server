import { randomUUID } from 'node:crypto';

import type { TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hamming } from '../src/modules/screening/dhash.calc.js';
import { sharpHasher } from '../src/modules/screening/run/image-hash.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { api, deliverAll, newUser, type TestUser } from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import {
  createDraft,
  getOwn,
  type OwnListing,
  patch,
  readyDraft,
  someRegion,
  submit,
} from './listing-http-helpers.js';
import {
  codesOf,
  deviceOf,
  LATER,
  pngOf,
  recompressed,
  runOf,
  tierPort,
  uploadBytes,
} from './screening-helpers.js';
import { storageOf } from './storage-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/*
 * Spec screening/image-checks trên kho thật (RustFS của test) và `sharp` thật: tải ảnh như app, việc
 * `screening.check-image` chạy qua hàng việc giả do ca test tự đẩy, kết quả về `listing` qua outbox.
 */
let app: FastifyInstance;
let jobs: FakeJobs;
let staff: TestUser;
const tiers = new Map<string, TrustTier>();
let seq = 0;

beforeAll(async () => {
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => LATER, trust: tierPort(tiers), jobs });
  await app.modules.screening.ensureRules();
  staff = await newUser(app);
  await grantStaff(staff.id, [], [await seedCategory()]);
});

afterAll(() => app.close());

type Upload = { bytes: Uint8Array; type: 'image/png' | 'image/jpeg' };
const png = async (seed: number): Promise<Upload> => ({
  bytes: await pngOf(seed),
  type: 'image/png',
});

/** Nháp đủ trường với ảnh thật đã tải, gửi rồi giao sự kiện — việc kiểm ảnh đã xếp, chưa chạy. */
async function submittedWith(user: TestUser, uploads: Upload[]): Promise<OwnListing> {
  seq += 1;
  const draft = await createDraft(app, user);
  const imageIds = await Promise.all(
    uploads.map(({ bytes, type }) => uploadBytes(app, user, draft.id, bytes, type)),
  );
  const ready = await patch(app, user, draft, {
    title: `Đồ dùng số ${seq}`,
    price: 500_000,
    categoryId: await seedCategory(),
    placement: 'marketplace',
    ...(await someRegion(app)),
    imageIds,
  });
  if (ready.statusCode !== 200) throw new Error(`Lưu nháp hỏng: ${ready.body}`);
  const listing = ready.json().data as OwnListing;
  const sent = await submit(app, user, listing, deviceOf(user));
  if (sent.statusCode !== 200) throw new Error(`Gửi hỏng: ${sent.body}`);
  await deliverAll(app);
  return listing;
}

/** Chạy mọi việc kiểm ảnh đã xếp rồi giao kết quả cho `listing`. */
const checkAll = async (): Promise<void> => {
  await jobs.runAll();
  await deliverAll(app);
};

const userAt = async (tier: TrustTier): Promise<TestUser> => {
  const user = await newUser(app);
  tiers.set(user.id, tier);
  return user;
};

describe('Tin chỉ hiện khi có kết quả cho chữ và mọi ảnh', () => {
  it('tin 3 ảnh, hai ảnh đã có kết quả: vẫn đang kiểm; đủ cả 3 ảnh, T2 không trúng gì: hiện đầy đủ', async () => {
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await png(1), await png(2), await png(3)]);
    const [first, second, third] = listing.images.map((image) => image.id);
    await app.modules.screening.checkImage(first ?? '');
    await app.modules.screening.checkImage(second ?? '');
    await deliverAll(app);
    expect((await getOwn(app, user, listing.id)).state).toBe('checking');

    await app.modules.screening.checkImage(third ?? '');
    await deliverAll(app);
    expect((await getOwn(app, user, listing.id)).state).toBe('live');
    expect(await runOf(listing.id)).toMatchObject({ outcome: 'pass_full', score: 0 });
  });

  it('ảnh không giải mã được: kiểm ảnh báo lỗi, tin bị giữ cho người', async () => {
    const user = await userAt('T2');
    const draft = await readyDraft(app, user);
    await submit(app, user, draft, deviceOf(user));
    await deliverAll(app);
    await checkAll();
    expect(await runOf(draft.id)).toMatchObject({ outcome: 'hold', cause: 'error' });
    expect((await getOwn(app, user, draft.id)).state).toBe('pending');
  });
});

describe('Ảnh trùng với tin của tài khoản khác là cổng cứng', () => {
  it('ảnh chép lại hay nén lại vẫn ra dHash gần như cũ', async () => {
    const original = await pngOf(40);
    const [a, b] = await Promise.all([
      sharpHasher.dhash(original),
      sharpHasher.dhash(await recompressed(original)),
    ]);
    expect(hamming(a, b)).toBeLessThanOrEqual(4);
    expect(hamming(a, await sharpHasher.dhash(await pngOf(41)))).toBeGreaterThan(4);
  });

  it('B dùng lại ảnh trong tin của A, nguyên bản hay nén lại: dính "ảnh trùng"; A dùng lại ảnh của mình thì không', async () => {
    const owner = await userAt('T2');
    const photo = await png(50);
    await submittedWith(owner, [photo]);
    await checkAll();
    const reused = await submittedWith(owner, [photo]);
    await checkAll();
    expect(await runOf(reused.id)).toMatchObject({ outcome: 'pass_full' });

    const copied = await submittedWith(await userAt('T3'), [photo]);
    const reencoded = await submittedWith(await userAt('T2'), [
      { bytes: await recompressed(photo.bytes), type: 'image/jpeg' },
    ]);
    await checkAll();
    expect(await runOf(copied.id)).toMatchObject({ outcome: 'hold', cause: 'gate' });
    expect(codesOf(await runOf(copied.id))).toEqual(['duplicate_image']);
    expect((await runOf(reencoded.id)).cause).toBe('gate');
  });
});

describe('Danh sách trắng ảnh mẫu của hãng', () => {
  it('ảnh mẫu trong danh sách trắng: hai tài khoản cùng dùng không dính; staff gỡ thì tin gửi sau dính', async () => {
    const brand = await png(60);
    const first = await submittedWith(await userAt('T2'), [brand]);
    await checkAll();
    const added = await api(app, 'POST', '/ops/screening/whitelist', staff.token, {
      imageId: first.images[0]?.id,
    });
    expect(added.statusCode).toBe(201);

    const second = await submittedWith(await userAt('T2'), [brand]);
    await checkAll();
    expect((await runOf(second.id)).outcome).toBe('pass_full');

    const removed = await api(
      app,
      'DELETE',
      `/ops/screening/whitelist/${added.json().data.id as string}`,
      staff.token,
    );
    expect(removed.statusCode).toBe(204);
    const third = await submittedWith(await userAt('T2'), [brand]);
    await checkAll();
    expect((await runOf(third.id)).cause).toBe('gate');
  });

  it('người không mang quyền staff thêm ảnh vào danh sách trắng: 403 FORBIDDEN', async () => {
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await png(70)]);
    const res = await api(app, 'POST', '/ops/screening/whitelist', user.token, {
      imageId: listing.images[0]?.id,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});

describe('Đọc ảnh từ kho cho máy băm (cổng media.readImage)', () => {
  it('ảnh có trong kho: trả bytes; không có tệp: null; tệp lớn hơn trần: ném', async () => {
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await png(80)]);
    const imageId = listing.images[0]?.id ?? '';
    expect((await app.modules.media.readImage(imageId))?.length).toBeGreaterThan(0);
    expect(await app.modules.media.readImage(randomUUID())).toBeNull();
    await expect(
      storageOf(process.env.STORAGE_URL ?? '').read(`img/${imageId}`, 10),
    ).rejects.toThrow(/lớn hơn 10 byte/);
  });
});
