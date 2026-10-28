import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../common/auth/actor.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import {
  createProductBodySchema,
  listingPromotionsSchema,
  opsProductSchema,
  productCodeParamsSchema,
  purchaseBodySchema,
  purchaseSchema,
  updateProductBodySchema,
} from './promotion.schema.js';
import type { PromotionService } from './promotion.service.js';

export interface PromotionRoutesOptions {
  promotion: PromotionService;
}

const TAGS_OWNER = ['Promotions · Người đăng'];
const TAGS_OPS = ['Ops · Promotions'];
const bearer = [{ bearerAuth: [] }];
const listingParamsSchema = z.object({ id: z.uuid() });
const ownerErrors = { 401: errorResponse, 403: errorResponse, 404: errorResponse };
const opsErrors = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
};

/** Gói đẩy tin trả Xu (change add-promotions): người đăng mua cho tin của mình; master soạn catalog. */
export const promotionRoutes: FastifyPluginAsyncZod<PromotionRoutesOptions> = async (
  app,
  { promotion },
) => {
  const user = [app.authenticate];
  const master = [app.authenticate, app.requireMaster];

  app.get('/listings/:id/promotions', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary:
        'Gói cho một tin của tôi: giá, thời hạn, mua được không và vì sao chưa; gói nổi bật đang chạy; số dư',
      security: bearer,
      params: listingParamsSchema,
      response: { 200: ok(listingPromotionsSchema), ...ownerErrors },
    },
    handler: async (request) =>
      toOk(await promotion.productsFor(actorOf(request), request.params.id)),
  });

  app.post('/listings/:id/promotions', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary:
        'Mua gói cho tin của tôi — trừ Xu và áp hiệu ứng trong một lượt; gửi lại cùng khoá trả cùng lượt',
      description: [
        'Tin không hiển thị đầy đủ → 409 `LISTING_NOT_PROMOTABLE`; chưa đủ mức → 409 `TRUST_TIER_TOO_LOW`; đang tạm khoá',
        'đăng tin → 409 `POSTING_LOCKED`; nhóm tắt gói → 409 `GROUP_PROMOTIONS_OFF`; thiếu Xu → 409',
        '`INSUFFICIENT_BALANCE` (tin không đổi); tin vừa sửa → 409 `CONFLICT` (không trừ); trong thời gian chờ → 429',
        '`PROMOTION_COOLDOWN`, quá trần ngày → 429 `PROMOTION_DAILY_LIMIT` — hai lỗi sau kèm `details.retryAt`.',
      ].join(' '),
      security: bearer,
      params: listingParamsSchema,
      body: purchaseBodySchema,
      response: {
        200: ok(purchaseSchema),
        400: errorResponse,
        ...ownerErrors,
        409: errorResponse,
        429: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await promotion.purchase(actorOf(request), request.params.id, request.body)),
  });

  app.get('/ops/promotions/products', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Mọi gói, kể cả đã tắt',
      security: bearer,
      response: { 200: ok(z.array(opsProductSchema)), 401: errorResponse, 403: errorResponse },
    },
    handler: async () => toOk(await promotion.opsProducts()),
  });

  app.post('/ops/promotions/products', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Tạo gói — mã không đổi được sau này; gói nổi bật bắt buộc có thời hạn',
      security: bearer,
      body: createProductBodySchema,
      response: { 201: ok(opsProductSchema), ...opsErrors, 409: errorResponse },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await promotion.createProduct(actorOf(request), request.body))),
  });

  app.patch('/ops/promotions/products/:code', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary:
        'Sửa gói (tên, mô tả, thời hạn, chờ, giá, mức, phạm vi, bật tắt, thứ tự) — lượt mua đã có giữ bản chụp cũ',
      security: bearer,
      params: productCodeParamsSchema,
      body: updateProductBodySchema,
      response: { 200: ok(opsProductSchema), ...opsErrors },
    },
    handler: async (request) =>
      toOk(await promotion.updateProduct(actorOf(request), request.params.code, request.body)),
  });
};
