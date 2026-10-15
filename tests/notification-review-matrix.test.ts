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
const contextWith = (masters: string[]): MatrixContext => ({
  group: unused,
  managers: unused,
  moderators: unused,
  owner: unused,
  names: unused,
  unitName: unused,
  announcement: unused,
  pendingCount: unused,
  listingTitles: unused,
  listingTargets: unused,
  masterIds: () => Promise.resolve(masters),
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
      collapse: { key: 'review.deadline.warning' },
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
