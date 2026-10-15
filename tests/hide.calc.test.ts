import type { ListingHideReason } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  applyHideEvent,
  dropGroupReasons,
  type HideEvent,
  type HideTarget,
  isDetached,
} from '../src/modules/listing/calc/hide.calc.js';

/* Scenario của spec listing/suspension phần không cần DB: lý do nào được đặt, gỡ, và không phụ thuộc thứ tự. */
const MEMBERS_ONLY: HideTarget = { state: 'live', placement: 'members_only', hideReasons: [] };
const GROUP_PUBLIC: HideTarget = { ...MEMBERS_ONLY, placement: 'group_public' };

/** Chạy lần lượt các sự kiện, trả lý do cuối cùng. */
const after = (target: HideTarget, ...events: HideEvent[]): ListingHideReason[] =>
  events.reduce<ListingHideReason[]>(
    (reasons, event) =>
      applyHideEvent({ ...target, hideReasons: reasons }, event)?.hideReasons ?? reasons,
    [...target.hideReasons],
  );

const left = (allowOutsiders = false): HideEvent => ({
  kind: 'member_left',
  reason: 'left',
  allowOutsiders,
});
const removed = (allowOutsiders = false): HideEvent => ({
  kind: 'member_left',
  reason: 'removed',
  allowOutsiders,
});
const bannedLeave = (allowOutsiders: boolean): HideEvent => ({
  kind: 'member_left',
  reason: 'banned',
  allowOutsiders,
});

describe('Tạm ẩn là cờ có lý do, hết mọi lý do mới hiện lại', () => {
  it('nhóm mở khoá khi danh mục còn tắt: vẫn tạm ẩn vì danh mục', () => {
    expect(
      after(
        MEMBERS_ONLY,
        { kind: 'group_locked' },
        { kind: 'category_disabled' },
        { kind: 'group_unlocked' },
      ),
    ).toEqual(['category_disabled']);
  });

  it('bật lại danh mục: hết lý do cuối cùng', () => {
    expect(
      after(MEMBERS_ONLY, { kind: 'category_disabled' }, { kind: 'category_enabled' }),
    ).toEqual([]);
  });

  it('nhận trùng một sự kiện không đổi gì', () => {
    const once = { ...MEMBERS_ONLY, hideReasons: ['group_locked' as const] };
    expect(applyHideEvent(once, { kind: 'group_locked' })).toBeNull();
    expect(applyHideEvent(MEMBERS_ONLY, { kind: 'group_unlocked' })).toBeNull();
  });
});

describe('Tài khoản bị khoá, đã xoá', () => {
  it('khoá rồi mở khoá', () => {
    expect(after(MEMBERS_ONLY, { kind: 'account_locked' })).toEqual(['account_locked']);
    expect(after(MEMBERS_ONLY, { kind: 'account_locked' }, { kind: 'account_unlocked' })).toEqual(
      [],
    );
  });

  it('xoá tài khoản: lý do không bao giờ gỡ; sự kiện rời nhóm vì xoá tài khoản bị bỏ qua', () => {
    expect(after(MEMBERS_ONLY, { kind: 'account_deleted' })).toEqual(['account_deleted']);
    expect(
      applyHideEvent(MEMBERS_ONLY, {
        kind: 'member_left',
        reason: 'account_deleted',
        allowOutsiders: false,
      }),
    ).toBeNull();
  });
});

describe('Người đăng rời nhóm', () => {
  it('tự rời: tin "chỉ thành viên" tạm ẩn "đã rời nhóm"; vào lại thì hiện lại', () => {
    expect(after(MEMBERS_ONLY, left())).toEqual(['left_group']);
    expect(after(MEMBERS_ONLY, left(), { kind: 'member_joined' })).toEqual([]);
  });

  it('bị gỡ khỏi nhóm: lý do "bị gỡ khỏi nhóm", không phải "đã rời nhóm"', () => {
    expect(after(MEMBERS_ONLY, removed())).toEqual(['removed_from_group']);
  });

  it('tin sàn chung không thuộc nhóm nào nên không bị đụng', () => {
    expect(applyHideEvent({ ...MEMBERS_ONLY, placement: 'marketplace' }, left())).toBeNull();
  });
});

describe('Tin "nhóm công khai" theo công tắc nhận tin người ngoài lúc rời', () => {
  it('nhóm đang tắt: tạm ẩn "đã rời nhóm"', () => {
    expect(after(GROUP_PUBLIC, left(false))).toEqual(['left_group']);
  });

  it('nhóm đang bật: tin giữ nguyên, thành tin người ngoài', () => {
    expect(applyHideEvent(GROUP_PUBLIC, removed(true))).toBeNull();
  });
});

describe('Người đăng bị cấm khỏi nhóm', () => {
  it('cấm thành viên lúc nhóm bật nhận tin người ngoài — dù sự kiện nào tới trước', () => {
    const ban: HideEvent = { kind: 'ban_created' };
    for (const order of [
      [bannedLeave(true), ban],
      [ban, bannedLeave(true)],
    ]) {
      expect(after(MEMBERS_ONLY, ...order)).toEqual(['removed_from_group', 'group_banned']);
      expect(after(GROUP_PUBLIC, ...order)).toEqual(['group_banned']);
    }
  });

  it('gỡ cấm cựu thành viên: "nhóm công khai" hiện lại, "chỉ thành viên" còn chờ vào lại', () => {
    const banned = [bannedLeave(true), { kind: 'ban_created' } as const];
    const unban: HideEvent = { kind: 'ban_lifted' };
    expect(after(GROUP_PUBLIC, ...banned, unban)).toEqual([]);
    expect(after(MEMBERS_ONLY, ...banned, unban)).toEqual(['removed_from_group']);
  });

  it('cấm rồi gỡ cấm một người ngoài chưa từng vào nhóm', () => {
    expect(after(GROUP_PUBLIC, { kind: 'ban_created' })).toEqual(['group_banned']);
    expect(after(GROUP_PUBLIC, { kind: 'ban_created' }, { kind: 'ban_lifted' })).toEqual([]);
  });
});

describe('Nhóm đóng, tin bị gỡ khỏi nhóm, nhóm sang riêng tư: rời nhóm hẳn', () => {
  it.each<HideEvent>([
    { kind: 'group_closed' },
    { kind: 'detached_by_group' },
    { kind: 'outsider_privatized' },
  ])('$kind: ghi mốc rời nhóm một lần, và tin coi như đã rời nhóm hẳn', (event) => {
    const change = applyHideEvent(GROUP_PUBLIC, event);
    expect(change?.detachedNow).toBe(true);
    expect(isDetached(change?.hideReasons ?? [])).toBe(true);
    const again = applyHideEvent(
      { ...GROUP_PUBLIC, hideReasons: change?.hideReasons ?? [] },
      { kind: 'group_locked' },
    );
    expect(again?.detachedNow).toBe(false);
  });
});

describe('Lý do không đặt lên nháp (D7), nhưng gỡ ở mọi tin', () => {
  it('khoá nhóm không đặt lý do lên nháp', () => {
    expect(
      applyHideEvent({ ...MEMBERS_ONLY, state: 'draft' }, { kind: 'group_locked' }),
    ).toBeNull();
  });

  it('nháp rút về từ chờ duyệt vẫn được gỡ lý do cũ', () => {
    const draft: HideTarget = { ...MEMBERS_ONLY, state: 'draft', hideReasons: ['group_locked'] };
    expect(applyHideEvent(draft, { kind: 'group_unlocked' })?.hideReasons).toEqual([]);
  });
});

describe('Đổi nơi đăng ra khỏi nhóm thì lý do của nhóm rơi theo (D3)', () => {
  it('người bị cấm đưa tin lên sàn chung: mất "bị cấm khỏi nhóm"', () => {
    expect(dropGroupReasons(['group_banned'])).toEqual([]);
  });

  it('còn lý do của danh mục thì giữ', () => {
    expect(dropGroupReasons(['left_group', 'category_disabled'])).toEqual(['category_disabled']);
  });
});
