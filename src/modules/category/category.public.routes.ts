import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { CACHE_CATALOG, CACHE_IMMUTABLE, cacheFor } from '../../common/http/cache.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import {
  categoryIdParamsSchema,
  publicCategorySchema,
  templateSchema,
  templateVersionParamsSchema,
} from './category.schema.js';
import type { CategoryService } from './category.service.js';

export interface CategoryPublicRoutesOptions {
  category: CategoryService;
}

const TAGS_CATEGORIES = ['Categories'];

/** Khách đọc được hết: danh mục đang bật, mẫu theo phiên bản. Không có cài đặt máy duyệt ở đây (design 2). */
export const categoryPublicRoutes: FastifyPluginAsyncZod<CategoryPublicRoutesOptions> = async (
  app,
  { category },
) => {
  app.get('/categories', {
    schema: {
      tags: TAGS_CATEGORIES,
      summary: 'Danh mục đang bật — mã, tên, số phiên bản mẫu hiện hành',
      response: { 200: ok(z.array(publicCategorySchema)) },
    },
    handler: async (_request, reply) =>
      cacheFor(reply, CACHE_CATALOG, toOk(await category.listPublic())),
  });

  app.get('/categories/:id/template', {
    schema: {
      tags: TAGS_CATEGORIES,
      summary: 'Mẫu thông tin hiện hành của danh mục (version null = chưa phát hành)',
      params: categoryIdParamsSchema,
      response: { 200: ok(templateSchema), 404: errorResponse },
    },
    handler: async (request, reply) =>
      cacheFor(reply, CACHE_CATALOG, toOk(await category.currentTemplate(request.params.id))),
  });

  app.get('/categories/:id/template/versions/:version', {
    schema: {
      tags: TAGS_CATEGORIES,
      summary: 'Một phiên bản mẫu đã phát hành — tin đăng cũ đọc đúng mẫu nó điền',
      params: templateVersionParamsSchema,
      response: { 200: ok(templateSchema), 404: errorResponse },
    },
    handler: async (request, reply) =>
      cacheFor(
        reply,
        CACHE_IMMUTABLE,
        toOk(await category.templateVersion(request.params.id, request.params.version)),
      ),
  });
};
