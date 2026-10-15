import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { actorOf } from '../../../common/auth/actor.js';
import { errorResponse } from '../../../common/schemas/response.js';
import { emptySchema } from '../../identity/identity.schema.js';
import { badgeParamsSchema } from '../listing.schema.js';
import type { ListingRoutesOptions } from '../listing.routes.js';

const TAGS = ['Listings · Nhóm'];
const bearer = [{ bearerAuth: [] }];

/** Người ngoài chủ tin tác động lên tin qua HTTP — hiện chỉ có nhóm gỡ huy hiệu (design add-listings mục 14). */
export const systemRoutes: FastifyPluginAsyncZod<ListingRoutesOptions> = async (
  app,
  { listing },
) => {
  app.delete('/groups/:groupId/listing-badges/:listingId', {
    preHandler: [app.authenticate],
    schema: {
      tags: TAGS,
      summary:
        'Nhóm gỡ huy hiệu của mình khỏi một tin — tin đó không gắn lại huy hiệu nhóm này được nữa',
      security: bearer,
      params: badgeParamsSchema,
      response: {
        204: emptySchema,
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) => {
      await listing.removeBadgeByGroup(
        actorOf(request),
        request.params.groupId,
        request.params.listingId,
      );
      return reply.status(204).send(null);
    },
  });
};
