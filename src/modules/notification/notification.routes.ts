import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../common/auth/actor.js';
import { paginated, toPage, toSkipTake } from '../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { emptySchema } from '../identity/identity.schema.js';
import {
  categoryParamsSchema,
  groupParamsSchema,
  inboxQuerySchema,
  markReadBodySchema,
  notificationSchema,
  preferenceBodySchema,
  preferencesSchema,
  unreadCountSchema,
} from './notification.schema.js';
import type { NotificationService } from './notification.service.js';

export interface NotificationRoutesOptions {
  notification: NotificationService;
}

const TAGS = ['Notifications'];
const bearer = [{ bearerAuth: [] }];
const errors = { 400: errorResponse, 401: errorResponse, 404: errorResponse, 409: errorResponse };

/** Hộp thư, số chưa đọc, bật tắt nhóm thông báo, tắt tiếng từng nhóm (TK 24). Realtime ở `/realtime`. */
export const notificationRoutes: FastifyPluginAsyncZod<NotificationRoutesOptions> = async (
  app,
  { notification },
) => {
  const user = [app.authenticate];

  app.get('/me/notifications', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Hộp thư — mới nhất trước (thông báo gộp nổi lên khi được cập nhật)',
      security: bearer,
      querystring: inboxQuerySchema,
      response: { 200: ok(paginated(notificationSchema)), ...errors },
    },
    handler: async (request) => {
      const { items, total } = await notification.inbox(
        actorOf(request),
        toSkipTake(request.query),
      );
      return toOk(toPage(items, total, request.query));
    },
  });

  app.get('/me/notifications/unread-count', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Số thông báo chưa đọc',
      security: bearer,
      response: { 200: ok(unreadCountSchema), 401: errorResponse },
    },
    handler: async (request) => toOk({ count: await notification.unreadCount(actorOf(request)) }),
  });

  app.post('/me/notifications/read', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Đánh dấu đã đọc theo mã, hoặc tất cả',
      security: bearer,
      body: markReadBodySchema,
      response: { 200: ok(z.object({ marked: z.number().int() })), ...errors },
    },
    handler: async (request) =>
      toOk({ marked: await notification.markRead(actorOf(request), request.body) }),
  });

  app.get('/me/notification-preferences', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Bật / tắt của chín nhóm thông báo và các nhóm đang tắt tiếng',
      security: bearer,
      response: { 200: ok(preferencesSchema), 401: errorResponse },
    },
    handler: async (request) => toOk(await notification.preferences(actorOf(request))),
  });

  app.put('/me/notification-preferences/:category', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Bật hoặc tắt nhắc của một nhóm thông báo — nhóm "tài khoản" luôn bật',
      security: bearer,
      params: categoryParamsSchema,
      body: preferenceBodySchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await notification.setPreference(
        actorOf(request),
        request.params.category,
        request.body.enabled,
      );
      return reply.status(204).send(null);
    },
  });

  app.put('/me/group-mutes/:groupId', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Tắt tiếng một nhóm — thông báo vẫn vào hộp thư, không nhắc',
      security: bearer,
      params: groupParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await notification.setGroupMute(actorOf(request), request.params.groupId, true);
      return reply.status(204).send(null);
    },
  });

  app.delete('/me/group-mutes/:groupId', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Bật lại tiếng một nhóm',
      security: bearer,
      params: groupParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await notification.setGroupMute(actorOf(request), request.params.groupId, false);
      return reply.status(204).send(null);
    },
  });
};
