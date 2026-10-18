import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { formatMoneyVN } from '../../common/schemas/money.js';
import { MESSAGING_EVENTS } from '../messaging/messaging.outbox.js';
import { empty, type Handler, type MatrixResult, str } from './notification.matrix.js';

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
/**
 * Một dòng nhóm "tin nhắn" gộp theo hội thoại cho người nhận — tin nhắn, đề nghị giá và câu trả lời đề nghị chung một
 * khoá, nên một hội thoại vẫn chỉ một dòng chưa đọc (add-price-offers, design mục 5).
 */
function conversationNotice(
  payload: Record<string, unknown>,
  input: { recipient: string; conversationId: string; messageId: string; type: string },
  senderName: string,
  body: string,
): MatrixResult {
  return {
    ...empty(),
    drafts: [
      {
        recipients: [input.recipient],
        category: 'messages',
        type: input.type,
        title: senderName,
        body,
        data: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          listingId: str(payload, 'listingId'),
        },
        groupId: null,
        alertable: true,
        personal: true,
        collapse: {
          key: `conversation:${input.conversationId}`,
          render: (count) => `${senderName} gửi ${count} tin nhắn mới.`,
          alertEvery: true,
        },
      },
    ],
  };
}

const ANSWER_VERB: Record<string, string> = { accepted: 'chấp nhận', declined: 'từ chối' };

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
    const body = message.offer
      ? `Trả giá ${formatMoneyVN(message.offer.amount)}`
      : preview(message.body);
    return conversationNotice(
      payload,
      { recipient, conversationId, messageId, type: 'messaging.message.received' },
      senderName,
      body,
    );
  },

  /** Người bán trả lời đề nghị giá: người mua được báo kết quả và số tiền, không gì khác (spec notification/inbox). */
  async [MESSAGING_EVENTS.offerAnswered](payload, ctx) {
    const buyer = str(payload, 'buyerId');
    const seller = str(payload, 'sellerId');
    const messageId = str(payload, 'messageId');
    const conversationId = str(payload, 'conversationId');
    const verb = ANSWER_VERB[str(payload, 'status') ?? ''];
    if (!buyer || !seller || !messageId || !conversationId || !verb) return empty();
    const message = await ctx.messagePreview(messageId);
    if (!message?.offer) return empty();
    const sellerName = (await ctx.names([seller])).get(seller) ?? 'Người dùng Ghim';
    return conversationNotice(
      payload,
      { recipient: buyer, conversationId, messageId, type: 'messaging.offer.answered' },
      sellerName,
      `Đã ${verb} giá ${formatMoneyVN(message.offer.amount)}`,
    );
  },
};

export const MESSAGING_NOTICE_EVENTS = Object.keys(MESSAGING_MATRIX) as OutboxEventType[];
