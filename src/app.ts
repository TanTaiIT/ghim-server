import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { corsOrigin, env, isTest } from './config/env.js';
import { registerAuth } from './common/auth/auth.plugin.js';
import { noStaffPrivilegeSource, type PrivilegeSource } from './common/auth/privilege-source.js';
import { createStaticRuntimeConfig, type RuntimeConfig } from './common/config/runtime-config.js';
import { createSecretBox } from './common/crypto/secrets.js';
import { errorHandler } from './common/errors/error-handler.js';
import { registerSwagger } from './common/plugins/swagger.js';
import { createJobs, type Jobs } from './lib/jobs.js';
import { logger } from './lib/logger.js';
import { createFakeMailer, createSmtpMailer, type Mailer } from './lib/mailer.js';
import { prisma } from './lib/prisma.js';
import { healthRoutes } from './modules/health/health.routes.js';
import {
  createGoogleTokenVerifier,
  type GoogleTokenVerifier,
} from './modules/identity/google.verifier.js';
import { registerIdentityJobs } from './modules/identity/identity.jobs.js';
import {
  createIdentityRepository,
  type IdentityRepository,
} from './modules/identity/identity.repository.js';
import { identityRoutes } from './modules/identity/identity.routes.js';
import {
  createIdentityService,
  type IdentityService,
} from './modules/identity/identity.service.js';

const API_PREFIX = '/api/v1';

declare module 'fastify' {
  interface FastifyInstance {
    /** Việc nền của tiến trình — `server.ts` start sau khi dựng app, stop khi tắt. */
    jobs: Jobs;
    /** Cửa "người này là ai" và các việc khởi động của identity (nạp hạt giống miền). */
    identity: IdentityService;
  }
}

/**
 * Mọi thứ có trạng thái ngoài tiến trình, thay được bằng bản giả: test HTTP truyền repository
 * trong bộ nhớ, jobs giả, mailer giả, đồng hồ cố định — và vẫn chạy đúng app thật (plugin,
 * schema, guard, error handler). Bỏ trống là bản thật (design 15).
 */
export interface AppDeps {
  repository: IdentityRepository;
  jobs: Jobs;
  mailer: Mailer;
  googleVerifier: GoogleTokenVerifier;
  privilegeSource: PrivilegeSource;
  config: RuntimeConfig;
  clock: () => Date;
}

/** `SMTP_URL` chỉ được trống ở test (env.ts), và ở test thì thư vào mảng. */
function defaultMailer(): Mailer {
  return env.SMTP_URL ? createSmtpMailer(env.SMTP_URL, env.MAIL_FROM) : createFakeMailer();
}

/**
 * Dựng app nhưng KHÔNG listen — `server.ts` mới mở cổng.
 *
 * Tách như vậy để test gọi `fastify.inject()` trên đúng app thật mà không chiếm cổng nào: chạy
 * song song bao nhiêu file test cũng được, và không có lượt dọn cổng nào phải nhớ.
 */
export async function buildApp(overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const deps: AppDeps = {
    repository: overrides.repository ?? createIdentityRepository(prisma),
    jobs: overrides.jobs ?? createJobs(env.DATABASE_URL),
    mailer: overrides.mailer ?? defaultMailer(),
    googleVerifier: overrides.googleVerifier ?? createGoogleTokenVerifier(env.GOOGLE_CLIENT_IDS),
    privilegeSource: overrides.privilegeSource ?? noStaffPrivilegeSource,
    config: overrides.config ?? createStaticRuntimeConfig(),
    clock: overrides.clock ?? (() => new Date()),
  };
  const secrets = createSecretBox(env.SECRETS_ENCRYPTION_KEY);
  const identity = createIdentityService({ ...deps, hashKey: env.IDENTITY_HASH_KEY, secrets });
  await registerIdentityJobs(deps.jobs, {
    ...deps,
    secrets,
    disposableDomainsUrl: env.DISPOSABLE_DOMAINS_URL,
  });

  const app = Fastify({
    loggerInstance: logger,
    /*
     * Nhận `x-request-id` từ ngoài nếu có, không thì tự sinh.
     *
     * Tôn trọng id có sẵn là thứ khiến một lượt gọi xuyên nhiều service ghép lại được thành một
     * dòng thời gian; tự sinh đè lên là cắt đứt sợi dây đó ngay tại cửa.
     */
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod vừa validate request, vừa serialize response, vừa sinh tài liệu — một schema, ba việc.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  /*
   * 404 KHÔNG đi qua `setErrorHandler` — Fastify có đường riêng cho nó, và mặc định trả
   * `{ message, error, statusCode }`, tức một hình dạng thứ hai lọt ra ngoài luật "mọi response
   * đều có { success, data|error }". Client sẽ gặp nó ở đúng lúc khó chịu nhất: gõ nhầm URL.
   */
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: `Không có đường dẫn ${request.method} ${request.url}` },
    }),
  );

  await app.register(helmet);
  // `credentials` chỉ bật khi origin là danh sách cụ thể: trình duyệt từ chối cookie kèm CORS `*`,
  // và mở credentials cho mọi nguồn là cho mọi trang web gọi API bằng cookie của người dùng.
  await app.register(cors, { origin: corsOrigin, credentials: corsOrigin !== '*' });
  // Test bắn hàng chục request từ cùng một IP trong vài giây — không bỏ qua thì một chốt hạ
  // tầng biến thành nguồn flake của toàn bộ suite nghiệp vụ.
  if (!isTest) {
    await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: '1 minute' });
  }

  await registerSwagger(app);
  await registerAuth(app, {
    resolver: identity,
    privilegeSource: deps.privilegeSource,
    jwtSecret: env.JWT_SECRET,
    accessTokenMinutes: deps.config.get('identity.accessTokenMinutes'),
  });
  app.decorate('jobs', deps.jobs);
  app.decorate('identity', identity);

  /*
   * Trả id ra HEADER, không chỉ ghi vào log.
   *
   * Không có dòng này thì id chỉ tồn tại phía server: người dùng báo lỗi mô tả bằng lời, còn
   * người trực log thì mò theo mốc thời gian. Có nó, một ảnh chụp màn hình DevTools là đủ để
   * tìm ra đúng request.
   */
  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  await app.register(healthRoutes);
  await app.register(identityRoutes, { prefix: API_PREFIX, identity, config: deps.config });

  return app;
}

export { API_PREFIX };
