import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { actorOf } from '../../../common/auth/actor.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import { boostBodySchema, boostStateSchema, listingParamsSchema } from '../listing.schema.js';
import type { ListingRoutesOptions } from '../listing.routes.js';

const TAGS = ['Listings · Đẩy tin'];
const bearer = [{ bearerAuth: [] }];
const errors = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
};

/**
 * Đẩy tin của người quản trị (change add-admin-boost): master mọi tin, staff tin sàn chung của danh mục được giao, chủ
 * nhóm / điều hành viên tin của nhóm. Trả trạng thái đẩy thay vì tin — app chỉ cần đổi nút, tin tải lại qua query riêng.
 */
export const boostRoutes: FastifyPluginAsyncZod<ListingRoutesOptions> = async (
  app,
  { listing },
) => {
  const user = [app.authenticate];

  app.get('/listings/:id/boost', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Hỏi trước quyền đẩy một tin: vai, đẩy được không, mốc đẩy lên đầu lại, hạn nổi bật',
      security: bearer,
      params: listingParamsSchema,
      response: { 200: ok(boostStateSchema), ...errors },
    },
    handler: async (request) => toOk(await listing.boostState(actorOf(request), request.params.id)),
  });

  app.post('/listings/:id/boost', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary:
        'Đẩy lên đầu (`rank_to_top`) hay đặt nổi bật N ngày (`featured`) — chỉ tin đang hiển thị đầy đủ',
      description: [
        'Đẩy lên đầu cách lần trước ít nhất `promotion.bumpCooldownHours` (khởi đầu 24 giờ), sớm hơn → 429',
        '`BOOST_COOLDOWN` kèm `details.retryAt`. Tin không hiển thị đầy đủ → 409 `BOOST_NOT_ALLOWED` với câu nói',
        'vì sao. Số ngày nổi bật ngoài 1 tới `promotion.featuredMaxDays` → 400. Không đổi `version` của tin.',
      ].join(' '),
      security: bearer,
      params: listingParamsSchema,
      body: boostBodySchema,
      response: { 200: ok(boostStateSchema), ...errors, 409: errorResponse, 429: errorResponse },
    },
    handler: async (request) =>
      toOk(await listing.boost(actorOf(request), request.params.id, request.body)),
  });

  app.delete('/listings/:id/featured', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Bỏ nổi bật ở mọi trạng thái của tin; tin không đang nổi bật thì không đổi gì',
      security: bearer,
      params: listingParamsSchema,
      response: { 200: ok(boostStateSchema), ...errors },
    },
    handler: async (request) => toOk(await listing.unfeature(actorOf(request), request.params.id)),
  });
};
