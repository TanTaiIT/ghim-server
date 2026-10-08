import { z } from 'zod';

/**
 * Hình dạng response DUY NHẤT của toàn API — client chỉ cần viết một lớp bóc vỏ.
 *
 * `success` là boolean chứ không phải suy ra từ HTTP status: một số proxy và SDK nuốt mất status
 * code, còn thân response thì luôn tới nơi nguyên vẹn.
 *
 * Đây là hàm nhận schema con chứ không phải một kiểu generic suông, vì Swagger cần schema THẬT
 * của từng endpoint mới sinh được tài liệu có ích — khai `data: z.unknown()` là tài liệu rỗng.
 */
export function ok<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data });
}

/** Vỏ lỗi — khai trong `response` của endpoint để Swagger nói được endpoint hỏng ra hình gì. */
export const errorResponse = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/** Bọc một giá trị đã có vào vỏ chuẩn. Dùng ở handler để không lặp `{ success: true }` khắp nơi. */
export function toOk<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}
