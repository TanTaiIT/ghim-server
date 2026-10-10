import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import type { Actor, ActorResolver } from './actor.js';
import type { OpsScope, PrivilegeSource } from './privilege-source.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Bearer → JWT → tra phiên → trạng thái tài khoản; gắn `request.actor`. */
    authenticate: preHandlerAsyncHookHandler;
    requireVerifiedEmail: preHandlerAsyncHookHandler;
    /** Chỉ master, và phiên phải có lớp thứ hai — mọi route master đều là bàn vận hành. */
    requireMaster: preHandlerAsyncHookHandler;
    /** Master luôn qua; người khác phải có việc `scope`; cả hai phải có lớp thứ hai trên phiên. */
    requireOps: (scope: OpsScope) => preHandlerAsyncHookHandler;
  }

  interface FastifyRequest {
    actor: Actor | null;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sid: string };
    user: { sid: string };
  }
}

export interface AuthDeps {
  resolver: ActorResolver;
  privilegeSource: PrivilegeSource;
  jwtSecret: string;
  accessTokenMinutes: number;
}

function actorOf(request: FastifyRequest): Actor {
  // Lỗi lập trình, không phải lỗi người dùng: route khai guard mà quên `authenticate` đứng trước.
  if (!request.actor) throw new Error('Guard này phải đứng sau authenticate trong preHandler');
  return request.actor;
}

// Kể cả master, kể cả khi chưa thiết lập: không có lớp thứ hai thì không có bàn vận hành.
function requireSecondFactor(actor: Actor): void {
  if (!actor.secondFactorAt) {
    throw new ForbiddenError(
      'Thiết lập và nhập mã lớp thứ hai trước khi dùng bàn vận hành',
      'TWO_FACTOR_REQUIRED',
    );
  }
}

/**
 * Guard đăng nhập dùng chung cho mọi module, gọi thẳng trong `buildApp` (không qua `register`)
 * để decorator nằm ở root và route nào cũng thấy. Access token chỉ là giấy thông hành 15 phút
 * mang `sid`; mọi request có đăng nhập đều tra phiên trong DB qua `resolver`, nên thu hồi có hiệu
 * lực ngay (design 4).
 */
export async function registerAuth(app: FastifyInstance, deps: AuthDeps): Promise<void> {
  await app.register(cookie);
  await app.register(jwt, {
    secret: deps.jwtSecret,
    sign: { expiresIn: `${deps.accessTokenMinutes}m` },
  });

  app.decorateRequest('actor', null);

  app.decorate('authenticate', async (request) => {
    let sid: string;
    try {
      ({ sid } = await request.jwtVerify<{ sid: string }>());
    } catch {
      // Thiếu header, token hỏng, token hết hạn — client chỉ cần refresh, không cần đăng nhập lại.
      throw new UnauthorizedError();
    }
    request.actor = await deps.resolver.resolveActor(sid);
  });

  app.decorate('requireVerifiedEmail', async (request) => {
    if (!actorOf(request).emailVerified) {
      throw new ForbiddenError('Xác nhận email trước khi dùng tính năng này', 'EMAIL_NOT_VERIFIED');
    }
  });

  app.decorate('requireMaster', async (request) => {
    const actor = actorOf(request);
    if (actor.role !== 'master') throw new ForbiddenError();
    requireSecondFactor(actor);
  });

  app.decorate('requireOps', (scope: OpsScope) => async (request: FastifyRequest) => {
    const actor = actorOf(request);
    const privileged =
      actor.role === 'master' || (await deps.privilegeSource.hasStaffScope(actor.accountId, scope));
    if (!privileged) throw new ForbiddenError();
    requireSecondFactor(actor);
  });
}
