import { describe, expect, it } from 'vitest';

import { MAX_LIMIT } from '../src/common/schemas/pagination.js';
import {
  cursorQuerySchema,
  decodeCursor,
  encodeCursor,
  toCursorPage,
} from '../src/common/schemas/cursor.js';

const KEY = {
  at: new Date('2026-10-12T04:00:00.123Z'),
  id: '0199c3a0-0000-7000-8000-000000000001',
};

describe('con trỏ phân trang', () => {
  it('mã hoá rồi giải mã ra đúng mốc, kể cả phần nghìn giây', () => {
    expect(decodeCursor(encodeCursor(KEY))).toEqual(KEY);
  });

  it('chuỗi không do server phát ra thì không phải con trỏ', () => {
    for (const bad of ['', 'abc', Buffer.from('[1,"khong-phai-uuid"]').toString('base64url')]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });

  it('query: không gửi gì là trang đầu 20 dòng; con trỏ hỏng là lỗi kiểm dữ liệu', () => {
    expect(cursorQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(cursorQuerySchema.parse({ cursor: encodeCursor(KEY), limit: '5' })).toEqual({
      cursor: KEY,
      limit: 5,
    });
    expect(cursorQuerySchema.safeParse({ cursor: 'hong' }).success).toBe(false);
    expect(cursorQuerySchema.safeParse({ limit: MAX_LIMIT + 1 }).success).toBe(false);
  });

  it('lấy dư một dòng để biết còn trang sau; trang cuối không có con trỏ', () => {
    const rows = [1, 2, 3].map((n) => ({ at: new Date(n), id: KEY.id }));
    const page = toCursorPage(rows, 2, (row) => row);
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual(rows[1]);
    expect(toCursorPage(rows, 3, (row) => row).nextCursor).toBeNull();
  });
});
