import { describe, expect, it } from 'vitest';

import {
  MAX_LIMIT,
  paginationQuerySchema,
  toPage,
  toSkipTake,
} from '../src/common/schemas/pagination.js';

describe('phân trang', () => {
  it('không gửi gì vẫn ra trang đầu', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('query string là chuỗi, được ép sang số', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('limit vượt trần bị chặn — không có lượt quét toàn bảng hợp lệ', () => {
    expect(paginationQuerySchema.safeParse({ limit: MAX_LIMIT + 1 }).success).toBe(false);
  });

  it('page/limit → skip/take', () => {
    expect(toSkipTake({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('totalPages làm tròn lên, danh sách rỗng là 0 trang', () => {
    expect(toPage([], 41, { page: 1, limit: 20 }).totalPages).toBe(3);
    expect(toPage([], 0, { page: 1, limit: 20 }).totalPages).toBe(0);
  });
});
