import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../../common/auth/actor.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import type { TrustService } from '../trust.service.js';
import {
  accountParamsSchema,
  amnestyBodySchema,
  appealBodySchema,
  articleParamsSchema,
  articleQuerySchema,
  commentBodySchema,
  commentSchema,
  createRuleArticleBodySchema,
  ruleArticleSchema,
  seriousAppealBodySchema,
  seriousAppealCodeBodySchema,
  seriousAppealResultSchema,
  strikeParamsSchema,
  strikeSchema,
  updateRuleArticleBodySchema,
} from './strike.schema.js';

export interface StrikeRoutesOptions {
  trust: TrustService;
}

const TAGS_ME = ['Me'];
const TAGS_SUPPORT = ['Support'];
const TAGS_OPS = ['Ops · Trust'];
const bearer = [{ bearerAuth: [] }];
const errors = { 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse };
const empty = z.null();

/**
 * Gậy cho người nhận (xem, khiếu nại trong app), kênh hỗ trợ không cần đăng nhập cho gậy nghiêm trọng, và bàn vận hành
 * (ân xá, gỡ khoá vĩnh viễn, nhận xét, quy định sàn). Quyết khiếu nại / gậy nghiêm trọng đi qua việc của `review`.
 */
export const strikeRoutes: FastifyPluginAsyncZod<StrikeRoutesOptions> = async (app, { trust }) => {
  const user = [app.authenticate];
  const staff = [app.authenticate, app.requireStaff];
  const master = [app.authenticate, app.requireMaster];
  // Hai route khách là cửa cho kẻ dò email: rate limit riêng như route đăng nhập.
  const sensitive = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  app.get('/me/strikes', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Gậy của tôi — kể cả đã hết hạn, đã huỷ; mỗi gậy ghi điều trích và ngày hết',
      security: bearer,
      response: { 200: ok(z.array(strikeSchema)), 401: errorResponse },
    },
    handler: async (request) => toOk(await trust.myStrikes(actorOf(request))),
  });

  app.post('/me/strikes/:strikeId/appeal', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary:
        'Khiếu nại một gậy thường / nặng — một lần, trong hạn; gậy nghiêm trọng đi kênh hỗ trợ',
      security: bearer,
      params: strikeParamsSchema,
      body: appealBodySchema,
      response: { 201: ok(strikeSchema), 400: errorResponse, ...errors },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(
          toOk(
            await trust.fileAppeal(
              actorOf(request),
              request.params.strikeId,
              request.body.statement,
            ),
          ),
        ),
  });

  app.post('/support/serious-appeal/code', {
    config: sensitive,
    schema: {
      tags: TAGS_SUPPORT,
      summary:
        'Người bị khoá vì gậy nghiêm trọng xin mã về email đã đăng ký — luôn 200, không lộ gì',
      body: seriousAppealCodeBodySchema,
      response: { 200: ok(empty), 400: errorResponse, 429: errorResponse },
    },
    handler: async (request) => {
      await trust.requestSeriousAppealCode(request.body.email);
      return toOk(null);
    },
  });

  app.post('/support/serious-appeal', {
    config: sensitive,
    schema: {
      tags: TAGS_SUPPORT,
      summary: 'Nộp khiếu nại gậy nghiêm trọng bằng mã — trả lý do khoá, lúc ra gậy, hạn khiếu nại',
      body: seriousAppealBodySchema,
      response: {
        201: ok(seriousAppealResultSchema),
        400: errorResponse,
        401: errorResponse,
        409: errorResponse,
        429: errorResponse,
      },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await trust.fileSeriousAppeal(request.body))),
  });

  app.post('/ops/trust/accounts/:accountId/amnesty', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Master ân xá một hay nhiều gậy thường / nặng của một người, bắt buộc ghi lý do',
      security: bearer,
      params: accountParamsSchema,
      body: amnestyBodySchema,
      response: { 200: ok(z.array(strikeSchema)), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(await trust.amnesty(actorOf(request), request.params.accountId, request.body)),
  });

  app.post('/ops/trust/strikes/:strikeId/lift', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Master gỡ khoá vĩnh viễn — tài khoản mở khoá, email hết bị chặn',
      security: bearer,
      params: strikeParamsSchema,
      response: { 200: ok(strikeSchema), ...errors },
    },
    handler: async (request) => toOk(await trust.lift(actorOf(request), request.params.strikeId)),
  });

  app.get('/ops/trust/accounts/:accountId/strikes', {
    preHandler: staff,
    schema: {
      tags: TAGS_OPS,
      summary: 'Lịch sử gậy của một người (staff, master)',
      security: bearer,
      params: accountParamsSchema,
      response: { 200: ok(z.array(strikeSchema)), ...errors },
    },
    handler: async (request) => toOk(await trust.strikesOf(request.params.accountId)),
  });

  app.post('/ops/trust/strikes/:strikeId/comments', {
    preHandler: staff,
    schema: {
      tags: TAGS_OPS,
      summary: 'Staff ghi nhận xét vào hồ sơ gậy nghiêm trọng đang chờ master — không đổi gì khác',
      security: bearer,
      params: strikeParamsSchema,
      body: commentBodySchema,
      response: { 201: ok(commentSchema), 400: errorResponse, ...errors },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(
          toOk(
            await trust.addComment(actorOf(request), request.params.strikeId, request.body.body),
          ),
        ),
  });

  app.get('/ops/trust/rule-articles', {
    preHandler: staff,
    schema: {
      tags: TAGS_OPS,
      summary: 'Quy định sàn để trích khi ra gậy — master thấy cả điều đã tắt',
      security: bearer,
      querystring: articleQuerySchema,
      response: { 200: ok(z.array(ruleArticleSchema)), 401: errorResponse, 403: errorResponse },
    },
    handler: async (request) =>
      toOk(
        await trust.ruleArticles({
          includeInactive:
            actorOf(request).role === 'master' && request.query.includeInactive === true,
        }),
      ),
  });

  app.post('/ops/trust/rule-articles', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Master thêm một điều vào quy định sàn',
      security: bearer,
      body: createRuleArticleBodySchema,
      response: { 201: ok(ruleArticleSchema), 400: errorResponse, ...errors },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await trust.createRuleArticle(actorOf(request), request.body))),
  });

  app.patch('/ops/trust/rule-articles/:articleId', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Master sửa câu, thứ tự, tắt / bật một điều — gậy đã ra giữ bản trích cũ',
      security: bearer,
      params: articleParamsSchema,
      body: updateRuleArticleBodySchema,
      response: { 200: ok(ruleArticleSchema), 400: errorResponse, ...errors },
    },
    handler: async (request) =>
      toOk(await trust.updateRuleArticle(actorOf(request), request.params.articleId, request.body)),
  });
};
