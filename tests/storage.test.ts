import { describe, expect, it } from 'vitest';

import { parseStorageUrl, storageUrlIssue } from '../src/config/storage-url.js';
import { fakeJpeg, storageOf, uploadWith } from './storage-helpers.js';

/*
 * Cổng của kho ảnh (design add-media mục 1): container được chọn phải giữ đúng mấy điều thiết kế dựa vào — một quyền
 * tải = một tệp, không ghi đè, chữ ký phủ cỡ và loại, quá hạn thì chết. Đỏ ở đây thì đổi kho, không nới thiết kế.
 */
const storage = storageOf(process.env.STORAGE_URL ?? '');
let seq = 0;
const nextKey = () => {
  seq += 1;
  return `img/cong-${Date.now()}-${seq}`;
};
const MINUTE = 60;

const grantFor = (key: string, byteSize = 2048, signedAt?: Date) =>
  storage.presignUpload({
    key,
    contentType: 'image/jpeg',
    byteSize,
    ttlSeconds: 15 * MINUTE,
    ...(signedAt ? { signedAt } : {}),
  });

describe('STORAGE_URL', () => {
  it('tách được endpoint, bucket, khoá; secret có ký tự đặc biệt qua mã hoá phần trăm', () => {
    expect(
      parseStorageUrl('https://key:s%2Fe%40c@acc.r2.cloudflarestorage.com/ghim-prod?region=auto'),
    ).toEqual({
      kind: 's3',
      endpoint: 'https://acc.r2.cloudflarestorage.com',
      bucket: 'ghim-prod',
      region: 'auto',
      accessKeyId: 'key',
      secretAccessKey: 's/e@c',
    });
    expect(parseStorageUrl('http://ghim:x@localhost:9100/ghim-dev')).toMatchObject({
      region: 'auto',
    });
  });

  it('dạng Cloudinary: khoá, secret, cloud name; thư mục mặc định ghim-server', () => {
    expect(
      parseStorageUrl('cloudinary://123456:s%2Fe%40c@ghim-cloud?folder=ghim-server/prod'),
    ).toEqual({
      kind: 'cloudinary',
      cloudName: 'ghim-cloud',
      apiKey: '123456',
      apiSecret: 's/e@c',
      folder: 'ghim-server/prod',
    });
    expect(parseStorageUrl('cloudinary://123456:secret@ghim-cloud')).toMatchObject({
      folder: 'ghim-server',
    });
  });

  it.each([
    ['không khoá', 'http://localhost:9100/ghim-dev'],
    ['không bucket', 'http://ghim:x@localhost:9100/'],
    ['bucket chữ hoa', 'http://ghim:x@localhost:9100/Ghim'],
    ['giao thức lạ', 's3://ghim:x@localhost:9100/ghim-dev'],
    ['Cloudinary thiếu secret', 'cloudinary://123456@ghim-cloud'],
    ['Cloudinary thư mục lạ', 'cloudinary://123456:secret@ghim-cloud?folder=../ra-ngoai'],
  ])('từ chối: %s', (_, value) => {
    expect(storageUrlIssue(value)).not.toBeNull();
  });
});

describe('kho thật', () => {
  it('tải bằng URL đã ký: tệp vào kho đúng cỡ, đúng loại', async () => {
    const key = nextKey();
    const res = await uploadWith(await grantFor(key), fakeJpeg());
    expect(res.status).toBe(200);
    expect(await storage.head(key)).toEqual({ byteSize: 2048, contentType: 'image/jpeg' });
  });

  it('dùng lại URL đã tải xong để thay ruột: kho từ chối (412), ruột giữ nguyên', async () => {
    const key = nextKey();
    const grant = await grantFor(key);
    expect((await uploadWith(grant, fakeJpeg(2048, 0x11))).status).toBe(200);
    expect((await uploadWith(grant, fakeJpeg(2048, 0x22))).status).toBe(412);
    const body = new Uint8Array(
      await (await fetch(await storage.viewUrl(key, 60 * MINUTE))).arrayBuffer(),
    );
    expect(body[0]).toBe(0x11);
  });

  it('tệp nặng hơn cỡ đã khai, sai loại, thiếu If-None-Match: kho từ chối, không tệp nào được ghi', async () => {
    const key = nextKey();
    const grant = await grantFor(key);
    expect((await uploadWith(grant, fakeJpeg(4096))).status).toBe(403);
    expect(
      (await uploadWith(grant, fakeJpeg(), { ...grant.headers, 'Content-Type': 'text/plain' }))
        .status,
    ).toBe(403);
    expect((await uploadWith(grant, fakeJpeg(), { 'Content-Type': 'image/jpeg' })).status).toBe(
      403,
    );
    expect(await storage.head(key)).toBeNull();
  });

  it('quyền tải quá 15 phút: kho từ chối', async () => {
    const key = nextKey();
    const grant = await grantFor(key, 2048, new Date(Date.now() - 16 * MINUTE * 1000));
    expect((await uploadWith(grant, fakeJpeg())).status).toBe(403);
    expect(await storage.head(key)).toBeNull();
  });

  it('đường xem: cùng khung giờ ra cùng URL; quá hạn thì không mở được', async () => {
    const key = nextKey();
    await uploadWith(await grantFor(key), fakeJpeg());
    const hour = 60 * MINUTE;
    const start = new Date(Math.floor(Date.now() / (hour * 1000)) * hour * 1000);
    const early = await storage.viewUrl(key, hour, new Date(start.getTime() + 1000));
    const late = await storage.viewUrl(key, hour, new Date(start.getTime() + 59 * MINUTE * 1000));
    expect(late).toBe(early);
    expect((await fetch(early)).status).toBe(200);
    const stale = await storage.viewUrl(key, hour, new Date(Date.now() - 3 * hour * 1000));
    expect((await fetch(stale)).status).toBe(403);
  });

  it('liệt kê theo trang, xoá nhiều; tệp không có thì head trả null', async () => {
    const prefix = `img/trang-${Date.now()}-`;
    const keys = [1, 2, 3].map((index) => `${prefix}${index}`);
    await Promise.all(keys.map(async (key) => uploadWith(await grantFor(key), fakeJpeg())));
    const first = await storage.list({ prefix, limit: 2 });
    expect(first.items.map((item) => item.key)).toEqual(keys.slice(0, 2));
    const second = await storage.list({ prefix, after: first.next ?? undefined, limit: 2 });
    expect(second.items.map((item) => item.key)).toEqual(keys.slice(2));
    expect(second.next).toBeNull();
    await storage.deleteMany(keys);
    expect(await storage.head(keys[0] ?? '')).toBeNull();
    expect((await storage.list({ prefix, limit: 10 })).items).toEqual([]);
  });
});
