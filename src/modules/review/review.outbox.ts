import type {
  OutboxEventInput,
  OutboxEventType,
  OutboxPayload,
} from '../../common/outbox/outbox.js';

/**
 * Sự kiện `review` phát vào outbox cho `notification` (design add-review-queues mục 10): N40 nhắc master việc nằm ở hàng
 * master quá lâu, N41 cảnh báo nhiều việc sắp chạm hạn, N42 hậu kiểm tuần trước làm không xuể. Người nhận là mọi master.
 */
export const REVIEW_EVENTS = {
  masterReminder: 'review.master.reminder',
  deadlineWarning: 'review.deadline.warning',
  postcheckLow: 'review.postcheck.low',
} as const satisfies Record<string, OutboxEventType>;

export const reviewEvent = (
  type: (typeof REVIEW_EVENTS)[keyof typeof REVIEW_EVENTS],
  payload: OutboxPayload,
): OutboxEventInput => ({ type, payload });
