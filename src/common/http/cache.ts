/**
 * Mặc định mọi response là `no-store` — hook `onSend` trong `buildApp` đặt khi route không tự khai, và
 * ép lại cho mọi lỗi. Route công khai chỉ mở qua `cacheFor`, sau khi service đã trả kết quả.
 */
export const CACHE_NONE = 'no-store';
/** Khu vực chỉ đổi khi phát hành phần mềm mới. */
export const CACHE_REGIONS = 'public, max-age=86400';
/** Danh mục và mẫu hiện hành: thay đổi của master tới app chậm nhiều nhất 5 phút. */
export const CACHE_CATALOG = 'public, max-age=300';
/** Phiên bản mẫu đã phát hành không bao giờ đổi. */
export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';

/** Đặt chính sách giữ lại rồi trả nguyên `body` — để handler viết `return cacheFor(reply, …, toOk(x))`. */
export function cacheFor<T>(
  reply: { header(key: string, value: string): unknown },
  policy: string,
  body: T,
): T {
  reply.header('cache-control', policy);
  return body;
}
