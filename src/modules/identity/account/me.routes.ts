import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorOf } from '../../../common/auth/actor.js';
import type { RuntimeConfig } from '../../../common/config/runtime-config.js';
import { errorResponse, ok, toOk } from '../../../common/schemas/response.js';
import {
  avatarBodySchema,
  changePasswordBodySchema,
  emailChangeBodySchema,
  emailChangeConfirmBodySchema,
  emptySchema,
  idVerificationBodySchema,
  idVerificationSchema,
  meSchema,
  patchMeBodySchema,
  publicProfileSchema,
  sessionParamsSchema,
  sessionSchema,
  twoFactorConfirmBodySchema,
  twoFactorSetupSchema,
  userParamsSchema,
  pushTokenBodySchema,
} from '../identity.schema.js';
import { sensitiveRateLimit } from '../auth/auth.routes.js';
import type { IdentityService } from '../identity.service.js';

export interface IdentityMeRoutesOptions {
  identity: IdentityService;
  config: RuntimeConfig;
}

const TAGS_ME = ['Me'];
const TAGS_USERS = ['Users'];
const bearer = [{ bearerAuth: [] }];

/** Sau `authenticate` thì `actor` luôn có; hàm này chỉ để kiểu không phải `| null` ở từng handler. */

/** Hồ sơ công khai (ai cũng xem được) và route của người đã đăng nhập (`/me/*`, qua `authenticate`). */
export const identityMeRoutes: FastifyPluginAsyncZod<IdentityMeRoutesOptions> = async (
  app,
  { identity, config },
) => {
  const signedIn = [app.authenticate];
  // Ba route kiểm mật khẩu / mã: token lộ không được dò thoải mái (fix-audit-identity).
  const sensitive = sensitiveRateLimit(config);

  app.get('/users/:id', {
    schema: {
      tags: TAGS_USERS,
      summary: 'Hồ sơ công khai — không email, không số giấy tờ',
      params: userParamsSchema,
      response: { 200: ok(publicProfileSchema), 404: errorResponse },
    },
    handler: async (request) => toOk(await identity.getPublicProfile(request.params.id)),
  });

  app.get('/me', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Tài khoản của chính mình',
      security: bearer,
      response: { 200: ok(meSchema), 401: errorResponse },
    },
    handler: async (request) => toOk(await identity.getMe(actorOf(request))),
  });

  app.patch('/me', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Sửa tên hiển thị, thêm / xoá số điện thoại (không xác thực)',
      security: bearer,
      body: patchMeBodySchema,
      response: { 200: ok(meSchema), 400: errorResponse, 401: errorResponse },
    },
    handler: async (request) => toOk(await identity.updateMe(actorOf(request), request.body)),
  });

  app.put('/me/avatar', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary:
        'Đặt ảnh đại diện: ảnh đã tải vào kho cho hồ sơ của mình (`imageId`), hoặc ảnh Google (`source`)',
      security: bearer,
      body: avatarBodySchema,
      response: { 200: ok(meSchema), 400: errorResponse, 401: errorResponse },
    },
    handler: async (request) => toOk(await identity.setAvatar(actorOf(request), request.body)),
  });

  app.delete('/me/avatar', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Bỏ ảnh đại diện',
      security: bearer,
      response: { 200: ok(meSchema), 401: errorResponse },
    },
    handler: async (request) => toOk(await identity.clearAvatar(actorOf(request))),
  });

  app.post('/me/email-change', {
    preHandler: signedIn,
    config: sensitive,
    schema: {
      tags: TAGS_ME,
      summary:
        'Xin đổi email — đòi mật khẩu (+ mã lớp hai nếu đã bật); mã gửi tới email mới, email cũ vẫn là email đăng nhập',
      security: bearer,
      body: emailChangeBodySchema,
      response: {
        200: ok(emptySchema),
        400: errorResponse,
        401: errorResponse,
        409: errorResponse,
        429: errorResponse,
      },
    },
    handler: async (request) => {
      await identity.requestEmailChange(actorOf(request), request.body);
      return toOk(null);
    },
  });

  app.post('/me/email-change/confirm', {
    preHandler: signedIn,
    config: sensitive,
    schema: {
      tags: TAGS_ME,
      summary: 'Xác nhận email mới bằng mã — báo email cũ, thu hồi mọi phiên khác',
      security: bearer,
      body: emailChangeConfirmBodySchema,
      response: { 200: ok(emptySchema), 400: errorResponse, 409: errorResponse },
    },
    handler: async (request) => {
      await identity.confirmEmailChange(actorOf(request), request.body);
      return toOk(null);
    },
  });

  app.delete('/me', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Tự xoá tài khoản — thu hồi mọi phiên, hồ sơ công khai biến mất',
      security: bearer,
      response: { 204: emptySchema, 401: errorResponse, 409: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.deleteMyAccount(actorOf(request));
      return reply.status(204).send(null);
    },
  });

  app.post('/me/id-verification', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Nộp giấy tờ xác minh (tự nguyện, không ảnh hưởng gì)',
      security: bearer,
      body: idVerificationBodySchema,
      response: { 201: ok(idVerificationSchema), 401: errorResponse, 409: errorResponse },
    },
    handler: async (request, reply) =>
      reply
        .status(201)
        .send(toOk(await identity.submitIdVerification(actorOf(request), request.body))),
  });

  app.get('/me/sessions', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Thiết bị đang đăng nhập',
      security: bearer,
      response: { 200: ok(z.array(sessionSchema)), 401: errorResponse },
    },
    handler: async (request) => toOk(await identity.listSessions(actorOf(request))),
  });

  app.delete('/me/sessions', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Đăng xuất mọi thiết bị khác, giữ thiết bị này',
      security: bearer,
      response: { 204: emptySchema, 401: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.revokeOtherSessions(actorOf(request));
      return reply.status(204).send(null);
    },
  });

  app.delete('/me/sessions/:id', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Đăng xuất một thiết bị',
      security: bearer,
      params: sessionParamsSchema,
      response: { 204: emptySchema, 401: errorResponse, 404: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.revokeSession(actorOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  });

  app.put('/me/push-token', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary:
        'Cho phép hiện thông báo trên máy này: gắn token Expo Push vào phiên hiện tại — token đang ở phiên khác thì chuyển sang',
      security: bearer,
      body: pushTokenBodySchema,
      response: { 204: emptySchema, 400: errorResponse, 401: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.setPushToken(actorOf(request), request.body.token);
      return reply.status(204).send(null);
    },
  });

  app.delete('/me/push-token', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Thôi hiện thông báo trên máy này',
      security: bearer,
      response: { 204: emptySchema, 401: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.clearPushToken(actorOf(request));
      return reply.status(204).send(null);
    },
  });

  app.put('/me/password', {
    preHandler: signedIn,
    config: sensitive,
    schema: {
      tags: TAGS_ME,
      summary: 'Đổi mật khẩu — thu hồi mọi phiên khác',
      security: bearer,
      body: changePasswordBodySchema,
      response: { 204: emptySchema, 400: errorResponse, 401: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.changePassword(actorOf(request), request.body);
      return reply.status(204).send(null);
    },
  });

  app.post('/me/two-factor/setup', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Bắt đầu thiết lập lớp thứ hai — trả URI otpauth cho ứng dụng tạo mã',
      security: bearer,
      response: { 200: ok(twoFactorSetupSchema), 401: errorResponse, 403: errorResponse },
    },
    handler: async (request) => toOk(await identity.setupTwoFactor(actorOf(request))),
  });

  app.post('/me/two-factor/confirm', {
    preHandler: signedIn,
    schema: {
      tags: TAGS_ME,
      summary: 'Xác nhận lớp thứ hai bằng mã đầu tiên — phiên này được mở bàn vận hành ngay',
      security: bearer,
      body: twoFactorConfirmBodySchema,
      response: { 204: emptySchema, 400: errorResponse, 401: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.confirmTwoFactor(actorOf(request), request.body);
      return reply.status(204).send(null);
    },
  });
};
