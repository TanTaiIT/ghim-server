import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../../common/auth/actor.js';
import { paginated } from '../../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import {
  claimResultSchema,
  createTemplateBodySchema,
  decisionBodySchema,
  decisionResultSchema,
  directRemoveBodySchema,
  listingParamsSchema,
  queueQuerySchema,
  reasonTemplateSchema,
  taskDetailSchema,
  taskItemSchema,
  taskParamsSchema,
  templateParamsSchema,
  updateTemplateBodySchema,
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
  const master = [app.authenticate, app.requireMaster];

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
      response: { 200: ok(claimResultSchema), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(await review.claim(actorOf(request), request.params.taskId, { kind: 'ops' })),
  });

  app.post(`${PREFIX}/tasks/:taskId/decision`, {
    preHandler: staff,
    schema: {
      tags: TAGS,
      summary:
        'Quyết định việc đang nhận: đạt (kèm nhận định máy với việc máy giữ), sai sót (kèm lý do mẫu), bác việc nhóm chuyển lên',
      security: bearer,
      params: taskParamsSchema,
      body: decisionBodySchema,
      response: { 200: ok(decisionResultSchema), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(
        await review.decide(actorOf(request), request.params.taskId, { kind: 'ops' }, request.body),
      ),
  });

  app.post(`${PREFIX}/listings/:listingId/remove`, {
    preHandler: staff,
    schema: {
      tags: TAGS,
      summary: 'Gỡ thẳng một tin sàn đang hiện không có việc mở — sai sót, kèm lý do mẫu',
      security: bearer,
      params: listingParamsSchema,
      body: directRemoveBodySchema,
      response: { 200: ok(decisionResultSchema), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(await review.removeDirectly(actorOf(request), request.params.listingId, request.body)),
  });

  app.post(`${PREFIX}/listings/:listingId/restore`, {
    preHandler: staff,
    schema: {
      tags: TAGS,
      summary: 'Khôi phục tin sàn đã bị gỡ — ngày hiển thị chạy tiếp từ chỗ đã dừng',
      security: bearer,
      params: listingParamsSchema,
      response: { 200: ok(decisionResultSchema), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(await review.restore(actorOf(request), request.params.listingId)),
  });

  app.get(`${PREFIX}/reason-templates`, {
    preHandler: staff,
    schema: {
      tags: TAGS,
      summary: 'Lý do mẫu cho "sai sót" — master thấy cả lý do đã tắt',
      security: bearer,
      response: { 200: ok(z.array(reasonTemplateSchema)), 401: errorResponse, 403: errorResponse },
    },
    handler: async (request) =>
      toOk(await review.reasonTemplates({ includeInactive: actorOf(request).role === 'master' })),
  });

  app.post(`${PREFIX}/reason-templates`, {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Thêm lý do mẫu (master)',
      security: bearer,
      body: createTemplateBodySchema,
      response: { 201: ok(reasonTemplateSchema), 400: errorResponse, ...errors },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(toOk(await review.createReasonTemplate(actorOf(request), request.body))),
  });

  app.patch(`${PREFIX}/reason-templates/:templateId`, {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Sửa câu, thứ tự, hay tắt / bật một lý do mẫu (master)',
      security: bearer,
      params: templateParamsSchema,
      body: updateTemplateBodySchema,
      response: { 200: ok(reasonTemplateSchema), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(
        await review.updateReasonTemplate(
          actorOf(request),
          request.params.templateId,
          request.body,
        ),
      ),
  });
};
