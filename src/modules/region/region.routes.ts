import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { CACHE_REGIONS, cacheFor } from '../../common/http/cache.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import {
  provinceCodeParamsSchema,
  provinceSchema,
  regionHitSchema,
  regionSearchQuerySchema,
  wardSchema,
} from './region.schema.js';
import type { RegionService } from './region.service.js';

export interface RegionRoutesOptions {
  region: RegionService;
}

const TAGS = ['Regions'];

/** Khách đọc được hết; kết quả giữ lại một ngày (spec category/regions). */
export const regionRoutes: FastifyPluginAsyncZod<RegionRoutesOptions> = async (app, { region }) => {
  app.get('/regions/provinces', {
    schema: {
      tags: TAGS,
      summary: '34 tỉnh, thành sau sáp nhập kèm tên cũ và tên gọi tắt',
      response: { 200: ok(z.array(provinceSchema)) },
    },
    handler: async (_request, reply) =>
      cacheFor(reply, CACHE_REGIONS, toOk(await region.listProvinces())),
  });

  app.get('/regions/provinces/:code/wards', {
    schema: {
      tags: TAGS,
      summary: 'Phường, xã của một tỉnh, thành',
      params: provinceCodeParamsSchema,
      response: { 200: ok(z.array(wardSchema)), 404: errorResponse },
    },
    handler: async (request, reply) =>
      cacheFor(reply, CACHE_REGIONS, toOk(await region.listWards(request.params.code))),
  });

  app.get('/regions/search', {
    schema: {
      tags: TAGS,
      summary: 'Tìm khu vực theo tên mới, tên cũ hay tên gọi tắt (bỏ dấu) — tỉnh trước, phường sau',
      querystring: regionSearchQuerySchema,
      response: { 200: ok(z.array(regionHitSchema)) },
    },
    handler: async (request, reply) =>
      cacheFor(reply, CACHE_REGIONS, toOk(await region.searchRegions(request.query.q))),
  });
};
