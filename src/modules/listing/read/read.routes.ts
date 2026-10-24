import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../../common/auth/actor.js';
import { cursorPaginated, cursorQuerySchema } from '../../../common/schemas/cursor.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import {
  feedQuerySchema,
  groupFeedQuerySchema,
  groupListingParamsSchema,
  listingParamsSchema,
  listingSchema,
  myListingsQuerySchema,
  ownListingSchema,
  userListingParamsSchema,
} from '../listing.schema.js';
import type { ListingRoutesOptions } from '../listing.routes.js';

const TAGS_OWNER = ['Listings · Người đăng'];
const TAGS_VIEWER = ['Listings · Người xem'];
const bearer = [{ bearerAuth: [] }];
/** Không token vẫn xem được; có token thì người đăng thấy tin của mình, thành viên thấy tin "chỉ thành viên". */
const optionalBearer = [{}, ...bearer];
const readErrors = { 400: errorResponse, 404: errorResponse };

/** Mọi lượt đọc tin — theo một luật "ai thấy một tin" (`calc/visibility.calc.ts`, CLAUDE.md luật 25). */
export const readRoutes: FastifyPluginAsyncZod<ListingRoutesOptions> = async (app, { listing }) => {
  const user = [app.authenticate];
  const anyone = [app.authenticateOptional];

  app.get('/me/listings', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Tin của tôi ở mọi trạng thái, kèm lý do tạm ẩn và lý do hạn chế',
      security: bearer,
      querystring: myListingsQuerySchema,
      response: {
        200: ok(cursorPaginated(ownListingSchema)),
        400: errorResponse,
        401: errorResponse,
      },
    },
    handler: async (request) => toOk(await listing.mine(actorOf(request), request.query)),
  });

  app.get('/listings', {
    preHandler: anyone,
    schema: {
      tags: TAGS_VIEWER,
      security: optionalBearer,
      summary:
        'Không `q` = bảng tin / danh mục (tin hiện đầy đủ); có `q` = tìm kiếm (gồm tin hạn chế)',
      description: [
        'Lọc theo mẫu thông tin của danh mục (TK 11) qua `attrs` — JSON, chỉ khi có `categoryId`: mục chọn một /',
        'chọn nhiều nhận mảng giá trị (tin khớp khi có một trong số đó), mục số nhận `{ "min", "max" }` (một hay',
        'cả hai đầu). Ví dụ `attrs={"hang":["Apple","Samsung"],"nam_san_xuat":{"min":2018,"max":2020}}`.',
        'Mục chữ, mục không có trong mẫu hiện hành, giá trị ngoài lựa chọn → 400 `VALIDATION_ERROR` kèm',
        '`details.field`. Tin không có mục đang lọc không hiện; thứ tự và luật ai thấy tin giữ nguyên.',
      ].join(' '),
      querystring: feedQuerySchema,
      response: { 200: ok(cursorPaginated(listingSchema)), 400: errorResponse },
    },
    handler: async (request) => toOk(await listing.feed(request.actor, request.query)),
  });

  app.get('/listings/:id', {
    preHandler: anyone,
    schema: {
      tags: TAGS_VIEWER,
      security: optionalBearer,
      summary:
        'Một tin — người đăng thấy trạng thái và lý do; người khác không được thấy thì 404 như tin không tồn tại',
      params: listingParamsSchema,
      response: { 200: ok(z.union([ownListingSchema, listingSchema])), ...readErrors },
    },
    handler: async (request) => toOk(await listing.get(request.actor, request.params.id)),
  });

  app.get('/listings/:id/suggestions', {
    preHandler: anyone,
    schema: {
      tags: TAGS_VIEWER,
      security: optionalBearer,
      summary: 'Vài tin sàn chung cùng danh mục để xem tiếp',
      params: listingParamsSchema,
      response: { 200: ok(z.array(listingSchema)), ...readErrors },
    },
    handler: async (request) => toOk(await listing.suggestions(request.actor, request.params.id)),
  });

  app.get('/groups/:groupId/listings', {
    preHandler: anyone,
    schema: {
      tags: TAGS_VIEWER,
      security: optionalBearer,
      summary: 'Bảng tin nhóm — "chỉ thành viên" chỉ hiện cho thành viên; có `q` = tìm trong nhóm',
      params: groupListingParamsSchema,
      querystring: groupFeedQuerySchema,
      response: { 200: ok(cursorPaginated(listingSchema)), ...readErrors },
    },
    handler: async (request) =>
      toOk(await listing.groupFeed(request.actor, request.params.groupId, request.query)),
  });

  app.get('/users/:id/listings', {
    preHandler: anyone,
    schema: {
      tags: TAGS_VIEWER,
      security: optionalBearer,
      summary: 'Tin đang hiển thị của người bán mà người xem được phép thấy',
      params: userListingParamsSchema,
      querystring: cursorQuerySchema,
      response: { 200: ok(cursorPaginated(listingSchema)), 400: errorResponse },
    },
    handler: async (request) =>
      toOk(await listing.profile(request.actor, request.params.id, request.query)),
  });
};
