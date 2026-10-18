import { z } from 'zod';

import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import { MESSAGING_EVENTS } from './messaging.outbox.js';
import type { MessagingService } from './messaging.service.js';

const account = z.object({ accountId: z.string() });
const messageSent = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  recipientId: z.string(),
});
const offerAnswered = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  buyerId: z.string(),
});

/** Payload sai là lỗi của bên phát: ném để sự kiện nằm lại outbox, không âm thầm bỏ qua. */
function parse<T>(schema: z.ZodType<T>, type: string, payload: Record<string, unknown>): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(`${type}: payload sai — ${z.prettifyError(result.error)}`);
  return result.data;
}

/**
 * Bên nghe của `messaging`: xoá tài khoản ẩn hội thoại phía người xoá (TK 7); tin nhắn vừa ghi thì báo hiệu realtime
 * cho người nhận sau commit — nhận trùng chỉ là một tín hiệu thừa, app vẫn đọc qua HTTP.
 */
export function registerMessagingListeners(
  dispatcher: OutboxDispatcher,
  messaging: MessagingService,
): void {
  dispatcher.register('identity.account.deleted', async (payload) => {
    await messaging.onAccountDeleted(parse(account, 'identity.account.deleted', payload).accountId);
  });
  dispatcher.register(MESSAGING_EVENTS.messageSent, (payload) => {
    messaging.signalMessage(parse(messageSent, MESSAGING_EVENTS.messageSent, payload));
    return Promise.resolve();
  });
  dispatcher.register(MESSAGING_EVENTS.offerAnswered, (payload) => {
    messaging.signalMessageUpdated(parse(offerAnswered, MESSAGING_EVENTS.offerAnswered, payload));
    return Promise.resolve();
  });
}
