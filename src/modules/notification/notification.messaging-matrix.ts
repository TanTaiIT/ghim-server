import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { MESSAGING_EVENTS } from '../messaging/messaging.outbox.js';
import { empty, type Handler, str } from './notification.matrix.js';

/** Câu nhắc chỉ chứa đầu tin nhắn — màn hình khoá ai cũng đọc được (TK 24). */
const PREVIEW_LENGTH = 100;
const preview = (body: string): string => {
  const line = body.replace(/\s+/g, ' ').trim();
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH - 1)}…` : line;
};

/**
 * N47 — tin nhắn mới cho bên nhận (TK 24, add-notifications): một dòng chưa đọc mỗi hội thoại (gộp theo hội thoại) nhưng
 * nhắc mỗi tin; người gửi không có trong người nhận. Nội dung tin nhắn đọc qua cổng của `messaging` (TK 30). Tin bị chặn
 * hay bị cụm cấm không có sự kiện nên không có thông báo.
 */
export const MESSAGING_MATRIX: Record<string, Handler> = {
  async [MESSAGING_EVENTS.messageSent](payload, ctx) {
    const recipient = str(payload, 'recipientId');
    const messageId = str(payload, 'messageId');
    const conversationId = str(payload, 'conversationId');
    if (!recipient || !messageId || !conversationId) return empty();
    const message = await ctx.messagePreview(messageId);
    if (!message) return empty();
    const senderName =
      (await ctx.names([message.senderId])).get(message.senderId) ?? 'Người dùng Ghim';
    return {
      ...empty(),
      drafts: [
        {
          recipients: [recipient],
          category: 'messages',
          type: 'messaging.message.received',
          title: senderName,
          body: preview(message.body),
          data: { conversationId, messageId, listingId: str(payload, 'listingId') },
          groupId: null,
          alertable: true,
          personal: true,
          collapse: {
            key: `conversation:${conversationId}`,
            render: (count) => `${senderName} gửi ${count} tin nhắn mới.`,
            alertEvery: true,
          },
        },
      ],
    };
  },
};

export const MESSAGING_NOTICE_EVENTS = Object.keys(MESSAGING_MATRIX) as OutboxEventType[];
