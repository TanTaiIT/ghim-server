import type { FastifyInstance } from 'fastify';

import { buildApp, type AppOverrides } from '../src/app.js';
import type { AuditEntry } from '../src/common/audit/audit.js';
import type { OpsScope } from '../src/common/auth/privilege-source.js';
import { prisma } from '../src/lib/prisma.js';
import { createCategoryRepository } from '../src/modules/category/category.repository.js';
import { createGroupRepository } from '../src/modules/group/group.repository.js';
import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { createMediaRepository } from '../src/modules/media/media.repository.js';
import { createPlatformRepository } from '../src/modules/platform/platform.repository.js';
import { createFakeJobs } from './fakes/jobs.fake.js';

export const TEST_NOW = new Date('2026-10-10T09:00:00+07:00');

/** Repository thật trên DB của worker — test dựng dữ liệu nền và đọc lại kết quả qua đây. */
export const repositories = {
  identity: createIdentityRepository(prisma),
  platform: createPlatformRepository(prisma),
  category: createCategoryRepository(prisma),
  group: createGroupRepository(prisma),
  media: createMediaRepository(prisma),
};

/** Một dòng nhật ký hợp lệ cho chỗ repository đòi `audit` mà test không kiểm; `actorId` là UUID vì cột là uuid. */
export const TEST_AUDIT: AuditEntry = {
  actorId: '00000000-0000-7000-8000-0000000000aa',
  actorRole: 'master',
  action: 'test.audit.entry',
  targetType: 'test',
  targetId: 'test',
};

/**
 * App thật trên Postgres và kho ảnh của worker. Chỉ việc nền và đồng hồ là giả (thư vào bản giả của mailer vì
 * test không có `SMTP_URL`): test tự quyết lúc nào việc chạy, và thời điểm không trôi giữa hai ca.
 */
export function buildTestApp(overrides: AppOverrides = {}): Promise<FastifyInstance> {
  return buildApp({
    ...overrides,
    jobs: overrides.jobs ?? createFakeJobs(),
    clock: overrides.clock ?? (() => TEST_NOW),
  });
}

/** Gắn (thay cả gói) quyền staff thẳng vào DB, không qua bàn vận hành. */
export async function grantStaff(
  accountId: string,
  scopes: OpsScope[] = [],
  categoryIds: string[] = [],
): Promise<void> {
  await repositories.platform.upsertStaff({
    accountId,
    scopes,
    categoryIds,
    grantedBy: TEST_AUDIT.actorId,
    at: TEST_NOW,
    audit: TEST_AUDIT,
  });
}
