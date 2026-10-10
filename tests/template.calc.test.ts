import { describe, expect, it } from 'vitest';

import { templateFieldsSchema } from '../src/modules/category/category.schema.js';
import {
  duplicateFieldNames,
  fieldsToJson,
  lockedFieldIssue,
  type TemplateField,
} from '../src/modules/category/template.calc.js';

const hang: TemplateField = {
  name: 'hang',
  label: 'Hãng',
  type: 'single_choice',
  required: true,
  options: ['Apple', 'Samsung'],
};
const dungLuong: TemplateField = {
  name: 'dung_luong',
  label: 'Dung lượng',
  type: 'text',
  required: false,
};

describe('templateFieldsSchema', () => {
  it('hai mục trùng tên → lỗi', () => {
    expect(
      templateFieldsSchema.safeParse([dungLuong, { ...dungLuong, label: 'Khác' }]).success,
    ).toBe(false);
    expect(duplicateFieldNames([dungLuong, hang, dungLuong])).toEqual(['dung_luong']);
  });

  it('mục chọn không có lựa chọn → lỗi; mục chữ mang lựa chọn → lỗi', () => {
    expect(templateFieldsSchema.safeParse([{ ...hang, options: [] }]).success).toBe(false);
    expect(templateFieldsSchema.safeParse([{ ...hang, options: undefined }]).success).toBe(false);
    expect(templateFieldsSchema.safeParse([{ ...dungLuong, options: ['a'] }]).success).toBe(false);
  });

  it('tên mục chỉ chữ thường, số, gạch dưới', () => {
    expect(templateFieldsSchema.safeParse([{ ...dungLuong, name: 'Dung Luong' }]).success).toBe(
      false,
    );
    expect(templateFieldsSchema.safeParse([hang, dungLuong]).success).toBe(true);
  });
});

describe('lockedFieldIssue', () => {
  const v1 = [hang, dungLuong];

  it('đổi nhãn, giữ tên → hợp lệ', () => {
    expect(lockedFieldIssue([v1], [hang, { ...dungLuong, label: 'Bộ nhớ trong' }])).toBeNull();
  });

  it('bỏ một mục, thêm một mục khác hẳn → hợp lệ', () => {
    const mau = { name: 'mau', label: 'Màu', type: 'text' as const, required: false };
    expect(lockedFieldIssue([v1], [hang, mau])).toBeNull();
  });

  it('đổi tên mục đã phát hành (cùng nhãn, cùng kiểu, tên mới) → bị khoá', () => {
    expect(lockedFieldIssue([v1], [hang, { ...dungLuong, name: 'bo_nho' }])).toContain(
      'dung_luong',
    );
  });

  it('đổi nhãn ở phiên bản 2 rồi đổi tên ở bản nháp sau → vẫn bị nhận ra', () => {
    const v2 = [hang, { ...dungLuong, label: 'Bộ nhớ trong' }];
    expect(
      lockedFieldIssue([v1, v2], [hang, { ...dungLuong, name: 'bo_nho', label: 'Bộ nhớ trong' }]),
    ).toContain('dung_luong');
  });

  it('dùng lại tên đã phát hành với kiểu khác, kể cả khi phiên bản sau đã bỏ mục đó → bị khoá', () => {
    const v2 = [hang];
    expect(lockedFieldIssue([v1, v2], [hang, { ...dungLuong, type: 'number' }])).toContain('kiểu');
  });

  it('chưa phát hành phiên bản nào → mọi bản nháp hợp lệ', () => {
    expect(lockedFieldIssue([], [hang, { ...dungLuong, name: 'bo_nho' }])).toBeNull();
  });
});

describe('fieldsToJson', () => {
  it('bỏ khoá options của mục chữ / số, giữ của mục chọn', () => {
    expect(fieldsToJson([hang, { ...dungLuong, options: undefined }])).toEqual([
      hang,
      { name: 'dung_luong', label: 'Dung lượng', type: 'text', required: false },
    ]);
  });
});
