import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { imageKey } from '../src/lib/storage/storage.js';
import { MEDIA_JOBS } from '../src/modules/media/media.jobs.js';
import { createMediaService } from '../src/modules/media/media.service.js';
import { outboxEvents, prisma } from './db-helpers.js';
import { api, newUser } from './group-helpers.js';
import { setAvatar, uploadImage } from './media-helpers.js';
import { fakeJpeg, storageOf, uploadWith } from './storage-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';
import type { FakeJobs } from './fakes/jobs.fake.js';

/*
 * Spec `media/image-cleanup`: lượt dọn 6 giờ và lượt đối chiếu hằng tháng trên DB và kho thật. Đồng hồ app tiến tay để
 * qua mốc 48 giờ; giờ của kho (so với `lastModified` của tệp) tiến riêng để tệp vừa tải trông như đã cũ.
 */
const HOUR_MS = 3_600_000;
let now = TEST_NOW;
let storageNow = new Date();
let app: FastifyInstance;
const storage = storageOf(process.env.STORAGE_URL ?? '');
const media = createMediaService({
  repository: repositories.media,
  storage,
  config: createStaticRuntimeConfig(),
  clock: () => now,
  storageClock: () => storageNow,
});

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
});

afterAll(() => app.close());

const later = (hours: number) => {
  now = new Date(now.getTime() + hours * HOUR_MS);
};
const inStorage = async (imageId: string) => (await storage.head(imageKey(imageId))) !== null;
const reconcile = () => {
  // Mọi tệp tải trước lúc này trông cũ hơn hạn một quyền tải.
  storageNow = new Date(Date.now() + HOUR_MS);
  return media.reconcile({ budgetMs: 60_000 });
};

describe('Xoá ảnh chưa xác nhận quá 48 giờ', () => {
  it('ảnh tải dở quá 48 giờ: lượt dọn xoá cả dòng lẫn tệp; đặt làm ảnh đại diện sau đó → IMAGE_NOT_IN_STORAGE', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    later(49);
    expect(await media.purgeUnconfirmed()).toBeGreaterThanOrEqual(1);
    expect(await inStorage(imageId)).toBe(false);
    expect(await prisma.image.count({ where: { id: imageId } })).toBe(0);
    const res = await setAvatar(app, user, { imageId });
    expect(res.json().error.code).toBe('IMAGE_NOT_IN_STORAGE');
  });

  it('ảnh mới tải 47 giờ: còn trong kho và vẫn đặt làm ảnh đại diện được', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    later(47);
    await media.purgeUnconfirmed();
    expect(await inStorage(imageId)).toBe(true);
    expect((await setAvatar(app, user, { imageId })).statusCode).toBe(200);
  });

  it('ảnh đã gỡ nhãn trong 48 giờ đầu: lượt dọn lúc 50 giờ không xoá; chạy lại không làm gì thêm', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    await setAvatar(app, user, { imageId });
    later(50);
    await media.purgeUnconfirmed();
    expect(await media.purgeUnconfirmed()).toBe(0);
    expect(await inStorage(imageId)).toBe(true);
  });
});

describe('Ảnh được dọn theo chủ', () => {
  it('tài khoản bị xoá hẳn: ảnh đại diện và ảnh vừa tải còn nhãn đều bị xoá ở lượt đối chiếu kế tiếp', async () => {
    const user = await newUser(app);
    const avatar = await uploadImage(app, user);
    await setAvatar(app, user, { imageId: avatar });
    const fresh = await uploadImage(app, user);
    // Xoá hẳn tài khoản là việc của add-data-retention; ở đây xoá thẳng dòng như việc đó sẽ làm.
    await prisma.account.delete({ where: { id: user.id } });
    await reconcile();
    expect(await inStorage(avatar)).toBe(false);
    expect(await inStorage(fresh)).toBe(false);
  });

  it('tài khoản bị xoá mềm (đang chờ xoá hẳn): ảnh đại diện vẫn còn sau lượt đối chiếu', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    await setAvatar(app, user, { imageId });
    expect((await api(app, 'DELETE', '/me', user.token, {})).statusCode).toBeLessThan(300);
    await reconcile();
    expect(await inStorage(imageId)).toBe(true);
  });
});

describe('Đối chiếu kho ảnh hằng tháng', () => {
  it('ảnh bị thay: ảnh cũ bị xoá khỏi kho, ảnh mới còn', async () => {
    const user = await newUser(app);
    const first = await uploadImage(app, user);
    await setAvatar(app, user, { imageId: first });
    const second = await uploadImage(app, user);
    await setAvatar(app, user, { imageId: second });
    const result = await reconcile();
    expect(result.released).toBeGreaterThanOrEqual(1);
    expect(await inStorage(first)).toBe(false);
    expect(await inStorage(second)).toBe(true);
  });

  it('tệp không ứng với ảnh nào: xoá khi đã cũ hơn hạn một quyền tải, còn mới thì để yên', async () => {
    const orphan = randomUUID();
    const grant = await storage.presignUpload({
      key: imageKey(orphan),
      contentType: 'image/jpeg',
      byteSize: 16,
      ttlSeconds: 900,
    });
    await uploadWith(grant, fakeJpeg(16));
    storageNow = new Date();
    await media.reconcile({ budgetMs: 60_000 });
    expect(await inStorage(orphan)).toBe(true);
    const result = await reconcile();
    expect(result.orphans).toBeGreaterThanOrEqual(1);
    expect(await inStorage(orphan)).toBe(false);
  });

  it('ảnh mới tải 2 giờ còn nhãn: vẫn còn trong kho và vẫn đặt làm ảnh đại diện được', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    later(2);
    await reconcile();
    expect(await inStorage(imageId)).toBe(true);
    expect((await setAvatar(app, user, { imageId })).statusCode).toBe(200);
  });

  it('ảnh đang dùng mà tệp mất khỏi kho: phát media.image.missing cho chủ, hồ sơ không bị sửa', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    await setAvatar(app, user, { imageId });
    await storage.deleteMany([imageKey(imageId)]);
    const result = await reconcile();
    expect(result.missing).toBeGreaterThanOrEqual(1);
    const event = (await outboxEvents()).find(
      (row) =>
        row.type === 'media.image.missing' &&
        (row.payload as { imageId: string }).imageId === imageId,
    );
    expect(event?.payload).toEqual({ imageId, ownerKind: 'profile', ownerId: user.id });
    const account = await prisma.account.findUniqueOrThrow({ where: { id: user.id } });
    expect(account.avatarImageId).toBe(imageId);
  });

  it('chạm trần thời gian: báo đã làm một phần kèm số đã xét, lượt sau xét tiếp phần còn lại', async () => {
    const orphans = [randomUUID(), randomUUID(), randomUUID()].toSorted();
    await Promise.all(
      orphans.map(async (id) =>
        uploadWith(
          await storage.presignUpload({
            key: imageKey(id),
            contentType: 'image/jpeg',
            byteSize: 8,
            ttlSeconds: 900,
          }),
          fakeJpeg(8),
        ),
      ),
    );
    storageNow = new Date(Date.now() + HOUR_MS);
    const before = await storage.list({ prefix: 'img/', limit: 1000 });
    const first = await media.reconcile({ budgetMs: 0, pageSize: 1 });
    expect(first).toMatchObject({ scanned: 1 });
    expect(first.next).not.toBeNull();
    const rest = await media.reconcile({
      after: first.next ?? undefined,
      budgetMs: 60_000,
      pageSize: 1,
    });
    expect(rest.next).toBeNull();
    expect(first.scanned + rest.scanned).toBe(before.items.length);
    expect(await Promise.all(orphans.map(inStorage))).toEqual([false, false, false]);
  });
});

describe('Lịch', () => {
  it('dọn mỗi 6 giờ, đối chiếu ngày 1 hằng tháng; lượt dở xếp lượt làm tiếp', () => {
    const { schedules } = app.jobs as FakeJobs;
    expect(schedules).toEqual(
      expect.arrayContaining([
        { name: MEDIA_JOBS.purgeUnconfirmed, cron: '0 */6 * * *' },
        { name: MEDIA_JOBS.reconcile, cron: '30 3 1 * *' },
      ]),
    );
  });
});
