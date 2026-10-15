import type { GroupJoinPath, GroupMode, GroupState } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { badgeEligible } from '../src/modules/group/calc/badges.calc.js';
import {
  allowsSettings,
  closable,
  type ModeChangePlan,
  planModeChange,
} from '../src/modules/group/calc/group-state.calc.js';
import {
  decideJoin,
  generateGroupCode,
  joinRequestBlock,
  type ModeratorCandidate,
  normalizeGroupCode,
  pickNominee,
  roleIneligibility,
} from '../src/modules/group/calc/membership.calc.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

const MODES: GroupMode[] = ['public_open', 'public_review', 'private_code', 'private_invite'];
const STATES: GroupState[] = [
  'pending_owner',
  'active',
  'going_private',
  'ownerless',
  'locked',
  'closed',
];
const JOIN_PATHS: GroupJoinPath[] = ['joined', 'approved', 'invited', 'roster', 'assigned'];

const immediate = (
  mode: GroupMode,
  code: 'generate' | 'clear',
  resetSideSwitches: boolean,
  cancelPendingRequests = false,
): ModeChangePlan => ({
  kind: 'immediate',
  mode,
  cancelPendingRequests,
  code,
  resetSideSwitches,
});

describe('planModeChange — mọi cặp chế độ', () => {
  const rows: [
    from: GroupMode,
    to: GroupMode,
    withoutPublicListings: ModeChangePlan,
    withPublicListings: ModeChangePlan,
  ][] = [
    [
      'public_open',
      'public_review',
      immediate('public_review', 'clear', false),
      immediate('public_review', 'clear', false),
    ],
    [
      'public_open',
      'private_code',
      immediate('private_code', 'generate', true),
      { kind: 'going_private', targetMode: 'private_code' },
    ],
    [
      'public_open',
      'private_invite',
      immediate('private_invite', 'clear', true),
      { kind: 'going_private', targetMode: 'private_invite' },
    ],
    [
      'public_review',
      'public_open',
      immediate('public_open', 'clear', false, true),
      immediate('public_open', 'clear', false, true),
    ],
    [
      'public_review',
      'private_code',
      immediate('private_code', 'generate', true),
      { kind: 'going_private', targetMode: 'private_code' },
    ],
    [
      'public_review',
      'private_invite',
      immediate('private_invite', 'clear', true),
      { kind: 'going_private', targetMode: 'private_invite' },
    ],
    [
      'private_code',
      'public_open',
      immediate('public_open', 'clear', true),
      immediate('public_open', 'clear', true),
    ],
    [
      'private_code',
      'public_review',
      immediate('public_review', 'clear', true),
      immediate('public_review', 'clear', true),
    ],
    [
      'private_code',
      'private_invite',
      immediate('private_invite', 'clear', false),
      immediate('private_invite', 'clear', false),
    ],
    [
      'private_invite',
      'public_open',
      immediate('public_open', 'clear', true),
      immediate('public_open', 'clear', true),
    ],
    [
      'private_invite',
      'public_review',
      immediate('public_review', 'clear', true),
      immediate('public_review', 'clear', true),
    ],
    [
      'private_invite',
      'private_code',
      immediate('private_code', 'generate', false),
      immediate('private_code', 'generate', false),
    ],
  ];

  it('bảng phủ đủ 12 cặp khác nhau', () => {
    const pairs = new Set(rows.map(([from, to]) => `${from}>${to}`));
    expect(pairs.size).toBe(MODES.length * (MODES.length - 1));
  });

  it.each(rows)('%s → %s', (from, to, withoutListings, withListings) => {
    expect(planModeChange(from, to, false)).toEqual(withoutListings);
    expect(planModeChange(from, to, true)).toEqual(withListings);
  });

  it.each(MODES)('%s → chính nó: không đổi gì, kể cả khi còn tin công khai', (mode) => {
    expect(planModeChange(mode, mode, false)).toBeNull();
    expect(planModeChange(mode, mode, true)).toBeNull();
  });

  it('chỉ xét duyệt → mở cửa huỷ đơn đang chờ; mọi cặp khác giữ đơn để người quản trị xét', () => {
    for (const from of MODES) {
      for (const to of MODES) {
        const plan = planModeChange(from, to, false);
        if (plan?.kind !== 'immediate') continue;
        expect(plan.cancelPendingRequests).toBe(from === 'public_review' && to === 'public_open');
      }
    }
  });

  it('chỉ công khai → riêng tư khi còn tin công khai mới qua trạng thái chuyển', () => {
    const goingPrivate = MODES.flatMap((from) =>
      MODES.filter((to) => planModeChange(from, to, true)?.kind === 'going_private').map(
        (to) => `${from}>${to}`,
      ),
    );
    expect(goingPrivate.toSorted()).toEqual([
      'public_open>private_code',
      'public_open>private_invite',
      'public_review>private_code',
      'public_review>private_invite',
    ]);
  });
});

describe('allowsSettings', () => {
  it.each(STATES)('%s', (state) => {
    expect(allowsSettings(state, false)).toBe(state === 'active');
    expect(allowsSettings(state, true)).toBe(state === 'active' || state === 'ownerless');
  });
});

describe('closable', () => {
  it('nhóm đã đóng không đóng lại được, kể cả master', () => {
    expect(closable('closed', false)).toBe(false);
    expect(closable('closed', true)).toBe(false);
  });

  it.each(STATES.filter((state) => state !== 'closed'))('master đóng được nhóm %s', (state) => {
    expect(closable(state, true)).toBe(true);
  });

  it('chủ nhóm đóng được nhóm đang hoạt động, đang chuyển, đang khoá — không phải nhóm chưa có hay thiếu chủ', () => {
    expect(closable('active', false)).toBe(true);
    expect(closable('going_private', false)).toBe(true);
    expect(closable('locked', false)).toBe(true);
    expect(closable('pending_owner', false)).toBe(false);
    expect(closable('ownerless', false)).toBe(false);
  });
});

describe('decideJoin — thứ tự lời mời > danh sách lớp > chế độ', () => {
  const invitation = { id: 'loi-moi-1', unitId: 'don-vi-a' };
  const roster = { unitId: 'don-vi-b' };

  it.each(MODES)('có lời mời ở nhóm %s: vào bằng lời mời, đơn vị theo lời mời', (mode) => {
    expect(decideJoin({ mode, invitation, roster, codeMatches: false })).toEqual({
      kind: 'member',
      via: 'invited',
      unitId: 'don-vi-a',
      invitationId: 'loi-moi-1',
    });
  });

  it.each(MODES)(
    'có tên trong danh sách lớp ở nhóm %s: vào ngay, đơn vị theo danh sách',
    (mode) => {
      expect(decideJoin({ mode, invitation: null, roster, codeMatches: false })).toEqual({
        kind: 'member',
        via: 'roster',
        unitId: 'don-vi-b',
      });
    },
  );

  it('danh sách lớp không ghi đơn vị thì vào không đơn vị', () => {
    expect(
      decideJoin({
        mode: 'private_invite',
        invitation: null,
        roster: { unitId: null },
        codeMatches: false,
      }),
    ).toEqual({ kind: 'member', via: 'roster', unitId: null });
  });

  it('công khai · mở cửa: bấm tham gia là vào', () => {
    expect(
      decideJoin({ mode: 'public_open', invitation: null, roster: null, codeMatches: false }),
    ).toEqual({ kind: 'member', via: 'joined', unitId: null });
  });

  it('công khai · xét duyệt: tạo đơn', () => {
    expect(
      decideJoin({ mode: 'public_review', invitation: null, roster: null, codeMatches: false }),
    ).toEqual({ kind: 'request' });
  });

  it('riêng tư · có mã: đúng mã thì tạo đơn, thiếu hay sai mã thì như không có nhóm', () => {
    expect(
      decideJoin({ mode: 'private_code', invitation: null, roster: null, codeMatches: true }),
    ).toEqual({ kind: 'request' });
    expect(
      decideJoin({ mode: 'private_code', invitation: null, roster: null, codeMatches: false }),
    ).toEqual({ kind: 'error', code: 'NOT_FOUND' });
  });

  it('riêng tư · chỉ lời mời: không có lời mời thì cần lời mời, đúng mã cũng không giúp gì', () => {
    for (const codeMatches of [false, true]) {
      expect(
        decideJoin({ mode: 'private_invite', invitation: null, roster: null, codeMatches }),
      ).toEqual({ kind: 'error', code: 'INVITATION_REQUIRED' });
    }
  });
});

describe('joinRequestBlock', () => {
  const base = { pendingCount: 0, now: NOW, reapplyWaitDays: 7, maxPending: 3 };

  it('chưa từng bị từ chối, chưa có đơn chờ: gửi được', () => {
    expect(joinRequestBlock({ ...base, lastRejectedAt: null })).toBeNull();
  });

  it('bị từ chối chưa đủ 7 ngày: quá sớm, kèm thời điểm gửi lại đúng 7 ngày sau lần từ chối', () => {
    const rejectedAt = new Date(NOW.getTime() - 7 * DAY_MS + 1);
    expect(joinRequestBlock({ ...base, lastRejectedAt: rejectedAt })).toEqual({
      code: 'JOIN_REQUEST_TOO_SOON',
      retryAt: new Date(rejectedAt.getTime() + 7 * DAY_MS),
    });
  });

  it('đúng 7 ngày sau lần từ chối: gửi lại được', () => {
    expect(joinRequestBlock({ ...base, lastRejectedAt: daysAgo(7) })).toBeNull();
  });

  it('thời gian chờ đọc từ tham số, không cố định 7', () => {
    expect(joinRequestBlock({ ...base, reapplyWaitDays: 10, lastRejectedAt: daysAgo(8) })).toEqual({
      code: 'JOIN_REQUEST_TOO_SOON',
      retryAt: new Date(daysAgo(8).getTime() + 10 * DAY_MS),
    });
  });

  it('đủ trần đơn chờ thì bị chặn; còn một chỗ thì gửi được', () => {
    expect(joinRequestBlock({ ...base, lastRejectedAt: null, pendingCount: 3 })).toEqual({
      code: 'JOIN_REQUEST_LIMIT',
    });
    expect(joinRequestBlock({ ...base, lastRejectedAt: null, pendingCount: 2 })).toBeNull();
  });

  it('vừa quá sớm vừa hết chỗ: báo quá sớm — người dùng biết lúc nào thử lại', () => {
    expect(
      joinRequestBlock({ ...base, lastRejectedAt: daysAgo(1), pendingCount: 3 }),
    ).toMatchObject({ code: 'JOIN_REQUEST_TOO_SOON' });
  });
});

describe('roleIneligibility', () => {
  it('người dùng đang hoạt động nhận được vai', () => {
    expect(roleIneligibility({ role: 'user', status: 'active' })).toBeNull();
  });

  it('không có tài khoản, hay tài khoản đã xoá', () => {
    expect(roleIneligibility(undefined)).toBe('không có tài khoản này');
    expect(roleIneligibility({ role: 'user', status: 'deleted' })).toBe('không có tài khoản này');
  });

  it('master không vào nhóm — kể cả khi đang bị khoá', () => {
    expect(roleIneligibility({ role: 'master', status: 'active' })).toBe(
      'tài khoản master không vào nhóm',
    );
    expect(roleIneligibility({ role: 'master', status: 'locked' })).toBe(
      'tài khoản master không vào nhóm',
    );
  });

  it('đang bị khoá', () => {
    expect(roleIneligibility({ role: 'user', status: 'locked' })).toBe('tài khoản đang bị khoá');
  });

  it('chưa xác nhận email', () => {
    expect(roleIneligibility({ role: 'user', status: 'pending_verification' })).toBe(
      'tài khoản chưa xác nhận email',
    );
  });
});

const candidate = (
  accountId: string,
  moderatorUnitId: string | null,
  roleSinceDaysAgo: number,
  joinedDaysAgo: number,
): ModeratorCandidate => ({
  accountId,
  moderatorUnitId,
  roleSince: daysAgo(roleSinceDaysAgo),
  joinedAt: daysAgo(joinedDaysAgo),
});

describe('pickNominee', () => {
  it('không còn điều hành viên nào: không có đề cử', () => {
    expect(pickNominee([])).toBeNull();
  });

  it('điều hành viên cả nhóm đứng trước điều hành viên đơn vị, dù nhận vai muộn hơn', () => {
    expect(
      pickNominee([
        candidate('don-vi-lau', 'lop-12a1', 300, 400),
        candidate('ca-nhom', null, 10, 20),
      ]),
    ).toBe('ca-nhom');
  });

  it('cùng cấp cả nhóm: nhận vai sớm nhất', () => {
    expect(
      pickNominee([
        candidate('moi', null, 5, 500),
        candidate('lau', null, 100, 120),
        candidate('vua', null, 50, 60),
      ]),
    ).toBe('lau');
  });

  it('nhận vai cùng lúc: vào nhóm sớm hơn thắng', () => {
    expect(
      pickNominee([candidate('vao-sau', null, 30, 40), candidate('vao-truoc', null, 30, 90)]),
    ).toBe('vao-truoc');
  });

  it('chỉ còn điều hành viên đơn vị: lấy người lâu năm nhất trong số đó', () => {
    expect(
      pickNominee([
        candidate('lop-a', 'lop-12a1', 20, 30),
        candidate('lop-b', 'lop-12a2', 80, 90),
        candidate('lop-c', 'lop-12a3', 80, 200),
      ]),
    ).toBe('lop-c');
  });
});

describe('generateGroupCode', () => {
  it('đúng độ dài yêu cầu, không bao giờ có I, L, O, U', () => {
    for (let index = 0; index < 2000; index += 1) {
      const code = generateGroupCode(6);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    }
    expect(generateGroupCode(9)).toHaveLength(9);
  });

  it('nguồn ngẫu nhiên tiêm vào: xin đúng số byte bằng độ dài, mỗi byte ra một ký tự', () => {
    const asked: number[] = [];
    const code = generateGroupCode(6, (bytes) => {
      asked.push(bytes);
      return Buffer.alloc(bytes, 0);
    });
    expect(asked).toEqual([6]);
    expect(code).toBe('000000');
    expect(generateGroupCode(6, (bytes) => Buffer.alloc(bytes, 0xff))).toBe('ZZZZZZ');
  });

  it('32 byte liên tiếp phủ trọn bảng chữ; byte 32 quay về ký tự đầu', () => {
    const all = generateGroupCode(33, () => Buffer.from(Array.from({ length: 33 }, (_, i) => i)));
    expect(all).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ0');
  });
});

describe('normalizeGroupCode', () => {
  it('chịu được cách người dùng gõ: chữ thường, khoảng trắng, gạch nối, I/L/O nhầm với số', () => {
    expect(normalizeGroupCode(' ab1o-il0z ')).toBe('AB10110Z');
    expect(normalizeGroupCode('k7m 2-q9')).toBe('K7M2Q9');
  });

  it('mã do máy sinh giữ nguyên qua chuẩn hoá', () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generateGroupCode(6);
      expect(normalizeGroupCode(code)).toBe(code);
    }
  });
});

describe('badgeEligible — mọi đường vào × chế độ × hiện tên × trạng thái', () => {
  const REVIEWED: ReadonlySet<GroupJoinPath> = new Set([
    'approved',
    'invited',
    'roster',
    'assigned',
  ]);
  const BY_MODE: Record<GroupMode, [showNameOff: boolean, showNameOn: boolean]> = {
    public_open: [false, false],
    public_review: [true, true],
    private_code: [false, true],
    private_invite: [false, true],
  };
  const rows = JOIN_PATHS.flatMap((joinedVia) =>
    MODES.flatMap((mode) =>
      [false, true].flatMap((showNameOnMarketplace) =>
        STATES.map((state) => {
          const expected =
            state !== 'closed' &&
            REVIEWED.has(joinedVia) &&
            BY_MODE[mode][showNameOnMarketplace ? 1 : 0];
          return { joinedVia, mode, showNameOnMarketplace, state, expected };
        }),
      ),
    ),
  );

  it.each(rows)(
    '$joinedVia · $mode · hiện tên $showNameOnMarketplace · $state → $expected',
    ({ joinedVia, mode, showNameOnMarketplace, state, expected }) => {
      expect(badgeEligible({ joinedVia }, { state, mode, showNameOnMarketplace })).toBe(expected);
    },
  );

  it('bấm tham gia không bao giờ có huy hiệu', () => {
    expect(rows.filter((row) => row.joinedVia === 'joined' && row.expected)).toEqual([]);
  });

  it('tạm khoá không đổi quyền mang huy hiệu', () => {
    expect(
      badgeEligible(
        { joinedVia: 'approved' },
        { state: 'locked', mode: 'public_review', showNameOnMarketplace: false },
      ),
    ).toBe(true);
  });
});
