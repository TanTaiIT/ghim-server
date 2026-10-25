import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../../common/auth/actor.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import { emptySchema } from '../../identity/identity.schema.js';
import {
  activatePhraseBodySchema,
  bandsBodySchema,
  categoryParamsSchema,
  createPhraseBodySchema,
  keywordsBodySchema,
  keywordsSchema,
  lookupParamsSchema,
  lookupSchema,
  patchPhraseBodySchema,
  phraseParamsSchema,
  phraseSchema,
  ruleCategoryParamsSchema,
  ruleChangeBodySchema,
  ruleParamsSchema,
  rulesSchema,
  screeningStatsSchema,
  statsQuerySchema,
  whitelistBodySchema,
  whitelistEntrySchema,
  whitelistParamsSchema,
} from '../screening.schema.js';
import type { ScreeningService } from '../screening.service.js';

export interface ScreeningOpsRoutesOptions {
  screening: ScreeningService;
}

const TAGS_RULES = ['Ops · Screening rules'];
const TAGS_PHRASES = ['Ops · Banned phrases'];
const TAGS_LISTS = ['Ops · Screening lists'];
const TAGS_LOOKUP = ['Ops · Screening lookups'];
const TAGS_STATS = ['Ops · Screening stats'];
const bearer = [{ bearerAuth: [] }];
const PREFIX = '/ops/screening';

/**
 * Bàn vận hành của máy duyệt (design mục 11): luật, dải, cụm từ — chỉ master; danh sách trắng ảnh mẫu — mọi staff (câu
 * 13); từ khoá danh mục — master và staff của danh mục đó; tra mã — việc `support`.
 */
export const screeningOpsRoutes: FastifyPluginAsyncZod<ScreeningOpsRoutesOptions> = async (
  app,
  { screening },
) => {
  const master = [app.authenticate, app.requireMaster];
  const staff = [app.authenticate, app.requireStaff];
  const support = [app.authenticate, app.requireOps('support')];
  const categoryStaff = [
    app.authenticate,
    app.requireCategoryOps((request) => (request.params as { categoryId: string }).categoryId),
  ];

  // ── LUẬT ───────────────────────────────────────────────────────────────────────────────────────

  // ── SỐ LIỆU ────────────────────────────────────────────

  app.get(`${PREFIX}/stats`, {
    preHandler: master,
    schema: {
      tags: TAGS_STATS,
      summary:
        'Số liệu máy theo tháng (master): số lượt, cho qua / hạn chế / giữ, dải điểm, luật trúng nhiều nhất — cộng cả số đã gộp khi hết hạn lưu',
      security: bearer,
      querystring: statsQuerySchema,
      response: {
        200: ok(screeningStatsSchema),
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
      },
    },
    handler: async (request) => toOk(await screening.monthlyStats(request.query.months)),
  });

  app.get(`${PREFIX}/rules`, {
    preHandler: master,
    schema: {
      tags: TAGS_RULES,
      summary: 'Luật, ghi đè theo danh mục, ngưỡng dải của phiên bản luật hiện hành',
      security: bearer,
      response: { 200: ok(rulesSchema), 403: errorResponse },
    },
    handler: async () => toOk(await screening.listRules()),
  });

  app.patch(`${PREFIX}/rules/:code`, {
    preHandler: master,
    schema: {
      tags: TAGS_RULES,
      summary:
        'Đổi trọng số hay chế độ một luật — cổng cứng không tắt được; tạo phiên bản luật mới',
      security: bearer,
      params: ruleParamsSchema,
      body: ruleChangeBodySchema,
      response: {
        200: ok(rulesSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await screening.changeRule(actorOf(request), request.params.code, request.body)),
  });

  app.put(`${PREFIX}/rules/:code/categories/:categoryId`, {
    preHandler: master,
    schema: {
      tags: TAGS_RULES,
      summary: 'Ghi đè trọng số hay chế độ của một luật cho một danh mục',
      security: bearer,
      params: ruleCategoryParamsSchema,
      body: ruleChangeBodySchema,
      response: {
        200: ok(rulesSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(
        await screening.setOverride(
          actorOf(request),
          request.params.code,
          request.params.categoryId,
          request.body,
        ),
      ),
  });

  app.delete(`${PREFIX}/rules/:code/categories/:categoryId`, {
    preHandler: master,
    schema: {
      tags: TAGS_RULES,
      summary: 'Bỏ ghi đè — danh mục dùng lại giá trị chung',
      security: bearer,
      params: ruleCategoryParamsSchema,
      response: { 204: emptySchema, 403: errorResponse, 404: errorResponse },
    },
    handler: async (request, reply) => {
      await screening.clearOverride(
        actorOf(request),
        request.params.code,
        request.params.categoryId,
      );
      return reply.status(204).send(null);
    },
  });

  app.put(`${PREFIX}/bands/:categoryId`, {
    preHandler: master,
    schema: {
      tags: TAGS_RULES,
      summary: 'Ngưỡng dải Vừa / Cao riêng cho một danh mục',
      security: bearer,
      params: categoryParamsSchema,
      body: bandsBodySchema,
      response: {
        200: ok(rulesSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await screening.setBands(actorOf(request), request.params.categoryId, request.body)),
  });

  // ── CỤM TỪ CẤM ─────────────────────────────────────────────────────────────────────────────────

  app.get(`${PREFIX}/phrases`, {
    preHandler: master,
    schema: {
      tags: TAGS_PHRASES,
      summary: 'Mọi cụm từ cấm, mới nhất trước',
      security: bearer,
      response: { 200: ok(z.array(phraseSchema)), 403: errorResponse },
    },
    handler: async () => toOk(await screening.listPhrases()),
  });

  app.post(`${PREFIX}/phrases`, {
    preHandler: master,
    schema: {
      tags: TAGS_PHRASES,
      summary: 'Thêm cụm (từ hai chữ) — bắt đầu ở chế độ chạy thử',
      security: bearer,
      body: createPhraseBodySchema,
      response: {
        201: ok(phraseSchema),
        400: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await screening.createPhrase(actorOf(request), request.body))),
  });

  app.patch(`${PREFIX}/phrases/:id`, {
    preHandler: master,
    schema: {
      tags: TAGS_PHRASES,
      summary: 'Đổi mức hay danh sách ngoại lệ của một cụm',
      security: bearer,
      params: phraseParamsSchema,
      body: patchPhraseBodySchema,
      response: {
        200: ok(phraseSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await screening.updatePhrase(actorOf(request), request.params.id, request.body)),
  });

  app.post(`${PREFIX}/phrases/:id/activate`, {
    preHandler: master,
    schema: {
      tags: TAGS_PHRASES,
      summary:
        'Bật thật — chưa đủ ngày chạy thử thì bắt buộc lý do; cụm mức chắc thì quét lại tin đang hiển thị',
      security: bearer,
      params: phraseParamsSchema,
      body: activatePhraseBodySchema,
      response: {
        200: ok(phraseSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(
        await screening.activatePhrase(actorOf(request), request.params.id, request.body.reason),
      ),
  });

  app.post(`${PREFIX}/phrases/:id/deactivate`, {
    preHandler: master,
    schema: {
      tags: TAGS_PHRASES,
      summary: 'Tắt — tin đang chờ vì cụm này vẫn chờ người duyệt',
      security: bearer,
      params: phraseParamsSchema,
      response: { 200: ok(phraseSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) =>
      toOk(await screening.deactivatePhrase(actorOf(request), request.params.id)),
  });

  // ── DANH SÁCH TRẮNG, TỪ KHOÁ ───────────────────────────────────────────────────────────────────

  app.get(`${PREFIX}/whitelist`, {
    preHandler: staff,
    schema: {
      tags: TAGS_LISTS,
      summary: 'Ảnh mẫu của hãng không tính là ảnh trùng',
      security: bearer,
      response: { 200: ok(z.array(whitelistEntrySchema)), 403: errorResponse },
    },
    handler: async () => toOk(await screening.listWhitelist()),
  });

  app.post(`${PREFIX}/whitelist`, {
    preHandler: staff,
    schema: {
      tags: TAGS_LISTS,
      summary: 'Thêm một ảnh trong kho vào danh sách trắng',
      security: bearer,
      body: whitelistBodySchema,
      response: { 201: ok(whitelistEntrySchema), 400: errorResponse, 403: errorResponse },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(toOk(await screening.addWhitelist(actorOf(request), request.body.imageId))),
  });

  app.delete(`${PREFIX}/whitelist/:id`, {
    preHandler: staff,
    schema: {
      tags: TAGS_LISTS,
      summary: 'Gỡ một ảnh khỏi danh sách trắng',
      security: bearer,
      params: whitelistParamsSchema,
      response: { 204: emptySchema, 403: errorResponse, 404: errorResponse },
    },
    handler: async (request, reply) => {
      await screening.removeWhitelist(actorOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  });

  app.put(`${PREFIX}/categories/:categoryId/keywords`, {
    preHandler: categoryStaff,
    schema: {
      tags: TAGS_LISTS,
      summary: 'Thay bộ từ khoá suy ra danh mục — dùng cho dấu hiệu "sai danh mục"',
      security: bearer,
      params: categoryParamsSchema,
      body: keywordsBodySchema,
      response: {
        200: ok(keywordsSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(
        await screening.replaceKeywords(
          actorOf(request),
          request.params.categoryId,
          request.body.keywords,
        ),
      ),
  });

  // ── TRA MÃ ─────────────────────────────────────────────────────────────────────────────────────

  app.get(`${PREFIX}/lookups/:code`, {
    preHandler: support,
    schema: {
      tags: TAGS_LOOKUP,
      summary: 'Lý do cụ thể của một lần giữ theo mã tra cứu — không có dấu thiết bị',
      security: bearer,
      params: lookupParamsSchema,
      response: { 200: ok(lookupSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) => toOk(await screening.lookup(request.params.code)),
  });
};
