import type { PushMessage, PushSender, PushTicket } from '../../src/common/push/expo-push.js';
import { DEVICE_NOT_REGISTERED } from '../../src/common/push/expo-push.js';

export interface FakePush extends PushSender {
  /** Mọi tin đã "đẩy" theo thứ tự, kèm mã ticket đã cấp. */
  readonly sent: (PushMessage & { ticketId: string })[];
  /** Token mà Expo sẽ báo `DeviceNotRegistered` ngay lúc gửi. */
  readonly rejected: Set<string>;
  /** Biên nhận lỗi theo mã ticket — ticket không có ở đây là biên nhận ok. */
  readonly receiptErrors: Map<string, string>;
}

/** Bản giả của Expo Push Service trong bộ nhớ: không mạng; test tự quyết máy nào đã gỡ app. */
export function createFakePush(): FakePush {
  const sent: (PushMessage & { ticketId: string })[] = [];
  const rejected = new Set<string>();
  const receiptErrors = new Map<string, string>();
  let seq = 0;
  return {
    sent,
    rejected,
    receiptErrors,
    send: (messages) =>
      Promise.resolve(
        messages.map((message): PushTicket => {
          if (rejected.has(message.to)) {
            return { to: message.to, status: 'error', error: DEVICE_NOT_REGISTERED };
          }
          seq += 1;
          const ticketId = `ticket-${seq}`;
          sent.push({ ...message, ticketId });
          return { to: message.to, status: 'ok', id: ticketId };
        }),
      ),
    receipts: (ids) =>
      Promise.resolve(
        new Map(
          ids.map((id) => {
            const error = receiptErrors.get(id);
            return [id, error ? { status: 'error' as const, error } : { status: 'ok' as const }];
          }),
        ),
      ),
  };
}
