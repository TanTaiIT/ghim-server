import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { imageKey } from '../src/lib/storage/storage.js';
import { createMediaService } from '../src/modules/media/media.service.js';
import { prisma } from './db-helpers.js';
import { firstByteAt } from './media-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { fakeJpeg, storageOf, uploadWith } from './storage-helpers.js';
import { repositories, TEST_NOW } from './test-app.js';

/*
 * Delta `media/image-storage` của add-listings — "Bản sao ảnh cho tin chuyển lên sàn chung" — trên DB và kho thật. Chủ
 * `listing` không có khoá ngoại sang `listings`, nên dòng ảnh của tin dựng thẳng được mà không cần tin.
 */
const storage = storageOf(process.env.STORAGE_URL ?? '');
const media = createMediaService({
  repository: repositories.media,
  storage,
  config: createStaticRuntimeConfig(),
  clock: () => TEST_NOW,
});

afterAll(() => prisma.$disconnect());

/** Ba ảnh đã tải và đã xác nhận cho một tin, mỗi ảnh tô một byte riêng để so ruột bản sao. */
async function listingWithImages(uploaderId: string, fills: number[]) {
  const listingId = randomUUID();
  const ids = await Promise.all(
    fills.map(async (fill) => {
      const row = await prisma.image.create({
        data: {
          ownerKind: 'listing',
          ownerId: listingId,
          uploaderId,
          contentType: 'image/jpeg',
          byteSize: 64,
          uploadedAt: TEST_NOW,
          confirmedAt: TEST_NOW,
          createdAt: TEST_NOW,
        },
      });
      const grant = await storage.presignUpload({
        key: imageKey(row.id),
        contentType: 'image/jpeg',
        byteSize: 64,
        ttlSeconds: 900,
      });
      await uploadWith(grant, fakeJpeg(64, fill));
      return row.id;
    }),
  );
  return { listingId, imageIds: ids };
}

describe('Bản sao ảnh cho tin chuyển lên sàn chung', () => {
  it('chuyển tin có ba ảnh: tin mới có ba ảnh mới cùng thứ tự, thuộc tin mới; ảnh tin cũ vẫn thuộc tin cũ', async () => {
    const { id: uploaderId } = await seedAccount();
    const old = await listingWithImages(uploaderId, [0x01, 0x02, 0x03]);
    const target = randomUUID();
    const copy = await media.copyImages({
      from: { kind: 'listing', id: old.listingId },
      to: { kind: 'listing', id: target },
      imageIds: old.imageIds,
      uploaderId,
    });
    await prisma.$transaction((tx) => copy.commit(tx));

    expect(copy.imageIds).toHaveLength(3);
    expect(copy.imageIds.some((id) => old.imageIds.includes(id))).toBe(false);
    const fresh = await prisma.image.findMany({ where: { id: { in: copy.imageIds } } });
    expect(fresh.every((row) => row.ownerId === target && row.confirmedAt !== null)).toBe(true);
    const bytes = await Promise.all(
      copy.imageIds.map(async (id) => firstByteAt(await storage.viewUrl(imageKey(id), 3600))),
    );
    expect(bytes).toEqual([0x01, 0x02, 0x03]);
    const kept = await prisma.image.findMany({ where: { id: { in: old.imageIds } } });
    expect(kept.every((row) => row.ownerId === old.listingId)).toBe(true);
  });

  it('tin cũ bị xoá hẳn sau đó: ảnh của tin mới vẫn còn trong kho', async () => {
    const { id: uploaderId } = await seedAccount();
    const old = await listingWithImages(uploaderId, [0x0a]);
    const target = randomUUID();
    const copy = await media.copyImages({
      from: { kind: 'listing', id: old.listingId },
      to: { kind: 'listing', id: target },
      imageIds: old.imageIds,
      uploaderId,
    });
    await prisma.$transaction((tx) => copy.commit(tx));
    const removed = await repositories.media.deleteByOwners('listing', [old.listingId]);
    await storage.deleteMany(removed.map(imageKey));
    expect(await storage.head(imageKey(old.imageIds[0] ?? ''))).toBeNull();
    expect(await firstByteAt(await storage.viewUrl(imageKey(copy.imageIds[0] ?? ''), 3600))).toBe(
      0x0a,
    );
  });

  it('transaction của chủ hỏng: không có dòng ảnh mới (tệp chép chờ lượt đối chiếu vét)', async () => {
    const { id: uploaderId } = await seedAccount();
    const old = await listingWithImages(uploaderId, [0x0b]);
    const copy = await media.copyImages({
      from: { kind: 'listing', id: old.listingId },
      to: { kind: 'listing', id: randomUUID() },
      imageIds: old.imageIds,
      uploaderId,
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await copy.commit(tx);
        throw new Error('lượt ghi của chủ hỏng');
      }),
    ).rejects.toThrow();
    expect(await prisma.image.count({ where: { id: { in: copy.imageIds } } })).toBe(0);
  });

  it('ảnh không thuộc tin nguồn: IMAGE_NOT_IN_STORAGE, không chép gì', async () => {
    const { id: uploaderId } = await seedAccount();
    const old = await listingWithImages(uploaderId, [0x0c]);
    await expect(
      media.copyImages({
        from: { kind: 'listing', id: randomUUID() },
        to: { kind: 'listing', id: randomUUID() },
        imageIds: old.imageIds,
        uploaderId,
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_NOT_IN_STORAGE' });
  });
});
