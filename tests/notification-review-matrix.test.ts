import { describe, expect, it } from 'vitest';

import type { MatrixContext, Payload } from '../src/modules/notification/notification.matrix.js';
import { REVIEW_MATRIX } from '../src/modules/notification/notification.review-matrix.js';
import { REVIEW_EVENTS } from '../src/modules/review/review.outbox.js';

/*
 * Dòng N40–N42 của ma trận (change add-review-queues, design mục 10) với ngữ cảnh giả: ai nhận, nhóm nào, có nhắc, câu
 * và gộp. Luồng thật — job của `review`, outbox, hộp thư master — ở `review-schedule.http.test.ts`.
 */
const MASTERS = ['0199a000-0000-7000-8000-0000000000m1', '0199a000-0000-7000-8000-0000000000m2'];

const unused = () => Promise.reject(new Error('ma trận của review không được hỏi điều này'));
const contextWith = (
  masters: string[],
  known: { groups?: Record<string, string>; titles?: Record<string, string> } = {},
): MatrixContext => ({
  group: (groupId) => {
    const name = known.groups?.[groupId];
    return Promise.resolve(name ? { id: groupId, name, state: 'active' } : null);
  },
  isMember: unused,
  isBanned: unused,
  managers: unused,
  moderators: unused,
  owner: unused,
  names: unused,
  unitName: unused,
  announcement: unused,
  pendingCount: unused,
  listingTitles: (ids) =>
    Promise.resolve(
      new Map(ids.flatMap((id) => (known.titles?.[id] ? [[id, known.titles[id]] as const] : []))),
    ),
  listingTargets: unused,
  masterIds: () => Promise.resolve(masters),
  messagePreview: unused,
  strike: unused,
  standing: unused,
  postingLockPoints: () => {
    throw new Error('ma trận này không được hỏi ngưỡng khoá đăng tin');
  },
  liveAccounts: unused,
  groupHeldNotice: unused,
  machineNotice: unused,
});

const handle = (type: string, payload: Payload, masters = MASTERS) => {
  const handler = REVIEW_MATRIX[type];
  if (!handler) throw new Error(`Thiếu dòng ma trận cho ${type}`);
  return handler(payload, contextWith(masters));
};

describe('N40 — việc nằm ở hàng master quá lâu', () => {
  it('báo mọi master, nhóm "tài khoản", có nhắc, gộp theo loại; câu theo số của lượt mới nhất', async () => {
    const result = await handle(REVIEW_EVENTS.masterReminder, { count: 3, hours: 72 });
    expect(result.fanOuts).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    const [draft] = result.drafts;
    expect(draft).toMatchObject({
      recipients: MASTERS,
      category: 'account',
      personal: true,
      alertable: true,
      type: 'review.master.reminder',
      title: 'Hàng chờ của master',
      body: '3 việc nằm ở hàng master quá 72 giờ chưa ai xử.',
      groupId: null,
    });
    expect(draft?.collapse?.key).toBe('review.master.reminder');
    // Nhắc lại tối đa một lần mỗi ngày (fix-audit-review, T9).
    expect(draft?.collapse?.alertMinutes).toBe('notification.reviewAlertMinutes');
    expect(draft?.collapse?.render(5)).toBe('3 việc nằm ở hàng master quá 72 giờ chưa ai xử.');
  });

  it('không có việc nào, hay thiếu số: không báo', async () => {
    expect((await handle(REVIEW_EVENTS.masterReminder, { count: 0, hours: 72 })).drafts).toEqual(
      [],
    );
    expect((await handle(REVIEW_EVENTS.masterReminder, { count: 2 })).drafts).toEqual([]);
  });

  it('chưa có master nào: không báo ai', async () => {
    expect(
      (await handle(REVIEW_EVENTS.masterReminder, { count: 1, hours: 72 }, [])).drafts,
    ).toEqual([]);
  });
});

describe('N41 — nhiều việc sắp chạm hạn', () => {
  it('báo mọi master kèm số việc sắp chạm hạn trên số việc đang chờ', async () => {
    const result = await handle(REVIEW_EVENTS.deadlineWarning, { open: 10, dueSoon: 5, hours: 24 });
    expect(result.drafts[0]).toMatchObject({
      recipients: MASTERS,
      category: 'account',
      type: 'review.deadline.warning',
      title: 'Hàng chờ sắp chạm hạn',
      body: '5 trong 10 việc đang chờ sẽ chạm hạn trong 24 giờ tới.',
      collapse: { key: 'review.deadline.warning', alertMinutes: 'notification.reviewAlertMinutes' },
    });
  });
});

describe('N42 — hậu kiểm tuần trước làm không xuể', () => {
  it('báo mọi master tỉ lệ làm xong, số xử xong, số tự huỷ và ngưỡng', async () => {
    const result = await handle(REVIEW_EVENTS.postcheckLow, {
      rate: 75,
      done: 75,
      expired: 25,
      threshold: 80,
      from: '2027-03-01T00:00:00.000+07:00',
      to: '2027-03-08T00:00:00.000+07:00',
    });
    expect(result.drafts[0]).toMatchObject({
      recipients: MASTERS,
      type: 'review.postcheck.low',
      title: 'Hậu kiểm tuần trước',
      body: 'Hậu kiểm tuần trước làm xong 75% (75 việc xử xong, 25 việc tự huỷ vì quá hạn) — dưới ngưỡng 80%.',
    });
  });

  it('chưa có tỉ lệ (tuần không có việc hàng 5 nào khép lại): không báo', async () => {
    expect(
      (await handle(REVIEW_EVENTS.postcheckLow, { rate: null, done: 0, expired: 0, threshold: 80 }))
        .drafts,
    ).toEqual([]);
  });
});

describe('N45 — người duyệt quyết về tin (notify-listing-decisions)', () => {
  const LISTING = '0199a000-0000-7000-8000-000000000101';
  const OWNER = '0199a000-0000-7000-8000-0000000000a1';
  const GROUP = '0199a000-0000-7000-8000-0000000000b1';
  const known = { groups: { [GROUP]: 'Hội phụ huynh 12A1' }, titles: { [LISTING]: 'Xe đạp cũ' } };
  const decided = (payload: Payload) => {
    const handler = REVIEW_MATRIX[REVIEW_EVENTS.listingDecided];
    if (!handler) throw new Error('Thiếu dòng N45');
    return handler(
      { listingId: LISTING, ownerId: OWNER, groupId: null, fault: null, reason: null, ...payload },
      contextWith([], known),
    );
  };

  it('được duyệt: người đăng nhận, "tin đăng của bạn", có nhắc, ký "Ghim", không gộp', async () => {
    const { drafts, fanOuts } = await decided({ outcome: 'approved' });
    expect(fanOuts).toEqual([]);
    expect(drafts).toEqual([
      expect.objectContaining({
        recipients: [OWNER],
        category: 'your_listings',
        type: 'listing.review.approved',
        title: 'Ghim',
        body: 'Tin «Xe đạp cũ» đã được duyệt và đang hiển thị.',
        detail: null,
        alertable: true,
        personal: true,
      }),
    ]);
    expect(drafts[0]?.collapse).toBeUndefined();
  });

  it('từ chối vì sai sót: câu nhắc không có lý do; nội dung trong app nêu lý do và cách sửa', async () => {
    const [draft] = (
      await decided({ outcome: 'rejected', fault: 'mistake', reason: 'Ảnh chưa rõ sản phẩm' })
    ).drafts;
    expect(draft?.body).toBe('Tin «Xe đạp cũ» chưa được duyệt.');
    expect(draft?.body).not.toContain('Ảnh chưa rõ sản phẩm');
    expect(draft?.detail).toBe(
      'Lý do: Ảnh chưa rõ sản phẩm. Sửa tin rồi gửi lại để người duyệt xem lại.',
    );
  });

  it('gỡ vì sai sót, khôi phục: đúng câu từng kết quả', async () => {
    const [removed] = (
      await decided({ outcome: 'removed', fault: 'mistake', reason: 'Giá ghi sai' })
    ).drafts;
    expect(removed).toMatchObject({
      body: 'Tin «Xe đạp cũ» đã bị gỡ.',
      detail: 'Lý do: Giá ghi sai. Sửa tin rồi gửi lại để tin hiện lại.',
    });
    const [restored] = (await decided({ outcome: 'restored' })).drafts;
    expect(restored).toMatchObject({ body: 'Tin «Xe đạp cũ» đã hiển thị lại.', detail: null });
  });

  it('quản trị nhóm quyết: ký "Quản trị nhóm «tên nhóm»", gắn nhóm; không tên người duyệt', async () => {
    const [draft] = (
      await decided({
        outcome: 'rejected',
        fault: 'mistake',
        reason: 'Sai danh mục',
        groupId: GROUP,
      })
    ).drafts;
    expect(draft).toMatchObject({
      title: 'Quản trị nhóm «Hội phụ huynh 12A1»',
      groupId: GROUP,
      data: { listingId: LISTING, groupId: GROUP },
    });
  });

  it('tin đã xoá hẳn, kết quả lạ, thiếu người đăng: không báo', async () => {
    expect(
      (await decided({ outcome: 'approved', listingId: '0199a000-0000-7000-8000-000000000999' }))
        .drafts,
    ).toEqual([]);
    expect((await decided({ outcome: 'dismissed' })).drafts).toEqual([]);
    expect((await decided({ outcome: 'approved', ownerId: null })).drafts).toEqual([]);
  });
});

describe('N36 — tin trong nhóm bị máy giữ chờ duyệt (add-trust-notices)', () => {
  const GROUP = '0199a000-0000-7000-8000-0000000000e1';
  const UNIT_MOD = '0199a000-0000-7000-8000-0000000000e2';
  const OTHER_MOD = '0199a000-0000-7000-8000-0000000000e3';
  const held = (notice: Awaited<ReturnType<MatrixContext['groupHeldNotice']>>): MatrixContext => ({
    ...contextWith([], { groups: { [GROUP]: 'Lớp 12A1' } }),
    groupHeldNotice: () => Promise.resolve(notice),
  });
  const run = (ctx: MatrixContext) => {
    const handler = REVIEW_MATRIX[REVIEW_EVENTS.groupHeld];
    if (!handler) throw new Error('Thiếu dòng N36');
    return handler({ taskId: '0199a000-0000-7000-8000-0000000000e9', groupId: GROUP }, ctx);
  };

  it('mỗi người xử được một dòng: số việc đang chờ của chính họ, gộp theo nhóm, có nhắc, theo tắt tiếng nhóm', async () => {
    const { drafts } = await run(
      held({
        groupId: GROUP,
        recipients: [
          { accountId: UNIT_MOD, pending: 3 },
          { accountId: OTHER_MOD, pending: 1 },
        ],
      }),
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      recipients: [UNIT_MOD],
      category: 'your_groups',
      type: 'group.review.pending',
      title: 'Lớp 12A1',
      body: '«Lớp 12A1» có 3 tin chờ duyệt.',
      data: { groupId: GROUP },
      groupId: GROUP,
      alertable: true,
      personal: false,
    });
    expect(drafts[1]?.body).toBe('«Lớp 12A1» có 1 tin chờ duyệt.');
    // Số là số hiện tại lúc gửi, không phải số lượt từ lúc đọc như N20.
    expect(drafts[0]?.collapse?.key).toBe(`group:${GROUP}:held`);
    expect(drafts[0]?.collapse?.render(9)).toBe('«Lớp 12A1» có 3 tin chờ duyệt.');
  });

  it('việc đã đóng, không còn ở cấp quản trị nhóm, hay nhóm không còn: không dòng nào', async () => {
    expect((await run(held(null))).drafts).toEqual([]);
    expect((await run(held({ groupId: GROUP, recipients: [] }))).drafts).toEqual([]);
    const gone: MatrixContext = {
      ...held({ groupId: GROUP, recipients: [{ accountId: UNIT_MOD, pending: 1 }] }),
      group: () => Promise.resolve(null),
    };
    expect((await run(gone)).drafts).toEqual([]);
  });
});
