import { describe, expect, it } from 'vitest';

import {
  decideGroupPlacement,
  type GroupPostingSnapshot,
  missingForSubmit,
  needsRegion,
  type SubmittableFields,
} from '../src/modules/listing/calc/placement.calc.js';

/* Scenario của spec listing/placement, listing/submission và listing/suspension phần không cần DB. */
const PUBLIC_GROUP: GroupPostingSnapshot = {
  state: 'active',
  mode: 'public_review',
  allowOutsiders: true,
  member: { unitId: null },
  banned: false,
};
const outsider = (over: Partial<GroupPostingSnapshot> = {}): GroupPostingSnapshot => ({
  ...PUBLIC_GROUP,
  member: null,
  ...over,
});

describe('decideGroupPlacement', () => {
  it('thành viên đăng "chỉ thành viên"', () => {
    expect(decideGroupPlacement('members_only', PUBLIC_GROUP)).toEqual({
      ok: true,
      unitId: null,
      outsider: false,
    });
  });

  it('người không phải thành viên đăng "chỉ thành viên"', () => {
    expect(decideGroupPlacement('members_only', outsider())).toEqual({
      ok: false,
      code: 'NOT_GROUP_MEMBER',
    });
  });

  it('nhóm riêng tư không có mức "nhóm công khai", kể cả với thành viên', () => {
    for (const mode of ['private_code', 'private_invite'] as const) {
      expect(decideGroupPlacement('group_public', { ...PUBLIC_GROUP, mode })).toEqual({
        ok: false,
        code: 'PLACEMENT_NOT_ALLOWED',
      });
    }
  });

  it('người ngoài gửi "nhóm công khai" vào nhóm nhận tin người ngoài', () => {
    expect(decideGroupPlacement('group_public', outsider())).toEqual({
      ok: true,
      unitId: null,
      outsider: true,
    });
  });

  it('nhóm tắt nhận tin người ngoài — kể cả người ngoài đang có tin trong nhóm', () => {
    expect(decideGroupPlacement('group_public', outsider({ allowOutsiders: false }))).toEqual({
      ok: false,
      code: 'OUTSIDER_POSTS_DISABLED',
    });
  });

  it('người bị cấm gửi theo đường người ngoài', () => {
    expect(decideGroupPlacement('group_public', outsider({ banned: true }))).toEqual({
      ok: false,
      code: 'GROUP_BANNED',
    });
  });

  it('nhóm tạm khoá, đã đóng không nhận tin — ở mọi mức', () => {
    for (const placement of ['group_public', 'members_only'] as const) {
      expect(decideGroupPlacement(placement, { ...PUBLIC_GROUP, state: 'locked' })).toEqual({
        ok: false,
        code: 'GROUP_LOCKED',
      });
      expect(decideGroupPlacement(placement, { ...PUBLIC_GROUP, state: 'closed' })).toEqual({
        ok: false,
        code: 'GROUP_CLOSED',
      });
    }
  });

  it('đang chuyển sang riêng tư: chặn "nhóm công khai", vẫn nhận "chỉ thành viên"', () => {
    const going = { ...PUBLIC_GROUP, state: 'going_private' as const };
    expect(decideGroupPlacement('group_public', going)).toEqual({
      ok: false,
      code: 'GROUP_MODE_CHANGING',
    });
    expect(decideGroupPlacement('members_only', going)).toMatchObject({ ok: true });
  });

  it('tin tự gắn đơn vị con của người đăng', () => {
    const school = { ...PUBLIC_GROUP, member: { unitId: 'lop-10a' } };
    expect(decideGroupPlacement('members_only', school)).toMatchObject({ unitId: 'lop-10a' });
  });

  it('thứ tự lỗi cố định: nhóm khoá trước người bị cấm, cấm trước tư cách', () => {
    expect(
      decideGroupPlacement('members_only', outsider({ state: 'locked', banned: true })),
    ).toEqual({ ok: false, code: 'GROUP_LOCKED' });
    expect(decideGroupPlacement('members_only', outsider({ banned: true }))).toEqual({
      ok: false,
      code: 'GROUP_BANNED',
    });
  });
});

const READY: SubmittableFields = {
  placement: 'marketplace',
  groupId: null,
  title: 'Xe đạp cũ',
  price: 1_200_000n,
  categoryId: 'xe-dap',
  imageIds: ['anh-1'],
  provinceCode: 79,
  wardCode: 1,
};

describe('missingForSubmit', () => {
  it('đủ mọi điều kiện — mô tả không bắt buộc', () => {
    expect(missingForSubmit(READY)).toEqual([]);
  });

  it('chưa chọn nơi đăng: báo thiếu, không tự gán sàn chung', () => {
    expect(missingForSubmit({ ...READY, placement: null })).toEqual(['placement']);
  });

  it('"chỉ thành viên" mà không chọn nhóm', () => {
    expect(missingForSubmit({ ...READY, placement: 'members_only' })).toEqual(['groupId']);
  });

  it('thiếu ảnh, tiêu đề trắng, chưa có giá, chưa có danh mục', () => {
    expect(
      missingForSubmit({ ...READY, imageIds: [], title: '   ', price: null, categoryId: null }),
    ).toEqual(['title', 'price', 'categoryId', 'images']);
  });

  it('giá 0 là cho tặng, không bị coi là thiếu giá', () => {
    expect(missingForSubmit({ ...READY, price: 0n })).toEqual([]);
  });
});

describe('needsRegion', () => {
  it('tin sàn chung chỉ có tỉnh, chưa có phường', () => {
    expect(needsRegion({ ...READY, wardCode: null })).toBe(true);
  });

  it('tin trong nhóm không có khu vực', () => {
    expect(
      needsRegion({
        ...READY,
        placement: 'members_only',
        groupId: 'nhom',
        provinceCode: null,
        wardCode: null,
      }),
    ).toBe(false);
  });
});
