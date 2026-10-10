import { afterAll } from 'vitest';

import { createCategoryRepository } from '../src/modules/category/category.repository.js';
import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { createPlatformRepository } from '../src/modules/platform/platform.repository.js';
import { describeCategoryRepositoryContract } from './category-repository.contract.js';
import { prisma, truncateAll } from './db-helpers.js';
import { describeIdentityRepositoryContract } from './identity-repository.contract.js';
import { describePlatformRepositoryContract } from './platform-repository.contract.js';

/* Hợp đồng repository trên Postgres; cùng bộ ca chạy trên bản giả ở `repository-contracts.test.ts`. */
afterAll(() => prisma.$disconnect());

let seq = 0;

describeIdentityRepositoryContract('Postgres', async () => {
  await truncateAll();
  return createIdentityRepository(prisma);
});

describePlatformRepositoryContract('Postgres', async () => {
  await truncateAll();
  return {
    repository: createPlatformRepository(prisma),
    newAccountId: async () => {
      seq += 1;
      const email = `staff-${seq}@ghim.test`;
      const row = await prisma.account.create({
        data: {
          email,
          emailNormalized: email,
          emailHash: `h-${seq}`,
          passwordHash: 'x',
          displayName: 'Staff',
          status: 'active',
        },
      });
      return row.id;
    },
  };
});

describeCategoryRepositoryContract('Postgres', async () => {
  await truncateAll();
  return createCategoryRepository(prisma);
});
