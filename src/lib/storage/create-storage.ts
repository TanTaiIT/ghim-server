import type { StorageConfig } from '../../config/storage-url.js';
import { createCloudinaryStorage } from './cloudinary.storage.js';
import { createS3Storage } from './s3.storage.js';
import type { Storage } from './storage.js';

/** `STORAGE_URL` chọn bộ nối; module chỉ thấy cổng `Storage`. Chuyển R2 thì bỏ nhánh Cloudinary cùng file của nó. */
export const createStorage = (config: StorageConfig): Storage =>
  config.kind === 'cloudinary' ? createCloudinaryStorage(config) : createS3Storage(config);
