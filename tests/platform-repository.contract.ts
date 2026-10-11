import { describe, expect, it } from 'vitest';

import type { PlatformRepository } from '../src/modules/platform/platform.repository.js';
import { TEST_AUDIT } from './fakes/audit.fake.js';

/* Hợp đồng repository của `platform` — xem `identity-repository.contract.ts` về cách chạy. */
const NOW = new Date('2026-10-10T04:00:00.000Z');

export interface PlatformContractEnv {
  repository: PlatformRepository;
  /** Tài khoản có thật để gắn quyền: DB có khoá ngoại sang `accounts`, bản giả thì không. */
  newAccountId: () => Promise<string>;
}

export function describePlatformRepositoryContract(
  label: string,
  make: () => Promise<PlatformContractEnv>,
): void {
  describe(`PlatformRepository — ${label}`, () => {
    it('phiên bản 1 chỉ nạp được khi bảng rỗng', async () => {
      const { repository } = await make();
      expect((await repository.seedConfigVersion({ a: 1 }, TEST_AUDIT.actorId, NOW))?.version).toBe(
        1,
      );
      expect(await repository.seedConfigVersion({ a: 2 }, TEST_AUDIT.actorId, NOW)).toBeNull();
    });

    it('phiên bản kế chỉ ghi từ phiên bản hiện hành; ghi từ phiên bản cũ trả null', async () => {
      const { repository } = await make();
      await repository.seedConfigVersion({ a: 1 }, TEST_AUDIT.actorId, NOW);
      const input = { values: { a: 2 }, note: null, createdBy: TEST_AUDIT.actorId, at: NOW };
      expect(
        await repository.createConfigVersion({ ...input, baseVersion: 2, audit: null }),
      ).toBeNull();
      expect(
        (await repository.createConfigVersion({ ...input, baseVersion: 1, audit: TEST_AUDIT }))
          ?.version,
      ).toBe(2);
      expect(
        await repository.createConfigVersion({ ...input, baseVersion: 1, audit: null }),
      ).toBeNull();
      expect((await repository.findCurrentConfig())?.version).toBe(2);
    });

    it('gắn quyền thay cả gói; treo một lần; thu quyền không có trả false', async () => {
      const { repository, newAccountId } = await make();
      const accountId = await newAccountId();
      const grant = (scopes: Array<'support' | 'user_reports'>) =>
        repository.upsertStaff({
          accountId,
          scopes,
          categoryIds: [],
          grantedBy: TEST_AUDIT.actorId,
          at: NOW,
          audit: TEST_AUDIT,
        });
      expect(await repository.findStaffGrant(accountId)).toBeNull();
      await grant(['support']);
      await grant(['user_reports']);
      expect((await repository.findStaff(accountId))?.scopes).toEqual(['user_reports']);
      expect(await repository.findStaffGrant(accountId)).toEqual({
        status: 'active',
        scopes: ['user_reports'],
        categoryIds: [],
      });

      const suspend = () => repository.suspendStaff({ accountId, reason: 'khoá', at: NOW });
      expect(await suspend()).toBe(true);
      expect(await suspend()).toBe(false);
      expect((await repository.findStaff(accountId))?.status).toBe('suspended');
      expect((await repository.findStaffGrant(accountId))?.status).toBe('suspended');

      expect(await repository.removeStaff(accountId)).toBe(true);
      expect(await repository.removeStaff(accountId)).toBe(false);
      await grant(['support']);
      expect(await repository.revokeStaff({ accountId, at: NOW, audit: TEST_AUDIT })).toBe(true);
      expect(await repository.revokeStaff({ accountId, at: NOW, audit: TEST_AUDIT })).toBe(false);
    });
  });
}
