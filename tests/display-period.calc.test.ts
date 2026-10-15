import type { ListingHideReason, ListingState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  DAY_MS,
  isDue,
  type ListingClock,
  nextClock,
  remainingMs,
  renewEarlyCheck,
} from '../src/modules/listing/calc/display-period.calc.js';

/*
 * Mỗi scenario của spec listing/display-period thành một chuỗi bước "ngày n, tin sang trạng thái / lý do tạm ẩn
 * này". Ngày 1 lúc 09:00 giờ Việt Nam; "hết hạn ngày 31" = 30 ngày hiển thị tính từ ngày 1.
 */
const DAY_ONE = new Date('2026-10-01T02:00:00.000Z');
const day = (n: number) => new Date(DAY_ONE.getTime() + (n - 1) * DAY_MS);
const SETTINGS = { visibleDays: 30, renewExtendDays: 30 };
const NEW_DRAFT: ListingClock = {
  firstLiveAt: null,
  expiresAt: null,
  clockRemainingMs: null,
  shownMs: 0n,
  shownSince: null,
  renewal: null,
};

type Step = [number, ListingState, ListingHideReason[]?];

function run(steps: Step[], from: ListingClock = NEW_DRAFT): ListingClock {
  return steps.reduce(
    (clock, [n, state, hideReasons = []]) =>
      nextClock(clock, { state, hideReasons }, day(n), SETTINGS),
    from,
  );
}

const daysLeft = (clock: ListingClock, n: number) => (remainingMs(clock, day(n)) ?? NaN) / DAY_MS;

/** Tin lên bảng ngày 1 rồi đứng yên tới ngày `n` — còn 31 − n ngày. */
const liveSinceDayOne = (): ListingClock =>
  run([
    [1, 'checking'],
    [1, 'live'],
  ]);

describe('Ba mươi ngày từ lần lên bảng đầu tiên', () => {
  it('không bị dừng lần nào: hết hạn sau đúng 30 ngày', () => {
    const clock = liveSinceDayOne();
    expect(clock.expiresAt).toEqual(day(31));
    expect(isDue('live', clock, new Date(day(31).getTime() - 1))).toBe(false);
    expect(isDue('live', clock, day(31))).toBe(true);
  });

  it('lên bảng sau khi chờ người duyệt: tính từ lúc lên bảng, không từ lúc gửi', () => {
    const clock = run([
      [1, 'checking'],
      [1, 'pending'],
      [3, 'live'],
    ]);
    expect(clock.firstLiveAt).toEqual(day(3));
    expect(clock.expiresAt).toEqual(day(33));
  });
});

describe('Sửa không làm mới tin', () => {
  it('sửa rồi máy cho qua: hạn và vị trí giữ nguyên', () => {
    const clock = run(
      [
        [20, 'checking'],
        [20, 'live'],
      ],
      liveSinceDayOne(),
    );
    expect(clock.expiresAt).toEqual(day(31));
    expect(clock.firstLiveAt).toEqual(day(1));
  });

  it('sửa rồi chờ người duyệt 2 ngày: hạn như trước khi sửa', () => {
    const clock = run(
      [
        [20, 'checking'],
        [20, 'pending'],
        [22, 'live'],
      ],
      liveSinceDayOne(),
    );
    expect(clock.expiresAt).toEqual(day(31));
  });
});

describe('Ngày dừng khi tin bị gỡ, bị từ chối', () => {
  it('gỡ ngày 10, khôi phục ngày 15: còn 21 ngày, hết hạn ngày 36', () => {
    const removed = run([[10, 'removed']], liveSinceDayOne());
    expect(removed.expiresAt).toBeNull();
    expect(daysLeft(removed, 12)).toBe(21);
    const restored = run([[15, 'live']], removed);
    expect(restored.expiresAt).toEqual(day(36));
  });

  it('bị từ chối sau khi sửa thì dừng, sửa lại vì sai sót thì chạy tiếp (D4)', () => {
    const clock = run(
      [
        [10, 'checking'],
        [10, 'pending'],
        [12, 'rejected'],
        [20, 'checking'],
      ],
      liveSinceDayOne(),
    );
    expect(clock.expiresAt).toEqual(day(39));
  });

  it('rút tin chờ duyệt về nháp thì ngày vẫn trôi — người đăng tự chọn (D4)', () => {
    const clock = run(
      [
        [20, 'checking'],
        [20, 'pending'],
        [21, 'draft'],
      ],
      liveSinceDayOne(),
    );
    expect(clock.expiresAt).toEqual(day(31));
  });
});

describe('Ngày dừng hay trôi khi tin tạm ẩn', () => {
  // Tin lên bảng ngày 1 nên tới ngày 21 còn đúng 10 ngày.

  it.each<[string, ListingHideReason[], number, number]>([
    ['nhóm bị tạm khoá 5 ngày', ['group_locked'], 5, 10],
    ['danh mục bị tắt 3 ngày', ['category_disabled'], 3, 10],
    ['tài khoản bị khoá 4 ngày', ['account_locked'], 4, 6],
    ['người đăng tự rời nhóm 4 ngày', ['left_group'], 4, 6],
    ['người ngoài bị cấm 5 ngày rồi gỡ cấm', ['group_banned'], 5, 10],
    ['người đăng bị gỡ khỏi nhóm, 4 ngày sau vào lại', ['removed_from_group'], 4, 10],
  ])('%s: hiện lại còn đúng số ngày', (_case, reasons, hiddenDays, left) => {
    const hidden = run([[21, 'live', reasons]], liveSinceDayOne());
    const back = run([[21 + hiddenDays, 'live']], hidden);
    expect(daysLeft(back, 21 + hiddenDays)).toBe(left);
  });

  it('thành viên bị cấm 5 ngày, gỡ cấm, 3 ngày sau mới vào lại: vẫn còn 10 ngày', () => {
    const clock = run(
      [
        [21, 'live', ['group_banned', 'removed_from_group']],
        [26, 'live', ['removed_from_group']],
        [29, 'live'],
      ],
      liveSinceDayOne(),
    );
    expect(daysLeft(clock, 29)).toBe(10);
  });

  it('hết ngày trong lúc tài khoản bị khoá: hết hạn trong lúc khoá, hiện lại vẫn hết hạn', () => {
    const locked = run([[28, 'live', ['account_locked']]], liveSinceDayOne());
    expect(isDue('live', locked, day(31))).toBe(true);
    const expired = run([[31, 'expired', ['account_locked']]], locked);
    const unlocked = run([[33, 'expired']], expired);
    expect(unlocked.expiresAt).toEqual(day(31));
  });
});

describe('Hết ngày trong lúc chờ máy hay người', () => {
  it('còn 2 ngày, sửa, chờ người 3 ngày rồi được đạt: lên bảng và tới hạn ngay', () => {
    const clock = run(
      [
        [29, 'checking'],
        [29, 'pending'],
        [32, 'live'],
      ],
      liveSinceDayOne(),
    );
    expect(isDue('live', clock, day(32))).toBe(true);
  });
});

describe('Gia hạn', () => {
  it('trong 7 ngày cuối thì được, sớm hơn thì trả ngày bắt đầu được gia hạn', () => {
    const clock = liveSinceDayOne();
    expect(renewEarlyCheck(clock, day(26), 7)).toEqual({ ok: true });
    expect(renewEarlyCheck(clock, day(19), 7)).toEqual({ ok: false, opensAt: day(24) });
  });

  it('gia hạn sớm ngày 27, máy cho qua: hạn mới là ngày 61, vị trí không đổi', () => {
    const clock = run(
      [
        [27, 'checking'],
        [27, 'live'],
      ],
      { ...liveSinceDayOne(), renewal: 'early' },
    );
    expect(clock.expiresAt).toEqual(day(61));
    expect(clock.firstLiveAt).toEqual(day(1));
    expect(clock.renewal).toBeNull();
  });

  it('gia hạn sớm ngày 27, chờ người, đạt ngày 28: vẫn ngày 61; gia hạn tiếp ngày 28 thì quá sớm', () => {
    const clock = run(
      [
        [27, 'checking'],
        [27, 'pending'],
        [28, 'live'],
      ],
      { ...liveSinceDayOne(), renewal: 'early' },
    );
    expect(clock.expiresAt).toEqual(day(61));
    expect(renewEarlyCheck(clock, day(28), 7)).toEqual({ ok: false, opensAt: day(54) });
  });

  it('gia hạn tin hết hạn ngày 40, đạt ngày 42: 30 ngày từ ngày 42, vị trí lần lên bảng đầu', () => {
    const expired = run([[31, 'expired']], liveSinceDayOne());
    const clock = run(
      [
        [40, 'checking'],
        [40, 'pending'],
        [42, 'live'],
      ],
      { ...expired, renewal: 'expired' },
    );
    expect(clock.expiresAt).toEqual(day(72));
    expect(clock.firstLiveAt).toEqual(day(1));
  });

  it('gia hạn bị từ chối thì không được cộng ngày và dấu gia hạn mất', () => {
    const clock = run(
      [
        [27, 'checking'],
        [27, 'pending'],
        [28, 'rejected'],
      ],
      { ...liveSinceDayOne(), renewal: 'early' },
    );
    expect(clock.renewal).toBeNull();
    expect(daysLeft(clock, 28)).toBe(3);
  });
});

describe('Thời gian được thấy (dữ kiện tin sạch của trust)', () => {
  it('cộng dồn lúc đang hiển thị và không tạm ẩn; tạm ẩn không tính dù ngày hiển thị vẫn trôi', () => {
    const clock = run(
      [
        [5, 'live', ['account_locked']],
        [8, 'live'],
        [11, 'sold'],
      ],
      liveSinceDayOne(),
    );
    expect(clock.shownMs).toBe(BigInt(7 * DAY_MS));
    expect(clock.shownSince).toBeNull();
  });

  it('chờ duyệt chưa từng hiển thị thì không có giờ nào được thấy', () => {
    const clock = run([
      [1, 'checking'],
      [1, 'pending'],
    ]);
    expect(clock.shownMs).toBe(0n);
    expect(clock.shownSince).toBeNull();
  });
});

describe('Tin trùng lên bảng ở vị trí tin cũ', () => {
  it('vị trí lấy của tin cũ, ngày hiển thị vẫn tính từ bây giờ', () => {
    const clock = nextClock(
      NEW_DRAFT,
      { state: 'live', hideReasons: [] },
      day(10),
      SETTINGS,
      day(2),
    );
    expect(clock.firstLiveAt).toEqual(day(2));
    expect(clock.expiresAt).toEqual(day(40));
  });
});

describe('Kết quả chỉ mang cột đồng hồ', () => {
  it('truyền cả dòng tin: không trả lại trạng thái, phiên bản hay cột nào khác của dòng', () => {
    const row = { ...NEW_DRAFT, id: 'tin', state: 'draft' as const, version: 2 };
    const clock = nextClock(row, { state: 'checking', hideReasons: [] }, day(1), SETTINGS);
    expect(Object.keys(clock).toSorted()).toEqual(Object.keys(NEW_DRAFT).toSorted());
  });
});
