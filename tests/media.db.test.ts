import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { repositories } from './test-app.js';

/*
 * Ràng buộc của `init_media` và `account_avatar`, và tranh chấp mà design add-media mục 6 dựa vào khoá dòng: gỡ nhãn
 * (`attach`, trong transaction lưu của chủ) đua với lượt dọn ảnh chưa xác nhận.
 */
const CHECK = '23514';
const FOREIGN_KEY = 'P2003';
const NOW = new Date('2026-10-11T04:00:00.000Z');
const HOUR_MS = 3_600_000;
const repo = repositories.media;

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

const image = (
  uploaderId: string,
  overrides: Partial<Prisma.ImageUncheckedCreateInput> = {},
): Prisma.ImageUncheckedCreateInput => ({
  ownerKind: 'profile',
  ownerId: uploaderId,
  uploaderId,
  contentType: 'image/jpeg',
  byteSize: 2048,
  createdAt: NOW,
  ...overrides,
});

describe('images', () => {
  it.each([
    ['gỡ nhãn khi chưa thấy tệp trong kho', { confirmedAt: NOW }],
    ['đánh dấu bỏ khi chưa từng gỡ nhãn', { uploadedAt: NOW, releasedAt: NOW }],
    ['cỡ 0 byte', { byteSize: 0 }],
  ])('%s → 23514', async (_, overrides) => {
    const { id } = await seedAccount();
    expect(await sqlStateOf(prisma.image.create({ data: image(id, overrides) }))).toBe(CHECK);
  });

  it('người tải không tồn tại → P2003; xoá hẳn tài khoản thì dòng ảnh đi theo', async () => {
    expect(await prismaErrorCode(prisma.image.create({ data: image(randomUUID()) }))).toBe(
      FOREIGN_KEY,
    );
    const { id } = await seedAccount();
    await prisma.image.create({ data: image(id) });
    await prisma.account.delete({ where: { id } });
    expect(await prisma.image.count({ where: { uploaderId: id } })).toBe(0);
  });
});

describe('accounts: ảnh đại diện', () => {
  it('cùng lúc ảnh trong kho và ảnh Google → 23514', async () => {
    const { id } = await seedAccount();
    const write = prisma.account.update({
      where: { id },
      data: {
        avatarImageId: randomUUID(),
        avatarFromGoogle: true,
        googlePictureUrl: 'https://g/a',
      },
    });
    expect(await sqlStateOf(write)).toBe(CHECK);
  });

  it('dùng ảnh Google khi chưa có ảnh Google → 23514', async () => {
    const { id } = await seedAccount();
    const write = prisma.account.update({ where: { id }, data: { avatarFromGoogle: true } });
    expect(await sqlStateOf(write)).toBe(CHECK);
  });
});

const owner = (id: string) => ({ kind: 'profile' as const, id });
const staleUploaded = async () => {
  const { id } = await seedAccount();
  const row = await prisma.image.create({
    data: image(id, { createdAt: new Date(NOW.getTime() - 49 * HOUR_MS), uploadedAt: NOW }),
  });
  return { accountId: id, imageId: row.id };
};

describe('gỡ nhãn đua với lượt dọn', () => {
  it('lượt lưu khoá dòng trước: lượt dọn chờ, xét lại điều kiện và không xoá ảnh vừa gỡ nhãn', async () => {
    const { accountId, imageId } = await staleUploaded();
    let purge: Promise<string[]> | null = null;
    await prisma.$transaction(async (tx) => {
      expect(await repo.attach(tx, { owner: owner(accountId), imageIds: [imageId], at: NOW })).toBe(
        true,
      );
      // Lượt dọn bắt đầu khi transaction lưu còn mở và đang giữ khoá dòng.
      purge = repo.deleteUnconfirmedBefore(NOW, 100);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(await purge).toEqual([]);
    expect((await prisma.image.findUniqueOrThrow({ where: { id: imageId } })).confirmedAt).toEqual(
      NOW,
    );
  });

  it('lượt dọn xoá trước: lượt lưu sau đó nhận false (chủ quay lui, báo IMAGE_NOT_IN_STORAGE)', async () => {
    const { accountId, imageId } = await staleUploaded();
    expect(await repo.deleteUnconfirmedBefore(NOW, 100)).toEqual([imageId]);
    const attached = await prisma.$transaction((tx) =>
      repo.attach(tx, { owner: owner(accountId), imageIds: [imageId], at: NOW }),
    );
    expect(attached).toBe(false);
  });

  it('ảnh chưa tải xong (chưa thấy trong kho) không gỡ nhãn được', async () => {
    const { id } = await seedAccount();
    const row = await prisma.image.create({ data: image(id) });
    const attached = await prisma.$transaction((tx) =>
      repo.attach(tx, { owner: owner(id), imageIds: [row.id], at: NOW }),
    );
    expect(attached).toBe(false);
    expect(
      (await prisma.image.findUniqueOrThrow({ where: { id: row.id } })).confirmedAt,
    ).toBeNull();
  });
});
