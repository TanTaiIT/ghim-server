import { sequentially } from '../utils/sequential.js';

/**
 * Đẩy thông báo lên điện thoại qua Expo Push Service bằng HTTP thuần (design add-notification-core mục 3, chốt
 * 17/10/2026): không package, lô 100 tin một lượt, biên nhận đọc sau. Token không bao giờ vào log.
 */
export interface PushMessage {
  /** `ExponentPushToken[…]` của một phiên. */
  to: string;
  title: string;
  body: string;
  data: Record<string, string | null>;
}

export type PushTicket =
  { to: string; status: 'ok'; id: string } | { to: string; status: 'error'; error: string };

export type PushReceipt = { status: 'ok' } | { status: 'error'; error: string };

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  receipts(ticketIds: string[]): Promise<Map<string, PushReceipt>>;
}

/** Máy đã gỡ app hay tắt thông báo — token này không còn dùng được, quên đi (Expo). */
export const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

/** Expo nhận tối đa ngần này tin một lượt gửi, và ngần này mã một lượt đọc biên nhận. */
const BATCH = 100;

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

const chunk = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) =>
    items.slice(i * BATCH, (i + 1) * BATCH),
  );

const errorOf = (ticket: Extract<ExpoTicket, { status: 'error' }>): string =>
  ticket.details?.error ?? ticket.message ?? 'unknown';

export function createExpoPush(input: {
  url: string;
  accessToken: string | null;
  fetch?: typeof fetch;
}): PushSender {
  const receiptsUrl = input.url.replace(/\/send$/, '/getReceipts');
  const call = input.fetch ?? fetch;
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(input.accessToken ? { authorization: `Bearer ${input.accessToken}` } : {}),
  };

  const post = async <T>(to: string, body: unknown): Promise<T> => {
    const response = await call(to, { method: 'POST', headers, body: JSON.stringify(body) });
    // Thân lỗi của Expo có thể chứa token — chỉ nêu mã HTTP.
    if (!response.ok) throw new Error(`Expo push trả ${response.status}`);
    return (await response.json()) as T;
  };

  return {
    async send(messages) {
      const tickets: PushTicket[] = [];
      // Từng lô một: Expo giới hạn tốc độ theo dự án, dồn song song chỉ đổi lấy 429.
      await sequentially(chunk(messages), async (batch) => {
        const { data } = await post<{ data: ExpoTicket[] }>(
          input.url,
          batch.map((message) => ({ ...message, sound: 'default' })),
        );
        batch.forEach((message, index) => {
          const ticket = data[index];
          if (!ticket) tickets.push({ to: message.to, status: 'error', error: 'missing' });
          else if (ticket.status === 'ok')
            tickets.push({ to: message.to, status: 'ok', id: ticket.id });
          else tickets.push({ to: message.to, status: 'error', error: errorOf(ticket) });
        });
      });
      return tickets;
    },

    async receipts(ticketIds) {
      const found = new Map<string, PushReceipt>();
      await sequentially(chunk(ticketIds), async (batch) => {
        const { data } = await post<{ data: Record<string, ExpoTicket> }>(receiptsUrl, {
          ids: batch,
        });
        for (const [id, receipt] of Object.entries(data)) {
          found.set(
            id,
            receipt.status === 'ok'
              ? { status: 'ok' }
              : { status: 'error', error: errorOf(receipt) },
          );
        }
      });
      return found;
    },
  };
}

/** Cho test HTTP không bàn về push và cho CLI: không gửi đi đâu, không ticket nào. */
export const noopPush: PushSender = {
  send: (messages) =>
    Promise.resolve(
      messages.map((message) => ({ to: message.to, status: 'error' as const, error: 'noop' })),
    ),
  receipts: () => Promise.resolve(new Map()),
};
