import { describeCategoryRepositoryContract } from './category-repository.contract.js';
import { createFakeCategoryRepository } from './fakes/category-repository.fake.js';
import { createFakeIdentityRepository } from './fakes/identity-repository.fake.js';
import { createFakePlatformRepository } from './fakes/platform-repository.fake.js';
import { describeIdentityRepositoryContract } from './identity-repository.contract.js';
import { describePlatformRepositoryContract } from './platform-repository.contract.js';

/* Hợp đồng repository trên bản giả; cùng bộ ca chạy trên Postgres ở `repository-contracts.db.test.ts`. */
let seq = 0;

describeIdentityRepositoryContract('bản giả', async () => createFakeIdentityRepository());

describePlatformRepositoryContract('bản giả', async () => ({
  repository: createFakePlatformRepository(),
  newAccountId: async () => {
    seq += 1;
    return `00000000-0000-7000-8000-${String(seq).padStart(12, '0')}`;
  },
}));

describeCategoryRepositoryContract('bản giả', async () => createFakeCategoryRepository());
