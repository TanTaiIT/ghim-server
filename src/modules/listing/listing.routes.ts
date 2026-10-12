import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../common/auth/actor.js';
import { cursorPaginated, cursorQuerySchema } from '../../common/schemas/cursor.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { emptySchema } from '../identity/identity.schema.js';
import {
  badgeParamsSchema,
  createListingBodySchema,
  deviceHeadersSchema,
  feedQuerySchema,
  groupFeedQuerySchema,
  groupListingParamsSchema,
  listingParamsSchema,
  listingSchema,
  moveListingBodySchema,
  myListingsQuerySchema,
  ownListingSchema,
  patchListingBodySchema,
  renewListingBodySchema,
  submitListingBodySchema,
  userListingParamsSchema,
} from './listing.schema.js';
import type { ListingService } from './listing.service.js';

export interface ListingRoutesOptions {
  listing: ListingService;
}

const TAGS_OWNER = ['Listings · Người đăng'];
const TAGS_VIEWER = ['Listings · Người xem'];
const TAGS_GROUP = ['Listings · Nhóm'];
const bearer = [{ bearerAuth: [] }];
const errors = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
  409: errorResponse,
};
/** Lượt gửi còn có thể chạm hạn mức, thời gian chờ (`trust`, `screening` — 429). */
const submitErrors = { ...errors, 429: errorResponse };
const readErrors = { 400: errorResponse, 404: errorResponse };

/**
 * Tin đăng (design add-listings mục 17). Route chỉ đòi đăng nhập: master, email chưa xác nhận, thiếu `x-device-id` là
 * bước 3 của thứ tự kiểm trong service — chặn ở đây thì 404 và `INVALID_TRANSITION` không còn đứng trước.
 */
export const listingRoutes: FastifyPluginAsyncZod<ListingRoutesOptions> = async (
  app,
  { listing },
) => {
  const user = [app.authenticate];
  const anyone = [app.authenticateOptional];

  // ── NGƯỜI ĐĂNG ─────────────────────────────────────────────────────────────────────────────────

  app.post('/listings', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Tạo nháp — lưu được khi chưa đủ trường',
      security: bearer,
      body: createListingBodySchema,
      response: { 201: ok(ownListingSchema), ...errors },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await listing.createDraft(actorOf(request), request.body))),
  });

  app.patch('/listings/:id', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary:
        'Lưu nháp, hoặc sửa tin đã gửi kèm `version` — sửa nội dung qua máy lại (cần `x-device-id`), thu hẹp nơi đăng và công tắc áp ngay',
      security: bearer,
      params: listingParamsSchema,
      headers: deviceHeadersSchema,
      body: patchListingBodySchema,
      response: { 200: ok(ownListingSchema), ...submitErrors },
    },
    handler: async (request) =>
      toOk(
        await listing.update(
          actorOf(request),
          request.params.id,
          request.body,
          request.headers['x-device-id'] || null,
        ),
      ),
  });

  app.post('/listings/:id/submit', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Gửi nháp — bấm hai lần cùng `version` trả 200 cùng tin, không tính thêm lượt gửi',
      security: bearer,
      params: listingParamsSchema,
      headers: deviceHeadersSchema,
      body: submitListingBodySchema,
      response: { 200: ok(ownListingSchema), ...submitErrors },
    },
    handler: async (request) =>
      toOk(
        await listing.submit(
          actorOf(request),
          request.params.id,
          request.body.version,
          request.headers['x-device-id'] || null,
        ),
      ),
  });

  app.post('/listings/:id/withdraw', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Rút tin đang chờ duyệt về nháp',
      security: bearer,
      params: listingParamsSchema,
      response: { 200: ok(ownListingSchema), ...errors },
    },
    handler: async (request) => toOk(await listing.withdraw(actorOf(request), request.params.id)),
  });

  app.post('/listings/:id/renew', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary:
        'Gia hạn (7 ngày cuối hay sau khi hết hạn), kèm sửa tuỳ chọn — qua máy như một lượt gửi',
      security: bearer,
      params: listingParamsSchema,
      headers: deviceHeadersSchema,
      body: renewListingBodySchema,
      response: { 200: ok(ownListingSchema), ...submitErrors },
    },
    handler: async (request) =>
      toOk(
        await listing.renew(
          actorOf(request),
          request.params.id,
          request.body,
          request.headers['x-device-id'] || null,
        ),
      ),
  });

  app.post('/listings/:id/sold', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Đánh dấu đã bán',
      security: bearer,
      params: listingParamsSchema,
      response: { 200: ok(ownListingSchema), ...errors },
    },
    handler: async (request) => toOk(await listing.markSold(actorOf(request), request.params.id)),
  });

  app.delete('/listings/:id', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Xoá tin ở mọi trạng thái — không ai thấy nữa, kể cả người đăng',
      security: bearer,
      params: listingParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await listing.remove(actorOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  });

  app.post('/listings/:id/move-to-marketplace', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary:
        'Chuyển tin đã rời nhóm hẳn lên sàn chung thành một tin mới — một lần, trong hạn; tin cũ giữ nguyên',
      security: bearer,
      params: listingParamsSchema,
      headers: deviceHeadersSchema,
      body: moveListingBodySchema,
      response: { 201: ok(ownListingSchema), ...submitErrors },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(
          toOk(
            await listing.moveToMarketplace(
              actorOf(request),
              request.params.id,
              request.body,
              request.headers['x-device-id'] || null,
            ),
          ),
        ),
  });

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

  // ── NGƯỜI XEM (khách được) ────────────────────────────────────────────────────────────────────

  app.get('/listings', {
    preHandler: anyone,
    schema: {
      tags: TAGS_VIEWER,
      summary:
        'Không `q` = bảng tin / danh mục (tin hiện đầy đủ); có `q` = tìm kiếm (gồm tin hạn chế)',
      querystring: feedQuerySchema,
      response: { 200: ok(cursorPaginated(listingSchema)), 400: errorResponse },
    },
    handler: async (request) => toOk(await listing.feed(request.actor, request.query)),
  });

  app.get('/listings/:id', {
    preHandler: anyone,
    schema: {
      tags: TAGS_VIEWER,
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
      summary: 'Tin đang hiển thị của người bán mà người xem được phép thấy',
      params: userListingParamsSchema,
      querystring: cursorQuerySchema,
      response: { 200: ok(cursorPaginated(listingSchema)), 400: errorResponse },
    },
    handler: async (request) =>
      toOk(await listing.profile(request.actor, request.params.id, request.query)),
  });

  // ── NHÓM ───────────────────────────────────────────────────────────────────────────────────────

  app.delete('/groups/:groupId/listing-badges/:listingId', {
    preHandler: user,
    schema: {
      tags: TAGS_GROUP,
      summary:
        'Nhóm gỡ huy hiệu của mình khỏi một tin — tin đó không gắn lại huy hiệu nhóm này được nữa',
      security: bearer,
      params: badgeParamsSchema,
      response: { 204: emptySchema, ...errors },
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
