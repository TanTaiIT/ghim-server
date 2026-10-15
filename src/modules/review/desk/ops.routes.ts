import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { actorOf } from '../../../common/auth/actor.js';
import { paginated } from '../../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import {
  claimResultSchema,
  queueQuerySchema,
  taskDetailSchema,
  taskItemSchema,
  taskParamsSchema,
} from '../review.schema.js';
import type { ReviewService } from '../review.service.js';

export interface ReviewOpsRoutesOptions {
  review: ReviewService;
}

const TAGS = ['Ops · Review'];
const bearer = [{ bearerAuth: [] }];
const PREFIX = '/ops/review';
const errors = { 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse };

/**
 * Bàn xử việc của staff và master (design add-review-queues mục 11). Staff thấy việc của danh mục mình theo chuỗi
 * chuyển tiếp; master thấy mọi việc. Việc ngoài phạm vi trả 404 như việc không tồn tại.
 */
export const reviewOpsRoutes: FastifyPluginAsyncZod<ReviewOpsRoutesOptions> = async (
  app,
  { review },
) => {
  const staff = [app.authenticate, app.requireStaff];

  app.get(`${PREFIX}/tasks`, {
    preHandler: staff,
    schema: {
      tags: TAGS,
      summary:
        'Hàng chờ của tôi: mỗi việc kèm số hàng, lý do, hạn xử, ai đang giữ — master thấy mọi việc, lọc `atMaster`',
      security: bearer,
      querystring: queueQuerySchema,
      response: { 200: ok(paginated(taskItemSchema)), 400: errorResponse, ...errors },
    },
    handler: async (request) => toOk(await review.opsQueue(actorOf(request), request.query)),
  });

  app.get(`${PREFIX}/tasks/:taskId`, {
    preHandler: staff,
    schema: {
      tags: TAGS,
      summary:
        'Bối cảnh người xử: tin, điểm và luật máy đã trúng, tin sạch, ảnh trùng, tài khoản dùng chung thiết bị',
      security: bearer,
      params: taskParamsSchema,
      response: { 200: ok(taskDetailSchema), ...errors },
    },
    handler: async (request) =>
      toOk(await review.task(actorOf(request), request.params.taskId, { kind: 'ops' })),
  });

  app.post(`${PREFIX}/tasks/:taskId/claim`, {
    preHandler: staff,
    schema: {
      tags: TAGS,
      summary: 'Nhận việc — giữ 10 phút; người khác thấy "đang có người xử"',
      security: bearer,
      params: taskParamsSchema,
      response: { 200: ok(claimResultSchema), ...errors },
    },
    handler: async (request) =>
      toOk(await review.claim(actorOf(request), request.params.taskId, { kind: 'ops' })),
  });
};
