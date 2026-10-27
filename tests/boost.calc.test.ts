import { describe, expect, it } from 'vitest';

import {
  activeFeaturedUntil,
  boostBlock,
  boostRole,
  type BoostScope,
  bumpRetryAt,
} from '../src/modules/listing/calc/boost.calc.js';

/*
 * Spec listing/boosting, phần thuần (change add-admin-boost): ai đẩy được tin nào, tin nào đẩy được, mốc đẩy lại. Phạm vi
 * nhóm lặp đúng các ca của `groupRoleOver` bên `review` — hai chỗ cùng luật.
 */
const ME = 'me';
const CARS = 'cat-cars';
const PHONES = 'cat-phones';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';

const marketplace = {
  placement: 'marketplace' as const,
  groupId: null,
  unitId: null,
  categoryId: CARS,
};
const inGroup = {
  placement: 'members_only' as const,
  groupId: 'g',
  unitId: UNIT_A,
  categoryId: CARS,
};
const reviewers = (over: Partial<NonNullable<BoostScope['reviewers']>> = {}) => ({
  moderationAllowed: true,
  ownerId: 'owner',
  moderators: [],
  ...over,
});
const role = (over: Partial<BoostScope>) =>
  boostRole({
    actorId: ME,
    isMaster: false,
    listing: marketplace,
    grant: null,
    reviewers: null,
    ...over,
  });

describe('Phạm vi đẩy tin theo vai', () => {
  it('master: mọi tin, sàn chung hay trong nhóm', () => {
    expect(role({ isMaster: true })).toBe('master');
    expect(role({ isMaster: true, listing: inGroup })).toBe('master');
  });

  it('staff đang hoạt động: tin sàn chung của danh mục được giao; danh mục khác, quyền treo thì không', () => {
    expect(role({ grant: { status: 'active', categoryIds: [CARS] } })).toBe('staff');
    expect(role({ grant: { status: 'active', categoryIds: [PHONES] } })).toBeNull();
    expect(role({ grant: { status: 'suspended', categoryIds: [CARS] } })).toBeNull();
    expect(
      role({
        grant: { status: 'active', categoryIds: [CARS] },
        listing: { ...marketplace, categoryId: null },
      }),
    ).toBeNull();
  });

  it('staff không đẩy tin trong nhóm, kể cả đúng danh mục', () => {
    expect(
      role({
        grant: { status: 'active', categoryIds: [CARS] },
        listing: inGroup,
        reviewers: reviewers(),
      }),
    ).toBeNull();
  });

  it('chủ nhóm, điều hành cả nhóm, điều hành đúng đơn vị; đơn vị khác thì không', () => {
    expect(role({ listing: inGroup, reviewers: reviewers({ ownerId: ME }) })).toBe('group_owner');
    expect(
      role({
        listing: inGroup,
        reviewers: reviewers({ moderators: [{ accountId: ME, unitId: null }] }),
      }),
    ).toBe('group_moderator');
    expect(
      role({
        listing: inGroup,
        reviewers: reviewers({ moderators: [{ accountId: ME, unitId: UNIT_A }] }),
      }),
    ).toBe('group_moderator');
    expect(
      role({
        listing: inGroup,
        reviewers: reviewers({ moderators: [{ accountId: ME, unitId: UNIT_B }] }),
      }),
    ).toBeNull();
  });

  it('nhóm không còn cho điều hành (bị khoá, đã đóng): không ai trong nhóm đẩy được', () => {
    expect(
      role({ listing: inGroup, reviewers: reviewers({ ownerId: ME, moderationAllowed: false }) }),
    ).toBeNull();
    expect(role({ listing: inGroup, reviewers: null })).toBeNull();
  });

  it('tin sàn chung mang huy hiệu nhóm: quản trị nhóm không có quyền gì', () => {
    expect(role({ listing: marketplace, reviewers: reviewers({ ownerId: ME }) })).toBeNull();
  });

  it('người dùng thường: không vai nào', () => {
    expect(role({})).toBeNull();
    expect(role({ listing: inGroup, reviewers: reviewers() })).toBeNull();
  });
});

describe('Chỉ đẩy tin đang hiển thị đầy đủ', () => {
  const live = { state: 'live' as const, hideReasons: [], restrictions: [] };

  it('tin hiển thị đầy đủ: đẩy được', () => {
    expect(boostBlock(live)).toBeNull();
  });

  it.each([
    ['draft', 'Tin còn là bản nháp'],
    ['checking', 'Tin đang được máy kiểm'],
    ['pending', 'Tin đang chờ duyệt'],
    ['rejected', 'Tin đã bị từ chối'],
    ['removed', 'Tin đã bị gỡ'],
    ['sold', 'Tin đã bán'],
    ['expired', 'Tin đã hết hạn'],
  ] as const)('trạng thái %s: "%s"', (state, message) => {
    expect(boostBlock({ ...live, state })).toBe(message);
  });

  it('tạm ẩn, rồi hạn chế — câu nói lý do nặng nhất', () => {
    expect(boostBlock({ ...live, hideReasons: ['reported'] })).toBe('Tin đang tạm ẩn');
    expect(boostBlock({ ...live, restrictions: ['new_account'] })).toMatch(/hiển thị hạn chế/);
    expect(boostBlock({ ...live, hideReasons: ['reported'], restrictions: ['new_account'] })).toBe(
      'Tin đang tạm ẩn',
    );
    expect(boostBlock({ ...live, state: 'pending', hideReasons: ['reported'] })).toBe(
      'Tin đang chờ duyệt',
    );
  });
});

describe('Thời gian chờ và hạn nổi bật', () => {
  const at = new Date('2026-10-27T08:00:00Z');
  const hoursLater = (h: number) => new Date(at.getTime() + h * 3_600_000);

  it('chưa đẩy lần nào: đẩy được ngay', () => {
    expect(bumpRetryAt(null, 24, at)).toBeNull();
  });

  it('2 giờ sau lần đẩy: mốc = lần trước + 24 giờ; đủ 24 giờ thì đẩy được', () => {
    expect(bumpRetryAt(at, 24, hoursLater(2))).toEqual(hoursLater(24));
    expect(bumpRetryAt(at, 24, hoursLater(24))).toBeNull();
  });

  it('thời gian chờ 0: không chờ', () => {
    expect(bumpRetryAt(at, 0, at)).toBeNull();
  });

  it('hạn nổi bật đã qua đọc như không nổi bật', () => {
    expect(activeFeaturedUntil(null, at)).toBeNull();
    expect(activeFeaturedUntil(hoursLater(1), at)).toEqual(hoursLater(1));
    expect(activeFeaturedUntil(at, at)).toBeNull();
  });
});
