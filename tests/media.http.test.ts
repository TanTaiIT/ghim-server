import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { imageKey } from '../src/lib/storage/storage.js';
import { prisma } from './db-helpers.js';
import { newUser, type TestUser } from './group-helpers.js';
import { firstByteAt, requestUpload } from './media-helpers.js';
import { fakeJpeg, storageOf, uploadWith } from './storage-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/* Spec `media/image-storage` (xin tải, giới hạn, không ghi đè) qua HTTP và kho thật. */
const MAX_PER_HOUR = 3;
let now = TEST_NOW;
let app: FastifyInstance;
const storage = storageOf(process.env.STORAGE_URL ?? '');

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    config: createStaticRuntimeConfig({ 'media.uploadGrantsPerHour': MAX_PER_HOUR }),
  });
  await app.ready();
});

afterAll(() => app.close());

type Grant = { imageId: string; upload: { url: string; headers: Record<string, string> } };
const grantOf = (res: { json(): unknown }) => (res.json() as { data: Grant }).data;
const imagesOf = (user: TestUser) => prisma.image.count({ where: { uploaderId: user.id } });

describe('Xin tải ảnh cho một chủ của mình', () => {
  it('hồ sơ của mình: 201 kèm quyền tải đúng một ảnh, ảnh tải xong thuộc về hồ sơ đó', async () => {
    const user = await newUser(app);
    const res = await requestUpload(app, user);
    expect(res.statusCode, res.body).toBe(201);
    const grant = grantOf(res);
    expect(grant.upload).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
    });
    expect((await uploadWith(grant.upload, fakeJpeg())).status).toBe(200);
    expect(await prisma.image.findUniqueOrThrow({ where: { id: grant.imageId } })).toMatchObject({
      ownerKind: 'profile',
      ownerId: user.id,
      uploaderId: user.id,
      confirmedAt: null,
    });
    expect(await storage.head(imageKey(grant.imageId))).toEqual({
      byteSize: 2048,
      contentType: 'image/jpeg',
    });
  });

  it('khách chưa đăng nhập: 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      payload: {
        ownerKind: 'profile',
        ownerId: randomUUID(),
        contentType: 'image/jpeg',
        byteSize: 1,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('hồ sơ của người khác, hay chủ không tồn tại: cùng 404 NOT_FOUND, không cấp quyền nào', async () => {
    const user = await newUser(app);
    const other = await newUser(app);
    const ofOther = await requestUpload(app, user, { ownerId: other.id });
    const ofNobody = await requestUpload(app, user, {
      ownerKind: 'listing',
      ownerId: randomUUID(),
    });
    expect(ofOther.statusCode).toBe(404);
    expect(ofOther.json().error.code).toBe('NOT_FOUND');
    expect(ofNobody.json()).toEqual(ofOther.json());
    expect(await imagesOf(user)).toBe(0);
  });
});

describe('Giới hạn của một lượt tải', () => {
  it('tệp khai là văn bản: 400 VALIDATION_ERROR, không cấp quyền nào', async () => {
    const user = await newUser(app);
    const res = await requestUpload(app, user, { contentType: 'text/plain' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await imagesOf(user)).toBe(0);
  });

  it('HEIC không nhận: 400 VALIDATION_ERROR', async () => {
    const user = await newUser(app);
    expect((await requestUpload(app, user, { contentType: 'image/heic' })).statusCode).toBe(400);
  });

  it('ảnh khai nặng 6 MB: 400 VALIDATION_ERROR nêu trần, không cấp quyền nào', async () => {
    const user = await newUser(app);
    const res = await requestUpload(app, user, { byteSize: 6 * 1024 * 1024 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(res.json().error.message).toContain('5 MB');
    expect(await imagesOf(user)).toBe(0);
  });

  it('quá số lượt xin trong một giờ: 429 UPLOAD_LIMIT; một giờ sau xin lại được', async () => {
    const user = await newUser(app);
    const results = await Promise.all(
      Array.from({ length: MAX_PER_HOUR + 2 }, () => requestUpload(app, user)),
    );
    // Xin song song vẫn không lọt quá trần: đếm và ghi nằm sau một khoá theo người.
    expect(results.filter((res) => res.statusCode === 201)).toHaveLength(MAX_PER_HOUR);
    const refused = results.find((res) => res.statusCode === 429);
    expect(refused?.json().error.code).toBe('UPLOAD_LIMIT');
    expect(await imagesOf(user)).toBe(MAX_PER_HOUR);
    now = new Date(now.getTime() + 61 * 60_000);
    expect((await requestUpload(app, user)).statusCode).toBe(201);
  });

  it('tải lên tệp nặng hơn cỡ đã khai: kho từ chối, không ảnh nào được ghi', async () => {
    const user = await newUser(app);
    const grant = grantOf(await requestUpload(app, user, { byteSize: 1024 }));
    expect((await uploadWith(grant.upload, fakeJpeg(4096))).status).toBe(403);
    expect(await storage.head(imageKey(grant.imageId))).toBeNull();
  });
});

describe('Ảnh đã tải không bị ghi đè', () => {
  it('dùng lại quyền tải để thay ruột: bị từ chối, ảnh trong kho giữ nội dung cũ', async () => {
    const user = await newUser(app);
    const grant = grantOf(await requestUpload(app, user));
    expect((await uploadWith(grant.upload, fakeJpeg(2048, 0x11))).status).toBe(200);
    expect((await uploadWith(grant.upload, fakeJpeg(2048, 0x22))).status).toBe(412);
    expect(await firstByteAt(await storage.viewUrl(imageKey(grant.imageId), 3600))).toBe(0x11);
  });
});

describe('Swagger', () => {
  it('khai route xin tải với bearerAuth và mã lỗi 400 / 401 / 404 / 429', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as {
      paths: Record<string, Record<string, { security?: unknown[]; responses: object }>>;
    };
    const op = doc.paths['/api/v1/media/uploads']?.['post'];
    expect(op?.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(op?.responses ?? {})).toEqual(
      expect.arrayContaining(['201', '400', '401', '404', '429']),
    );
  });
});
