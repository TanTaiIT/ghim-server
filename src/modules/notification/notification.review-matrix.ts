import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { REVIEW_EVENTS } from '../review/review.outbox.js';
import {
  empty,
  type Handler,
  type MatrixContext,
  type MatrixResult,
  type NoticeDraft,
  num,
  type Payload,
} from './notification.matrix.js';

/** Một dòng cho mọi master, nhóm "tài khoản" (luôn bật), có nhắc; lặp lại thì cập nhật dòng chưa đọc, không thêm dòng. */
async function toMasters(
  ctx: MatrixContext,
  draft: { type: string; title: string; body: string },
): Promise<MatrixResult> {
  const recipients = await ctx.masterIds();
  if (recipients.length === 0) return empty();
  const notice: NoticeDraft = {
    ...draft,
    recipients,
    category: 'account',
    personal: true,
    data: {},
    groupId: null,
    alertable: true,
    // Câu luôn theo số của lượt mới nhất: dòng chưa đọc là trạng thái hiện tại, không phải số lần nhắc.
    collapse: { key: draft.type, render: () => draft.body },
  };
  return { ...empty(), drafts: [notice] };
}

/**
 * Ma trận N40–N42 (design add-review-queues mục 10): việc theo lịch của `review` báo master. Payload luôn mang đủ số
 * (cả ngưỡng đang dùng); thiếu số là sự kiện hỏng — không báo. Báo người đăng về quyết định là việc của
 * `add-notifications`.
 */
export const REVIEW_MATRIX: Record<string, Handler> = {
  // N40 — việc nằm ở hàng master quá hạn nhắc, nhắc lại mỗi ngày.
  async [REVIEW_EVENTS.masterReminder](payload: Payload, ctx: MatrixContext) {
    const count = num(payload, 'count');
    const hours = num(payload, 'hours');
    if (!count || hours === null) return empty();
    return toMasters(ctx, {
      type: 'review.master.reminder',
      title: 'Hàng chờ của master',
      body: `${count} việc nằm ở hàng master quá ${hours} giờ chưa ai xử.`,
    });
  },

  // N41 — một nửa số việc đang chờ sắp chạm hạn.
  async [REVIEW_EVENTS.deadlineWarning](payload: Payload, ctx: MatrixContext) {
    const open = num(payload, 'open');
    const dueSoon = num(payload, 'dueSoon');
    const hours = num(payload, 'hours');
    if (open === null || dueSoon === null || hours === null) return empty();
    return toMasters(ctx, {
      type: 'review.deadline.warning',
      title: 'Hàng chờ sắp chạm hạn',
      body: `${dueSoon} trong ${open} việc đang chờ sẽ chạm hạn trong ${hours} giờ tới.`,
    });
  },

  // N42 — hậu kiểm tuần trước làm xong dưới ngưỡng.
  async [REVIEW_EVENTS.postcheckLow](payload: Payload, ctx: MatrixContext) {
    const rate = num(payload, 'rate');
    const done = num(payload, 'done');
    const expired = num(payload, 'expired');
    const threshold = num(payload, 'threshold');
    if (rate === null || done === null || expired === null || threshold === null) return empty();
    return toMasters(ctx, {
      type: 'review.postcheck.low',
      title: 'Hậu kiểm tuần trước',
      body:
        `Hậu kiểm tuần trước làm xong ${rate}% (${done} việc xử xong, ${expired} việc tự huỷ vì quá hạn)` +
        ` — dưới ngưỡng ${threshold}%.`,
    });
  },
};

export const REVIEW_NOTICE_EVENTS = Object.keys(REVIEW_MATRIX) as OutboxEventType[];
