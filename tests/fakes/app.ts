import type { FastifyInstance } from 'fastify';

import { buildApp, type AppOverrides } from '../../src/app.js';
import { createFakeAuditLog } from './audit.fake.js';
import { createFakeCategoryRepository } from './category-repository.fake.js';
import { createFakeIdentityRepository } from './identity-repository.fake.js';
import { createFakeJobs } from './jobs.fake.js';
import { createFakePlatformRepository } from './platform-repository.fake.js';

export const TEST_NOW = new Date('2026-10-10T09:00:00+07:00');

/**
 * App thật trên mọi bản giả: repository trong bộ nhớ, việc nền giả, đồng hồ đứng yên. Những gì không
 * truyền thì `buildApp` nối bản thật của `platform` LÊN bản giả — `PrivilegeSource` đọc repository giả,
 * bảng con số đọc repository giả — nên test HTTP đi đúng đường production mà không cần Postgres.
 */
export async function buildTestApp(overrides: AppOverrides = {}): Promise<FastifyInstance> {
  // Bản giả tự dựng dùng chung một sổ nhật ký; test truyền repository riêng thì tự truyền sổ chung.
  const auditLog = createFakeAuditLog();
  return buildApp({
    ...overrides,
    repositories: {
      identity: overrides.repositories?.identity ?? createFakeIdentityRepository({ auditLog }),
      platform: overrides.repositories?.platform ?? createFakePlatformRepository({ auditLog }),
      category: overrides.repositories?.category ?? createFakeCategoryRepository({ auditLog }),
    },
    jobs: overrides.jobs ?? createFakeJobs(),
    clock: overrides.clock ?? (() => TEST_NOW),
  });
}
