import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../common/auth/actor.js';
import {
  paginated,
  paginationQuerySchema,
  toPage,
  toSkipTake,
} from '../../common/schemas/pagination.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import { emptySchema } from '../identity/identity.schema.js';
import {
  announcementSchema,
  badgeSchema,
  groupIdParamsSchema,
  groupSearchQuerySchema,
  groupSummarySchema,
  groupViewSchema,
  idParamsSchema,
  joinBodySchema,
  joinResultSchema,
  lookupCodeBodySchema,
  myGroupSchema,
  myInvitationsSchema,
  ownerOfferSchema,
} from './group.schema.js';
import type { GroupService } from './group.service.js';

export interface GroupRoutesOptions {
  group: GroupService;
}

const TAGS = ['Groups'];
const TAGS_ME = ['Groups · Của tôi'];
const bearer = [{ bearerAuth: [] }];
/** Không token vẫn xem được; có token thì thành viên thấy đủ hồ sơ nhóm riêng tư. */
const optionalBearer = [{}, ...bearer];
const errors = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
  409: errorResponse,
};

/** Mặt người dùng của nhóm: tìm, xem, vào, rời, lời mời, lời giao chủ (TK 9, 10). */
export const groupRoutes: FastifyPluginAsyncZod<GroupRoutesOptions> = async (app, { group }) => {
  const user = [app.authenticate, app.requireVerifiedEmail];

  app.get('/groups', {
    schema: {
      tags: TAGS,
      summary: 'Tìm nhóm công khai theo tên, không phân biệt dấu',
      querystring: groupSearchQuerySchema,
      response: { 200: ok(paginated(groupSummarySchema)), 400: errorResponse },
    },
    handler: async (request) => {
      const { items, total } = await group.search(request.query.q, toSkipTake(request.query));
      return toOk(toPage(items, total, request.query));
    },
  });

  app.get('/groups/:groupId', {
    preHandler: [app.authenticateOptional],
    schema: {
      tags: TAGS,
      summary: 'Hồ sơ nhóm — người ngoài nhóm riêng tư chỉ thấy tên nhóm',
      security: optionalBearer,
      params: groupIdParamsSchema,
      response: {
        200: ok(groupViewSchema),
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    handler: async (request) => toOk(await group.view(request.actor, request.params.groupId)),
  });

  app.post('/groups/lookup-code', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Tìm nhóm riêng tư bằng mã nhóm',
      security: bearer,
      body: lookupCodeBodySchema,
      response: { 200: ok(groupSummarySchema), ...errors },
    },
    handler: async (request) => toOk(await group.lookupCode(actorOf(request), request.body.code)),
  });

  app.post('/groups/:groupId/join', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary:
        'Vào nhóm: vào ngay (mở cửa, lời mời, danh sách lớp) hoặc gửi đơn (xét duyệt, có mã)',
      security: bearer,
      params: groupIdParamsSchema,
      body: joinBodySchema,
      response: { 201: ok(joinResultSchema), ...errors, 429: errorResponse },
    },
    handler: async (request, reply) => {
      const result = await group.join(actorOf(request), request.params.groupId, request.body.code);
      return reply.status(201).send(toOk(result));
    },
  });

  app.delete('/groups/:groupId/join-request', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Rút đơn đang chờ của mình',
      security: bearer,
      params: groupIdParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.withdrawRequest(actorOf(request), request.params.groupId);
      return reply.status(204).send(null);
    },
  });

  app.post('/groups/:groupId/leave', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Rời nhóm — chủ nhóm phải chuyển chủ trước',
      security: bearer,
      params: groupIdParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.leave(actorOf(request), request.params.groupId);
      return reply.status(204).send(null);
    },
  });

  app.get('/groups/:groupId/announcements', {
    preHandler: user,
    schema: {
      tags: TAGS,
      summary: 'Thông báo của nhóm gửi tới mình (cả nhóm và đơn vị của mình), mới nhất trước',
      security: bearer,
      params: groupIdParamsSchema,
      querystring: paginationQuerySchema,
      response: { 200: ok(paginated(announcementSchema)), ...errors },
    },
    handler: async (request) => {
      const { items, total } = await group.listAnnouncements(
        actorOf(request),
        request.params.groupId,
        toSkipTake(request.query),
      );
      return toOk(toPage(items, total, request.query));
    },
  });

  // ── CỦA TÔI ──────────────────────────────────────────────────────────────────────────────────

  app.get('/me/groups', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Nhóm mình đang ở, kèm vai và quyền mang huy hiệu',
      security: bearer,
      response: { 200: ok(z.array(myGroupSchema)), 401: errorResponse, 403: errorResponse },
    },
    handler: async (request) => toOk(await group.myGroups(actorOf(request))),
  });

  app.get('/me/group-badges', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Nhóm mình đang có quyền mang huy hiệu trên tin sàn',
      security: bearer,
      response: { 200: ok(z.array(badgeSchema)), 401: errorResponse, 403: errorResponse },
    },
    handler: async (request) => toOk(await group.myBadges(actorOf(request))),
  });

  app.get('/me/group-invitations', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Lời mời còn hạn và nhóm có tên mình trong danh sách lớp',
      security: bearer,
      response: { 200: ok(myInvitationsSchema), 401: errorResponse, 403: errorResponse },
    },
    handler: async (request) => toOk(await group.myInvitations(actorOf(request))),
  });

  app.get('/me/group-owner-offers', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Lời giao chủ nhóm, lời chuyển chủ đang chờ mình trả lời',
      security: bearer,
      response: { 200: ok(z.array(ownerOfferSchema)), 401: errorResponse, 403: errorResponse },
    },
    handler: async (request) => toOk(await group.myOwnerOffers(actorOf(request))),
  });

  app.post('/group-invitations/:id/accept', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Nhận lời mời vào nhóm',
      security: bearer,
      params: idParamsSchema,
      response: { 200: ok(myGroupSchema), ...errors },
    },
    handler: async (request) =>
      toOk(await group.acceptInvitation(actorOf(request), request.params.id)),
  });

  app.post('/group-invitations/:id/decline', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Từ chối lời mời vào nhóm',
      security: bearer,
      params: idParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.declineInvitation(actorOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  });

  app.post('/group-owner-offers/:id/accept', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Nhận làm chủ nhóm',
      security: bearer,
      params: idParamsSchema,
      response: { 200: ok(myGroupSchema), ...errors },
    },
    handler: async (request) =>
      toOk(await group.acceptOwnerOffer(actorOf(request), request.params.id)),
  });

  app.post('/group-owner-offers/:id/decline', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Từ chối làm chủ nhóm',
      security: bearer,
      params: idParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.declineOwnerOffer(actorOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  });
};
