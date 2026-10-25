import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../common/auth/actor.js';
import { cursorPaginated } from '../../common/schemas/cursor.js';
import { paginated } from '../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { emptySchema } from '../identity/identity.schema.js';
import { myReportSchema } from '../review/report/report.schema.js';
import {
  blockBodySchema,
  blockedSchema,
  blockParamsSchema,
  blocksQuerySchema,
  conversationParamsSchema,
  conversationReportBodySchema,
  conversationSchema,
  conversationsQuerySchema,
  groupParamsSchema,
  listingParamsSchema,
  messageBodySchema,
  messageSchema,
  messagesQuerySchema,
  OFFER_DECISIONS,
  type OfferDecision,
  offerBodySchema,
  offerParamsSchema,
} from './messaging.schema.js';
import type { MessagingService } from './messaging.service.js';

export interface MessagingRoutesOptions {
  messaging: MessagingService;
}

const TAGS = ['Messaging'];
const bearer = [{ bearerAuth: [] }];
const errors = { 401: errorResponse, 403: errorResponse, 404: errorResponse };
/** Mã máy của app: tuỳ chọn, như `/reports` — chỉ dùng cho ngưỡng tạm ẩn của báo cáo. */
const deviceHeaders = z.object({ 'x-device-id': z.string().trim().max(200).optional() });

const DECISION_PATH: Record<OfferDecision, string> = { accepted: 'accept', declined: 'decline' };
const DECISION_SUMMARY: Record<OfferDecision, string> = {
  accepted:
    'Người bán chấp nhận đề nghị giá đang chờ — chỉ ghi nhận, tin không đổi trạng thái hay giá',
  declined: 'Người bán từ chối đề nghị giá đang chờ',
};

/**
 * App Ghim: hội thoại từ một tin, với Hỗ trợ Ghim, với quản trị một nhóm; tin nhắn, chặn người, báo cáo từ hội thoại
 * (TK 24). Bàn vận hành hỗ trợ ở `messaging.ops.routes.ts`.
 */
export const messagingRoutes: FastifyPluginAsyncZod<MessagingRoutesOptions> = async (
  app,
  { messaging },
) => {
  const user = [app.authenticate];
  const verified = [app.authenticate, app.requireVerifiedEmail];

  app.post('/listings/:listingId/conversation', {
    preHandler: verified,
    schema: {
      tags: TAGS,
      summary:
        'Mở hội thoại với một tin đang hiển thị — 201 hội thoại mới; 200 khi đã có hội thoại với tin này',
      security: bearer,
      params: listingParamsSchema,
      response: {
        200: ok(conversationSchema),
        201: ok(conversationSchema),
        409: errorResponse,
        429: errorResponse,
        ...errors,
      },
    },
    handler: async (request, reply) => {
      const { created, conversation } = await messaging.open(
        actorOf(request),
        request.params.listingId,
      );
      return reply.status(created ? 201 : 200).send(toOk(conversation));
    },
  });

  const opened = { 200: ok(conversationSchema), 201: ok(conversationSchema) };

  app.post('/me/support/conversation', {
    preHandler: verified,
    schema: {
      tags: TAGS,
      summary:
        'Mở hội thoại với Hỗ trợ Ghim — 201 lần đầu; 200 hội thoại cũ (kể cả đã xoá phía mình), mỗi người một hội thoại',
      security: bearer,
      response: { ...opened, ...errors },
    },
    handler: async (request, reply) => {
      const { created, conversation } = await messaging.openSupport(actorOf(request));
      return reply.status(created ? 201 : 200).send(toOk(conversation));
    },
  });

  app.post('/groups/:groupId/conversation', {
    preHandler: verified,
    schema: {
      tags: TAGS,
      summary:
        'Mở hội thoại với quản trị một nhóm — chủ nhóm và điều hành viên cùng thấy, trả lời dưới tên nhóm; 201 mới, 200 đã có',
      security: bearer,
      params: groupParamsSchema,
      response: { ...opened, 409: errorResponse, ...errors },
    },
    handler: async (request, reply) => {
      const { created, conversation } = await messaging.openGroup(
        actorOf(request),
        request.params.groupId,
      );
      return reply.status(created ? 201 : 200).send(toOk(conversation));
    },
  });

  app.get('/me/conversations', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Hội thoại của tôi, hoạt động gần nhất trước — không có hội thoại đã xoá phía mình',
      security: bearer,
      querystring: conversationsQuerySchema,
      response: {
        200: ok(cursorPaginated(conversationSchema)),
        400: errorResponse,
        401: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await messaging.conversations(actorOf(request), request.query)),
  });

  app.get('/me/conversations/:conversationId', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Một hội thoại của tôi; người ngoài nhận 404 như không có',
      security: bearer,
      params: conversationParamsSchema,
      response: { 200: ok(conversationSchema), ...errors },
    },
    handler: async (request) =>
      toOk(await messaging.conversation(actorOf(request), request.params.conversationId)),
  });

  app.get('/me/conversations/:conversationId/messages', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Tin nhắn của hội thoại, mới trước; con trỏ đi về quá khứ',
      security: bearer,
      params: conversationParamsSchema,
      querystring: messagesQuerySchema,
      response: { 200: ok(cursorPaginated(messageSchema)), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(
        await messaging.messages(actorOf(request), request.params.conversationId, request.query),
      ),
  });

  app.post('/me/conversations/:conversationId/messages', {
    preHandler: verified,
    schema: {
      tags: TAGS,
      summary:
        'Gửi tin nhắn — chữ, tối đa 4 ảnh, hay cả hai; chữ qua bộ lọc cụm từ cấm, ảnh qua luật chất lượng của ảnh tin; bị chặn hay bên kia đã rời thì không gửi được',
      security: bearer,
      params: conversationParamsSchema,
      body: messageBodySchema,
      response: { 201: ok(messageSchema), 400: errorResponse, 409: errorResponse, ...errors },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(
          toOk(await messaging.send(actorOf(request), request.params.conversationId, request.body)),
        ),
  });

  app.post('/me/conversations/:conversationId/offers', {
    preHandler: verified,
    schema: {
      tags: TAGS,
      summary:
        'Người mua trả giá — từ 1 đồng tới giá đăng; tin đang hiển thị và cho thương lượng; giá mới thay giá đang chờ',
      security: bearer,
      params: conversationParamsSchema,
      body: offerBodySchema,
      response: { 201: ok(messageSchema), 400: errorResponse, 409: errorResponse, ...errors },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(
          toOk(
            await messaging.offer(
              actorOf(request),
              request.params.conversationId,
              request.body.amount,
            ),
          ),
        ),
  });

  for (const decision of OFFER_DECISIONS) {
    app.post(`/me/conversations/:conversationId/offers/:messageId/${DECISION_PATH[decision]}`, {
      preHandler: verified,
      schema: {
        tags: TAGS,
        summary: DECISION_SUMMARY[decision],
        security: bearer,
        params: offerParamsSchema,
        response: { 200: ok(messageSchema), 409: errorResponse, ...errors },
      },
      handler: async (request) =>
        toOk(
          await messaging.answerOffer(
            actorOf(request),
            request.params.conversationId,
            request.params.messageId,
            decision,
          ),
        ),
    });
  }

  app.post('/me/conversations/:conversationId/read', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Đánh dấu đã đọc tới giờ',
      security: bearer,
      params: conversationParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await messaging.markRead(actorOf(request), request.params.conversationId);
      return reply.status(204).send(null);
    },
  });

  app.delete('/me/conversations/:conversationId', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Xoá hội thoại khỏi danh sách của tôi — bên kia vẫn thấy đủ',
      security: bearer,
      params: conversationParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await messaging.remove(actorOf(request), request.params.conversationId);
      return reply.status(204).send(null);
    },
  });

  app.post('/me/conversations/:conversationId/reports', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary:
        'Báo cáo bên kia ngay từ hội thoại về tin — 201 lượt báo mới; 200 khi đã báo người này trong báo cáo đang mở; hội thoại với một đội: 409',
      security: bearer,
      params: conversationParamsSchema,
      headers: deviceHeaders,
      body: conversationReportBodySchema,
      response: {
        200: ok(myReportSchema),
        201: ok(myReportSchema),
        400: errorResponse,
        409: errorResponse,
        429: errorResponse,
        ...errors,
      },
    },
    handler: async (request, reply) => {
      const { created, report } = await messaging.report(
        actorOf(request),
        request.params.conversationId,
        request.body,
        request.headers['x-device-id'] || null,
      );
      return reply.status(created ? 201 : 200).send(toOk(report));
    },
  });

  app.put('/me/conversations/:conversationId/viewing', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary:
        'Máy này đang mở hội thoại: tin nhắn của nó không đẩy lên máy này trong 10 phút — gọi lại khi còn mở',
      security: bearer,
      params: conversationParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await messaging.setViewing(actorOf(request), request.params.conversationId);
      return reply.status(204).send(null);
    },
  });

  app.delete('/me/conversations/:conversationId/viewing', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Đã đóng hội thoại trên máy này',
      security: bearer,
      params: conversationParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await messaging.clearViewing(actorOf(request), request.params.conversationId);
      return reply.status(204).send(null);
    },
  });

  app.post('/me/blocks', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary:
        'Chặn một người: không hội thoại mới, hội thoại cũ ngừng nhận tin — không ai được báo',
      security: bearer,
      body: blockBodySchema,
      response: { 204: emptySchema, 400: errorResponse, ...errors },
    },
    handler: async (request, reply) => {
      await messaging.block(actorOf(request), request.body.accountId);
      return reply.status(204).send(null);
    },
  });

  app.delete('/me/blocks/:accountId', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Gỡ chặn',
      security: bearer,
      params: blockParamsSchema,
      response: { 204: emptySchema, 401: errorResponse },
    },
    handler: async (request, reply) => {
      await messaging.unblock(actorOf(request), request.params.accountId);
      return reply.status(204).send(null);
    },
  });

  app.get('/me/blocks', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Người tôi đã chặn',
      security: bearer,
      querystring: blocksQuerySchema,
      response: { 200: ok(paginated(blockedSchema)), 400: errorResponse, 401: errorResponse },
    },
    handler: async (request) => toOk(await messaging.blocks(actorOf(request), request.query)),
  });
};
