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
} as const satisfies Record<string, OutboxEventType>;

export const trustEvent = (
  type: (typeof TRUST_EVENTS)[keyof typeof TRUST_EVENTS],
  payload: OutboxPayload,
): OutboxEventInput => ({ type, payload });
