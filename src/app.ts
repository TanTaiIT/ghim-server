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

import { corsOrigin, env, isTest, trustProxy } from './config/env.js';
import { registerAuth } from './common/auth/auth.plugin.js';
import type { PrivilegeSource } from './common/auth/privilege-source.js';
import type { RuntimeConfig } from './common/config/runtime-config.js';
import { createSecretBox } from './common/crypto/secrets.js';
import { errorHandler } from './common/errors/error-handler.js';
import { CACHE_NONE } from './common/http/cache.js';
import type { AppModule } from './common/module/app-module.js';
import { createOutboxModule } from './common/outbox/outbox.jobs.js';
import { registerSwagger } from './common/plugins/swagger.js';
import { sequentially } from './common/utils/sequential.js';
import { createJobs, type Jobs } from './lib/jobs.js';
import { logger } from './lib/logger.js';
import { createFakeMailer, createSmtpMailer, type Mailer } from './lib/mailer.js';
import { prisma } from './lib/prisma.js';
import { createCategoryModule } from './modules/category/category.module.js';
import {
  createCategoryRepository,
  type CategoryRepository,
} from './modules/category/category.repository.js';
import type { CategoryService } from './modules/category/category.service.js';
import { healthRoutes } from './modules/health/health.routes.js';
import {
  createGoogleTokenVerifier,
  type GoogleTokenVerifier,
} from './modules/identity/google.verifier.js';
import { createIdentityModule } from './modules/identity/identity.module.js';
import {
  createIdentityRepository,
  type IdentityRepository,
} from './modules/identity/identity.repository.js';
import type { IdentityService } from './modules/identity/identity.service.js';
import { createPlatformModule } from './modules/platform/platform.module.js';
import {
  createPlatformRepository,
  type PlatformRepository,
} from './modules/platform/platform.repository.js';
import {
  createPlatformPrivilegeSource,
  createVersionedRuntimeConfig,
  type PlatformService,
  type VersionedRuntimeConfig,
} from './modules/platform/platform.service.js';

const API_PREFIX = '/api/v1';

/**
 * Mã truy vết từ ngoài chỉ được giữ khi đúng định dạng (spec api-contract): nó đi vào mọi dòng log và
 * được trả lại trong header, nên không nhận chuỗi tuỳ ý dài tới cả chục KB.
 */
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Service của từng module theo tên, cho `server.ts` và test gọi thẳng. */
export interface AppServices {
  identity: IdentityService;
  platform: PlatformService;
  category: CategoryService;
}

export interface Repositories {
  identity: IdentityRepository;
  platform: PlatformRepository;
  category: CategoryRepository;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Việc nền của tiến trình — `server.ts` start sau khi dựng app, stop khi tắt. */
    jobs: Jobs;
    /** Service của từng module theo tên — một decorate cho mọi module, không một cái mỗi module. */
    modules: AppServices;
    /** Định nghĩa module theo thứ tự dựng: `server.ts` lặp qua để nối bên nghe outbox và chạy khởi động. */
    moduleList: readonly AppModule[];
  }
}

/**
 * Mọi thứ có trạng thái ngoài tiến trình, thay được bằng bản giả: test HTTP truyền repository
 * trong bộ nhớ, jobs giả, mailer giả, đồng hồ cố định — và vẫn chạy đúng app thật (plugin,
 * schema, guard, error handler). Bỏ trống là bản thật (design 15). Repository của mọi module nằm
 * chung một chỗ; phần còn lại là hạ tầng dùng chung.
 */
export interface AppDeps {
  repositories: Repositories;
  jobs: Jobs;
  mailer: Mailer;
  googleVerifier: GoogleTokenVerifier;
  privilegeSource: PrivilegeSource;
  config: RuntimeConfig;
  clock: () => Date;
}

export type AppOverrides = Partial<Omit<AppDeps, 'repositories'>> & {
  repositories?: Partial<Repositories>;
};

/** `SMTP_URL` chỉ được trống ở test (env.ts), và ở test thì thư vào mảng. */
function defaultMailer(): Mailer {
  return env.SMTP_URL ? createSmtpMailer(env.SMTP_URL, env.MAIL_FROM) : createFakeMailer();
}

/**
 * Bảng con số thật đọc từ `config_versions`, nạp NGAY lúc dựng app: `registerAuth` cần hạn access
 * token trước khi có request nào. Bảng rỗng (lần chạy đầu, trước khi `server.ts` nạp phiên bản 1)
 * thì dùng giá trị khởi đầu của sổ đăng ký — cùng con số, nên không có khoảng lệch.
 */
async function resolveConfig(
  override: RuntimeConfig | undefined,
  platformRepository: PlatformRepository,
): Promise<{ config: RuntimeConfig; versioned: VersionedRuntimeConfig | null }> {
  if (override) return { config: override, versioned: null };
  const versioned = createVersionedRuntimeConfig(platformRepository);
  await versioned.load();
  return { config: versioned, versioned };
}

/**
 * Dựng app nhưng KHÔNG listen — `server.ts` mới mở cổng.
 *
 * Tách như vậy để test gọi `fastify.inject()` trên đúng app thật mà không chiếm cổng nào: chạy
 * song song bao nhiêu file test cũng được, và không có lượt dọn cổng nào phải nhớ.
 */
export async function buildApp(overrides: AppOverrides = {}): Promise<FastifyInstance> {
  const repositories: Repositories = {
    identity: overrides.repositories?.identity ?? createIdentityRepository(prisma),
    platform: overrides.repositories?.platform ?? createPlatformRepository(prisma),
    category: overrides.repositories?.category ?? createCategoryRepository(prisma),
  };
  const { config, versioned } = await resolveConfig(overrides.config, repositories.platform);
  const deps: AppDeps = {
    repositories,
    jobs: overrides.jobs ?? createJobs(env.DATABASE_URL, { max: env.JOBS_POOL_MAX }),
    mailer: overrides.mailer ?? defaultMailer(),
    googleVerifier: overrides.googleVerifier ?? createGoogleTokenVerifier(env.GOOGLE_CLIENT_IDS),
    privilegeSource:
      overrides.privilegeSource ?? createPlatformPrivilegeSource(repositories.platform),
    config,
    clock: overrides.clock ?? (() => new Date()),
  };

  // Thứ tự dựng là thứ tự phụ thuộc: `platform` cần cửa đọc của `identity` và `category`.
  const identity = createIdentityModule({
    ...deps,
    repository: repositories.identity,
    secrets: createSecretBox(env.SECRETS_ENCRYPTION_KEY),
    hashKey: env.IDENTITY_HASH_KEY,
    disposableDomainsUrl: env.DISPOSABLE_DOMAINS_URL,
  });
  const category = createCategoryModule({ repository: repositories.category, clock: deps.clock });
  const platform = createPlatformModule({
    repository: repositories.platform,
    identity: identity.service,
    categories: category.service,
    clock: deps.clock,
    ...(versioned ? { runtimeConfig: versioned } : {}),
  });
  const moduleList: readonly AppModule[] = [
    identity.module,
    category.module,
    platform.module,
    createOutboxModule(prisma),
  ];
  await sequentially(moduleList, async (appModule) => {
    await appModule.jobs?.(deps.jobs);
  });

  const app = Fastify({
    loggerInstance: logger,
    /*
     * Nhận `x-request-id` từ ngoài nếu có, không thì tự sinh.
     *
     * Tôn trọng id có sẵn là thứ khiến một lượt gọi xuyên nhiều service ghép lại được thành một
     * dòng thời gian; tự sinh đè lên là cắt đứt sợi dây đó ngay tại cửa.
     */
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
    trustProxy,
    // Mặc định của Fastify là 0 (không giới hạn): client gửi nhỏ giọt giữ socket mãi.
    requestTimeout: 30_000,
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
    resolver: identity.service,
    privilegeSource: deps.privilegeSource,
    jwtSecret: env.JWT_SECRET,
    config: deps.config,
  });
  app.decorate('jobs', deps.jobs);
  app.decorate('modules', {
    identity: identity.service,
    platform: platform.service,
    category: category.service,
  });
  app.decorate('moduleList', moduleList);

  /*
   * Trả id ra HEADER, không chỉ ghi vào log.
   *
   * Không có dòng này thì id chỉ tồn tại phía server: người dùng báo lỗi mô tả bằng lời, còn
   * người trực log thì mò theo mốc thời gian. Có nó, một ảnh chụp màn hình DevTools là đủ để
   * tìm ra đúng request.
   */
  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
    // Mặc định cấm giữ lại (dữ liệu cá nhân, bàn vận hành); route công khai tự mở bằng `cacheFor`.
    // Lỗi luôn bị ép về `no-store`, kể cả khi handler đã đặt header rồi mới hỏng ở bước serialize.
    if (reply.statusCode >= 400 || !reply.hasHeader('cache-control')) {
      void reply.header('cache-control', CACHE_NONE);
    }
  });

  await app.register(healthRoutes);
  await sequentially(moduleList, async (appModule) => {
    if (appModule.routes) await app.register(appModule.routes, { prefix: API_PREFIX });
  });

  return app;
}

export { API_PREFIX };
