import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import {
  type CLIENTS,
  DEFAULT_DEVICE_NAME,
  DEVICE_NAME_MAX,
  deletionRequestBodySchema,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  emptySchema,
  forgotPasswordBodySchema,
  googleBodySchema,
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
  registeredSchema,
  resendCodeBodySchema,
  resetPasswordBodySchema,
  tokensSchema,
  verifyEmailBodySchema,
} from './identity.schema.js';
import type { IdentityService, SessionOpened } from './identity.service.js';

export interface IdentityAuthRoutesOptions {
  identity: IdentityService;
  config: RuntimeConfig;
}

type Client = (typeof CLIENTS)[number];

const TAGS = ['Auth'];
const SECONDS_PER_DAY = 86_400;

/** Tên thiết bị cho danh sách phiên: app gửi lên thì dùng, không thì rút từ user-agent, không nữa thì tên chung. */
function deviceNameOf(request: FastifyRequest, explicit: string | undefined): string {
  if (explicit) return explicit;
  const userAgent = request.headers['user-agent'];
  return userAgent ? userAgent.slice(0, DEVICE_NAME_MAX) : DEFAULT_DEVICE_NAME;
}

/** Route khách: không guard. Mọi route ở đây là cửa cho kẻ dò, nên có rate limit riêng. */
export const identityAuthRoutes: FastifyPluginAsyncZod<IdentityAuthRoutesOptions> = async (
  app,
  { identity, config },
) => {
  // Ba con số dưới đây đọc ở mỗi lượt, không lúc đăng ký route: chúng nằm trong bảng con số có
  // phiên bản, master đổi thì có hiệu lực ngay (spec config-versions, rà soát 10/10/2026).
  const sensitive = {
    rateLimit: { max: () => config.get('identity.authRateLimitPerMinute'), timeWindow: '1 minute' },
  };

  /**
   * Access token ký ở đây chứ không trong service: service không biết Fastify. Web nhận refresh
   * token qua cookie httpOnly để JavaScript của trang không đọc được; app giữ trong kho an toàn.
   */
  const issueTokens = (reply: FastifyReply, opened: SessionOpened, client: Client) => {
    const { token: accessToken, expiresInSeconds } = app.signAccessToken(opened.sessionId);
    if (client === 'web') {
      void reply.setCookie(REFRESH_COOKIE, opened.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: REFRESH_COOKIE_PATH,
        maxAge: config.get('identity.sessionIdleDays') * SECONDS_PER_DAY,
      });
      return toOk({ accessToken, refreshToken: null, expiresIn: expiresInSeconds });
    }
    return toOk({ accessToken, refreshToken: opened.refreshToken, expiresIn: expiresInSeconds });
  };

  app.post('/auth/register', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Đăng ký bằng email và mật khẩu',
      body: registerBodySchema,
      response: { 201: ok(registeredSchema), 400: errorResponse, 409: errorResponse },
    },
    handler: async (request, reply) =>
      reply.status(201).send(toOk(await identity.register(request.body))),
  });

  app.post('/auth/verify-email', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Xác nhận email bằng mã',
      body: verifyEmailBodySchema,
      response: { 200: ok(emptySchema), 400: errorResponse },
    },
    handler: async (request) => {
      await identity.verifyEmail(request.body);
      return toOk(null);
    },
  });

  app.post('/auth/resend-code', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Gửi lại mã xác nhận email',
      body: resendCodeBodySchema,
      response: { 200: ok(emptySchema), 429: errorResponse },
    },
    handler: async (request) => {
      await identity.resendCode(request.body);
      return toOk(null);
    },
  });

  app.post('/auth/login', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Đăng nhập bằng email và mật khẩu (master, staff kèm mã lớp thứ hai)',
      body: loginBodySchema,
      response: { 200: ok(tokensSchema), 401: errorResponse, 403: errorResponse },
    },
    handler: async (request, reply) => {
      const { email, password, totpCode, deviceName, client } = request.body;
      const opened = await identity.login({
        email,
        password,
        totpCode,
        deviceName: deviceNameOf(request, deviceName),
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return issueTokens(reply, opened, client);
    },
  });

  app.post('/auth/google', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Đăng ký hoặc đăng nhập bằng ID token Google',
      body: googleBodySchema,
      response: {
        200: ok(tokensSchema),
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) => {
      const { idToken, deviceName, client } = request.body;
      const opened = await identity.loginWithGoogle({
        idToken,
        deviceName: deviceNameOf(request, deviceName),
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return issueTokens(reply, opened, client);
    },
  });

  app.post('/auth/refresh', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Xoay refresh token, lấy access token mới (body cho app, cookie cho web)',
      description: [
        'Mỗi lượt cấp refresh token mới; token cũ gửi lại sau đó bị coi là bị lộ và thu hồi cả phiên.',
        'App: gom mọi lượt làm mới thành MỘT (dùng chung một promise). Nhận 409 REFRESH_CONFLICT nghĩa là',
        'một lượt khác vừa làm mới trước — chờ và dùng kết quả của lượt đó, KHÔNG gửi lại token cũ.',
        'Web (cookie): lượt thắng đã đặt cookie mới cho mọi tab; tab nhận 409 gửi lại một lần là được.',
      ].join(' '),
      body: refreshBodySchema,
      response: {
        200: ok(tokensSchema),
        401: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request, reply) => {
      const fromCookie = request.cookies[REFRESH_COOKIE];
      const token = request.body.refreshToken ?? fromCookie;
      if (!token) throw new UnauthorizedError('Thiếu refresh token');
      const opened = await identity.refresh(token);
      return issueTokens(reply, opened, request.body.refreshToken ? 'app' : 'web');
    },
  });

  app.post('/auth/logout', {
    preHandler: [app.authenticate],
    schema: {
      tags: TAGS,
      summary: 'Đăng xuất phiên hiện tại',
      security: [{ bearerAuth: [] }],
      response: { 204: emptySchema, 401: errorResponse },
    },
    handler: async (request, reply) => {
      if (request.actor) await identity.logout(request.actor);
      void reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      return reply.status(204).send(null);
    },
  });

  app.post('/auth/deletion-requests', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Xin xoá tài khoản bằng email + mật khẩu (kênh hỗ trợ, không cần đăng nhập)',
      body: deletionRequestBodySchema,
      response: { 204: emptySchema, 401: errorResponse, 409: errorResponse },
    },
    handler: async (request, reply) => {
      await identity.requestDeletion(request.body);
      return reply.status(204).send(null);
    },
  });

  app.post('/auth/forgot-password', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Xin mã đặt lại mật khẩu (trả lời giống nhau dù email có tài khoản hay không)',
      body: forgotPasswordBodySchema,
      response: { 200: ok(emptySchema), 429: errorResponse },
    },
    handler: async (request) => {
      await identity.forgotPassword(request.body);
      return toOk(null);
    },
  });

  app.post('/auth/reset-password', {
    config: sensitive,
    schema: {
      tags: TAGS,
      summary: 'Đặt lại mật khẩu bằng mã — thu hồi mọi phiên',
      body: resetPasswordBodySchema,
      response: { 200: ok(emptySchema), 400: errorResponse },
    },
    handler: async (request) => {
      await identity.resetPassword(request.body);
      return toOk(null);
    },
  });
};
