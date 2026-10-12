import { z } from 'zod';

import { MAX_LIMIT } from './pagination.js';

/**
 * Phân trang theo con trỏ cho danh sách luôn có dòng mới chen vào đầu (bảng tin, tìm kiếm, hồ sơ, tin của tôi):
 * trang theo số trang lặp hoặc sót tin khi có tin mới, và `total` là một lượt `COUNT` toàn bảng mỗi request
 * (design add-listings D6). Danh sách khác giữ `pagination.ts`.
 *
 * Con trỏ là mốc (`at`, `id`) của dòng cuối trang trước, mã hoá base64url để app coi như chuỗi kín — đổi cách
 * xếp sau này không phá app.
 */
export interface CursorKey {
  at: Date;
  id: string;
}

export function encodeCursor({ at, id }: CursorKey): string {
  return Buffer.from(JSON.stringify([at.getTime(), id])).toString('base64url');
}

const keySchema = z.tuple([z.number().int(), z.uuid()]);

/** `null` khi chuỗi không phải con trỏ do server phát ra. */
export function decodeCursor(cursor: string): CursorKey | null {
  try {
    const parsed = keySchema.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
    return parsed.success ? { at: new Date(parsed.data[0]), id: parsed.data[1] } : null;
  } catch {
    return null;
  }
}

export const cursorQuerySchema = z.object({
  cursor: z
    .string()
    .transform((value, ctx) => {
      const key = decodeCursor(value);
      if (!key) {
        ctx.addIssue({ code: 'custom', message: 'Con trỏ phân trang không hợp lệ' });
        return z.NEVER;
      }
      return key;
    })
    .optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(20),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export function cursorPaginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    /** `null` = hết danh sách. */
    nextCursor: z.string().nullable(),
  });
}

/**
 * Lấy `limit + 1` dòng để biết còn trang sau mà không phải đếm; dòng thừa không trả về, dòng cuối trang làm con trỏ.
 */
export function toCursorPage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => CursorKey,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(keyOf(last)) : null,
  };
}
