import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createCloudinaryStorage,
  signDeliveryPath,
  signUploadParams,
} from '../src/lib/storage/cloudinary.storage.js';
import { StorageUnavailableError } from '../src/lib/storage/storage.js';

/*
 * Bộ nối Cloudinary (change use-cloudinary-storage) với `fetch` giả: chữ ký, trường của quyền tải, đường xem, cách gọi
 * Admin API. Cloudinary không chạy được trong docker-compose, nên khớp với kho thật hay không chỉ kiểm tay trên tài
 * khoản thật (task 3.1 của change use-cloudinary-storage).
 */
const CONFIG = {
  kind: 'cloudinary' as const,
  cloudName: 'ghim-cloud',
  apiKey: '123456',
  apiSecret: 'bi-mat-khong-lo',
  folder: 'ghim-server',
};

interface Call {
  url: string;
  method: string;
  authorization: string | null;
}

/** `fetch` giả trả lần lượt các response cho trước (một `Error` thì ném ra) và ghi lại mỗi lượt gọi. */
function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const signals: (AbortSignal | null)[] = [];
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      authorization: headers.get('authorization'),
    });
    signals.push(init?.signal ?? null);
    const next = responses.shift();
    if (!next) throw new Error('Hết response giả');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { request, calls, signals };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Chữ ký', () => {
  it('tải lên: đúng bộ thử trong tài liệu Cloudinary', () => {
    expect(
      signUploadParams(
        {
          timestamp: '1315060510',
          public_id: 'sample_image',
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('đường xem: 8 ký tự base64 an toàn cho URL', () => {
    expect(signDeliveryPath('ghim-server/img/abc', 'abcd')).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });
});

describe('Quyền tải và đường xem', () => {
  const storage = createCloudinaryStorage(CONFIG, fakeFetch([]).request);

  it('quyền tải là biểu mẫu POST: public_id cố định, không ghi đè, chỉ nhận ảnh, ký đủ trường', async () => {
    const signedAt = new Date('2026-10-14T08:00:00.000Z');
    const grant = await storage.presignUpload({
      key: 'img/abc',
      contentType: 'image/jpeg',
      byteSize: 2048,
      ttlSeconds: 900,
      signedAt,
    });
    const signed = {
      allowed_formats: 'jpg,png,webp',
      overwrite: 'false',
      public_id: 'ghim-server/img/abc',
      timestamp: String(signedAt.getTime() / 1000),
      type: 'authenticated',
    };
    expect(grant).toEqual({
      method: 'POST',
      url: 'https://api.cloudinary.com/v1_1/ghim-cloud/image/upload',
      headers: {},
      fields: {
        ...signed,
        api_key: '123456',
        signature: signUploadParams(signed, CONFIG.apiSecret),
      },
      expiresAt: new Date(signedAt.getTime() + 900_000),
    });
    expect(JSON.stringify(grant)).not.toContain(CONFIG.apiSecret);
  });

  it('đường xem: ảnh authenticated có chữ ký, cùng một ảnh ra cùng một URL', async () => {
    const url = await storage.viewUrl('img/abc', 3600);
    const signature = signDeliveryPath('ghim-server/img/abc', CONFIG.apiSecret);
    expect(url).toBe(
      `https://res.cloudinary.com/ghim-cloud/image/authenticated/s--${signature}--/ghim-server/img/abc`,
    );
    expect(await storage.viewUrl('img/abc', 60)).toBe(url);
  });
});

const resource = (id: string) => ({
  public_id: `ghim-server/img/${id}`,
  created_at: '2026-10-14T08:00:00Z',
});

describe('Admin API', () => {
  it('head: định dạng thành loại ảnh; không có ảnh thì null; gọi bằng Basic auth', async () => {
    const { request, calls } = fakeFetch([
      json({ bytes: 2048, format: 'jpg' }),
      json({ error: { message: 'Resource not found' } }, 404),
    ]);
    const storage = createCloudinaryStorage(CONFIG, request);
    expect(await storage.head('img/abc')).toEqual({ byteSize: 2048, contentType: 'image/jpeg' });
    expect(await storage.head('img/khong-co')).toBeNull();
    expect(calls[0]).toEqual({
      url: 'https://api.cloudinary.com/v1_1/ghim-cloud/resources/image/authenticated/ghim-server/img/abc',
      method: 'GET',
      authorization: `Basic ${Buffer.from('123456:bi-mat-khong-lo').toString('base64')}`,
    });
  });

  it('xoá nhiều: lô 50 public_id, URL còn xa trần 8 KB, kèm invalidate để CDN thôi trả ảnh đã xoá', async () => {
    const { request, calls } = fakeFetch([json({}), json({}), json({})]);
    const storage = createCloudinaryStorage({ ...CONFIG, folder: 'ghim-server-dev' }, request);
    await storage.deleteMany(Array.from({ length: 120 }, () => `img/${randomUUID()}`));
    expect(calls.map((call) => call.method)).toEqual(['DELETE', 'DELETE', 'DELETE']);
    const sizes = calls.map((call) => new URL(call.url).searchParams.getAll('public_ids[]').length);
    expect(sizes).toEqual([50, 50, 20]);
    expect(Math.max(...calls.map((call) => call.url.length))).toBeLessThan(4096);
    expect(calls.every((call) => new URL(call.url).searchParams.get('invalidate') === 'true')).toBe(
      true,
    );
  });

  it('liệt kê: trang liền nhau đi theo con trỏ đã nhớ; khoá chưa thấy thì đi lại từ đầu và bỏ khoá đã qua', async () => {
    const { request, calls } = fakeFetch([
      json({ resources: [resource('a'), resource('b')], next_cursor: 'c1' }),
      json({ resources: [resource('c')] }),
      json({ resources: [resource('a'), resource('b')], next_cursor: 'c1' }),
      json({ resources: [resource('c')] }),
    ]);
    const storage = createCloudinaryStorage(CONFIG, request);
    const first = await storage.list({ prefix: 'img/', limit: 2 });
    expect(first).toEqual({
      items: [
        { key: 'img/a', lastModified: new Date('2026-10-14T08:00:00Z') },
        { key: 'img/b', lastModified: new Date('2026-10-14T08:00:00Z') },
      ],
      next: 'img/b',
    });
    const second = await storage.list({ prefix: 'img/', after: 'img/b', limit: 2 });
    expect(second.items.map((item) => item.key)).toEqual(['img/c']);
    expect(second.next).toBeNull();
    expect(new URL(calls[1]?.url ?? '').searchParams.get('next_cursor')).toBe('c1');

    const fresh = createCloudinaryStorage(CONFIG, request);
    const resumed = await fresh.list({ prefix: 'img/', after: 'img/b', limit: 2 });
    expect(resumed.items.map((item) => item.key)).toEqual(['img/c']);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('prefix')).toBe('ghim-server/img/');
  });

  it('đọc: vượt trần thì ném; không có tệp thì null; lỗi không mang secret', async () => {
    const { request } = fakeFetch([
      new Response(new Uint8Array(11), { status: 206 }),
      new Response('', { status: 404 }),
      json({ error: { message: 'Invalid Signature' } }, 401),
    ]);
    const storage = createCloudinaryStorage(CONFIG, request);
    await expect(storage.read('img/abc', 10)).rejects.toThrow('lớn hơn 10 byte');
    expect(await storage.read('img/abc', 10)).toBeNull();
    const error = await storage.read('img/abc', 10).catch((caught: unknown) => caught);
    expect(String(error)).toContain('401');
    expect(String(error)).not.toContain(CONFIG.apiSecret);
    // Khoá hay chữ ký sai là lỗi cấu hình: phải ra 500 cho người sửa, không phải "thử lại sau".
    expect(error).not.toBeInstanceOf(StorageUnavailableError);
  });
});

const unavailable = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(StorageUnavailableError);

describe('Kho không trả lời', () => {
  it('quá giờ hay mất mạng: StorageUnavailableError; mọi lượt gọi mang hạn giờ', async () => {
    const { request, signals } = fakeFetch([
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      new TypeError('fetch failed'),
    ]);
    const storage = createCloudinaryStorage(CONFIG, request);
    await unavailable(storage.head('img/abc'));
    await unavailable(storage.copy('img/abc', 'img/def'));
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it('quá trần lượt gọi (420, 429) hay 5xx: StorageUnavailableError, câu lỗi không mang secret', async () => {
    const { request } = fakeFetch([
      json({ error: { message: 'Rate Limit Exceeded' } }, 420),
      json({}, 429),
      new Response('', { status: 503 }),
    ]);
    const storage = createCloudinaryStorage(CONFIG, request);
    const error = await storage.head('img/abc').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageUnavailableError);
    expect(String((error as Error).cause)).toContain('420');
    expect(String((error as Error).cause)).not.toContain(CONFIG.apiSecret);
    await unavailable(storage.list({ prefix: 'img/', limit: 10 }));
    await unavailable(storage.deleteMany(['img/abc']));
  });

  it('đứt giữa lúc tải thân ảnh: StorageUnavailableError', async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.error(new DOMException('timeout', 'TimeoutError')),
    });
    const { request } = fakeFetch([new Response(broken, { status: 206 })]);
    const storage = createCloudinaryStorage(CONFIG, request);
    await unavailable(storage.read('img/abc', 10));
  });
});
