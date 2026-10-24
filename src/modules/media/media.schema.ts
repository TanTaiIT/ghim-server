import { z } from 'zod';

import type { OutboxEventType } from '../../common/outbox/outbox.js';

/** Tuple của enum `image_owner_kind`. `listing` khai sẵn cho `add-listings`. */
export const IMAGE_OWNER_KINDS = ['profile', 'listing'] as const;

/** TK 25: không HEIC — Android và web không hiển thị được, app chuyển định dạng trước khi tải. */
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const MEDIA_EVENTS = {
  /** Ảnh đang được dùng mà tệp không còn trong kho — chủ của ảnh quyết làm gì, `media` không sửa chủ. */
  imageMissing: 'media.image.missing',
  /** Dòng ảnh đã xoá hẳn (lượt dọn ảnh bỏ, ảnh chưa xác nhận, ảnh của tin đã xoá) — `{ imageIds }`, mỗi lô một sự kiện. */
  imagesDeleted: 'media.images.deleted',
} as const satisfies Record<string, OutboxEventType>;

export const uploadBodySchema = z
  .object({
    ownerKind: z.enum(IMAGE_OWNER_KINDS),
    ownerId: z.uuid(),
    contentType: z.enum(IMAGE_CONTENT_TYPES),
    /** Trần thật là `media.maxImageBytes` của bảng con số, service kiểm. */
    byteSize: z.number().int().positive(),
  })
  .strict();

export const uploadGrantSchema = z.object({
  imageId: z.uuid(),
  /**
   * Cạnh ngắn tối thiểu (điểm ảnh, sau khi xoay theo EXIF) mà máy duyệt áp cho ảnh của tin — app chặn ảnh nhỏ hơn trước
   * khi tải (add-image-quality-checks). Ảnh đại diện không bị kiểm chất lượng.
   */
  minShortSide: z.number().int(),
  /**
   * `PUT` (kho chuẩn S3): gửi thân tệp kèm nguyên văn `headers` và `Content-Length` đúng `byteSize`. `POST` (Cloudinary):
   * gửi biểu mẫu multipart gồm nguyên văn `fields`, tệp ở trường `file` sau cùng. Hướng dẫn ở `docs/media.md`.
   */
  upload: z.object({
    method: z.enum(['PUT', 'POST']),
    url: z.string(),
    headers: z.record(z.string(), z.string()),
    fields: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  }),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;
export type UploadGrantDto = z.infer<typeof uploadGrantSchema>;
