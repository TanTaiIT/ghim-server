import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../common/auth/actor.js';
import { paginated, toPage, toSkipTake } from '../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { emptySchema } from '../identity/identity.schema.js';
import {
  accountTargetBodySchema,
  createGroupBodySchema,
  groupIdParamsSchema,
  groupProfileSchema,
  groupSummarySchema,
  lockBodySchema,
  opsGroupListQuerySchema,
  ownerOfferSchema,
} from './group.schema.js';
import type { GroupService } from './group.service.js';

export interface GroupOpsRoutesOptions {
  group: GroupService;
}

const TAGS = ['Ops · Groups'];
const bearer = [{ bearerAuth: [] }];
const errors = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
  409: errorResponse,
};

const opsGroupSchema = groupProfileSchema.extend({
  ownerId: z.uuid().nullable(),
  nomineeId: z.uuid().nullable(),
  ownerlessSince: z.iso.datetime().nullable(),
});

/** Việc chỉ master làm với nhóm (TK 6): lập, giao chủ (kể cả xác nhận chủ mới khi thiếu chủ), khoá, mở khoá. */
export const groupOpsRoutes: FastifyPluginAsyncZod<GroupOpsRoutesOptions> = async (
  app,
  { group },
) => {
  const master = [app.authenticate, app.requireMaster];

  app.post('/ops/groups', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Lập nhóm — nhóm chờ giao chủ tới khi có người nhận làm chủ',
      security: bearer,
      body: createGroupBodySchema,
      response: { 201: ok(groupSummarySchema), ...errors },
    },
    handler: async (request, reply) => {
      const created = await group.create(actorOf(request), request.body);
      return reply.status(201).send(toOk(created));
    },
  });

  app.get('/ops/groups', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Danh sách nhóm, lọc theo trạng thái (vd thiếu chủ)',
      security: bearer,
      querystring: opsGroupListQuerySchema,
      response: { 200: ok(paginated(groupSummarySchema)), ...errors },
    },
    handler: async (request) => {
      const { state } = request.query;
      const { items, total } = await group.listForOps({
        ...(state ? { state } : {}),
        ...toSkipTake(request.query),
      });
      return toOk(toPage(items, total, request.query));
    },
  });

  app.get('/ops/groups/:groupId', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Hồ sơ nhóm cho master, kèm chủ nhóm, người được đề cử và lúc bắt đầu thiếu chủ',
      security: bearer,
      params: groupIdParamsSchema,
      response: { 200: ok(opsGroupSchema), ...errors },
    },
    handler: async (request) => toOk(await group.getForOps(request.params.groupId)),
  });

  app.post('/ops/groups/:groupId/owner-offers', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary:
        'Giao chủ nhóm — lần đầu, nhóm thiếu chủ, hay giao đè; người nhận đồng ý trong 14 ngày',
      security: bearer,
      params: groupIdParamsSchema,
      body: accountTargetBodySchema,
      response: { 201: ok(ownerOfferSchema), ...errors },
    },
    handler: async (request, reply) => {
      const offer = await group.offerOwner(
        actorOf(request),
        request.params.groupId,
        request.body.accountId,
      );
      return reply.status(201).send(toOk(offer));
    },
  });

  app.post('/ops/groups/:groupId/lock', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Tạm khoá nhóm kèm lý do',
      security: bearer,
      params: groupIdParamsSchema,
      body: lockBodySchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.lock(actorOf(request), request.params.groupId, request.body.reason);
      return reply.status(204).send(null);
    },
  });

  app.post('/ops/groups/:groupId/unlock', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Mở khoá nhóm — cần chủ nhóm dùng được',
      security: bearer,
      params: groupIdParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.unlock(actorOf(request), request.params.groupId);
      return reply.status(204).send(null);
    },
  });

  app.post('/ops/groups/:groupId/close', {
    preHandler: master,
    schema: {
      tags: TAGS,
      summary: 'Đóng nhóm, kể cả nhóm chưa có chủ — vĩnh viễn',
      security: bearer,
      params: groupIdParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.close(actorOf(request), request.params.groupId);
      return reply.status(204).send(null);
    },
  });
};
