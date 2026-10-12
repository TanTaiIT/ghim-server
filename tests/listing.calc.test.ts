import type { ListingState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  LISTING_ARROWS,
  type ListingArrow,
  type ListingSide,
  transition,
} from '../src/modules/listing/listing.calc.js';

/*
 * Sơ đồ TK 18 chép lại tay, không đọc từ code: mỗi dòng là một mũi tên CÓ. Test chạy đủ 8 trạng thái × 15 mũi
 * tên × 5 bên — ô nào không nằm trong danh sách này phải ra `null` (CLAUDE.md luật 13: test cả mũi tên KHÔNG có).
 */
const STATES: ListingState[] = [
  'draft',
  'checking',
  'pending',
  'live',
  'rejected',
  'sold',
  'expired',
  'removed',
];
const SIDES: ListingSide[] = ['owner', 'machine', 'system', 'reviewer', 'appeal'];

const DIAGRAM: [ListingArrow, ListingSide, ListingState, ListingState][] = [
  ['submit', 'owner', 'draft', 'checking'],
  ['withdraw', 'owner', 'pending', 'draft'],
  ['edit', 'owner', 'pending', 'checking'],
  ['edit', 'owner', 'live', 'checking'],
  ['edit', 'owner', 'rejected', 'checking'],
  ['edit', 'owner', 'removed', 'checking'],
  ['renew', 'owner', 'expired', 'checking'],
  ['renewEarly', 'owner', 'live', 'checking'],
  ['markSold', 'owner', 'live', 'sold'],
  ['markSold', 'owner', 'expired', 'sold'],
  ['pass', 'machine', 'checking', 'live'],
  ['hold', 'machine', 'checking', 'pending'],
  ['recall', 'machine', 'live', 'pending'],
  ['expire', 'system', 'live', 'expired'],
  ['approve', 'reviewer', 'pending', 'live'],
  ['reject', 'reviewer', 'pending', 'rejected'],
  ['remove', 'reviewer', 'live', 'removed'],
  ['restore', 'reviewer', 'removed', 'live'],
  ['appealWin', 'appeal', 'rejected', 'live'],
  ['appealWin', 'appeal', 'removed', 'live'],
];

const expected = (arrow: ListingArrow, side: ListingSide, state: ListingState) =>
  DIAGRAM.find(([a, s, from]) => a === arrow && s === side && from === state)?.[3] ?? null;

describe('transition — đủ 8 trạng thái × 15 mũi tên × 5 bên', () => {
  it('bảng có đúng 15 mũi tên', () => {
    expect(LISTING_ARROWS).toHaveLength(15);
    expect(new Set(DIAGRAM.map(([arrow]) => arrow))).toEqual(new Set(LISTING_ARROWS));
  });

  for (const arrow of LISTING_ARROWS) {
    it(`${arrow}: chỉ đúng bên, đúng trạng thái gốc mới đi được`, () => {
      for (const side of SIDES) {
        for (const state of STATES) {
          // Sửa tin bị từ chối / bị gỡ cần lỗi là sai sót; ca vi phạm kiểm riêng bên dưới.
          expect(transition(state, arrow, side, 'mistake'), `${side} ${arrow} từ ${state}`).toBe(
            expected(arrow, side, state),
          );
        }
      }
    });
  }
});

describe('transition — sửa tin sau quyết định của người duyệt', () => {
  it('bị từ chối hay bị gỡ vì sai sót thì sửa được', () => {
    expect(transition('rejected', 'edit', 'owner', 'mistake')).toBe('checking');
    expect(transition('removed', 'edit', 'owner', 'mistake')).toBe('checking');
  });

  it('vi phạm hay chưa rõ lỗi thì không sửa để gửi lại được', () => {
    for (const fault of ['violation', null] as const) {
      expect(transition('rejected', 'edit', 'owner', fault)).toBeNull();
      expect(transition('removed', 'edit', 'owner', fault)).toBeNull();
    }
  });

  it('lỗi không đổi gì với tin đang hiển thị hay chờ duyệt', () => {
    expect(transition('live', 'edit', 'owner', null)).toBe('checking');
    expect(transition('pending', 'edit', 'owner', 'violation')).toBe('checking');
  });
});

describe('transition — các scenario của spec listing/lifecycle', () => {
  it('máy không bao giờ đưa tin sang bị từ chối hay bị gỡ', () => {
    const machineTargets = STATES.flatMap((state) =>
      LISTING_ARROWS.map((arrow) => transition(state, arrow, 'machine')),
    );
    expect(machineTargets).not.toContain('rejected');
    expect(machineTargets).not.toContain('removed');
  });

  it('không việc tự động nào đưa tin sang đang hiển thị', () => {
    expect(
      STATES.flatMap((state) => LISTING_ARROWS.map((arrow) => transition(state, arrow, 'system'))),
    ).not.toContain('live');
  });

  it('người duyệt không từ chối được tin đang hiển thị — chỉ gỡ', () => {
    expect(transition('live', 'reject', 'reviewer')).toBeNull();
    expect(transition('live', 'remove', 'reviewer')).toBe('removed');
  });

  it('gia hạn tin đã bán, rút về nháp tin đang hiển thị, đánh dấu đã bán tin chờ duyệt: không có mũi tên', () => {
    expect(transition('sold', 'renew', 'owner')).toBeNull();
    expect(transition('live', 'withdraw', 'owner')).toBeNull();
    expect(transition('pending', 'markSold', 'owner')).toBeNull();
  });

  it('sửa tin đang kiểm, đã bán, hết hạn (không kèm gia hạn): không có mũi tên', () => {
    expect(transition('checking', 'edit', 'owner')).toBeNull();
    expect(transition('sold', 'edit', 'owner')).toBeNull();
    expect(transition('expired', 'edit', 'owner')).toBeNull();
  });
});
