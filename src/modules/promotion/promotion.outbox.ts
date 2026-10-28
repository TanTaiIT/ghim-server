import type { OutboxEventInput, OutboxPayload } from '../../common/outbox/outbox.js';
import type { PROMOTION_EVENTS } from './promotion.schema.js';

export { PROMOTION_EVENTS } from './promotion.schema.js';

type PromotionEventType = (typeof PROMOTION_EVENTS)[keyof typeof PROMOTION_EVENTS];

export const promotionEvent = (
  type: PromotionEventType,
  payload: OutboxPayload,
): OutboxEventInput => ({
  type,
  payload,
});
