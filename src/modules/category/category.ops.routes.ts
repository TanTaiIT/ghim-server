import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../common/auth/actor.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { emptySchema } from '../identity/identity.schema.js';
import {
  categoryAdminSchema,
  categoryIdParamsSchema,
  categorySettingsBodySchema,
  categorySettingsSchema,
  createCategoryBodySchema,
  renameCategoryBodySchema,
  saveDraftBodySchema,
  settingsVersionParamsSchema,
  templateDraftSchema,
  templateSchema,
} from './category.schema.js';
import type { CategoryService } from './category.service.js';

export interface CategoryOpsRoutesOptions {
  category: CategoryService;
}

const TAGS = ['Ops · Categories'];
const bearer = [{ bearerAuth: [] }];

const categoryIdOf = (request: FastifyRequest): string => (request.params as { id: string }).id;

/**
 * Bàn vận hành của danh mục: tạo, cài đặt, bật / tắt, phát hành mẫu là của master; soạn nháp mở cho
 * staff phụ trách danh mục đó (`requireCategoryOps`). Không có DELETE — tắt thay cho xoá (spec).
 */
export const categoryOpsRoutes: FastifyPluginAsyncZod<CategoryOpsRoutesOptions> = async (
  app,
  { category },
) => {
  const master = [app.authenticate, app.requireMaster];
  const categoryStaff = [app.authenticate, app.requireCategoryOps(categoryIdOf)];

  app.get('/ops/categories', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Mọi danh mục kể cả đang tắt, đủ cài đặt hiện hành',
      security: bearer,
      response: { 200: ok(z.array(categoryAdminSchema)), 403: errorResponse },
    },
    handler: async () => toOk(await category.listAdmin()),
  });

  app.post('/ops/categories', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Tạo danh mục với phiên bản cài đặt 1',
      security: bearer,
      body: createCategoryBodySchema,
      response: {
        201: ok(categoryAdminSchema),
        400: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await category.create(actorOf(request), request.body))),
  });

  app.patch('/ops/categories/:id', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Đổi tên danh mục (không tạo phiên bản cài đặt)',
      security: bearer,
      params: categoryIdParamsSchema,
      body: renameCategoryBodySchema,
      response: {
        200: ok(categoryAdminSchema),
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await category.rename(actorOf(request), request.params.id, request.body.name)),
  });

  app.put('/ops/categories/:id/settings', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Đổi cài đặt máy duyệt — gửi trọn bộ, tạo phiên bản cài đặt kế',
      security: bearer,
      params: categoryIdParamsSchema,
      body: categorySettingsBodySchema,
      response: {
        200: ok(categoryAdminSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await category.updateSettings(actorOf(request), request.params.id, request.body)),
  });

  app.get('/ops/categories/:id/settings/versions/:version', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Tra một phiên bản cài đặt cũ',
      security: bearer,
      params: settingsVersionParamsSchema,
      response: { 200: ok(categorySettingsSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) =>
      toOk(await category.getSettingsVersion(request.params.id, request.params.version)),
  });

  app.post('/ops/categories/:id/enable', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Bật lại danh mục — cài đặt và mẫu giữ nguyên như lúc tắt',
      security: bearer,
      params: categoryIdParamsSchema,
      response: { 200: ok(categoryAdminSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) =>
      toOk(await category.setStatus(actorOf(request), request.params.id, 'active')),
  });

  app.post('/ops/categories/:id/disable', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Tắt danh mục — không xoá',
      security: bearer,
      params: categoryIdParamsSchema,
      response: { 200: ok(categoryAdminSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) =>
      toOk(await category.setStatus(actorOf(request), request.params.id, 'disabled')),
  });

  // ── MẪU THÔNG TIN ───────────────────────────────────────────────────────────────────────────

  app.get('/ops/categories/:id/template/draft', {
    preHandler: categoryStaff,
    schema: {
      tags: TAGS,
      summary: 'Bản nháp mẫu (draftVersion 0 = chưa có, fields là mẫu hiện hành)',
      security: bearer,
      params: categoryIdParamsSchema,
      response: { 200: ok(templateDraftSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) => toOk(await category.getDraft(request.params.id)),
  });

  app.put('/ops/categories/:id/template/draft', {
    preHandler: categoryStaff,
    schema: {
      tags: TAGS,
      summary: 'Thay cả bản nháp với khoá lạc quan baseDraftVersion',
      security: bearer,
      params: categoryIdParamsSchema,
      body: saveDraftBodySchema,
      response: {
        200: ok(templateDraftSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await category.saveDraft(actorOf(request), request.params.id, request.body)),
  });

  app.delete('/ops/categories/:id/template/draft', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Bỏ bản nháp — mẫu hiện hành không đổi',
      security: bearer,
      params: categoryIdParamsSchema,
      response: { 204: emptySchema, 403: errorResponse, 404: errorResponse },
    },
    handler: async (request, reply) => {
      await category.discardDraft(actorOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  });

  app.post('/ops/categories/:id/template/publish', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Phát hành bản nháp thành phiên bản mẫu kế — bất biến từ đó',
      security: bearer,
      params: categoryIdParamsSchema,
      response: {
        201: ok(templateSchema),
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await category.publish(actorOf(request), request.params.id))),
  });
};
