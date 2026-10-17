import { type BlockService, createBlockService } from './block.service.js';
import { type ConversationService, createConversationService } from './conversation.service.js';
import { createInboxService, type InboxService } from './inbox.service.js';
import type { MessagingServiceDeps } from './messaging.shared.js';

export type { MessagingServiceDeps } from './messaging.shared.js';

export type MessagingService = ConversationService & InboxService & BlockService;

/**
 * Nhắn tin (TK 24, design add-messaging): hội thoại gắn với một tin, hai bên là người mua và người đăng; chặn người;
 * báo cáo từ hội thoại đi qua `review`. Chỉ `messaging` ghi hội thoại, tin nhắn, chặn (CLAUDE.md luật 11).
 */
export function createMessagingService(deps: MessagingServiceDeps): MessagingService {
  const inbox = createInboxService(deps);
  return {
    ...inbox.service,
    ...createConversationService(deps, inbox.describe),
    ...createBlockService(deps),
  };
}
