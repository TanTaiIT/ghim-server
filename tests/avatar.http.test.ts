import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { imageKey, StorageUnavailableError } from '../src/lib/storage/storage.js';
import { prisma } from './db-helpers.js';
import { api, newUser, type TestUser } from './group-helpers.js';
import { firstByteAt, requestUpload, setAvatar, uploadImage } from './media-helpers.js';
import { storageOf } from './storage-helpers.js';
import { buildTestApp } from './test-app.js';

/*
 * Ảnh đại diện — chủ ảnh đầu tiên: requirement "Ảnh đại diện" của `identity/profile` và các requirement lưu ảnh của
 * `media/image-storage` (chỉ nhận ảnh trong kho, ngoại lệ Google, nhãn "chưa xác nhận").
 */
let app: FastifyInstance;
const storage = storageOf(process.env.STORAGE_URL ?? '');

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const imageRow = (id: string) => prisma.image.findUniqueOrThrow({ where: { id } });
const meOf = async (user: TestUser) =>
  (await api(app, 'GET', '/me', user.token)).json().data as { avatarUrl: string | null };
const expectNotInStorage = (res: { statusCode: number; json(): { error: { code: string } } }) => {
  expect(res.statusCode).toBe(400);
  expect(res.json().error.code).toBe('IMAGE_NOT_IN_STORAGE');
};

describe('Ảnh đại diện', () => {
  it('đặt bằng ảnh đã tải: 200, hồ sơ công khai trả đường xem mở được đúng ảnh, không lộ đường dẫn cố định', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user, 0x42);
    const res = await setAvatar(app, user, { imageId });
    expect(res.statusCode, res.body).toBe(200);
    const avatarUrl = res.json().data.avatarUrl as string;
    expect(await firstByteAt(avatarUrl)).toBe(0x42);
    expect(new URL(avatarUrl).searchParams.get('X-Amz-Expires')).not.toBeNull();
    const profile = await api(app, 'GET', `/users/${user.id}`);
    expect(await firstByteAt(profile.json().data.avatarUrl)).toBe(0x42);
  });

  it('bỏ ảnh đại diện: 200, hồ sơ không còn ảnh; ảnh cũ thành ảnh bị bỏ chờ lượt đối chiếu', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    await setAvatar(app, user, { imageId });
    const res = await api(app, 'DELETE', '/me/avatar', user.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.avatarUrl).toBeNull();
    expect((await imageRow(imageId)).releasedAt).not.toBeNull();
  });
});

describe('Chỉ nhận ảnh nằm trong kho', () => {
  it('ảnh đã xin quyền nhưng chưa tải lên: 400 IMAGE_NOT_IN_STORAGE, ảnh đại diện giữ nguyên', async () => {
    const user = await newUser(app);
    const current = await uploadImage(app, user, 0x10);
    await setAvatar(app, user, { imageId: current });
    const pending = (await requestUpload(app, user)).json().data.imageId as string;
    expectNotInStorage(await setAvatar(app, user, { imageId: pending }));
    expect(await firstByteAt((await meOf(user)).avatarUrl ?? '')).toBe(0x10);
  });

  it('ảnh do người khác tải lên: 400 IMAGE_NOT_IN_STORAGE, giống hệt mã không tồn tại', async () => {
    const user = await newUser(app);
    const other = await newUser(app);
    const ofOther = await setAvatar(app, user, { imageId: await uploadImage(app, other) });
    const ofNobody = await setAvatar(app, user, { imageId: randomUUID() });
    expectNotInStorage(ofOther);
    expect(ofOther.json()).toEqual(ofNobody.json());
  });

  it('ảnh của chính mình trong kho: hồ sơ lưu cùng ảnh đó', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    expect((await setAvatar(app, user, { imageId })).statusCode).toBe(200);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: user.id } });
    expect(account).toMatchObject({ avatarImageId: imageId, avatarFromGoogle: false });
  });
});

describe('Ngoại lệ duy nhất là ảnh đại diện lấy từ Google', () => {
  it('đường link tới trang khác: 400 IMAGE_NOT_IN_STORAGE', async () => {
    const user = await newUser(app);
    expectNotInStorage(
      await setAvatar(app, user, { imageId: 'https://example.com/anh-cua-toi.jpg' }),
    );
  });

  it('tài khoản chưa nối Google chọn ảnh Google: 400 IMAGE_NOT_IN_STORAGE', async () => {
    const user = await newUser(app);
    expectNotInStorage(await setAvatar(app, user, { source: 'google' }));
  });

  it('tài khoản đã nối Google chọn lại ảnh Google: hồ sơ lưu link Google, ảnh trong kho đang dùng thành ảnh bị bỏ', async () => {
    const user = await newUser(app);
    const picture = 'https://lh3.googleusercontent.com/a/cua-toi';
    await prisma.account.update({ where: { id: user.id }, data: { googlePictureUrl: picture } });
    const imageId = await uploadImage(app, user);
    await setAvatar(app, user, { imageId });
    const res = await setAvatar(app, user, { source: 'google' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.avatarUrl).toBe(picture);
    expect((await imageRow(imageId)).releasedAt).not.toBeNull();
  });
});

describe('Nhãn "chưa xác nhận"', () => {
  it('ảnh vừa tải mang nhãn; đặt làm ảnh đại diện thành công thì gỡ', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    expect((await imageRow(imageId)).confirmedAt).toBeNull();
    await setAvatar(app, user, { imageId });
    expect((await imageRow(imageId)).confirmedAt).not.toBeNull();
  });

  it('lần lưu bị từ chối 400 VALIDATION_ERROR: nhãn vẫn còn', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    const res = await setAvatar(app, user, { imageId, source: 'google' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect((await imageRow(imageId)).confirmedAt).toBeNull();
  });
});

describe('Ảnh đã tải không bị ghi đè', () => {
  it('đổi ảnh đại diện: ảnh thay vào là ảnh mới trong kho, ruột ảnh cũ không đổi', async () => {
    const user = await newUser(app);
    const first = await uploadImage(app, user, 0x01);
    await setAvatar(app, user, { imageId: first });
    const second = await uploadImage(app, user, 0x02);
    const res = await setAvatar(app, user, { imageId: second });
    expect(second).not.toBe(first);
    expect(await firstByteAt(res.json().data.avatarUrl)).toBe(0x02);
    expect(await firstByteAt(await storage.viewUrl(imageKey(first), 3600))).toBe(0x01);
    expect((await imageRow(first)).releasedAt).not.toBeNull();
  });
});

describe('Kho ảnh tạm không trả lời', () => {
  it('đặt ảnh đại diện lúc kho không trả lời: 503 STORAGE_UNAVAILABLE, ảnh đại diện giữ nguyên, nhãn còn', async () => {
    const user = await newUser(app);
    const current = await uploadImage(app, user, 0x10);
    await setAvatar(app, user, { imageId: current });
    const next = await uploadImage(app, user, 0x20);
    const flaky = await buildTestApp({
      storage: {
        ...storage,
        head: () => Promise.reject(new StorageUnavailableError('đọc thông tin ảnh')),
      },
    });
    try {
      await flaky.ready();
      const res = await setAvatar(flaky, user, { imageId: next });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('STORAGE_UNAVAILABLE');
    } finally {
      await flaky.close();
    }
    expect(await firstByteAt((await meOf(user)).avatarUrl ?? '')).toBe(0x10);
    expect((await imageRow(next)).confirmedAt).toBeNull();
  });
});
