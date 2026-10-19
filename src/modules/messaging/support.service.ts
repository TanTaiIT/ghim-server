import type { Actor } from '../../common/auth/actor.js';
import type { CursorQuery } from '../../common/schemas/cursor.js';
import { toCursorPage } from '../../common/schemas/cursor.js';
import { toPage, toSkipTake } from '../../common/schemas/pagination.js';
import { toMessageDto, viewerOf } from './inbox.service.js';
import type { Conversation } from './messaging.repository.js';
import type { ConversationDto, MessageDto, SupportQueueQuery } from './messaging.schema.js';
import { conversationNotFound, type MessagingServiceDeps } from './messaging.shared.js';

export interface SupportDeskService {
  /** Hàng hỗ trợ (spec messaging/support-chat): đang chờ đội trả lời trước, chờ lâu nhất trước. */
  supportQueue(
    actor: Actor,
    query: SupportQueueQuery,
  ): Promise<{
    items: ConversationDto[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>;
  supportConversation(actor: Actor, conversationId: string): Promise<ConversationDto>;
  /** Staff thấy ai trong đội viết từng tin — người dùng thì không (spec support-chat). */
  supportMessages(
    actor: Actor,
    conversationId: string,
    query: CursorQuery,
  ): Promise<{ items: MessageDto[]; nextCursor: string | null }>;
  /** Đã đọc chung của đội: một staff đọc là cả đội đã đọc (spec conversations). */
  markSupportRead(actor: Actor, conversationId: string): Promise<void>;
}

/**
 * Bàn vận hành hỗ trợ (design add-team-conversations mục 6): quyền `support` do route kiểm; staff đứng ở phía đội của mọi
 * hội thoại hỗ trợ, kể cả của chính mình — chỉ lượt trả lời bị chặn (cam kết 1, `replyAsSupport`).
 */
export function createSupportDeskService(
  deps: MessagingServiceDeps,
  describe: (
    rows: Conversation[],
    viewerId: string,
    options?: { asTeam?: boolean },
  ) => Promise<ConversationDto[]>,
): SupportDeskService {
  const { repository, clock } = deps;

  const support = async (conversationId: string): Promise<Conversation> => {
    const row = await repository.find(conversationId);
    if (!row || row.kind !== 'support') throw conversationNotFound();
    return row;
  };

  return {
    async supportQueue(actor, query) {
      const { items, total } = await repository.supportQueue({
        pendingOnly: query.status === 'pending',
        ...toSkipTake(query),
      });
      return toPage(await describe(items, actor.accountId, { asTeam: true }), total, query);
    },

    async supportConversation(actor, conversationId) {
      const [dto] = await describe([await support(conversationId)], actor.accountId, {
        asTeam: true,
      });
      if (!dto) throw conversationNotFound();
      return dto;
    },

    async supportMessages(actor, conversationId, query) {
      const row = await support(conversationId);
      const rows = await repository.messages(conversationId, query.cursor, query.limit + 1);
      const page = toCursorPage(rows, query.limit, (message) => ({
        at: message.createdAt,
        id: message.id,
      }));
      const viewer = viewerOf(row, actor.accountId, 'seller');
      return {
        items: page.items.map((message) => toMessageDto(message, viewer)),
        nextCursor: page.nextCursor,
      };
    },

    async markSupportRead(_actor, conversationId) {
      await support(conversationId);
      await repository.markRead(conversationId, 'seller', clock());
    },
  };
}
