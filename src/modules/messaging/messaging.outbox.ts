import type {
  OutboxEventInput,
  OutboxEventType,
  OutboxPayload,
} from '../../common/outbox/outbox.js';

/**
 * Sự kiện `messaging` phát vào outbox, cùng transaction với dòng ghi (design add-messaging mục 2, 3). Không mang nội dung
 * tin nhắn: bên nghe (realtime, rồi `add-notifications`) đọc lại qua cổng khi cần.
 */
export const MESSAGING_EVENTS = {
  conversationOpened: 'messaging.conversation.opened',
  messageSent: 'messaging.message.sent',
  /** Người bán trả lời đề nghị giá (add-price-offers); đề nghị mới đi đường `messageSent` như tin chữ. */
  offerAnswered: 'messaging.offer.answered',
} as const satisfies Record<string, OutboxEventType>;

export const messagingEvent = (
  type: (typeof MESSAGING_EVENTS)[keyof typeof MESSAGING_EVENTS],
  payload: OutboxPayload,
): OutboxEventInput => ({ type, payload });
