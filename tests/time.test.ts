import { describe, expect, it } from 'vitest';

import { formatMomentVN } from '../src/common/time/time.js';

/*
 * Mốc nói với người dùng tính theo giờ Việt Nam (CLAUDE.md luật 24) — máy chủ chạy UTC, nên 17:00 UTC trở đi đã là
 * ngày hôm sau ở Việt Nam. Câu thời gian chờ (add-trust-notices) dùng hàm này cho cả lỗi 429 lẫn thông báo.
 */
describe('formatMomentVN', () => {
  it('giờ, phút và ngày theo giờ Việt Nam, không có giây', () => {
    expect(formatMomentVN(new Date('2026-10-22T08:30:45Z'))).toBe('15:30 ngày 22/10/2026');
  });

  it('qua nửa đêm ở Việt Nam khi UTC vẫn là hôm trước', () => {
    expect(formatMomentVN(new Date('2026-10-22T17:05:00Z'))).toBe('00:05 ngày 23/10/2026');
  });

  it('đầu năm: ngày và tháng hai chữ số', () => {
    expect(formatMomentVN(new Date('2026-12-31T20:00:00Z'))).toBe('03:00 ngày 01/01/2027');
  });
});
