import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { boostRoutes } from './boost/boost.routes.js';
import type { ListingService } from './listing.service.js';
import { postingRoutes } from './posting/posting.routes.js';
import { readRoutes } from './read/read.routes.js';
import { systemRoutes } from './system/system.routes.js';

export interface ListingRoutesOptions {
  listing: ListingService;
}

/**
 * Bề mặt route của `listing` (design add-listings mục 17): file này chỉ đăng ký route của từng cụm — người đăng ghi
 * (`posting`), mọi lượt đọc (`read`), người khác tác động lên tin (`system`) — dưới tiền tố `/api/v1` do `buildApp` đặt.
 */
export const listingRoutes: FastifyPluginAsyncZod<ListingRoutesOptions> = async (
  app,
  { listing },
) => {
  await app.register(postingRoutes, { listing });
  await app.register(readRoutes, { listing });
  await app.register(systemRoutes, { listing });
  await app.register(boostRoutes, { listing });
};
