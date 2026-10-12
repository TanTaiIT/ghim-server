import { describe, expect, it } from 'vitest';

import {
  canView,
  type Surface,
  type Viewer,
  type VisibleListing,
} from '../src/modules/listing/visibility.calc.js';

/* Scenario của spec listing/visibility và delta identity/profile. */
const OWNER = 'chu-tin';
const MARKET: VisibleListing = {
  ownerId: OWNER,
  state: 'live',
  placement: 'marketplace',
  groupId: null,
  hideReasons: [],
  restrictions: [],
  deletedAt: null,
};
const GROUP_X = 'nhom-x';
const GROUP_PUBLIC: VisibleListing = { ...MARKET, placement: 'group_public', groupId: GROUP_X };
const MEMBERS_ONLY: VisibleListing = { ...MARKET, placement: 'members_only', groupId: GROUP_X };

const GUEST: Viewer = { accountId: null, memberGroupIds: new Set() };
const STRANGER: Viewer = { accountId: 'nguoi-la', memberGroupIds: new Set() };
const MEMBER: Viewer = { accountId: 'thanh-vien', memberGroupIds: new Set([GROUP_X]) };
const SELF: Viewer = { accountId: OWNER, memberGroupIds: new Set() };

const surfaces = (listing: VisibleListing, viewer: Viewer, groupId: string | null = null) =>
  (
    [
      'link',
      'feed',
      'category',
      'search',
      'suggest',
      'group_feed',
      'group_search',
      'profile',
    ] as Surface[]
  ).filter((surface) => canView(listing, viewer, surface, groupId));

describe('Hai mức hiển thị', () => {
  it('tin sàn chung đầy đủ: bảng tin, danh mục, tìm kiếm, gợi ý, hồ sơ, đường link', () => {
    expect(surfaces(MARKET, GUEST)).toEqual([
      'link',
      'feed',
      'category',
      'search',
      'suggest',
      'profile',
    ]);
  });

  it('tin sàn chung hạn chế: chỉ tìm có từ khoá, hồ sơ, đường link', () => {
    expect(surfaces({ ...MARKET, restrictions: ['new_account'] }, GUEST)).toEqual([
      'link',
      'search',
      'profile',
    ]);
  });
});

describe('Ai thấy một tin', () => {
  it.each([
    ['chờ duyệt', 'pending'],
    ['bị gỡ', 'removed'],
    ['nháp', 'draft'],
    ['đang kiểm', 'checking'],
    ['bị từ chối', 'rejected'],
  ] as const)('tin %s: khách như không có', (_case, state) => {
    expect(canView({ ...MARKET, state }, GUEST, 'link')).toBe(false);
  });

  it('tin hết hạn, đã bán: mở bằng đường link được, không có trên bảng tin, tìm kiếm, gợi ý, hồ sơ', () => {
    for (const state of ['expired', 'sold'] as const) {
      expect(surfaces({ ...MARKET, state }, GUEST)).toEqual(['link']);
    }
  });

  it('tin đang hiển thị nhưng tạm ẩn: khách như không có', () => {
    expect(surfaces({ ...MARKET, hideReasons: ['group_locked'] }, GUEST)).toEqual([]);
  });

  it('người đăng luôn mở được tin của mình, kể cả chờ duyệt hay tạm ẩn — trừ khi đã xoá', () => {
    expect(canView({ ...MARKET, state: 'pending' }, SELF, 'link')).toBe(true);
    expect(canView({ ...MARKET, hideReasons: ['account_locked'] }, SELF, 'link')).toBe(true);
    expect(canView({ ...MARKET, deletedAt: new Date() }, SELF, 'link')).toBe(false);
  });

  it('tin của chính mình trên bảng tin vẫn theo luật chung', () => {
    expect(canView({ ...MARKET, state: 'pending' }, SELF, 'feed')).toBe(false);
  });
});

describe('Phạm vi theo nơi đăng', () => {
  it('"chỉ thành viên": khách và người ngoài như không có', () => {
    expect(surfaces(MEMBERS_ONLY, GUEST, GROUP_X)).toEqual([]);
    expect(surfaces(MEMBERS_ONLY, STRANGER, GROUP_X)).toEqual([]);
  });

  it('"chỉ thành viên": thành viên mở được và thấy trên bảng tin nhóm', () => {
    expect(surfaces(MEMBERS_ONLY, MEMBER, GROUP_X)).toEqual([
      'link',
      'group_feed',
      'group_search',
      'profile',
    ]);
  });

  it('"nhóm công khai": ai cũng mở được, có trên bảng tin nhóm, không có trên bảng tin sàn chung', () => {
    expect(surfaces(GROUP_PUBLIC, GUEST, GROUP_X)).toEqual([
      'link',
      'group_feed',
      'group_search',
      'profile',
    ]);
  });

  it('bảng tin của nhóm khác không có tin này', () => {
    expect(canView(GROUP_PUBLIC, GUEST, 'group_feed', 'nhom-y')).toBe(false);
  });
});

describe('Tìm kiếm và gợi ý', () => {
  it('tìm kiếm chung không có tin "nhóm công khai", tìm trong nhóm thì có', () => {
    expect(canView(GROUP_PUBLIC, GUEST, 'search')).toBe(false);
    expect(canView(GROUP_PUBLIC, GUEST, 'group_search', GROUP_X)).toBe(true);
  });

  it('gợi ý chỉ lấy mức đầy đủ', () => {
    expect(canView({ ...MARKET, restrictions: ['machine'] }, GUEST, 'suggest')).toBe(false);
  });
});

describe('Hồ sơ công khai liệt kê tin đang bán (identity/profile)', () => {
  it('cả tin đầy đủ lẫn hạn chế', () => {
    expect(canView(MARKET, GUEST, 'profile')).toBe(true);
    expect(canView({ ...MARKET, restrictions: ['new_account'] }, GUEST, 'profile')).toBe(true);
  });

  it('"chỉ thành viên": khách không thấy, thành viên nhóm thấy', () => {
    expect(canView(MEMBERS_ONLY, GUEST, 'profile')).toBe(false);
    expect(canView(MEMBERS_ONLY, MEMBER, 'profile')).toBe(true);
  });

  it('nháp, chờ duyệt, tạm ẩn, đã bán, hết hạn không có trên hồ sơ', () => {
    for (const listing of [
      { ...MARKET, state: 'draft' as const },
      { ...MARKET, state: 'pending' as const },
      { ...MARKET, hideReasons: ['group_locked' as const] },
      { ...MARKET, state: 'sold' as const },
      { ...MARKET, state: 'expired' as const },
    ]) {
      expect(canView(listing, GUEST, 'profile')).toBe(false);
    }
  });
});
