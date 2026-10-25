import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { actorOf } from '../../common/auth/actor.js';
import { cursorPaginated } from '../../common/schemas/cursor.js';
import { paginated } from '../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { emptySchema } from '../identity/identity.schema.js';
import {
  conversationParamsSchema,
  conversationSchema,
  messageSchema,
  messagesQuerySchema,
  supportQueueQuerySchema,
  supportReplyBodySchema,
} from './messaging.schema.js';
import type { MessagingRoutesOptions } from './messaging.routes.js';

const TAGS = ['Ops · Support'];
const bearer = [{ bearerAuth: [] }];
const errors = { 401: errorResponse, 403: errorResponse, 404: errorResponse };

/**
 * Bàn vận hành: hàng hội thoại với Hỗ trợ Ghim cho staff mang quyền "hỗ trợ người dùng" (spec messaging/support-chat).
 * Người dùng chỉ thấy "Hỗ trợ Ghim" — mã người viết chỉ hiện ở đây.
 */
export const messagingOpsRoutes: FastifyPluginAsyncZod<MessagingRoutesOptions> = async (
  app,
  { messaging },
) => {
  const support = [app.authenticate, app.requireOps('support')];

  app.get('/ops/support/conversations', {
    preHandler: support,
    schema: {
      tags: TAGS,
      summary: 'Hàng hội thoại hỗ trợ — đang chờ đội trả lời trước, chờ lâu nhất trước',
      security: bearer,
      querystring: supportQueueQuerySchema,
      response: { 200: ok(paginated(conversationSchema)), 400: errorResponse, ...errors },
    },
    handler: async (request) => toOk(await messaging.supportQueue(actorOf(request), request.query)),
  });

  app.get('/ops/support/conversations/:conversationId', {
    preHandler: support,
    schema: {
      tags: TAGS,
      summary: 'Một hội thoại hỗ trợ',
      security: bearer,
      params: conversationParamsSchema,
      response: { 200: ok(conversationSchema), ...errors },
    },
    handler: async (request) =>
      toOk(await messaging.supportConversation(actorOf(request), request.params.conversationId)),
  });

  app.get('/ops/support/conversations/:conversationId/messages', {
    preHandler: support,
    schema: {
      tags: TAGS,
      summary: 'Tin nhắn của hội thoại hỗ trợ, mới trước — kèm staff nào đã viết',
      security: bearer,
      params: conversationParamsSchema,
      querystring: messagesQuerySchema,
      response: { 200: ok(cursorPaginated(messageSchema)), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(
        await messaging.supportMessages(
          actorOf(request),
          request.params.conversationId,
          request.query,
        ),
      ),
  });

  app.post('/ops/support/conversations/:conversationId/messages', {
    preHandler: support,
    schema: {
      tags: TAGS,
      summary:
        'Trả lời dưới tên Hỗ trợ Ghim — không qua bộ lọc cụm từ cấm; không trả lời hội thoại hỗ trợ của chính mình',
      security: bearer,
      params: conversationParamsSchema,
      body: supportReplyBodySchema,
      response: { 201: ok(messageSchema), 400: errorResponse, 409: errorResponse, ...errors },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(
          toOk(
            await messaging.replyAsSupport(
              actorOf(request),
              request.params.conversationId,
              request.body.body,
            ),
          ),
        ),
  });

  app.post('/ops/support/conversations/:conversationId/read', {
    preHandler: support,
    schema: {
      tags: TAGS,
      summary: 'Đánh dấu đã đọc cho cả đội hỗ trợ',
      security: bearer,
      params: conversationParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await messaging.markSupportRead(actorOf(request), request.params.conversationId);
      return reply.status(204).send(null);
    },
  });
};
