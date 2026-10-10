import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Actor } from '../../common/auth/actor.js';
import { paginated, paginationQuerySchema } from '../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import {
  accountParamsSchema,
  clearFlagBodySchema,
  disposableDomainBodySchema,
  disposableDomainParamsSchema,
  disposableDomainSchema,
  emptySchema,
  flagSchema,
  idVerificationDecisionBodySchema,
  idVerificationListQuerySchema,
  idVerificationParamsSchema,
  idVerificationSchema,
  lockBodySchema,
  lookupCodeParamsSchema,
} from './identity.schema.js';
import type { IdentityService } from './identity.service.js';

export interface IdentityOpsRoutesOptions {
  identity: IdentityService;
}

const TAGS_ACCOUNTS = ['Ops · Accounts'];
const TAGS_FLAGS = ['Ops · Flags'];
const TAGS_DOMAINS = ['Ops · Disposable domains'];
const TAGS_ID = ['Ops · ID verification'];
const bearer = [{ bearerAuth: [] }];

function actorOf(request: FastifyRequest): Actor {
  if (!request.actor) throw new Error('Route này phải có authenticate trong preHandler');
  return request.actor;
}

/** Bàn vận hành: mọi route qua `authenticate` rồi `requireMaster` / `requireOps(scope)`. */
export const identityOpsRoutes: FastifyPluginAsyncZod<IdentityOpsRoutesOptions> = async (
  app,
  { identity },
) => {
  const master = [app.authenticate, app.requireMaster];
  const support = [app.authenticate, app.requireOps('support')];
  const idReviewer = [app.authenticate, app.requireOps('id_verification')];

  // ── TÀI KHOẢN ─────────────────────────────────────────────────────────────────────────────────

  app.post('/ops/accounts/:id/lock', {
    preHandler: master,
    schema: {
      tags: TAGS_ACCOUNTS,
      summary: 'Khoá tài khoản kèm lý do — thu hồi mọi phiên ngay',
      security: bearer,
      params: accountParamsSchema,
      body: lockBodySchema,
      response: { 204: emptySchema, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.lockAccount(actorOf(request), request.params.id, request.body.reason);
      return reply.status(204).send(null);
    },
  });

  app.post('/ops/accounts/:id/unlock', {
    preHandler: master,
    schema: {
      tags: TAGS_ACCOUNTS,
      summary: 'Mở khoá — đóng luôn đánh dấu "dùng máy của tài khoản bị khoá" liên quan',
      security: bearer,
      params: accountParamsSchema,
      response: { 204: emptySchema, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.unlockAccount(actorOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  });

  // ── ĐÁNH DẤU THIẾT BỊ ─────────────────────────────────────────────────────────────────────────

  app.get('/ops/flags/:lookupCode', {
    preHandler: support,
    schema: {
      tags: TAGS_FLAGS,
      summary:
        'Tra mã tra cứu người dùng gửi kèm yêu cầu hỗ trợ — thấy loại đánh dấu, không thấy mã thiết bị',
      security: bearer,
      params: lookupCodeParamsSchema,
      response: { 200: ok(flagSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) => toOk(await identity.getFlag(request.params.lookupCode)),
  });

  app.post('/ops/flags/:lookupCode/clear', {
    preHandler: support,
    schema: {
      tags: TAGS_FLAGS,
      summary:
        'Gỡ đánh dấu kèm lý do (vd máy mua lại) — lượt gửi tin sau không bị đánh dấu lại vì chủ cũ',
      security: bearer,
      params: lookupCodeParamsSchema,
      body: clearFlagBodySchema,
      response: { 204: emptySchema, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.clearFlag(actorOf(request), request.params.lookupCode, request.body.reason);
      return reply.status(204).send(null);
    },
  });

  // ── MIỀN DÙNG MỘT LẦN ─────────────────────────────────────────────────────────────────────────

  app.get('/ops/disposable-domains', {
    preHandler: master,
    schema: {
      tags: TAGS_DOMAINS,
      summary: 'Danh sách miền email dùng một lần (kể cả miền đã bỏ)',
      security: bearer,
      querystring: paginationQuerySchema,
      response: { 200: ok(paginated(disposableDomainSchema)), 403: errorResponse },
    },
    handler: async (request) => toOk(await identity.listDisposableDomains(request.query)),
  });

  app.post('/ops/disposable-domains', {
    preHandler: master,
    schema: {
      tags: TAGS_DOMAINS,
      summary: 'Thêm một miền vào danh sách chặn',
      security: bearer,
      body: disposableDomainBodySchema,
      response: { 201: ok(disposableDomainSchema), 403: errorResponse },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await identity.addDisposableDomain(request.body.domain))),
  });

  app.delete('/ops/disposable-domains/:domain', {
    preHandler: master,
    schema: {
      tags: TAGS_DOMAINS,
      summary: 'Bỏ một miền khỏi danh sách chặn (giữ bia mộ để cập nhật tự động không thêm lại)',
      security: bearer,
      params: disposableDomainParamsSchema,
      response: { 200: ok(emptySchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) => {
      await identity.removeDisposableDomain(request.params.domain, actorOf(request).accountId);
      return toOk(null);
    },
  });

  // ── XÁC MINH GIẤY TỜ ──────────────────────────────────────────────────────────────────────────

  app.get('/ops/id-verifications', {
    preHandler: idReviewer,
    schema: {
      tags: TAGS_ID,
      summary: 'Hàng chờ xác minh giấy tờ (mặc định mọi trạng thái, lọc bằng ?status=)',
      security: bearer,
      querystring: idVerificationListQuerySchema,
      response: { 200: ok(paginated(idVerificationSchema)), 403: errorResponse },
    },
    handler: async (request) => toOk(await identity.listIdVerifications(request.query)),
  });

  app.post('/ops/id-verifications/:id/decision', {
    preHandler: idReviewer,
    schema: {
      tags: TAGS_ID,
      summary: 'Duyệt hoặc từ chối (từ chối phải kèm lý do)',
      security: bearer,
      params: idVerificationParamsSchema,
      body: idVerificationDecisionBodySchema,
      response: {
        200: ok(idVerificationSchema),
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await identity.decideIdVerification(actorOf(request), request.params.id, request.body)),
  });
};
