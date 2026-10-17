import type { Actor } from '../../common/auth/actor.js';
import { BadRequestError, NotFoundError } from '../../common/errors/app-error.js';
import { type PaginationQuery, toPage, toSkipTake } from '../../common/schemas/pagination.js';
import type { MyReportDto } from '../review/report/report.schema.js';
import type { BlockedDto, ConversationReportBody } from './messaging.schema.js';
import {
  conversationNotFound,
  type MessagingServiceDeps,
  otherOf,
  sideOf,
} from './messaging.shared.js';

export interface BlockService {
  /** Lặp lại vô hại; chặn mình → 400; không có tài khoản hay đã xoá → 404. Không ai được báo (spec blocking). */
  block(actor: Actor, accountId: string): Promise<void>;
  unblock(actor: Actor, accountId: string): Promise<void>;
  blocks(
    actor: Actor,
    query: PaginationQuery,
  ): Promise<{
    items: BlockedDto[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>;
  /** Báo cáo bên kia ngay từ hội thoại: `review` ghi, lượt báo mang mã hội thoại làm bằng chứng (spec review/reports). */
  report(
    actor: Actor,
    conversationId: string,
    body: ConversationReportBody,
    deviceId: string | null,
  ): Promise<{ created: boolean; report: MyReportDto }>;
}

export function createBlockService(deps: MessagingServiceDeps): BlockService {
  const { repository, identity, review, clock } = deps;

  return {
    async block(actor, accountId) {
      if (accountId === actor.accountId) {
        throw new BadRequestError('Không chặn chính mình', 'VALIDATION_ERROR');
      }
      const summary = (await identity.accountSummaries([accountId])).get(accountId);
      if (!summary || summary.status === 'deleted') {
        throw new NotFoundError('Không có người dùng này');
      }
      await repository.block(actor.accountId, accountId, clock());
    },

    unblock: (actor, accountId) => repository.unblock(actor.accountId, accountId),

    async blocks(actor, query) {
      const { items, total } = await repository.blocks(actor.accountId, toSkipTake(query));
      const summaries = await identity.accountSummaries(items.map((row) => row.blockedId));
      return toPage(
        items.map((row) => {
          const summary = summaries.get(row.blockedId);
          return {
            accountId: row.blockedId,
            displayName: summary && summary.status !== 'deleted' ? summary.displayName : null,
            blockedAt: row.createdAt.toISOString(),
          };
        }),
        total,
        query,
      );
    },

    async report(actor, conversationId, body, deviceId) {
      const row = await repository.find(conversationId);
      const side = row ? sideOf(row, actor.accountId) : null;
      if (!row || !side) throw conversationNotFound();
      return review.submitReport(
        actor,
        { subject: { kind: 'account', accountId: otherOf(row, side) }, category: body.category },
        deviceId,
        { conversationId: row.id },
      );
    },
  };
}
