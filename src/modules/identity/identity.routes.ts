import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { identityAuthRoutes } from './auth/auth.routes.js';
import { identityMeRoutes } from './account/me.routes.js';
import { identityOpsRoutes } from './ops/ops.routes.js';
import type { IdentityService } from './identity.service.js';

export interface IdentityRoutesOptions {
  identity: IdentityService;
  config: RuntimeConfig;
}

/**
 * Bề mặt route của `identity` (design 1): file này chỉ đăng ký các plugin con theo mối quan tâm —
 * khách (`auth`), người đã đăng nhập (`me`), bàn vận hành (`ops`) — dưới tiền tố `/api/v1` do
 * `buildApp` đặt.
 */
export const identityRoutes: FastifyPluginAsyncZod<IdentityRoutesOptions> = async (
  app,
  { identity, config },
) => {
  await app.register(identityAuthRoutes, { identity, config });
  await app.register(identityMeRoutes, { identity, config });
  await app.register(identityOpsRoutes, { identity });
};
