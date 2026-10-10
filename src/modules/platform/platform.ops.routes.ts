import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Actor } from '../../common/auth/actor.js';
import { paginated } from '../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { emptySchema } from '../identity/identity.schema.js';
import {
  accountIdParamsSchema,
  auditEntrySchema,
  auditQuerySchema,
  configChangeBodySchema,
  configVersionParamsSchema,
  configVersionSchema,
  staffGrantBodySchema,
  staffListQuerySchema,
  staffPermissionSchema,
} from './platform.schema.js';
import type { PlatformService } from './platform.service.js';

export interface PlatformOpsRoutesOptions {
  platform: PlatformService;
}

const TAGS_STAFF = ['Ops · Staff'];
const TAGS_CONFIG = ['Ops · Config'];
const TAGS_AUDIT = ['Ops · Audit'];
const bearer = [{ bearerAuth: [] }];

function actorOf(request: FastifyRequest): Actor {
  if (!request.actor) throw new Error('Route này phải có authenticate trong preHandler');
  return request.actor;
}

/** Toàn bộ bàn vận hành của `platform` là của master (TK 6): cấp quyền, bảng con số, nhật ký. */
export const platformOpsRoutes: FastifyPluginAsyncZod<PlatformOpsRoutesOptions> = async (
  app,
  { platform },
) => {
  const master = [app.authenticate, app.requireMaster];

  app.get('/ops/staff', {
    preHandler: master,
    schema: {
      tags: TAGS_STAFF,
      summary: 'Danh sách tài khoản mang quyền staff, lọc được theo danh mục',
      security: bearer,
      querystring: staffListQuerySchema,
      response: { 200: ok(z.array(staffPermissionSchema)), 403: errorResponse },
    },
    handler: async (request) => toOk(await platform.listStaff(request.query.categoryId)),
  });

  app.put('/ops/staff/:accountId', {
    preHandler: master,
    schema: {
      tags: TAGS_STAFF,
      summary: 'Gắn hoặc sửa quyền staff — gửi TRỌN phạm vi (danh mục + việc toàn hệ thống)',
      security: bearer,
      params: accountIdParamsSchema,
      body: staffGrantBodySchema,
      response: {
        200: ok(staffPermissionSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await platform.grantStaff(actorOf(request), request.params.accountId, request.body)),
  });

  app.delete('/ops/staff/:accountId', {
    preHandler: master,
    schema: {
      tags: TAGS_STAFF,
      summary: 'Thu toàn bộ quyền staff — có hiệu lực ngay',
      security: bearer,
      params: accountIdParamsSchema,
      response: { 204: emptySchema, 403: errorResponse, 404: errorResponse },
    },
    handler: async (request, reply) => {
      await platform.revokeStaff(actorOf(request), request.params.accountId);
      return reply.status(204).send(null);
    },
  });

  app.post('/ops/staff/:accountId/restore', {
    preHandler: master,
    schema: {
      tags: TAGS_STAFF,
      summary: 'Trả lại quyền đang treo, đúng phạm vi lúc treo',
      security: bearer,
      params: accountIdParamsSchema,
      response: {
        200: ok(staffPermissionSchema),
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await platform.restoreStaff(actorOf(request), request.params.accountId)),
  });

  app.get('/ops/config', {
    preHandler: master,
    schema: {
      tags: TAGS_CONFIG,
      summary: 'Phiên bản hiện hành của bảng con số',
      security: bearer,
      response: { 200: ok(configVersionSchema), 403: errorResponse },
    },
    handler: async () => toOk(await platform.getCurrentConfig()),
  });

  app.get('/ops/config/versions/:version', {
    preHandler: master,
    schema: {
      tags: TAGS_CONFIG,
      summary: 'Tra một phiên bản cũ',
      security: bearer,
      params: configVersionParamsSchema,
      response: { 200: ok(configVersionSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) => toOk(await platform.getConfigVersion(request.params.version)),
  });

  app.post('/ops/config', {
    preHandler: master,
    schema: {
      tags: TAGS_CONFIG,
      summary:
        'Đổi con số: tạo phiên bản mới từ phiên bản đang sửa (409 nếu đã có người sửa trước)',
      security: bearer,
      body: configChangeBodySchema,
      response: {
        201: ok(configVersionSchema),
        400: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await platform.changeConfig(actorOf(request), request.body))),
  });

  app.get('/ops/audit', {
    preHandler: master,
    schema: {
      tags: TAGS_AUDIT,
      summary: 'Tra nhật ký theo người làm, đối tượng, khoảng thời gian',
      security: bearer,
      querystring: auditQuerySchema,
      response: { 200: ok(paginated(auditEntrySchema)), 403: errorResponse },
    },
    handler: async (request) => toOk(await platform.queryAudit(request.query)),
  });
};
