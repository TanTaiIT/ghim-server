import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { parseStorageUrl } from '../src/config/storage-url.js';
import { createS3Storage, type Storage } from '../src/lib/storage.js';

/**
 * Kho test: container `storage-test` (RustFS trên tmpfs), mỗi worker một bucket như mỗi worker một DB. Các hàm ở đây
 * dựng và dọn bucket — việc app không bao giờ làm, nên không nằm trong `Storage`.
 */
/** Kho của test luôn là RustFS (chuẩn S3); Cloudinary chỉ kiểm tay trên tài khoản thật. */
const s3ConfigOf = (storageUrl: string) => {
  const config = parseStorageUrl(storageUrl);
  if (config.kind !== 's3') throw new Error('Test cần kho chuẩn S3 (RustFS)');
  return config;
};

export const storageOf = (storageUrl: string): Storage => createS3Storage(s3ConfigOf(storageUrl));

const clientOf = (storageUrl: string) => {
  const config = s3ConfigOf(storageUrl);
  return {
    bucket: config.bucket,
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }),
  };
};

/** Xoá mọi tệp trong bucket — mỗi file test bắt đầu từ kho rỗng, như `truncateAll`. */
export async function emptyBucket(storageUrl: string): Promise<void> {
  const { client, bucket } = clientOf(storageUrl);
  const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 }));
  const keys = (page.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []));
  if (keys.length === 0) return;
  await client.send(
    new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }),
  );
  if (page.IsTruncated) await emptyBucket(storageUrl);
}

export async function dropBucket(storageUrl: string): Promise<void> {
  await emptyBucket(storageUrl);
  const { client, bucket } = clientOf(storageUrl);
  await client.send(new DeleteBucketCommand({ Bucket: bucket }));
}

/** Tải một tệp lên bằng URL đã ký, như app làm. */
export const uploadWith = (
  grant: { url: string; headers: Record<string, string> },
  body: Uint8Array,
  headers: Record<string, string> = grant.headers,
) => fetch(grant.url, { method: 'PUT', body, headers });

/** Một "ảnh" JPEG đủ dùng cho test: kho không đọc ruột, chỉ kiểm cỡ và loại đã ký. */
export const fakeJpeg = (byteSize = 2048, fill = 0xff): Uint8Array =>
  new Uint8Array(byteSize).fill(fill);
