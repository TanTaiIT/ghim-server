import { createHash } from 'node:crypto';

import type { CloudinaryStorageConfig } from '../../config/storage-url.js';
import { type Storage, type StoredObject, StorageUnavailableError } from './storage.js';

/*
 * Kho ảnh trên Cloudinary, dùng tạm tới khi chuyển R2 (change use-cloudinary-storage). Gọi Upload API và Admin API bằng
 * `fetch` như `docs/market`, không SDK. Ảnh để kiểu `authenticated`: không chữ ký thì CDN trả 401. Những điều kho S3 tự
 * ràng mà Cloudinary không ràng (cỡ, hạn 15 phút, đường xem có hạn) ghi ở design mục 4 và Risks.
 */

/** Cùng bộ với `IMAGE_CONTENT_TYPES` của `media`; Cloudinary gọi JPEG là `jpg`. */
const ALLOWED_FORMATS = 'jpg,png,webp';
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
/**
 * Admin API nhận tới 100 `public_id` mỗi lệnh xoá, nhưng chúng nằm trong query string: lô 100 dài 7,5–7,9 KB (đo
 * 15/10/2026 với `ghim-server` / `ghim-server-dev`), sát trần 8 KB dòng request của nhiều máy chủ — lô 50 còn một nửa.
 */
const DELETE_BATCH = 50;
/** Trần của Admin API: liệt kê tối đa 500 mỗi trang. */
const LIST_MAX = 500;
/** Lệnh nặng nhất là đọc hay chép một ảnh 5 MB; quá hạn này coi như kho không trả lời. */
const REQUEST_TIMEOUT_MS = 15_000;
/** 420 là mã quá trần lượt gọi của Cloudinary; 429 và 5xx cũng là lỗi thoáng qua, làm lại sau là được. */
const RATE_LIMITED = new Set([420, 429]);
/** Đủ cho mọi trang của một lượt đối chiếu kho; quá thì quên con trỏ cũ nhất. */
const CURSOR_MEMORY = 1000;

/** Chữ ký tải lên: khoá xếp theo chữ cái, `k=v` nối bằng `&`, ghép `api_secret`, SHA-1 hex. `file`, `api_key` không ký. */
export function signUploadParams(
  params: Readonly<Record<string, string>>,
  apiSecret: string,
): string {
  const canonical = Object.keys(params)
    .toSorted()
    .map((name) => `${name}=${params[name] ?? ''}`)
    .join('&');
  return createHash('sha1')
    .update(canonical + apiSecret)
    .digest('hex');
}

/** Chữ ký đường xem: 8 ký tự đầu của SHA-1 dạng base64 an toàn cho URL, trên phần đường dẫn sau chữ ký. */
export function signDeliveryPath(path: string, apiSecret: string): string {
  return createHash('sha1')
    .update(path + apiSecret)
    .digest('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .slice(0, 8);
}

/** Lỗi đọc được, không bao giờ mang khoá: chỉ thao tác, mã HTTP và câu lỗi của Cloudinary. */
const failure = async (action: string, res: Response): Promise<Error> => {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new Error(`Cloudinary ${action}: ${res.status} ${body?.error?.message ?? ''}`.trimEnd());
};

/** Thân response chạy cùng hạn giờ của lượt gọi: đứt giữa chừng cũng là kho không trả lời. */
const bodyOf = <T>(action: string, body: Promise<T>): Promise<T> =>
  body.catch((error: unknown) => Promise.reject(new StorageUnavailableError(action, error)));

export function createCloudinaryStorage(
  config: CloudinaryStorageConfig,
  request: typeof fetch = fetch,
): Storage {
  const { cloudName, apiKey, apiSecret, folder } = config;
  const api = `https://api.cloudinary.com/v1_1/${cloudName}`;
  const auth = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
  const publicIdOf = (key: string): string => `${folder}/${key}`;
  const keyOf = (publicId: string): string => publicId.slice(folder.length + 1);

  // Không version, không đuôi tệp: CDN trả bản gốc; ảnh không ghi đè được nên không cần version để đổi cache.
  const viewUrlOf = (key: string): string => {
    const publicId = publicIdOf(key);
    return `https://res.cloudinary.com/${cloudName}/image/authenticated/s--${signDeliveryPath(publicId, apiSecret)}--/${publicId}`;
  };

  /** Trường ký của một lượt tải: `public_id` cố định và `overwrite=false` — tải lại không thay được ruột ảnh. */
  const signedFields = (key: string, signedAt: Date): Record<string, string> => {
    const params = {
      allowed_formats: ALLOWED_FORMATS,
      overwrite: 'false',
      public_id: publicIdOf(key),
      timestamp: String(Math.floor(signedAt.getTime() / 1000)),
      type: 'authenticated',
    };
    return { ...params, api_key: apiKey, signature: signUploadParams(params, apiSecret) };
  };

  /**
   * Mọi lượt gọi Cloudinary: có hạn giờ; mất mạng, quá giờ, quá trần lượt gọi hay 5xx thành `StorageUnavailableError`.
   * Lỗi còn lại (khoá sai, chữ ký sai) giữ nguyên — đó là lỗi cấu hình, phải là 500 và phải có người sửa.
   */
  const send = async (action: string, url: string, init: RequestInit = {}): Promise<Response> => {
    let res: Response;
    try {
      res = await request(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      throw new StorageUnavailableError(action, error);
    }
    if (RATE_LIMITED.has(res.status) || res.status >= 500) {
      throw new StorageUnavailableError(action, await failure(action, res));
    }
    return res;
  };
  const admin = (action: string, path: string, method = 'GET') =>
    send(action, `${api}${path}`, { method, headers: { Authorization: auth } });

  const resourcePath = (key: string): string =>
    `/resources/image/authenticated/${publicIdOf(key).split('/').map(encodeURIComponent).join('/')}`;

  const deleteBatch = async (keys: string[]): Promise<void> => {
    if (keys.length === 0) return;
    // Thiếu `invalidate` thì CDN còn trả ảnh đã xoá (thử ngày 14/10/2026).
    const query = new URLSearchParams({ invalidate: 'true' });
    for (const key of keys.slice(0, DELETE_BATCH)) query.append('public_ids[]', publicIdOf(key));
    const res = await admin('xoá ảnh', `/resources/image/authenticated?${query}`, 'DELETE');
    if (!res.ok) throw await failure('xoá ảnh', res);
    await deleteBatch(keys.slice(DELETE_BATCH));
  };

  const listPage = async (prefix: string, max: number, cursor: string | undefined) => {
    const query = new URLSearchParams({
      prefix: publicIdOf(prefix),
      max_results: String(max),
      ...(cursor ? { next_cursor: cursor } : {}),
    });
    const res = await admin('liệt kê', `/resources/image/authenticated?${query}`);
    if (!res.ok) throw await failure('liệt kê', res);
    const body = (await bodyOf('liệt kê', res.json())) as {
      resources: { public_id: string; created_at: string }[];
      next_cursor?: string;
    };
    return {
      items: body.resources.map((row): StoredObject => ({
        key: keyOf(row.public_id),
        lastModified: new Date(row.created_at),
      })),
      cursor: body.next_cursor ?? null,
    };
  };

  /**
   * Admin API chỉ sang trang bằng con trỏ, không có "sau khoá X" như `StartAfter` của S3 (design mục 3): nhớ khoá cuối của
   * mỗi trang → con trỏ trang sau, nên các trang liền nhau của một lượt đi thẳng.
   */
  const cursors = new Map<string, string>();
  const pageResult = (items: StoredObject[], cursor: string | null) => {
    const last = items.at(-1);
    if (!cursor || !last) return { items, next: null };
    cursors.set(last.key, cursor);
    const oldest = cursors.keys().next().value;
    if (cursors.size > CURSOR_MEMORY && oldest !== undefined) cursors.delete(oldest);
    return { items, next: last.key };
  };

  return {
    kind: 'cloudinary',
    bucket: `${cloudName}/${folder}`,

    presignUpload: ({ key, ttlSeconds, signedAt = new Date() }) =>
      Promise.resolve({
        method: 'POST',
        url: `${api}/image/upload`,
        headers: {},
        fields: signedFields(key, signedAt),
        expiresAt: new Date(signedAt.getTime() + ttlSeconds * 1000),
      }),

    viewUrl: (key) => Promise.resolve(viewUrlOf(key)),

    async head(key) {
      const res = await admin('đọc thông tin ảnh', resourcePath(key));
      if (res.status === 404) return null;
      if (!res.ok) throw await failure('đọc thông tin ảnh', res);
      const body = (await bodyOf('đọc thông tin ảnh', res.json())) as {
        bytes: number;
        format: string;
      };
      return { byteSize: body.bytes, contentType: CONTENT_TYPES[body.format] ?? null };
    },

    async read(key, maxBytes) {
      const res = await send('tải ảnh', viewUrlOf(key), {
        headers: { Range: `bytes=0-${maxBytes}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw await failure('tải ảnh', res);
      const bytes = new Uint8Array(await bodyOf('tải ảnh', res.arrayBuffer()));
      if (bytes.length > maxBytes) throw new Error(`Tệp ${key} lớn hơn ${maxBytes} byte`);
      return bytes;
    },

    async copy(fromKey, toKey) {
      const form = new FormData();
      for (const [name, value] of Object.entries(signedFields(toKey, new Date()))) {
        form.append(name, value);
      }
      form.append('file', viewUrlOf(fromKey));
      const res = await send('chép ảnh', `${api}/image/upload`, { method: 'POST', body: form });
      if (!res.ok) throw await failure('chép ảnh', res);
    },

    deleteMany: (keys) => deleteBatch([...new Set(keys)]),

    async list({ prefix, after, limit }) {
      const max = Math.min(limit, LIST_MAX);
      const known = after ? cursors.get(after) : undefined;
      if (!after || known) {
        const page = await listPage(prefix, max, known);
        return pageResult(page.items, page.cursor);
      }
      // `after` chưa từng thấy — lượt tiếp tục sau khi khởi động lại: đi lại từ đầu, bỏ các khoá ≤ `after`.
      const walk = async (cursor: string | undefined): Promise<ReturnType<typeof pageResult>> => {
        const page = await listPage(prefix, max, cursor);
        const items = page.items.filter((item) => item.key > after);
        if (items.length > 0 || !page.cursor) return pageResult(items, page.cursor);
        return walk(page.cursor);
      };
      return walk(undefined);
    },

    async ensureBucket() {
      const res = await admin('kiểm khoá', '/ping');
      if (!res.ok) throw await failure('kiểm khoá', res);
      return { created: false };
    },
  };
}
