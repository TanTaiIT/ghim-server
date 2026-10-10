import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import {
  categoryIdParamsSchema,
  provinceCodeParamsSchema,
  provinceSchema,
  publicCategorySchema,
  regionHitSchema,
  regionSearchQuerySchema,
  templateSchema,
  templateVersionParamsSchema,
  wardSchema,
} from './category.schema.js';
import type { CategoryService } from './category.service.js';

export interface CategoryPublicRoutesOptions {
  category: CategoryService;
}

const TAGS_CATEGORIES = ['Categories'];
const TAGS_REGIONS = ['Regions'];

/** Khách đọc được hết: danh mục đang bật, mẫu theo phiên bản, khu vực. Không có cài đặt máy duyệt ở đây (design 2). */
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
    handler: async () => toOk(await category.listPublic()),
  });

  app.get('/categories/:id/template', {
    schema: {
      tags: TAGS_CATEGORIES,
      summary: 'Mẫu thông tin hiện hành của danh mục (version null = chưa phát hành)',
      params: categoryIdParamsSchema,
      response: { 200: ok(templateSchema), 404: errorResponse },
    },
    handler: async (request) => toOk(await category.currentTemplate(request.params.id)),
  });

  app.get('/categories/:id/template/versions/:version', {
    schema: {
      tags: TAGS_CATEGORIES,
      summary: 'Một phiên bản mẫu đã phát hành — tin đăng cũ đọc đúng mẫu nó điền',
      params: templateVersionParamsSchema,
      response: { 200: ok(templateSchema), 404: errorResponse },
    },
    handler: async (request) =>
      toOk(await category.templateVersion(request.params.id, request.params.version)),
  });

  app.get('/regions/provinces', {
    schema: {
      tags: TAGS_REGIONS,
      summary: '34 tỉnh, thành sau sáp nhập kèm tên cũ và tên gọi tắt',
      response: { 200: ok(z.array(provinceSchema)) },
    },
    handler: async () => toOk(await category.listProvinces()),
  });

  app.get('/regions/provinces/:code/wards', {
    schema: {
      tags: TAGS_REGIONS,
      summary: 'Phường, xã của một tỉnh, thành',
      params: provinceCodeParamsSchema,
      response: { 200: ok(z.array(wardSchema)), 404: errorResponse },
    },
    handler: async (request) => toOk(await category.listWards(request.params.code)),
  });

  app.get('/regions/search', {
    schema: {
      tags: TAGS_REGIONS,
      summary: 'Tìm khu vực theo tên mới, tên cũ hay tên gọi tắt (bỏ dấu) — tỉnh trước, phường sau',
      querystring: regionSearchQuerySchema,
      response: { 200: ok(z.array(regionHitSchema)) },
    },
    handler: async (request) => toOk(await category.searchRegions(request.query.q)),
  });
};
