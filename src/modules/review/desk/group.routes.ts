import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../../common/auth/actor.js';
import { paginated, paginationQuerySchema } from '../../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import {
  claimResultSchema,
  decisionBodySchema,
  decisionResultSchema,
  groupParamsSchema,
  groupTaskParamsSchema,
  reasonTemplateSchema,
  taskDetailSchema,
  taskItemSchema,
} from '../review.schema.js';
import type { ReviewService } from '../review.service.js';

export interface ReviewGroupRoutesOptions {
  review: ReviewService;
}

const TAGS = ['Groups · Review'];
const bearer = [{ bearerAuth: [] }];
const errors = { 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse };

/**
 * Điều hành viên, chủ nhóm xử việc của nhóm trên app (TK 16): chỉ việc đang ở bậc của nhóm và mình xử được — điều
 * hành đơn vị trước, điều hành cả nhóm và chủ nhóm khi đơn vị không còn ai (chốt 15/10/2026).
 */
export const reviewGroupRoutes: FastifyPluginAsyncZod<ReviewGroupRoutesOptions> = async (
  app,
  { review },
) => {
  const user = [app.authenticate, app.requireVerifiedEmail];

  app.get('/groups/:groupId/review/tasks', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Hàng chờ của nhóm mà tôi xử được',
      security: bearer,
      params: groupParamsSchema,
      querystring: paginationQuerySchema,
      response: { 200: ok(paginated(taskItemSchema)), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(await review.groupQueue(actorOf(request), request.params.groupId, request.query)),
  });

  app.get('/groups/:groupId/review/tasks/:taskId', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Bối cảnh việc của nhóm',
      security: bearer,
      params: groupTaskParamsSchema,
      response: { 200: ok(taskDetailSchema), ...errors },
    },
    handler: async (request) =>
      toOk(
        await review.task(actorOf(request), request.params.taskId, {
          kind: 'group',
          groupId: request.params.groupId,
        }),
      ),
  });

  app.post('/groups/:groupId/review/tasks/:taskId/claim', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Nhận việc của nhóm — giữ 10 phút',
      security: bearer,
      params: groupTaskParamsSchema,
      response: { 200: ok(claimResultSchema), ...errors },
    },
    handler: async (request) =>
      toOk(
        await review.claim(actorOf(request), request.params.taskId, {
          kind: 'group',
          groupId: request.params.groupId,
        }),
      ),
  });

  app.post('/groups/:groupId/review/tasks/:taskId/decision', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary:
        'Quyết định việc của nhóm: đạt, sai sót (kèm lý do mẫu), gỡ khỏi nhóm — kèm "trái quy định sàn" thì chuyển lên staff',
      security: bearer,
      params: groupTaskParamsSchema,
      body: decisionBodySchema,
      response: { 200: ok(decisionResultSchema), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(
        await review.decide(
          actorOf(request),
          request.params.taskId,
          { kind: 'group', groupId: request.params.groupId },
          request.body,
        ),
      ),
  });

  app.get('/groups/:groupId/review/reason-templates', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Lý do mẫu đang dùng cho "sai sót"',
      security: bearer,
      params: groupParamsSchema,
      response: { 200: ok(z.array(reasonTemplateSchema)), 401: errorResponse, 403: errorResponse },
    },
    handler: async () => toOk(await review.reasonTemplates({ includeInactive: false })),
  });
};
