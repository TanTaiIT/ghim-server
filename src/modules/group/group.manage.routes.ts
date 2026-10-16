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
  accountTargetBodySchema,
  announcementBodySchema,
  announcementSchema,
  bannedMemberSchema,
  decideBodySchema,
  groupIdParamsSchema,
  groupMemberParamsSchema,
  groupProfileSchema,
  groupSettingsBodySchema,
  groupUnitParamsSchema,
  idParamsSchema,
  inviteBodySchema,
  joinRequestSchema,
  memberSchema,
  memberUnitBodySchema,
  membersQuerySchema,
  moderatorBodySchema,
  ownerOfferSchema,
  pendingInvitationSchema,
  rosterBodySchema,
  rosterRemoveBodySchema,
  rosterResultSchema,
  unitBodySchema,
  unitSchema,
} from './group.schema.js';
import type { GroupService } from './group.service.js';

export interface GroupManageRoutesOptions {
  group: GroupService;
}

const TAGS_MANAGE = ['Groups · Quản trị'];
const TAGS_OWNER = ['Groups · Chủ nhóm'];
const bearer = [{ bearerAuth: [] }];
const errors = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
  409: errorResponse,
};
const invitationParamsSchema = z.object({ groupId: z.uuid(), invitationId: z.uuid() });

/**
 * Việc của quản trị nhóm (chủ nhóm, điều hành viên) và quyền riêng của chủ nhóm. Master dùng chung các route này
 * khi làm thay chủ nhóm; service kiểm vai trong nhóm, route chỉ đòi đăng nhập.
 */
export const groupManageRoutes: FastifyPluginAsyncZod<GroupManageRoutesOptions> = async (
  app,
  { group },
) => {
  const user = [app.authenticate, app.requireVerifiedEmail];

  // ── THÀNH VIÊN ───────────────────────────────────────────────────────────────────────────────

  app.get('/groups/:groupId/members', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Danh sách thành viên — chỉ chủ nhóm, điều hành viên, master',
      security: bearer,
      params: groupIdParamsSchema,
      querystring: membersQuerySchema,
      response: { 200: ok(paginated(memberSchema)), ...errors },
    },
    handler: async (request) => {
      const { unitId } = request.query;
      const { items, total } = await group.listMembers(actorOf(request), request.params.groupId, {
        ...(unitId ? { unitId } : {}),
        ...toSkipTake(request.query),
      });
      return toOk(toPage(items, total, request.query));
    },
  });

  app.patch('/groups/:groupId/members/:accountId', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Xếp thành viên vào đơn vị con (null = bỏ khỏi đơn vị)',
      security: bearer,
      params: groupMemberParamsSchema,
      body: memberUnitBodySchema,
      response: { 200: ok(memberSchema), ...errors },
    },
    handler: async (request) =>
      toOk(
        await group.setMemberUnit(
          actorOf(request),
          request.params.groupId,
          request.params.accountId,
          request.body.unitId,
        ),
      ),
  });

  app.delete('/groups/:groupId/members/:accountId', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Gỡ thành viên — người bị gỡ vào lại như người mới',
      security: bearer,
      params: groupMemberParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.removeMember(actorOf(request), request.params.groupId, request.params.accountId);
      return reply.status(204).send(null);
    },
  });

  app.put('/groups/:groupId/bans/:accountId', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Cấm một người khỏi nhóm (kể cả người chưa từng vào) — chỉ có tác dụng trong nhóm',
      security: bearer,
      params: groupMemberParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.ban(actorOf(request), request.params.groupId, request.params.accountId);
      return reply.status(204).send(null);
    },
  });

  app.get('/groups/:groupId/bans', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Người đang bị cấm khỏi nhóm, mới cấm trước — để gỡ cấm',
      security: bearer,
      params: groupIdParamsSchema,
      querystring: paginationQuerySchema,
      response: { 200: ok(paginated(bannedMemberSchema)), ...errors },
    },
    handler: async (request) => {
      const { items, total } = await group.listBans(
        actorOf(request),
        request.params.groupId,
        toSkipTake(request.query),
      );
      return toOk(toPage(items, total, request.query));
    },
  });

  app.delete('/groups/:groupId/bans/:accountId', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Gỡ cấm',
      security: bearer,
      params: groupMemberParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.unban(actorOf(request), request.params.groupId, request.params.accountId);
      return reply.status(204).send(null);
    },
  });

  // ── ĐƠN, LỜI MỜI, DANH SÁCH LỚP ──────────────────────────────────────────────────────────────

  app.get('/groups/:groupId/join-requests', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Đơn xin vào đang chờ, cũ nhất trước',
      security: bearer,
      params: groupIdParamsSchema,
      querystring: paginationQuerySchema,
      response: { 200: ok(paginated(joinRequestSchema)), ...errors },
    },
    handler: async (request) => {
      const { items, total } = await group.listJoinRequests(
        actorOf(request),
        request.params.groupId,
        toSkipTake(request.query),
      );
      return toOk(toPage(items, total, request.query));
    },
  });

  app.post('/group-join-requests/:id/decision', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Duyệt hoặc từ chối một đơn',
      security: bearer,
      params: idParamsSchema,
      body: decideBodySchema,
      response: { 200: ok(joinRequestSchema), ...errors },
    },
    handler: async (request) =>
      toOk(
        await group.decideJoinRequest(actorOf(request), request.params.id, request.body.approve),
      ),
  });

  app.post('/groups/:groupId/invitations', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Mời bằng email — trả lời giống hệt dù email có tài khoản hay không',
      security: bearer,
      params: groupIdParamsSchema,
      body: inviteBodySchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.invite(
        actorOf(request),
        request.params.groupId,
        request.body.email,
        request.body.unitId,
      );
      return reply.status(204).send(null);
    },
  });

  app.get('/groups/:groupId/invitations', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary:
        'Lời mời đang chờ, mới trước — email đã che, như nhau dù email có tài khoản hay không; điều hành viên đơn vị chỉ thấy đơn vị mình',
      security: bearer,
      params: groupIdParamsSchema,
      querystring: paginationQuerySchema,
      response: { 200: ok(paginated(pendingInvitationSchema)), ...errors },
    },
    handler: async (request) => {
      const { items, total } = await group.listInvitations(
        actorOf(request),
        request.params.groupId,
        toSkipTake(request.query),
      );
      return toOk(toPage(items, total, request.query));
    },
  });

  app.delete('/groups/:groupId/invitations/:invitationId', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Thu hồi lời mời đang chờ',
      security: bearer,
      params: invitationParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.revokeInvitation(
        actorOf(request),
        request.params.groupId,
        request.params.invitationId,
      );
      return reply.status(204).send(null);
    },
  });

  app.post('/groups/:groupId/roster', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary:
        'Nạp thêm email vào danh sách lớp (chỉ lưu dấu băm) — trả số dòng mới, không nói email nào khớp',
      security: bearer,
      params: groupIdParamsSchema,
      body: rosterBodySchema,
      response: { 200: ok(rosterResultSchema), ...errors },
    },
    handler: async (request) =>
      toOk(await group.addRoster(actorOf(request), request.params.groupId, request.body.entries)),
  });

  app.post('/groups/:groupId/roster/remove', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Bỏ một email khỏi danh sách lớp',
      security: bearer,
      params: groupIdParamsSchema,
      body: rosterRemoveBodySchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.removeRosterEntry(actorOf(request), request.params.groupId, request.body.email);
      return reply.status(204).send(null);
    },
  });

  app.post('/groups/:groupId/announcements', {
    preHandler: user,
    schema: {
      tags: TAGS_MANAGE,
      summary: 'Gửi thông báo cho cả nhóm, hay cho đơn vị mình phụ trách',
      security: bearer,
      params: groupIdParamsSchema,
      body: announcementBodySchema,
      response: { 201: ok(announcementSchema), ...errors, 429: errorResponse },
    },
    handler: async (request, reply) => {
      const announcement = await group.postAnnouncement(
        actorOf(request),
        request.params.groupId,
        request.body,
      );
      return reply.status(201).send(toOk(announcement));
    },
  });

  // ── CHỦ NHÓM ─────────────────────────────────────────────────────────────────────────────────

  app.patch('/groups/:groupId/settings', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Đổi tên, mô tả, chế độ, nhận tin người ngoài, hiện tên trên tin sàn, kiểu bảng tin',
      security: bearer,
      params: groupIdParamsSchema,
      body: groupSettingsBodySchema,
      response: { 200: ok(groupProfileSchema), ...errors },
    },
    handler: async (request) =>
      toOk(await group.updateSettings(actorOf(request), request.params.groupId, request.body)),
  });

  app.post('/groups/:groupId/code', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Đổi mã nhóm khi bị lộ — mã cũ hết hiệu lực ngay',
      security: bearer,
      params: groupIdParamsSchema,
      response: { 200: ok(z.object({ code: z.string() })), ...errors },
    },
    handler: async (request) =>
      toOk(await group.rotateCode(actorOf(request), request.params.groupId)),
  });

  app.post('/groups/:groupId/units', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Lập đơn vị con (lớp, phòng ban) — chỉ nhóm trường học, công ty',
      security: bearer,
      params: groupIdParamsSchema,
      body: unitBodySchema,
      response: { 201: ok(unitSchema), ...errors },
    },
    handler: async (request, reply) => {
      const unit = await group.createUnit(
        actorOf(request),
        request.params.groupId,
        request.body.name,
      );
      return reply.status(201).send(toOk(unit));
    },
  });

  app.patch('/groups/:groupId/units/:unitId', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Đổi tên đơn vị con',
      security: bearer,
      params: groupUnitParamsSchema,
      body: unitBodySchema,
      response: { 200: ok(unitSchema), ...errors },
    },
    handler: async (request) =>
      toOk(
        await group.renameUnit(
          actorOf(request),
          request.params.groupId,
          request.params.unitId,
          request.body.name,
        ),
      ),
  });

  app.delete('/groups/:groupId/units/:unitId', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Xoá đơn vị con trống',
      security: bearer,
      params: groupUnitParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.deleteUnit(actorOf(request), request.params.groupId, request.params.unitId);
      return reply.status(204).send(null);
    },
  });

  app.put('/groups/:groupId/moderators/:accountId', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Bổ nhiệm hoặc đổi phạm vi điều hành viên (unitId null = cả nhóm)',
      security: bearer,
      params: groupMemberParamsSchema,
      body: moderatorBodySchema,
      response: { 200: ok(memberSchema), ...errors },
    },
    handler: async (request) =>
      toOk(
        await group.setModerator(
          actorOf(request),
          request.params.groupId,
          request.params.accountId,
          request.body.unitId,
        ),
      ),
  });

  app.delete('/groups/:groupId/moderators/:accountId', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Bãi nhiệm điều hành viên — người đó vẫn là thành viên',
      security: bearer,
      params: groupMemberParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.dismissModerator(
        actorOf(request),
        request.params.groupId,
        request.params.accountId,
      );
      return reply.status(204).send(null);
    },
  });

  app.post('/groups/:groupId/owner-transfer', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Chuyển quyền chủ nhóm cho một thành viên — người nhận đồng ý trong 14 ngày',
      security: bearer,
      params: groupIdParamsSchema,
      body: accountTargetBodySchema,
      response: { 201: ok(ownerOfferSchema), ...errors },
    },
    handler: async (request, reply) => {
      const offer = await group.transferOwnership(
        actorOf(request),
        request.params.groupId,
        request.body.accountId,
      );
      return reply.status(201).send(toOk(offer));
    },
  });

  app.delete('/groups/:groupId/owner-transfer', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Huỷ lời chuyển chủ đang chờ',
      security: bearer,
      params: groupIdParamsSchema,
      response: { 204: emptySchema, ...errors },
    },
    handler: async (request, reply) => {
      await group.cancelOwnerOffer(actorOf(request), request.params.groupId);
      return reply.status(204).send(null);
    },
  });

  app.post('/groups/:groupId/close', {
    preHandler: user,
    schema: {
      tags: TAGS_OWNER,
      summary: 'Đóng nhóm — vĩnh viễn',
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
