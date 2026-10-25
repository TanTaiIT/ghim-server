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

/**
 * Cùng chuỗi [số, mã] như `CursorKey`, nhưng số là giá trị cột đang xếp — mili giây với danh sách theo thời gian, đồng
 * với danh sách theo giá (add-feed-sort). Danh sách đổi được cách xếp đọc dạng này rồi hiểu số theo cách xếp đang dùng.
 */
export interface NumericCursorKey {
  value: number;
  id: string;
}

const keySchema = z.tuple([z.number().int(), z.uuid()]);

const encodeKey = ({ value, id }: NumericCursorKey): string =>
  Buffer.from(JSON.stringify([value, id])).toString('base64url');

function decodeKey(cursor: string): NumericCursorKey | null {
  try {
    const parsed = keySchema.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
    return parsed.success ? { value: parsed.data[0], id: parsed.data[1] } : null;
  } catch {
    return null;
  }
}

export const encodeCursor = ({ at, id }: CursorKey): string =>
  encodeKey({ value: at.getTime(), id });

/** `null` khi chuỗi không phải con trỏ do server phát ra. */
export function decodeCursor(cursor: string): CursorKey | null {
  const key = decodeKey(cursor);
  return key && { at: new Date(key.value), id: key.id };
}

const cursorParam = <T>(decode: (cursor: string) => T | null) =>
  z.string().transform((value, ctx) => {
    const key = decode(value);
    if (!key) {
      ctx.addIssue({ code: 'custom', message: 'Con trỏ phân trang không hợp lệ' });
      return z.NEVER;
    }
    return key;
  });

/** Con trỏ của danh sách đổi được cách xếp — thay `cursor` của `cursorQuerySchema` bằng `.extend`. */
export const numericCursorSchema = cursorParam(decodeKey);

export const cursorQuerySchema = z.object({
  cursor: cursorParam(decodeCursor).optional(),
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
  keyOf: (row: T) => CursorKey | NumericCursorKey,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  if (rows.length <= limit || !last) return { items, nextCursor: null };
  const key = keyOf(last);
  return { items, nextCursor: 'at' in key ? encodeCursor(key) : encodeKey(key) };
}
