import { z } from 'zod';

/** Trần cứng cho `limit`: không có nó thì `?limit=1000000` là một lượt quét toàn bảng hợp lệ. */
const MAX_LIMIT = 100;

/**
 * Query phân trang dùng chung cho MỌI API danh sách.
 *
 * `coerce` vì query string luôn là chuỗi; `default` để client không gửi gì vẫn có trang đầu.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** `page`/`limit` của API → `skip`/`take` của Prisma. Một chỗ đổi, không rải `(page - 1) * limit`. */
export function toSkipTake({ page, limit }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

/**
 * Vỏ của một trang kết quả.
 *
 * Có `total` VÀ `totalPages`: client nào cũng cần cái thứ hai để vẽ thanh phân trang, và để
 * client tự chia là mời mỗi client làm tròn một kiểu.
 */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });
}

export function toPage<T>(items: T[], total: number, { page, limit }: PaginationQuery) {
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export { MAX_LIMIT };
