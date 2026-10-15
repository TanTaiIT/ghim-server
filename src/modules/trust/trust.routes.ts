import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { actorOf } from '../../common/auth/actor.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { trustDashboardSchema } from './trust.schema.js';
import type { TrustService } from './trust.service.js';

export interface TrustRoutesOptions {
  trust: TrustService;
}

/** Bảng uy tín (design mục 11). Không có route ghi: mức chỉ đổi do tính lại (spec trust-tiers). */
export const trustRoutes: FastifyPluginAsyncZod<TrustRoutesOptions> = async (app, { trust }) => {
  app.get('/me/trust', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Me'],
      summary:
        'Bảng uy tín: mức, còn thiếu gì để lên mức, hạn mức còn lại, tin hạn chế, tin chờ người duyệt',
      security: [{ bearerAuth: [] }],
      response: { 200: ok(trustDashboardSchema), 401: errorResponse },
    },
    handler: async (request) => toOk(await trust.dashboard(actorOf(request))),
  });
};
