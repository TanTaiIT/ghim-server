/**
 * `STORAGE_URL` gói cả kho ảnh vào một chuỗi như `DATABASE_URL`, `SMTP_URL`: đổi nhà cung cấp chuẩn S3 (R2, RustFS,
 * S3) chỉ là đổi chuỗi. Giao thức của chính chuỗi quyết `http` hay `https`; luôn dùng đường dẫn kiểu
 * `host/bucket/key` vì R2, RustFS và S3 đều nhận, còn kiểu tên miền con cần DNS riêng cho từng bucket.
 */
export interface StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Luật đặt tên bucket chung của S3 và R2. */
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function storageUrlIssue(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'không phải URL';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return 'phải bắt đầu bằng http:// hay https://';
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
  return {
    endpoint: `${url.protocol}//${url.host}`,
    bucket: url.pathname.replace(/^\//, ''),
    region: url.searchParams.get('region') ?? 'auto',
    accessKeyId: decodeURIComponent(url.username),
    secretAccessKey: decodeURIComponent(url.password),
  };
}
