import type { StorageConfig } from '../../config/storage-url.js';

/**
 * Quyền tải một ảnh. `PUT` (kho S3): gửi thân tệp kèm đúng các `headers` — chữ ký phủ cả ba, sai một cái là kho từ chối.
 * `POST` (Cloudinary): gửi biểu mẫu multipart gồm nguyên văn `fields`, tệp ở trường `file` sau cùng.
 */
export interface UploadGrant {
  method: 'PUT' | 'POST';
  url: string;
  headers: Record<string, string>;
  fields: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  key: string;
  lastModified: Date;
}

/**
 * Kho không trả lời kịp, hay đang chặn vì quá trần lượt gọi: lỗi thoáng qua, làm lại sau là được. `errorHandler` dịch
 * thành 503 `STORAGE_UNAVAILABLE` thay vì 500 "Lỗi hệ thống"; việc nền ném ra để hàng việc thử lại.
 */
export class StorageUnavailableError extends Error {
  constructor(action: string, cause?: unknown) {
    super(`Kho ảnh không trả lời (${action})`, { cause });
    this.name = 'StorageUnavailableError';
  }
}

/**
 * Cửa duy nhất vào kho ảnh. Ký URL luôn theo **giờ thật** chứ không theo đồng hồ của app: kho kiểm hạn chữ ký bằng
 * đồng hồ của chính nó. `signedAt` chỉ để test dựng một chữ ký đã quá hạn.
 */
export interface Storage {
  /** Công cụ kiểm kho biết chờ điều gì; module không rẽ nhánh theo nó. */
  readonly kind: StorageConfig['kind'];
  readonly bucket: string;
  presignUpload(input: {
    key: string;
    contentType: string;
    byteSize: number;
    ttlSeconds: number;
    signedAt?: Date;
  }): Promise<UploadGrant>;
  /**
   * Đường xem. Kho S3: có hạn — ký từ đầu khung `ttlSeconds` hiện tại, hạn hai khung: cùng một ảnh trong cùng khung ra
   * cùng một URL (app và CDN cache được), và URL nào cũng còn sống ít nhất `ttlSeconds`. Cloudinary: có chữ ký nhưng
   * không hết hạn (design use-cloudinary-storage, chấp nhận tới khi chuyển R2).
   */
  viewUrl(key: string, ttlSeconds: number, signedAt?: Date): Promise<string>;
  head(key: string): Promise<{ byteSize: number; contentType: string | null } | null>;
  /** Nội dung một tệp, `null` khi không có; tệp lớn hơn `maxBytes` thì ném — chỉ tải tới `maxBytes + 1` byte. */
  read(key: string, maxBytes: number): Promise<Uint8Array | null>;
  /** Chép trong kho, không qua server: bản sao ảnh cho tin chuyển lên sàn chung (TK 25). */
  copy(fromKey: string, toKey: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  list(input: { prefix: string; after?: string | undefined; limit: number }): Promise<{
    items: StoredObject[];
    next: string | null;
  }>;
  /** Bucket thiếu thì tạo — dev và test; production bucket có sẵn nên chỉ là một lượt kiểm. */
  ensureBucket(): Promise<{ created: boolean }>;
}

/** Khoá của một ảnh trong kho: ai có mã ảnh là ký được đường xem, không phải hỏi `media`. */
export const imageKey = (imageId: string): string => `img/${imageId}`;
export const IMAGE_KEY_PREFIX = 'img/';
