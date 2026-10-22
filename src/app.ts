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
import { parseStorageUrl } from './config/storage-url.js';
import { registerAuth } from './common/auth/auth.plugin.js';
import type { PrivilegeSource } from './common/auth/privilege-source.js';
import type { RuntimeConfig } from './common/config/runtime-config.js';
import { createSecretBox } from './common/crypto/secrets.js';
import { errorHandler } from './common/errors/error-handler.js';
import { CACHE_NONE } from './common/http/cache.js';
import type { AppModule } from './common/module/app-module.js';
import { createOutboxDispatcher, type OutboxDispatcher } from './common/outbox/dispatcher.js';
import { createExpoPush, type PushSender } from './common/push/expo-push.js';
import { createRealtimeGateway, type Realtime } from './common/realtime/realtime.js';
import { registerSwagger } from './common/plugins/swagger.js';
import { sequentially } from './common/utils/sequential.js';
import { createJobs, type Jobs } from './lib/jobs.js';
import { logger } from './lib/logger.js';
import { createFakeMailer, createSmtpMailer, type Mailer } from './lib/mailer.js';
import { prisma } from './lib/prisma.js';
import { createStorage } from './lib/storage/create-storage.js';
import type { Storage } from './lib/storage/storage.js';
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
import { createGroupModule } from './modules/group/group.module.js';
import { createGroupRepository, type GroupRepository } from './modules/group/group.repository.js';
import type { GroupService } from './modules/group/group.service.js';
import { createIdentityModule } from './modules/identity/identity.module.js';
import {
  createIdentityRepository,
  type IdentityRepository,
} from './modules/identity/identity.repository.js';
import type { IdentityService } from './modules/identity/identity.service.js';
import { createListingModule } from './modules/listing/listing.module.js';
import {
  type ListingScreeningPort,
  type ListingTrustPort,
} from './modules/listing/listing.ports.js';
import {
  createListingRepository,
  type ListingRepository,
} from './modules/listing/listing.repository.js';
import type { ListingService } from './modules/listing/listing.service.js';
import { createMediaModule } from './modules/media/media.module.js';
import { createReviewModule } from './modules/review/review.module.js';
import {
  createReviewRepository,
  type ReviewRepository,
} from './modules/review/review.repository.js';
import {
  createReportRepository,
  type ReportRepository,
} from './modules/review/report/report.repository.js';
import type { ReviewService } from './modules/review/review.service.js';
import { sharpHasher } from './modules/screening/run/image-hash.js';
import { createScreeningModule } from './modules/screening/screening.module.js';
import {
  createScreeningRepository,
  type ScreeningRepository,
} from './modules/screening/screening.repository.js';
import type { ScreeningService } from './modules/screening/screening.service.js';
import { createTrustModule } from './modules/trust/trust.module.js';
import {
  createStrikeRepository,
  type StrikeRepository,
} from './modules/trust/strike/strike.repository.js';
import { createTrustRepository, type TrustRepository } from './modules/trust/trust.repository.js';
import type { TrustService } from './modules/trust/trust.service.js';
import { createMediaRepository, type MediaRepository } from './modules/media/media.repository.js';
import type { MediaService } from './modules/media/media.service.js';
import { createMessagingModule } from './modules/messaging/messaging.module.js';
import {
  createMessagingRepository,
  type MessagingRepository,
} from './modules/messaging/messaging.repository.js';
import type { MessagingService } from './modules/messaging/messaging.service.js';
import { createNotificationModule } from './modules/notification/notification.module.js';
import { createNotificationRepository } from './modules/notification/notification.repository.js';
import type { NotificationService } from './modules/notification/notification.service.js';
import { createOpsModule } from './modules/ops/ops.module.js';
import { createOpsRepository, type OpsRepository } from './modules/ops/ops.repository.js';
import type { OpsService } from './modules/ops/ops.service.js';
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
  group: GroupService;
  notification: NotificationService;
  media: MediaService;
  listing: ListingService;
  trust: TrustService;
  screening: ScreeningService;
  review: ReviewService;
  messaging: MessagingService;
  ops: OpsService;
}

export interface Repositories {
  identity: IdentityRepository;
  platform: PlatformRepository;
  category: CategoryRepository;
  group: GroupRepository;
  media: MediaRepository;
  listing: ListingRepository;
  trust: TrustRepository;
  strike: StrikeRepository;
  screening: ScreeningRepository;
  review: ReviewRepository;
  report: ReportRepository;
  messaging: MessagingRepository;
  /** Sổ kết quả việc nền (`job_runs`) — `createJobs` ghi qua nó, nên dựng trước `jobs`. */
  ops: OpsRepository;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Việc nền của tiến trình — `server.ts` start sau khi dựng app, stop khi tắt. */
    jobs: Jobs;
    /** Service của từng module theo tên — một decorate cho mọi module, không một cái mỗi module. */
    modules: AppServices;
    /** Định nghĩa module theo thứ tự dựng: `server.ts` lặp qua để chạy khởi động. */
    moduleList: readonly AppModule[];
    /**
     * Bộ phát outbox với bên nghe của mọi module — `server.ts` bật / tắt, test gọi `runOnce()`. Mỗi request có ghi
     * xong thì `kick()` để thông báo realtime không chờ vòng 10 giây.
     */
    outbox: OutboxDispatcher;
    realtime: Realtime;
  }
}

/**
 * Mọi thứ có trạng thái ngoài tiến trình, thay được khi dựng app: test giữ repository thật trên DB
 * test nhưng thay jobs, mailer, đồng hồ, hoặc bọc một repository để chặn hai lượt ở đúng điểm tranh
 * chấp. Bỏ trống là bản thật (design 15).
 */
export interface AppDeps {
  repositories: Repositories;
  jobs: Jobs;
  mailer: Mailer;
  storage: Storage;
  googleVerifier: GoogleTokenVerifier;
  /** Đẩy thông báo lên điện thoại (add-notifications) — test đưa bản giả, không bao giờ gọi Expo. */
  push: PushSender;
  privilegeSource: PrivilegeSource;
  config: RuntimeConfig;
  clock: () => Date;
}

export type AppOverrides = Partial<Omit<AppDeps, 'repositories'>> & {
  repositories?: Partial<Repositories>;
  /**
   * Cổng mức tin cậy và hạn mức mà `listing` và `group` hỏi — bỏ trống là `trust` thật. Test không bàn về hạn mức đè
   * bằng `createInterimTrust`: nhịp gửi thật của T0 (3 lượt / giờ, đồng hồ test đứng yên) chặn luồng của chúng.
   */
  trust?: ListingTrustPort;
  /**
   * Cổng máy duyệt mà `listing` gọi trong lượt gửi — bỏ trống là `screening` thật. Test không bàn về máy duyệt đè bằng
   * `interimScreening`: máy thật giữ tin chờ kết quả ảnh, mà test tự quyết lúc nào máy cho qua.
   */
  screening?: ListingScreeningPort;
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

const notBuilt = (module: string): never => {
  throw new Error(`${module} chưa dựng xong`);
};

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
    group: overrides.repositories?.group ?? createGroupRepository(prisma),
    media: overrides.repositories?.media ?? createMediaRepository(prisma),
    listing: overrides.repositories?.listing ?? createListingRepository(prisma),
    trust: overrides.repositories?.trust ?? createTrustRepository(prisma),
    strike: overrides.repositories?.strike ?? createStrikeRepository(prisma),
    screening: overrides.repositories?.screening ?? createScreeningRepository(prisma),
    review: overrides.repositories?.review ?? createReviewRepository(prisma),
    report: overrides.repositories?.report ?? createReportRepository(prisma),
    messaging: overrides.repositories?.messaging ?? createMessagingRepository(prisma),
    ops: overrides.repositories?.ops ?? createOpsRepository(prisma),
  };
  const { config, versioned } = await resolveConfig(overrides.config, repositories.platform);
  const deps: AppDeps = {
    repositories,
    jobs:
      overrides.jobs ??
      createJobs(env.DATABASE_URL, { max: env.JOBS_POOL_MAX, runLog: repositories.ops }),
    mailer: overrides.mailer ?? defaultMailer(),
    storage: overrides.storage ?? createStorage(parseStorageUrl(env.STORAGE_URL)),
    googleVerifier: overrides.googleVerifier ?? createGoogleTokenVerifier(env.GOOGLE_CLIENT_IDS),
    push:
      overrides.push ??
      createExpoPush({ url: env.EXPO_PUSH_URL, accessToken: env.EXPO_ACCESS_TOKEN ?? null }),
    privilegeSource:
      overrides.privilegeSource ?? createPlatformPrivilegeSource(repositories.platform),
    config,
    clock: overrides.clock ?? (() => new Date()),
  };

  // Thứ tự dựng là thứ tự phụ thuộc: `platform` cần cửa đọc của `identity` và `category`, `group` cần
  // `identity`. Chiều ngược lại — `identity` hỏi "có đang là chủ nhóm" lúc xoá tài khoản — đi qua tham chiếu muộn:
  // chỉ được gọi khi có request, lúc đó `group` đã dựng xong.
  let groupService: GroupService | null = null;
  // `listing` dựng sau `media` và `group` vì cần cả hai; hai cổng ngược (chủ ảnh là tin, đếm tin "nhóm công khai")
  // cũng nối muộn — chỉ được gọi khi có request hay việc nền, lúc đó `listing` đã dựng xong.
  let listingService: ListingService | null = null;
  // `trust` dựng sau `listing` (hỏi dữ kiện tin qua cổng của nó), mà `listing` và `group` hỏi mức, hạn mức của
  // `trust`: hai chiều nối muộn, như trên (design add-trust-tiers mục 1).
  let trustService: TrustService | null = null;
  const lateTrust = (): TrustService => trustService ?? notBuilt('trust');
  const trust: ListingTrustPort = overrides.trust ?? {
    tierOf: (accountId) => lateTrust().tierOf(accountId),
    tierIn: (tx, accountId) => lateTrust().tierIn(tx, accountId),
    assertCanSubmit: (tx, input) => lateTrust().assertCanSubmit(tx, input),
    strikePointsIn: (tx, accountId) => lateTrust().strikePointsIn(tx, accountId),
    strikePointsOf: (accountId) => lateTrust().strikePointsOf(accountId),
    struckAccounts: (accountIds) => lateTrust().struckAccounts(accountIds),
  };
  // `screening` dựng sau `listing` và `trust` (hỏi dữ kiện tin và mức qua cổng của chúng), mà `listing` gọi máy duyệt
  // trong lượt gửi, `identity` lọc tên, `trust` lấy câu cho tin chờ duyệt: ba chiều nối muộn (design add-screening mục 12).
  let screeningService: ScreeningService | null = null;
  const lateScreening: Pick<ScreeningService, 'precheck' | 'scoreText' | 'openRun' | 'notices'> = {
    precheck: (accountId, kind) =>
      screeningService?.precheck(accountId, kind) ?? notBuilt('screening'),
    scoreText: (input) => screeningService?.scoreText(input) ?? notBuilt('screening'),
    openRun: (tx, input) => screeningService?.openRun(tx, input) ?? notBuilt('screening'),
    notices: (listingIds) => screeningService?.notices(listingIds) ?? notBuilt('screening'),
  };
  // Cổng của `listing` khai `score: unknown` — kết quả chỉ đi từ `scoreText` sang `openRun` của cùng lượt gửi.
  const screening: ListingScreeningPort = overrides.screening ?? lateScreening;
  // `review` dựng sau mọi module nó hỏi; `listing` hỏi ngược "tin có việc đang mở không" lúc đổi nơi đăng — nối muộn.
  let reviewService: ReviewService | null = null;
  // `messaging` dựng sau `review` và `trust` (hỏi cả hai), mà `trust` hỏi "có người nhắn hỏi mua" và `review` lấy bản
  // ghi hội thoại cho người xử: hai chiều nối muộn (design add-messaging mục 8, 9).
  let messagingService: MessagingService | null = null;
  const lateMessaging = (): MessagingService => messagingService ?? notBuilt('messaging');
  // Cổng realtime cần HTTP server của Fastify, mà module dựng trước Fastify: module cầm một tay nối, cổng thật gắn
  // vào ngay sau khi Fastify có server (dưới đây).
  let gateway: Realtime | null = null;
  const realtime: Realtime = {
    emitToUser: (accountId, event, payload) => gateway?.emitToUser(accountId, event, payload),
    disconnectUser: (accountId) => gateway?.disconnectUser(accountId),
    disconnectSession: (sessionId) => gateway?.disconnectSession(sessionId),
    onlineAmong: (accountIds) => gateway?.onlineAmong(accountIds) ?? new Set(),
  };
  // `media` trước `identity`: ảnh đại diện cần cổng xác nhận ảnh. `media` không hỏi ngược ai — chủ `profile` chính
  // là người tải lên.
  const media = createMediaModule({
    repository: repositories.media,
    storage: deps.storage,
    config: deps.config,
    clock: deps.clock,
    owners: {
      listing: {
        canUpload: (accountId, listingId) =>
          listingService?.canUpload(accountId, listingId) ?? notBuilt('listing'),
        existing: (ids) => listingService?.existingListings(ids) ?? notBuilt('listing'),
      },
    },
  });
  const identity = createIdentityModule({
    ...deps,
    images: media.service,
    ownership: {
      ownsAnyGroup: (accountId) => groupService?.ownsAnyGroup(accountId) ?? Promise.resolve(false),
    },
    sessionsRevoked: {
      session: (sessionId) => realtime.disconnectSession(sessionId),
      account: (accountId) => realtime.disconnectUser(accountId),
    },
    names: {
      hidden: (names) => screeningService?.hiddenNames(names) ?? notBuilt('screening'),
    },
    // Gậy (add-strikes): `trust` dựng sau, nối muộn — chỉ được hỏi khi có request.
    strikes: {
      isEmailBanned: (hash) => lateTrust().isEmailBanned(hash),
      blocksDeletion: async (accountId) =>
        (await lateTrust().hasSevereStrike(accountId)) ||
        (await lateTrust().seriousLockOf(accountId)) !== null,
      seriousLockOf: (accountId) => lateTrust().seriousLockOf(accountId),
      activeStrikesOf: (accountIds) => lateTrust().activeStrikesOf(accountIds),
    },
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
    strikes: {
      hasActiveStrike: async (accountId) => (await lateTrust().standingOf(accountId)).active,
    },
    ...(versioned ? { runtimeConfig: versioned } : {}),
  });
  const group = createGroupModule({
    repository: repositories.group,
    identity: identity.service,
    config: deps.config,
    clock: deps.clock,
    trust: {
      tierOf: (accountId) => trust.tierOf(accountId),
      hasSevereStrike: (accountId) => lateTrust().hasSevereStrike(accountId),
    },
    publicListings: {
      countInGroup: (tx, groupId) =>
        listingService?.countGroupPublic(tx, groupId) ?? notBuilt('listing'),
    },
  });
  groupService = group.service;
  const listing = createListingModule({
    repository: repositories.listing,
    groups: group.service,
    categories: category.service,
    media: media.service,
    identity: identity.service,
    trust,
    screening,
    openWork: {
      blocksPlacement: (listingId) =>
        reviewService?.blocksPlacement(listingId) ?? notBuilt('review'),
      reportHidden: (listingId) => reviewService?.reportHidden(listingId) ?? notBuilt('review'),
    },
    config: deps.config,
    clock: deps.clock,
  });
  listingService = listing.service;
  const trustModule = createTrustModule({
    repository: repositories.trust,
    strikes: repositories.strike,
    privileges: deps.privilegeSource,
    listings: listing.service,
    identity: identity.service,
    buyerInterest: { hasInquiry: (listingId) => lateMessaging().hasInquiry(listingId) },
    holds: {
      explain: (ids) => screeningService?.explainHolds(ids) ?? notBuilt('screening'),
      cooldownOf: (accountId) => screeningService?.cooldownOf(accountId) ?? notBuilt('screening'),
    },
    config: deps.config,
    clock: deps.clock,
  });
  trustService = trustModule.service;
  const screeningModule = createScreeningModule({
    repository: repositories.screening,
    listings: listing.service,
    categories: category.service,
    identity: identity.service,
    media: media.service,
    trust: {
      tierOf: (accountId) => trust.tierOf(accountId),
      strikePointsOf: (accountId) => trust.strikePointsOf(accountId),
    },
    hasher: sharpHasher,
    jobs: deps.jobs,
    config: deps.config,
    clock: deps.clock,
  });
  screeningService = screeningModule.service;
  const review = createReviewModule({
    repository: repositories.review,
    reports: repositories.report,
    listings: listing.service,
    screening: screeningModule.service,
    identity: identity.service,
    trust: {
      tierOf: (accountId) => trust.tierOf(accountId),
      cleanCount: (accountId) => trustModule.service.cleanCount(accountId),
      voidByReport: (listingId, accountId) =>
        trustModule.service.voidByReport(listingId, accountId),
      issueStrike: (tx, input) => trustModule.service.issueStrike(tx, input),
      decideAppeal: (tx, input) => trustModule.service.decideAppeal(tx, input),
      decideSerious: (tx, input) => trustModule.service.decideSerious(tx, input),
      decidePermanentReview: (tx, input) => trustModule.service.decidePermanentReview(tx, input),
      strikesOf: (accountId) => trustModule.service.strikesOf(accountId),
      strikeDetail: (strikeId) => trustModule.service.strikeDetail(strikeId),
      ruleArticle: (id) => trustModule.service.ruleArticle(id),
    },
    groups: group.service,
    platform: platform.service,
    categories: category.service,
    media: media.service,
    messaging: { transcripts: (ids) => lateMessaging().transcripts(ids) },
    privileges: deps.privilegeSource,
    jobs: deps.jobs,
    config: deps.config,
    clock: deps.clock,
  });
  reviewService = review.service;
  const messaging = createMessagingModule({
    repository: repositories.messaging,
    identity: identity.service,
    listings: listing.service,
    trust: { tierOf: (accountId) => trust.tierOf(accountId) },
    screening: screeningModule.service,
    review: review.service,
    groups: group.service,
    platform: platform.service,
    realtime,
    config: deps.config,
    clock: deps.clock,
  });
  messagingService = messaging.service;
  const notification = createNotificationModule({
    repository: createNotificationRepository(prisma),
    groups: {
      findGroup: (groupId) => group.service.findGroup(groupId),
      managerIds: (groupId) => group.service.managerIds(groupId),
      moderatorIds: (groupId) => group.service.moderatorIds(groupId),
      memberIds: (groupId, query) => group.service.memberIds(groupId, query),
      ownerId: (groupId) => group.service.ownerId(groupId),
      unitName: (groupId, unitId) => group.service.unitName(groupId, unitId),
      announcementBody: (id) => group.service.announcementBody(id),
      countPendingRequests: (groupId) => group.service.countPendingRequests(groupId),
      isMember: (groupId, accountId) => group.service.isMember(groupId, accountId),
      isBanned: (groupId, accountId) => group.service.isBanned(groupId, accountId),
    },
    identity: identity.service,
    listings: listing.service,
    screening: screeningModule.service,
    messaging: {
      previewOf: (messageId) => messaging.service.previewOf(messageId),
      viewingSessions: (conversationId) => messaging.service.viewingSessions(conversationId),
    },
    trust: {
      strikeDetail: (strikeId) => trustModule.service.strikeDetail(strikeId),
      standingOf: (accountId) => trustModule.service.standingOf(accountId),
    },
    review: { groupHeldNotice: (taskId) => review.service.groupHeldNotice(taskId) },
    push: deps.push,
    jobs: deps.jobs,
    realtime,
    config: deps.config,
    clock: deps.clock,
  });
  // `ops` sau cùng (TK 29 đợt 7): gọi cổng hạn lưu của mọi module, không ai gọi ngược lại; nhận việc dọn outbox.
  const ops = createOpsModule({
    repository: repositories.ops,
    prisma,
    listings: listing.service,
    media: media.service,
    groups: group.service,
    identity: identity.service,
    messaging: messaging.service,
    notification: notification.service,
    screening: screeningModule.service,
    trust: trustModule.service,
    review: review.service,
    jobs: deps.jobs,
    config: deps.config,
    clock: deps.clock,
  });
  const moduleList: readonly AppModule[] = [
    media.module,
    identity.module,
    category.module,
    platform.module,
    group.module,
    listing.module,
    trustModule.module,
    screeningModule.module,
    review.module,
    messaging.module,
    notification.module,
    ops.module,
  ];
  const outbox = createOutboxDispatcher(prisma);
  for (const appModule of moduleList) appModule.listeners?.(outbox);
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
  // Phương thức liệt kê tường minh: mặc định của thư viện chỉ có GET/HEAD/POST, còn `*` đi kèm
  // cookie thì trình duyệt đọc là tên một phương thức — hỏng đúng ở production.
  await app.register(cors, {
    origin: corsOrigin,
    credentials: corsOrigin !== '*',
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
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
  app.decorate('outbox', outbox);
  app.decorate('realtime', realtime);
  const socketGateway = createRealtimeGateway(app.server, {
    verifyToken: (token) => app.jwt.verify<{ sid: string; exp: number }>(token),
    resolveActor: (sessionId) => identity.service.resolveActor(sessionId),
    corsOrigin,
    onPresence: (accountId) => {
      identity.service.recordSeen(accountId).catch((error: unknown) => {
        app.log.warn({ err: error }, 'Không ghi được mốc hoạt động');
      });
    },
  });
  gateway = socketGateway;
  // Đóng socket trước khi HTTP server đóng: kết nối websocket còn mở thì `server.close()` chờ mãi.
  app.addHook('preClose', async () => {
    await socketGateway.close();
  });
  // Request có ghi xong thì phát outbox ngay (thông báo realtime); GET không ghi gì nên không đánh thức bộ phát.
  app.addHook('onResponse', async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') outbox.kick();
  });
  app.decorate('modules', {
    identity: identity.service,
    platform: platform.service,
    category: category.service,
    group: group.service,
    notification: notification.service,
    media: media.service,
    listing: listing.service,
    trust: trustModule.service,
    screening: screeningModule.service,
    review: review.service,
    messaging: messaging.service,
    ops: ops.service,
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
