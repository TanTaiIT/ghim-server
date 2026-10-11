import { noStaffPrivilegeSource } from '../src/common/auth/privilege-source.js';
import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { createSecretBox } from '../src/common/crypto/secrets.js';
import type { IdentityRepository } from '../src/modules/identity/identity.repository.js';
import { createIdentityService } from '../src/modules/identity/identity.service.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { repositories, TEST_NOW } from './test-app.js';

/** Khoá HMAC của service dựng ở đây — test tự băm mã để cài mã sống phải dùng đúng khoá này. */
export const TEST_HASH_KEY = 'identity-hash-key-thu-du-ba-muoi-hai-ky-tu-01';

/**
 * Service identity trên repository thật của worker; chỉ việc nền, đồng hồ và Google là giả. Truyền
 * `repository` khi cần bọc repository thật để ép thứ tự của một cuộc đua.
 */
export function buildIdentityService(
  overrides: { now?: Date; repository?: IdentityRepository } = {},
) {
  const repository = overrides.repository ?? repositories.identity;
  const jobs = createFakeJobs();
  const service = createIdentityService({
    repository,
    jobs,
    privilegeSource: noStaffPrivilegeSource,
    config: createStaticRuntimeConfig(),
    clock: () => overrides.now ?? TEST_NOW,
    hashKey: TEST_HASH_KEY,
    secrets: createSecretBox(Buffer.alloc(32, 1).toString('base64')),
    googleVerifier: { verify: async () => null },
  });
  return { service, repository, jobs };
}
