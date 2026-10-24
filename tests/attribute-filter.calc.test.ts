import { describe, expect, it } from 'vitest';

import type { TemplateField } from '../src/modules/category/calc/template.calc.js';
import {
  attributeFilterIssue,
  attributeFilterWhere,
} from '../src/modules/listing/calc/attribute-filter.calc.js';

/* Design add-listing-filters mục 2 (kiểm theo mẫu) và mục 3 (điều kiện Prisma trên jsonb). */
const PHONE: TemplateField[] = [
  {
    name: 'hang',
    label: 'Hãng',
    type: 'single_choice',
    required: true,
    options: ['Apple', 'Samsung'],
  },
  { name: 'mau', label: 'Màu', type: 'multi_choice', required: false, options: ['Đen', 'Bạc'] },
  { name: 'nam_san_xuat', label: 'Năm sản xuất', type: 'number', required: false },
  { name: 'ghi_chu', label: 'Ghi chú', type: 'text', required: false },
];

describe('attributeFilterIssue', () => {
  it('bộ lọc đúng mẫu: không lỗi', () => {
    expect(
      attributeFilterIssue(PHONE, {
        hang: ['Apple', 'Samsung'],
        mau: ['Đen'],
        nam_san_xuat: { min: 2018, max: 2020 },
      }),
    ).toBeNull();
    expect(attributeFilterIssue(PHONE, {})).toBeNull();
  });

  it('mục chữ, mục không có trong mẫu: lỗi nêu đúng mục', () => {
    expect(attributeFilterIssue(PHONE, { ghi_chu: ['x'] })).toEqual({
      field: 'ghi_chu',
      message: 'Mục "Ghi chú" là mục chữ, không lọc được',
    });
    expect(attributeFilterIssue(PHONE, { dung_luong: ['128GB'] })).toMatchObject({
      field: 'dung_luong',
      message: expect.stringContaining('"dung_luong"'),
    });
  });

  it('giá trị ngoài lựa chọn: nêu mục và giá trị lạ', () => {
    expect(attributeFilterIssue(PHONE, { hang: ['Apple', 'Nokia'] })).toEqual({
      field: 'hang',
      message: 'Mục "Hãng" không có lựa chọn "Nokia"',
    });
    expect(attributeFilterIssue(PHONE, { mau: ['Trắng'] })?.field).toBe('mau');
  });

  it('kiểu bộ lọc sai kiểu mục: khoảng số cho mục chọn, mảng cho mục số', () => {
    expect(attributeFilterIssue(PHONE, { hang: { min: 1 } })?.message).toBe(
      'Mục "Hãng" là mục chọn, lọc theo lựa chọn',
    );
    expect(attributeFilterIssue(PHONE, { nam_san_xuat: ['2018'] })?.message).toBe(
      'Mục "Năm sản xuất" là mục số, lọc theo khoảng từ – tới',
    );
  });

  it('nhiều mục sai: báo lỗi đầu tiên theo thứ tự gửi lên', () => {
    expect(attributeFilterIssue(PHONE, { hang: ['Apple'], ghi_chu: ['x'], la: ['y'] })?.field).toBe(
      'ghi_chu',
    );
  });
});

describe('attributeFilterWhere', () => {
  it('chọn một: OR của equals theo path; chọn nhiều: OR của array_contains', () => {
    expect(attributeFilterWhere(PHONE, { hang: ['Apple', 'Samsung'] })).toEqual([
      {
        OR: [
          { attributes: { path: ['hang'], equals: 'Apple' } },
          { attributes: { path: ['hang'], equals: 'Samsung' } },
        ],
      },
    ]);
    expect(attributeFilterWhere(PHONE, { mau: ['Đen', 'Bạc'] })).toEqual([
      {
        OR: [
          { attributes: { path: ['mau'], array_contains: ['Đen'] } },
          { attributes: { path: ['mau'], array_contains: ['Bạc'] } },
        ],
      },
    ]);
  });

  it('khoảng số: mỗi đầu một điều kiện; thiếu đầu nào bỏ đầu đó', () => {
    expect(attributeFilterWhere(PHONE, { nam_san_xuat: { min: 2018, max: 2020 } })).toEqual([
      { attributes: { path: ['nam_san_xuat'], gte: 2018 } },
      { attributes: { path: ['nam_san_xuat'], lte: 2020 } },
    ]);
    expect(attributeFilterWhere(PHONE, { nam_san_xuat: { max: 2020 } })).toEqual([
      { attributes: { path: ['nam_san_xuat'], lte: 2020 } },
    ]);
  });

  it('nhiều mục ghép AND: mỗi mục một phần tử của danh sách', () => {
    const where = attributeFilterWhere(PHONE, {
      hang: ['Apple'],
      mau: ['Đen'],
      nam_san_xuat: { min: 2018 },
    });
    expect(where).toHaveLength(3);
    expect(where.map((w) => Object.keys(w)[0])).toEqual(['OR', 'OR', 'attributes']);
  });
});
