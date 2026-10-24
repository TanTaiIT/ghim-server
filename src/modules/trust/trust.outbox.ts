import type {
  OutboxEventInput,
  OutboxEventType,
  OutboxPayload,
} from '../../common/outbox/outbox.js';

/**
 * Sự kiện `trust` phát vào outbox (design add-trust-tiers mục 10). Một sự kiện cho cả lên lẫn xuống mức: `listing` gỡ
 * lý do "tài khoản mới" khi từ T0 lên, `notification` báo lên / xuống mức ở `add-notifications`.
 */
export const TRUST_EVENTS = {
  tierChanged: 'trust.tier.changed',
  /**
   * Gậy (add-strikes). `strike.standing` phát sau MỌI thay đổi (ra, hết hạn, huỷ, hạ, kế thừa) — bên nghe hỏi lại
   * `trust` rồi đối chiếu, không tin payload (C1). `strike.issued` kèm `kind`: `serious` → `identity` khoá, `review` mở
   * việc.
   */
  strikeIssued: 'trust.strike.issued',
  strikeExpired: 'trust.strike.expired',
  strikeCancelled: 'trust.strike.cancelled',
  /** Master quyết gậy nghiêm trọng (`permanent` / `downgrade` / `cancel`) hay gỡ khoá vĩnh viễn (`lifted`). */
  strikeDecided: 'trust.strike.decided',
  strikeStanding: 'trust.strike.standing',
  /** Khoá vĩnh viễn tới kỳ xem lại 2 năm — `review` mở việc cho master. */
  strikeReviewDue: 'trust.strike.review_due',
  appealFiled: 'trust.appeal.filed',
  /** Khiếu nại đóng không qua người xét (ân xá, gậy được quyết đường khác) — `review` đóng việc. */
  appealClosed: 'trust.appeal.closed',
  /**
   * Khiếu nại có kết quả qua người xét hay lượt tự thắng khi quá hạn (add-trust-notices): phát cả khi thua — lượt thua
   * không đổi gậy nên không có `strike.*` nào để `notification` nghe.
   */
  appealDecided: 'trust.appeal.decided',
  /**
   * Một lần cho cả lượt kế thừa khi đăng ký lại (add-trust-notices): `strike.issued { inherited }` phát từng gậy và
   * không mang mã lượt, nên `notification` không gom được thành một thông báo.
   */
  strikeInherited: 'trust.strike.inherited',
} as const satisfies Record<string, OutboxEventType>;

export const trustEvent = (
  type: (typeof TRUST_EVENTS)[keyof typeof TRUST_EVENTS],
  payload: OutboxPayload,
): OutboxEventInput => ({ type, payload });
