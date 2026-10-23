import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import type { RuntimeConfig } from '../config/runtime-config.js';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import { actorOf, type Actor, type ActorResolver } from './actor.js';
import type { OpsScope, PrivilegeSource, StaffGrantView } from './privilege-source.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Bearer → JWT → tra phiên → trạng thái tài khoản; gắn `request.actor`. */
    authenticate: preHandlerAsyncHookHandler;
    /** Như `authenticate` khi có header `Authorization`; không có thì là khách (`request.actor = null`). */
    authenticateOptional: preHandlerAsyncHookHandler;
    requireVerifiedEmail: preHandlerAsyncHookHandler;
    /** Chỉ master — mọi route master đều là bàn vận hành. */
    requireMaster: preHandlerAsyncHookHandler;
    /** Master luôn qua; người khác phải có việc `scope` đang hiệu lực. */
    requireOps: (scope: OpsScope) => preHandlerAsyncHookHandler;
    /** Master hay bất kỳ staff nào đang hiệu lực, không cần việc hay danh mục cụ thể (danh sách trắng ảnh mẫu). */
    requireStaff: preHandlerAsyncHookHandler;
    /** Như `requireOps` nhưng theo danh mục lấy từ request (thường là `params.id`). */
    requireCategoryOps: (
      categoryIdOf: (request: FastifyRequest) => string,
    ) => preHandlerAsyncHookHandler;
    /**
     * Ký access token cho một phiên với hạn đọc từ bảng con số NGAY lúc ký — master đổi hạn thì lượt
     * đăng nhập kế tiếp nhận hạn mới, không chờ khởi động lại (spec config-versions).
     */
    signAccessToken: (sessionId: string) => { token: string; expiresInSeconds: number };
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
  config: RuntimeConfig;
}

const SECONDS_PER_MINUTE = 60;

/**
 * Guard đăng nhập dùng chung cho mọi module, gọi thẳng trong `buildApp` (không qua `register`)
 * để decorator nằm ở root và route nào cũng thấy. Access token chỉ là giấy thông hành 15 phút
 * mang `sid`; mọi request có đăng nhập đều tra phiên trong DB qua `resolver`, nên thu hồi có hiệu
 * lực ngay (design 4). Quyền staff hỏi `PrivilegeSource` mỗi lần — thu quyền cũng có hiệu lực ngay.
 */
export async function registerAuth(app: FastifyInstance, deps: AuthDeps): Promise<void> {
  await app.register(cookie);
  // Hạn mặc định chỉ là lưới an toàn cho lượt `app.jwt.sign` trần; đường thật là `signAccessToken`.
  await app.register(jwt, {
    secret: deps.jwtSecret,
    sign: { expiresIn: `${deps.config.get('identity.accessTokenMinutes')}m` },
  });

  app.decorate('signAccessToken', (sessionId: string) => {
    const expiresInSeconds = deps.config.get('identity.accessTokenMinutes') * SECONDS_PER_MINUTE;
    return {
      token: app.jwt.sign({ sid: sessionId }, { expiresIn: expiresInSeconds }),
      expiresInSeconds,
    };
  });

  app.decorateRequest('actor', null);

  /** Master qua ngay; staff phải đang hiệu lực VÀ có phạm vi; treo thì nói rõ là treo. */
  const assertOps = async (
    actor: Actor,
    inScope: (grant: StaffGrantView) => boolean,
  ): Promise<void> => {
    if (actor.role !== 'master') {
      const grant = await deps.privilegeSource.staffGrant(actor.accountId);
      if (grant?.status === 'suspended') {
        throw new ForbiddenError(
          'Quyền staff của bạn đang treo — liên hệ master',
          'STAFF_PERMISSION_SUSPENDED',
        );
      }
      if (!grant || !inScope(grant)) throw new ForbiddenError();
    }
  };

  const authenticate = async (request: FastifyRequest): Promise<void> => {
    let sid: string;
    try {
      ({ sid } = await request.jwtVerify<{ sid: string }>());
    } catch {
      // Thiếu header, token hỏng, token hết hạn — client chỉ cần refresh, không cần đăng nhập lại.
      throw new UnauthorizedError();
    }
    request.actor = await deps.resolver.resolveActor(sid);
  };
  app.decorate('authenticate', authenticate);
  // Có header mà token hỏng vẫn là 401: app đang đăng nhập phải biết để refresh, không bị coi như khách.
  app.decorate('authenticateOptional', async (request) => {
    if (request.headers.authorization) await authenticate(request);
    else request.actor = null;
  });

  app.decorate('requireVerifiedEmail', async (request) => {
    if (!actorOf(request).emailVerified) {
      throw new ForbiddenError('Xác nhận email trước khi dùng tính năng này', 'EMAIL_NOT_VERIFIED');
    }
  });

  app.decorate('requireMaster', async (request) => {
    if (actorOf(request).role !== 'master') throw new ForbiddenError();
  });

  app.decorate('requireOps', (scope: OpsScope) => async (request: FastifyRequest) => {
    const actor = actorOf(request);
    await assertOps(actor, (grant) => grant.scopes.includes(scope));
  });

  app.decorate('requireStaff', async (request) => {
    await assertOps(actorOf(request), () => true);
  });

  app.decorate(
    'requireCategoryOps',
    (categoryIdOf: (request: FastifyRequest) => string) => async (request: FastifyRequest) => {
      const actor = actorOf(request);
      await assertOps(actor, (grant) => grant.categoryIds.includes(categoryIdOf(request)));
    },
  );
}
