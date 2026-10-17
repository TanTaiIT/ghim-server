import { describe, expect, it } from 'vitest';

import {
  canHandle,
  type GroupReviewers,
  type RouteInput,
  routeOf,
} from '../src/modules/review/calc/route.calc.js';

/*
 * Spec review/queues ("việc vào hàng của ai") và review/conflict-of-interest (chuỗi chuyển tiếp), phần thuần: ai xử
 * được một việc, với người dự tuyển và người bị loại cho trước.
 */
const UNIT_10A = 'unit-10a';
const UNIT_10B = 'unit-10b';
const school: GroupReviewers = {
  moderationAllowed: true,
  ownerId: 'owner',
  moderators: [
    { accountId: 'mod-10a', unitId: UNIT_10A },
    { accountId: 'mod-10a-2', unitId: UNIT_10A },
    { accountId: 'mod-10b', unitId: UNIT_10B },
    { accountId: 'mod-whole', unitId: null },
  ],
};

const input = (overrides: Partial<RouteInput> = {}): RouteInput => ({
  subject: 'listing',
  queue: 0,
  reasons: [],
  placement: 'marketplace',
  groupId: null,
  unitId: null,
  groupReview: 'group',
  escalated: false,
  excluded: new Set(),
  group: null,
  categoryStaff: ['staff-phone', 'staff-phone-2'],
  safetyStaff: ['staff-safety'],
  masters: ['master'],
  ...overrides,
});
const inGroup = (overrides: Partial<RouteInput> = {}) =>
  input({ placement: 'members_only', groupId: 'g', unitId: UNIT_10A, group: school, ...overrides });

describe('Tin sàn', () => {
  it('việc máy giữ vào hàng staff được giao danh mục', () => {
    expect(routeOf(input())).toEqual({
      level: 'category_staff',
      handlers: ['staff-phone', 'staff-phone-2'],
    });
  });

  it('staff đăng tin của mình → việc đi cho staff khác cùng danh mục', () => {
    expect(routeOf(input({ excluded: new Set(['staff-phone']) })).handlers).toEqual([
      'staff-phone-2',
    ]);
  });

  it('danh mục không còn staff nào xử được → master', () => {
    expect(routeOf(input({ categoryStaff: [] }))).toEqual({
      level: 'master',
      handlers: ['master'],
    });
    expect(routeOf(input({ excluded: new Set(['staff-phone', 'staff-phone-2']) })).level).toBe(
      'master',
    );
  });

  it('tin nhóm mở rộng lên sàn chung → staff, không phải điều hành nhóm', () => {
    expect(routeOf(inGroup({ placement: 'marketplace' })).level).toBe('category_staff');
  });
});

describe('Tin trong nhóm', () => {
  it('việc của lớp 10A chỉ hiện cho điều hành lớp 10A', () => {
    const route = routeOf(inGroup());
    expect(route).toEqual({ level: 'unit_moderators', handlers: ['mod-10a', 'mod-10a-2'] });
    expect(route.handlers).not.toContain('mod-10b');
  });

  it('điều hành cả nhóm và chủ nhóm không thấy việc khi lớp còn người xử được (chốt 15/10/2026)', () => {
    const route = routeOf(inGroup());
    expect(route.handlers).not.toContain('mod-whole');
    expect(route.handlers).not.toContain('owner');
  });

  it('điều hành viên 10A đăng tin → điều hành viên kia của 10A', () => {
    expect(routeOf(inGroup({ excluded: new Set(['mod-10a']) })).handlers).toEqual(['mod-10a-2']);
  });

  it('lớp không còn ai xử được → điều hành cả nhóm → chủ nhóm → staff danh mục', () => {
    const unitOut = new Set(['mod-10a', 'mod-10a-2']);
    expect(routeOf(inGroup({ excluded: unitOut })).level).toBe('group_moderators');
    expect(routeOf(inGroup({ excluded: new Set([...unitOut, 'mod-whole']) }))).toEqual({
      level: 'group_owner',
      handlers: ['owner'],
    });
    expect(routeOf(inGroup({ excluded: new Set([...unitOut, 'mod-whole', 'owner']) })).level).toBe(
      'category_staff',
    );
  });

  it('tin không thuộc đơn vị nào → bắt đầu từ điều hành cả nhóm', () => {
    expect(routeOf(inGroup({ unitId: null })).level).toBe('group_moderators');
  });

  it('nhóm không còn cho điều hành (bị khoá, đã đóng) → staff danh mục', () => {
    expect(routeOf(inGroup({ group: { ...school, moderationAllowed: false } })).level).toBe(
      'category_staff',
    );
  });

  it('danh mục đặt "tin nhóm bị giữ do sàn duyệt" → staff, kể cả tin "chỉ thành viên"', () => {
    expect(routeOf(inGroup({ groupReview: 'platform' })).level).toBe('category_staff');
  });

  it('mức rủi ro không quyết ai xử: danh mục để nhóm duyệt thì điều hành nhóm xử', () => {
    expect(routeOf(inGroup({ groupReview: 'group' })).level).toBe('unit_moderators');
  });

  it('hàng 3 và hàng 4 luôn về staff danh mục; hàng 5 tin nhóm về điều hành nhóm', () => {
    expect(routeOf(inGroup({ queue: 3 })).level).toBe('category_staff');
    expect(routeOf(inGroup({ queue: 4 })).level).toBe('category_staff');
    expect(routeOf(inGroup({ queue: 5, groupReview: 'platform' })).level).toBe('unit_moderators');
  });
});

describe('Quá hạn và master', () => {
  it('việc đã chuyển master → chỉ master, người xử ban đầu không còn trong danh sách', () => {
    const route = routeOf(inGroup({ escalated: true }));
    expect(route).toEqual({ level: 'master', handlers: ['master'] });
    expect(canHandle(route, 'mod-10a', false)).toBe(false);
  });

  it('master xử được mọi việc, kể cả việc không ở chỗ mình', () => {
    expect(canHandle(routeOf(inGroup()), 'master', true)).toBe(true);
  });

  it('staff khác danh mục không xử được', () => {
    expect(canHandle(routeOf(input()), 'staff-motorbike', false)).toBe(false);
  });
});
