import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { reviewGroupRoutes } from './desk/group.routes.js';
import { reviewOpsRoutes } from './desk/ops.routes.js';
import type { ReviewService } from './review.service.js';
import { reviewStatsRoutes } from './stats/stats.routes.js';

export interface ReviewRoutesOptions {
  review: ReviewService;
}

/** Bàn vận hành cho staff và master, số liệu cho master; app cho điều hành viên, chủ nhóm xử việc của nhóm. */
export const reviewRoutes: FastifyPluginAsyncZod<ReviewRoutesOptions> = async (app, { review }) => {
  await app.register(reviewOpsRoutes, { review });
  await app.register(reviewGroupRoutes, { review });
  await app.register(reviewStatsRoutes, { review });
};
