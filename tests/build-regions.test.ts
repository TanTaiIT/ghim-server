import { describe, expect, it } from 'vitest';

import { buildRegions } from '../src/cli/build-regions.js';

/* Script sinh `regions.json` dừng thay vì ghi file lệch: sai số tỉnh, mã trùng, tỉnh lạ. */
const provinces = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    code: index + 1,
    name: `Tỉnh T${index + 1}`,
    wards: [{ code: 1000 + index, name: `Phường P${index}` }],
  }));
const former = Object.fromEntries(
  Array.from({ length: 34 }, (_, index) => [`T${index + 1}`, { formerNames: [], aliases: [] }]),
);

describe('buildRegions', () => {
  it('dữ liệu đúng: tên ngắn bỏ "Tỉnh" / "Thành phố", trộn tên cũ', () => {
    const result = buildRegions(provinces(34), {
      ...former,
      T1: { formerNames: ['Cũ'], aliases: ['Gọi tắt'] },
    });
    expect(result.provinces[0]).toEqual({
      code: 1,
      name: 'T1',
      fullName: 'Tỉnh T1',
      formerNames: ['Cũ'],
      aliases: ['Gọi tắt'],
    });
    expect(result.wards).toHaveLength(34);
  });

  it('không đủ 34 tỉnh → ném', () => {
    expect(() => buildRegions(provinces(33), former)).toThrow(/34/);
  });

  it('tỉnh không có trong bảng tên cũ → ném', () => {
    const { T5: _dropped, ...rest } = former;
    expect(() => buildRegions(provinces(34), rest)).toThrow(/T5/);
  });

  it('mã phường trùng → ném', () => {
    const api = provinces(34);
    api[1] = { ...api[1]!, wards: [{ code: 1000, name: 'Phường trùng mã' }] };
    expect(() => buildRegions(api, former)).toThrow(/1000/);
  });
});
