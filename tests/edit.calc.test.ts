import { describe, expect, it } from 'vitest';

import { classifyEdit, type EditableFields } from '../src/modules/listing/posting/edit.calc.js';

/* Scenario của spec listing/editing (phần không cần DB) và D3 của design add-listings. */
const MARKET: EditableFields = {
  title: 'Xe đạp cũ',
  description: 'Còn tốt',
  price: 1_200_000n,
  categoryId: 'xe-dap',
  attributes: { hang: 'Giant', size: 'M' },
  imageIds: ['anh-1', 'anh-2', 'anh-3'],
  provinceCode: 79,
  wardCode: 1,
  placement: 'marketplace',
  groupId: null,
  badgeGroupId: null,
  negotiable: false,
  delivery: false,
  showPhone: false,
};
const MEMBERS_ONLY: EditableFields = { ...MARKET, placement: 'members_only', groupId: 'nhom-x' };
const FREE = { detached: false, placementLocked: false, memberOfTarget: true };

describe('Sửa nội dung người mua đọc hay lọc theo thì qua máy lại', () => {
  it.each<[string, Partial<EditableFields>]>([
    ['tiêu đề', { title: 'Xe đạp Giant cũ' }],
    ['mô tả', { description: 'Mới thay xích' }],
    ['giá', { price: 1_000_000n }],
    ['danh mục', { categoryId: 'the-thao' }],
    ['thông tin theo mẫu', { attributes: { hang: 'Trek', size: 'M' } }],
    ['chỉ đổi thứ tự ảnh', { imageIds: ['anh-3', 'anh-1', 'anh-2'] }],
    ['phường', { wardCode: 2 }],
  ])('%s', (_field, change) => {
    expect(classifyEdit(MARKET, { ...MARKET, ...change }, FREE)).toMatchObject({
      ok: true,
      machine: true,
    });
  });
});

describe('Mở rộng nơi đăng và gắn huy hiệu thì qua máy lại', () => {
  it('mở rộng hai nấc: "chỉ thành viên" lên sàn chung', () => {
    expect(classifyEdit(MEMBERS_ONLY, MARKET, FREE)).toMatchObject({
      machine: true,
      placement: 'widen',
    });
  });

  it('gắn huy hiệu', () => {
    expect(classifyEdit(MARKET, { ...MARKET, badgeGroupId: 'nhom-x' }, FREE)).toMatchObject({
      machine: true,
      badge: 'attach',
    });
  });

  it('đổi sang một nhóm khác', () => {
    expect(classifyEdit(MEMBERS_ONLY, { ...MEMBERS_ONLY, groupId: 'nhom-y' }, FREE)).toMatchObject({
      machine: true,
      placement: 'regroup',
    });
  });
});

describe('Sửa làm tin ít người thấy hơn thì không qua máy', () => {
  it('thu hẹp từ sàn chung về "chỉ thành viên" của nhóm mình — không qua máy', () => {
    expect(classifyEdit(MARKET, MEMBERS_ONLY, FREE)).toEqual({
      ok: true,
      machine: false,
      placement: 'narrow',
      badge: null,
    });
  });

  it.each<[string, Partial<EditableFields>]>([
    ['bật giao tận nơi', { delivery: true }],
    ['bật có thương lượng', { negotiable: true }],
    ['ẩn số điện thoại', { showPhone: true }],
  ])('%s', (_case, change) => {
    expect(classifyEdit(MARKET, { ...MARKET, ...change }, FREE)).toMatchObject({
      machine: false,
      placement: null,
    });
  });

  it('bỏ huy hiệu', () => {
    const badged = { ...MARKET, badgeGroupId: 'nhom-x' };
    expect(classifyEdit(badged, MARKET, FREE)).toMatchObject({ machine: false, badge: 'detach' });
  });
});

describe('So giá trị, không so ô được gửi lên', () => {
  it('app gửi lại y hệt nội dung cũ kèm bật "có thương lượng": không qua máy', () => {
    const resent = {
      ...MARKET,
      attributes: { size: 'M', hang: 'Giant' },
      imageIds: [...MARKET.imageIds],
      negotiable: true,
    };
    expect(classifyEdit(MARKET, resent, FREE)).toMatchObject({ machine: false });
  });
});

describe('Không đổi nơi đăng khi đang có việc chờ', () => {
  const locked = { ...FREE, placementLocked: true };

  it('thu hẹp tin đang chờ duyệt', () => {
    expect(classifyEdit(MARKET, MEMBERS_ONLY, locked)).toEqual({
      ok: false,
      code: 'PLACEMENT_LOCKED',
    });
  });

  it('mở rộng tin đang bị báo cáo', () => {
    expect(classifyEdit(MEMBERS_ONLY, MARKET, locked)).toEqual({
      ok: false,
      code: 'PLACEMENT_LOCKED',
    });
  });

  it('sửa giá mà không đổi nơi đăng vẫn được, và qua máy', () => {
    expect(classifyEdit(MARKET, { ...MARKET, price: 900_000n }, locked)).toMatchObject({
      ok: true,
      machine: true,
    });
  });
});

describe('Chuyển tin vào nhóm mình không phải thành viên', () => {
  it('thu hẹp từ sàn chung vào nhóm người ngoài: qua máy như gửi mới', () => {
    const outsiderGroup = { ...MARKET, placement: 'group_public' as const, groupId: 'nhom-y' };
    expect(classifyEdit(MARKET, outsiderGroup, { ...FREE, memberOfTarget: false })).toMatchObject({
      machine: true,
      placement: 'narrow',
    });
  });
});

describe('Tin đã rời nhóm hẳn (D3)', () => {
  it('không sửa được nữa, kể cả bật giao tận nơi', () => {
    for (const after of [MARKET, { ...MEMBERS_ONLY, delivery: true }]) {
      expect(classifyEdit(MEMBERS_ONLY, after, { ...FREE, detached: true })).toEqual({
        ok: false,
        code: 'LISTING_DETACHED',
      });
    }
  });
});
