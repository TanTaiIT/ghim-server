import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { S3StorageConfig } from '../../config/storage-url.js';
import type { Storage } from './storage.js';

const SIGNED_UPLOAD_HEADERS = new Set(['content-type', 'content-length', 'if-none-match']);
/** Trần của lệnh xoá nhiều khoá trong chuẩn S3. */
const DELETE_BATCH = 1000;

const isMissing = (error: unknown): boolean =>
  error instanceof S3ServiceException &&
  (error.$metadata.httpStatusCode === 404 ||
    error.name === 'NotFound' ||
    error.name === 'NoSuchKey');

/** Kho chuẩn S3: RustFS cho dev và test, Cloudflare R2 ở production khi bỏ Cloudinary. */
export function createS3Storage(config: S3StorageConfig): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const { bucket } = config;

  const deleteBatch = async (keys: string[]): Promise<void> => {
    if (keys.length === 0) return;
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.slice(0, DELETE_BATCH).map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (result.Errors?.length) {
      throw new Error(`Kho không xoá được ${result.Errors.length} tệp`);
    }
    await deleteBatch(keys.slice(DELETE_BATCH));
  };

  return {
    kind: 's3',
    bucket,

    async presignUpload({ key, contentType, byteSize, ttlSeconds, signedAt = new Date() }) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: byteSize,
          // Khoá đã có tệp thì kho trả 412: dùng lại URL không thay được ruột ảnh.
          IfNoneMatch: '*',
        }),
        { expiresIn: ttlSeconds, signingDate: signedAt, signableHeaders: SIGNED_UPLOAD_HEADERS },
      );
      return {
        method: 'PUT',
        url,
        headers: { 'Content-Type': contentType, 'If-None-Match': '*' },
        fields: {},
        expiresAt: new Date(signedAt.getTime() + ttlSeconds * 1000),
      };
    },

    viewUrl(key, ttlSeconds, signedAt = new Date()) {
      const windowMs = ttlSeconds * 1000;
      const windowStart = new Date(Math.floor(signedAt.getTime() / windowMs) * windowMs);
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: ttlSeconds * 2,
        signingDate: windowStart,
      });
    },

    async head(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { byteSize: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async read(key, maxBytes) {
      let bytes: Uint8Array | undefined;
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${maxBytes}` }),
        );
        bytes = await result.Body?.transformToByteArray();
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
      if (!bytes) return null;
      if (bytes.length > maxBytes) throw new Error(`Tệp ${key} lớn hơn ${maxBytes} byte`);
      return bytes;
    },

    async copy(fromKey, toKey) {
      await client.send(
        new CopyObjectCommand({ Bucket: bucket, Key: toKey, CopySource: `${bucket}/${fromKey}` }),
      );
    },

    deleteMany: (keys) => deleteBatch([...new Set(keys)]),

    async list({ prefix, after, limit }) {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: limit,
          ...(after ? { StartAfter: after } : {}),
        }),
      );
      const items = (result.Contents ?? []).flatMap((item) =>
        item.Key && item.LastModified ? [{ key: item.Key, lastModified: item.LastModified }] : [],
      );
      return { items, next: result.IsTruncated ? (items.at(-1)?.key ?? null) : null };
    },

    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return { created: false };
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      return { created: true };
    },
  };
}
