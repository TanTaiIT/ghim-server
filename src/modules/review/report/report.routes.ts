import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../../common/auth/actor.js';
import { paginated, paginationQuerySchema } from '../../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import type { ReviewService } from '../review.service.js';
import { myReportSchema, reportBodySchema } from './report.schema.js';

export interface ReportRoutesOptions {
  review: ReviewService;
}

const TAGS = ['Reports'];
const bearer = [{ bearerAuth: [] }];

/** Mã máy của app: tuỳ chọn — lượt báo không có thì vẫn vào hàng, chỉ không tính ngưỡng tạm ẩn (chốt 16/10/2026). */
const deviceHeaders = z.object({ 'x-device-id': z.string().trim().max(200).optional() });

/** Người dùng báo cáo một tin hay một người, và xem các báo cáo mình đã gửi (TK 23). */
export const reportRoutes: FastifyPluginAsyncZod<ReportRoutesOptions> = async (app, { review }) => {
  const user = [app.authenticate];

  app.post('/reports', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary:
        'Báo cáo một tin hay một người — 201 lượt báo mới; 200 khi mình đã báo đối tượng này trong báo cáo đang mở',
      security: bearer,
      headers: deviceHeaders,
      body: reportBodySchema,
      response: {
        200: ok(myReportSchema),
        201: ok(myReportSchema),
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        429: errorResponse,
      },
    },
    handler: async (request, reply) => {
      const { created, report } = await review.submitReport(
        actorOf(request),
        request.body,
        request.headers['x-device-id'] || null,
      );
      return reply.status(created ? 201 : 200).send(toOk(report));
    },
  });

  app.get('/me/reports', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Báo cáo tôi đã gửi: loại, trạng thái, kết quả — không có ai khác đã báo',
      security: bearer,
      querystring: paginationQuerySchema,
      response: { 200: ok(paginated(myReportSchema)), 401: errorResponse },
    },
    handler: async (request) => toOk(await review.myReports(actorOf(request), request.query)),
  });
};
