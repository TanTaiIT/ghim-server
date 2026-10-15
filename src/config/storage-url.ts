/**
 * `STORAGE_URL` gói cả kho ảnh vào một chuỗi như `DATABASE_URL`, `SMTP_URL`: đổi kho chỉ là đổi chuỗi.
 *
 * - Chuẩn S3 (RustFS, R2, S3): `http(s)://<key>:<secret>@<host>/<bucket>[?region=…]`. Giao thức của chính chuỗi quyết
 *   `http` hay `https`; luôn dùng đường dẫn kiểu `host/bucket/key` vì R2, RustFS và S3 đều nhận, còn kiểu tên miền con
 *   cần DNS riêng cho từng bucket.
 * - Cloudinary (dùng tạm tới khi chuyển R2, change use-cloudinary-storage):
 *   `cloudinary://<api_key>:<api_secret>@<cloud_name>[?folder=…]` — dạng `CLOUDINARY_URL` của chính Cloudinary, thêm
 *   thư mục để tách ảnh của hệ thống này khỏi ảnh khác trên cùng tài khoản.
 */
export interface S3StorageConfig {
  kind: 's3';
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface CloudinaryStorageConfig {
  kind: 'cloudinary';
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

export type StorageConfig = S3StorageConfig | CloudinaryStorageConfig;

/** Luật đặt tên bucket chung của S3 và R2. */
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const CLOUD_NAME = /^[a-z0-9][a-z0-9_-]*$/i;
/** Thư mục thành phần đầu của `public_id`: chữ, số, gạch; nhiều cấp nối bằng `/`. */
const FOLDER = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i;
const DEFAULT_FOLDER = 'ghim-server';

function cloudinaryIssue(url: URL): string | null {
  if (!url.username || !url.password) {
    return 'thiếu khoá Cloudinary (cloudinary://<api_key>:<api_secret>@<cloud_name>)';
  }
  if (!CLOUD_NAME.test(url.hostname)) return 'thiếu hay sai cloud name của Cloudinary';
  const folder = url.searchParams.get('folder');
  if (folder !== null && !FOLDER.test(folder)) {
    return 'thư mục Cloudinary chỉ gồm chữ, số, dấu - _ và / giữa các cấp';
  }
  return null;
}

export function storageUrlIssue(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'không phải URL';
  }
  if (url.protocol === 'cloudinary:') return cloudinaryIssue(url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return 'phải bắt đầu bằng http://, https:// hay cloudinary://';
  if (!url.username || !url.password)
    return 'thiếu khoá truy cập (http://<key>:<secret>@host/bucket)';
  const bucket = url.pathname.replace(/^\//, '');
  if (!BUCKET_NAME.test(bucket))
    return 'thiếu tên bucket, hay tên bucket sai luật S3 (chữ thường, số, dấu - .)';
  return null;
}

export function parseStorageUrl(value: string): StorageConfig {
  const issue = storageUrlIssue(value);
  if (issue) throw new Error(`STORAGE_URL ${issue}`);
  const url = new URL(value);
  if (url.protocol === 'cloudinary:') {
    return {
      kind: 'cloudinary',
      cloudName: url.hostname,
      apiKey: decodeURIComponent(url.username),
      apiSecret: decodeURIComponent(url.password),
      folder: url.searchParams.get('folder') ?? DEFAULT_FOLDER,
    };
  }
  return {
    kind: 's3',
    endpoint: `${url.protocol}//${url.host}`,
    bucket: url.pathname.replace(/^\//, ''),
    region: url.searchParams.get('region') ?? 'auto',
    accessKeyId: decodeURIComponent(url.username),
    secretAccessKey: decodeURIComponent(url.password),
  };
}
