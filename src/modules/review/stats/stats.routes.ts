import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import { boardSchema, reviewerRateSchema, ruleRateSchema } from '../review.schema.js';
import type { ReviewService } from '../review.service.js';

export interface ReviewStatsRoutesOptions {
  review: ReviewService;
}

const TAGS = ['Ops · Review'];
const bearer = [{ bearerAuth: [] }];
const PREFIX = '/ops/review/stats';
const errors = { 401: errorResponse, 403: errorResponse };

/** Số liệu cho master (design add-review-queues mục 11): bảng tồn, tỉ lệ bị lật, tỉ lệ máy quá tay. */
export const reviewStatsRoutes: FastifyPluginAsyncZod<ReviewStatsRoutesOptions> = async (
  app,
  { review },
) => {
  const master = [app.authenticate, app.requireMaster];

  app.get(`${PREFIX}/board`, {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary:
        'Bảng tồn: việc mở theo hàng, việc quá hạn, việc nằm ở hàng master quá hạn nhắc (master)',
      security: bearer,
      response: { 200: ok(boardSchema), ...errors },
    },
    handler: async () => toOk(await review.board()),
  });

  app.get(`${PREFIX}/reviewers`, {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary:
        'Tỉ lệ bị lật theo người duyệt — quyết định "đạt" đã hậu kiểm bị gỡ tin hay gỡ khỏi nhóm (master)',
      security: bearer,
      response: { 200: ok(z.array(reviewerRateSchema)), ...errors },
    },
    handler: async () => toOk(await review.reviewerRates()),
  });

  app.get(`${PREFIX}/rules`, {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary:
        'Tỉ lệ máy quá tay theo luật — tin máy giữ có trúng luật được người cho đạt, kèm số lượt "máy quá tay" (master)',
      security: bearer,
      response: { 200: ok(z.array(ruleRateSchema)), ...errors },
    },
    handler: async () => toOk(await review.ruleRates()),
  });
};
