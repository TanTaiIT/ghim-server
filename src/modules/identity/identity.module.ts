import type { PrivilegeSource } from '../../common/auth/privilege-source.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import type { SecretBox } from '../../common/crypto/secrets.js';
import type { AppModule } from '../../common/module/app-module.js';
import type { Jobs } from '../../lib/jobs.js';
import type { Mailer } from '../../lib/mailer.js';
import type { GoogleTokenVerifier } from './google.verifier.js';
import { registerIdentityJobs } from './identity.jobs.js';
import type { IdentityRepository } from './identity.repository.js';
import { identityRoutes } from './identity.routes.js';
import {
  createIdentityService,
  type IdentityService,
  type GroupOwnership,
  type NameScreen,
  type ProfileImages,
  type SessionRevocationListener,
  type RegionCheck,
  type StrikeGate,
} from './identity.service.js';

export interface IdentityModuleDeps {
  repository: IdentityRepository;
  jobs: Jobs;
  mailer: Mailer;
  googleVerifier: GoogleTokenVerifier;
  privilegeSource: PrivilegeSource;
  config: RuntimeConfig;
  clock: () => Date;
  secrets: SecretBox;
  hashKey: string;
  disposableDomainsUrl: string;
  ownership?: GroupOwnership;
  sessionsRevoked?: SessionRevocationListener;
  images?: ProfileImages;
  names?: NameScreen;
  /** `trust` nối muộn (add-strikes); CLI không có. */
  strikes?: StrikeGate;
  regions?: RegionCheck;
}

export function createIdentityModule(deps: IdentityModuleDeps): {
  service: IdentityService;
  module: AppModule;
} {
  const service = createIdentityService(deps);
  return {
    service,
    module: {
      name: 'identity',
      routes: async (app) => {
        await app.register(identityRoutes, { identity: service, config: deps.config });
      },
      jobs: (jobs) => registerIdentityJobs(jobs, deps),
      // Tên sự kiện của `listing` viết thẳng: `listing` đã phụ thuộc `identity`, import ngược lại thành vòng.
      listeners: (dispatcher) => {
        dispatcher.register('listing.listing.submitted', async (payload) => {
          const { ownerId, deviceHash, at } = payload;
          if (
            typeof ownerId !== 'string' ||
            typeof deviceHash !== 'string' ||
            typeof at !== 'string'
          ) {
            throw new Error('listing.listing.submitted thiếu ownerId / deviceHash / at');
          }
          await service.recordListingSubmission(ownerId, deviceHash, new Date(at));
        });
        // Gậy (add-strikes): nghiêm trọng thì khoá ngay; master hạ / huỷ / gỡ thì mở khoá; hết hiệu lực thì đóng
        // đánh dấu máy. Tên sự kiện viết thẳng: `trust` phụ thuộc `identity`, import ngược lại thành vòng.
        dispatcher.register('trust.strike.issued', async (payload) => {
          const { accountId, kind, issuedBy, ruleText, strikeId } = payload;
          if (kind !== 'serious') return;
          if (
            typeof accountId !== 'string' ||
            typeof issuedBy !== 'string' ||
            typeof ruleText !== 'string' ||
            typeof strikeId !== 'string'
          ) {
            throw new Error('trust.strike.issued thiếu accountId / issuedBy / ruleText / strikeId');
          }
          await service.lockFromStrike({ accountId, by: issuedBy, reason: ruleText, strikeId });
        });
        dispatcher.register('trust.strike.decided', async (payload) => {
          const { accountId, decision, by } = payload;
          if (typeof accountId !== 'string' || typeof by !== 'string') {
            throw new Error('trust.strike.decided thiếu accountId / by');
          }
          if (decision === 'downgrade' || decision === 'cancel' || decision === 'lifted') {
            await service.unlockFromStrike({ accountId, by });
          }
        });
        for (const type of ['trust.strike.expired', 'trust.strike.cancelled'] as const) {
          dispatcher.register(type, async (payload) => {
            const { strikeId } = payload;
            if (typeof strikeId !== 'string') throw new Error(`${type} thiếu strikeId`);
            await service.clearStruckFlags(strikeId);
          });
        }
      },
      // Bảng rỗng = lần chạy đầu: không có danh sách thì lượt đăng ký đầu tiên bằng email tạm sẽ lọt.
      startup: async () => {
        const seeded = await service.seedDisposableDomainsIfEmpty();
        return seeded > 0 ? { seededDisposableDomains: seeded } : null;
      },
    },
  };
}
