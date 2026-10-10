import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { categoryOpsRoutes } from './category.ops.routes.js';
import { categoryPublicRoutes } from './category.public.routes.js';
import type { CategoryService } from './category.service.js';

export interface CategoryRoutesOptions {
  category: CategoryService;
}

/** Bề mặt route của `category`: khách (`public`) và bàn vận hành (`ops`), dưới tiền tố `/api/v1`. */
export const categoryRoutes: FastifyPluginAsyncZod<CategoryRoutesOptions> = async (
  app,
  { category },
) => {
  await app.register(categoryPublicRoutes, { category });
  await app.register(categoryOpsRoutes, { category });
};
