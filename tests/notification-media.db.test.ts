import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { imageKey } from '../src/lib/storage/storage.js';
import { createMediaService } from '../src/modules/media/media.service.js';
import { outboxEvents, prisma } from './db-helpers.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { deliverAll, newUser, type TestUser } from './group-helpers.js';
import { createDraft, getOwn, listingApi, liveListingOf } from './listing-http-helpers.js';
import { setAvatar, uploadImage } from './media-helpers.js';
import { storageOf } from './storage-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Change notify-missing-images trên luồng thật (spec media/image-cleanup): lượt đối chiếu kho thấy ảnh đang dùng mất
 * tệp → `media.image.missing` qua outbox → bên nghe thật của `notification` → hộp thư trên DB thật.
 */
const HOUR_MS = 3_600_000;
let app: FastifyInstance;
const storage = storageOf(process.env.STORAGE_URL ?? '');
// Giờ của kho đẩy tới trước: tệp vừa tải trông cũ hơn hạn một quyền tải, như ở `media.jobs.test.ts`.
const media = createMediaService({
  repository: repositories.media,
  storage,
  config: createStaticRuntimeConfig(),
  clock: () => TEST_NOW,
  storageClock: () => new Date(Date.now() + HOUR_MS),
});

beforeAll(async () => {
  app = await buildTestApp({ trust: createInterimTrust('T1'), screening: interimScreening });
  await app.ready();
});

afterAll(() => app.close());

const inbox = (user: TestUser, type: string) =>
  prisma.notification.findMany({ where: { recipientId: user.id, type } });
const reconcileAndDeliver = async () => {
  await media.reconcile({ budgetMs: 60_000 });
  await deliverAll(app);
};
const lose = (imageIds: string[]) => storage.deleteMany(imageIds.map(imageKey));
const remove = async (user: TestUser, listingId: string) =>
  expect((await listingApi(app, 'DELETE', `/listings/${listingId}`, user)).statusCode).toBe(204);

describe('Cổng noticeTargets của listing', () => {
  it('tin sống và nháp có mặt kèm người đăng, tiêu đề; tin đã xoá và mã lạ vắng', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    const draft = await createDraft(app, user);
    const gone = await createDraft(app, user);
    await remove(user, gone.id);
    const targets = await app.modules.listing.noticeTargets([
      live.id,
      draft.id,
      gone.id,
      randomUUID(),
    ]);
    expect(targets).toEqual(
      new Map([
        [live.id, { ownerId: user.id, title: live.title }],
        [draft.id, { ownerId: user.id, title: null }],
      ]),
    );
  });
});

describe('Ảnh đang dùng mà mất khỏi kho', () => {
  it('ảnh đại diện: chủ tài khoản nhận một dòng nhóm "tài khoản" có nhắc; hồ sơ không bị sửa', async () => {
    const user = await newUser(app);
    const imageId = await uploadImage(app, user);
    expect((await setAvatar(app, user, { imageId })).statusCode).toBe(200);
    await lose([imageId]);
    await reconcileAndDeliver();
    const rows = await inbox(user, 'account.avatar.missing');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'account', alert: true, title: 'Ảnh đại diện' });
    const account = await prisma.account.findUniqueOrThrow({ where: { id: user.id } });
    expect(account.avatarImageId).toBe(imageId);
  });

  it('hai ảnh của cùng một tin đang hiển thị: người đăng nhận đúng một dòng chưa đọc "2 ảnh"; tin không bị sửa', async () => {
    const user = await newUser(app);
    const listing = await liveListingOf(app, user, {}, 2);
    await lose(listing.images.map((image) => image.id));
    await reconcileAndDeliver();
    const rows = await inbox(user, 'listing.image.missing');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'your_listings',
      title: listing.title,
      body: '2 ảnh của tin không còn trong kho — mở tin để thay ảnh khác.',
      count: 2,
      readAt: null,
    });
    expect(rows[0]?.alertedAt).not.toBeNull();
    const after = await getOwn(app, user, listing.id);
    expect(after.version).toBe(listing.version);
    expect(after.images.map((image) => image.id)).toEqual(listing.images.map((image) => image.id));
  });

  it('ảnh của tin người đăng đã xoá: sự kiện vẫn phát nhưng không ai nhận thông báo', async () => {
    const user = await newUser(app);
    const listing = await liveListingOf(app, user);
    await remove(user, listing.id);
    const [image] = listing.images;
    if (!image) throw new Error('Tin thử cần một ảnh');
    await lose([image.id]);
    await reconcileAndDeliver();
    const emitted = (await outboxEvents()).some(
      (row) =>
        row.type === 'media.image.missing' &&
        (row.payload as { imageId: string }).imageId === image.id,
    );
    expect(emitted).toBe(true);
    expect(await inbox(user, 'listing.image.missing')).toEqual([]);
  });
});
