import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { screeningOpsRoutes } from './ops/ops.routes.js';
import type { ScreeningService } from './screening.service.js';

export interface ScreeningRoutesOptions {
  screening: ScreeningService;
}

/** Người đăng thấy câu báo qua route của `listing` và `trust`; `screening` chỉ có route bàn vận hành. */
export const screeningRoutes: FastifyPluginAsyncZod<ScreeningRoutesOptions> = async (
  app,
  { screening },
) => {
  await app.register(screeningOpsRoutes, { screening });
};
