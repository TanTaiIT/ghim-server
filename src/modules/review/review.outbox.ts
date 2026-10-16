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
  /**
   * Người duyệt cho đạt tin chờ duyệt, từ chối, gỡ hay khôi phục — cùng transaction với nhật ký quyết định
   * (change notify-listing-decisions). `groupId` chỉ có khi người quyết là quản trị nhóm; không mang mã người quyết.
   */
  listingDecided: 'review.listing.decided',
} as const satisfies Record<string, OutboxEventType>;

/** Kết quả người đăng được báo (N45) — tên theo việc xảy ra với tin, không theo nút người duyệt bấm. */
export type ListingDecidedOutcome = 'approved' | 'rejected' | 'removed' | 'restored';

export const reviewEvent = (
  type: (typeof REVIEW_EVENTS)[keyof typeof REVIEW_EVENTS],
  payload: OutboxPayload,
): OutboxEventInput => ({ type, payload });
