import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { actorOf } from '../../../common/auth/actor.js';
import { deviceHeadersSchema } from '../../../common/schemas/device-headers.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import { emptySchema } from '../../identity/identity.schema.js';
import {
  createListingBodySchema,
  listingParamsSchema,
  moveListingBodySchema,
  ownListingSchema,
  patchListingBodySchema,
  renewListingBodySchema,
  submitListingBodySchema,
} from '../listing.schema.js';
import type { ListingRoutesOptions } from '../listing.routes.js';

const TAGS = ['Listings · Người đăng'];
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

/**
 * Người đăng ghi (design add-listings mục 17). Route chỉ đòi đăng nhập: master, email chưa xác nhận, thiếu `x-device-id`
 * là bước 3 của thứ tự kiểm trong service — chặn ở đây thì 404 và `INVALID_TRANSITION` không còn đứng trước.
 */
export const postingRoutes: FastifyPluginAsyncZod<ListingRoutesOptions> = async (
  app,
  { listing },
) => {
  const user = [app.authenticate];

  app.post('/listings', {
    preHandler: user,
    schema: {
      tags: TAGS,
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
      tags: TAGS,
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
      tags: TAGS,
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
      tags: TAGS,
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
      tags: TAGS,
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
      tags: TAGS,
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
      tags: TAGS,
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
      tags: TAGS,
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
};
