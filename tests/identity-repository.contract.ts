import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import type { IdentityRepository } from '../src/modules/identity/identity.repository.js';

/*
 * Hợp đồng repository của `identity`: cùng một bộ ca chạy trên bản giả (`repository-contracts.test.ts`)
 * và trên Postgres (`repository-contracts.db.test.ts`). Chỉ ca tuần tự — ca đồng thời thật nằm ở test
 * DB, vì bản giả chạy tuần tự.
 */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const LATER = new Date('2026-10-10T05:00:00.000Z');

let seq = 0;
async function newAccount(repository: IdentityRepository, emailNormalized?: string) {
  seq += 1;
  const email = emailNormalized ?? `hop-dong-${seq}@ghim.test`;
  return repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${seq}`,
    passwordHash: 'x',
    googleSub: null,
    status: 'pending_verification',
    displayName: `Người ${seq}`,
    at: NOW,
  });
}

const issue = (repository: IdentityRepository, accountId: string, codeHash = 'ma') =>
  repository.issueCode({
    accountId,
    purpose: 'email_verify',
    codeHash,
    targetEmail: null,
    expiresAt: LATER,
    at: NOW,
  });

export function describeIdentityRepositoryContract(
  label: string,
  make: () => Promise<IdentityRepository>,
): void {
  describe(`IdentityRepository — ${label}`, () => {
    it('email chuẩn hoá unique: lượt tạo trùng ném đúng lỗi P2002 của Prisma', async () => {
      const repository = await make();
      await newAccount(repository, 'trung@ghim.test');
      const duplicate = newAccount(repository, 'trung@ghim.test');
      await expect(duplicate).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      await expect(duplicate).rejects.toMatchObject({ code: 'P2002' });
    });

    it('một mã sống mỗi mục đích: phát mã mới thì mã cũ hết sống', async () => {
      const repository = await make();
      const account = await newAccount(repository);
      await issue(repository, account.id, 'ma-cu');
      const fresh = await issue(repository, account.id, 'ma-moi');
      expect((await repository.findLiveCode(account.id, 'email_verify'))?.id).toBe(fresh.id);
    });

    it('tiêu mã một lần: lượt thứ hai trả false và không đổi tài khoản', async () => {
      const repository = await make();
      const account = await newAccount(repository);
      const code = await issue(repository, account.id);
      const verify = () =>
        repository.applyAccountChange({
          accountId: account.id,
          consumeCodeId: code.id,
          patch: { status: 'active' },
          at: NOW,
          events: [],
        });
      expect(await verify()).toBe(true);
      await repository.updateAccount(account.id, { status: 'pending_verification' });
      expect(await verify()).toBe(false);
      expect((await repository.findAccountById(account.id))?.status).toBe('pending_verification');
    });

    it('sai đủ trần thì mã bị huỷ, không còn mã sống', async () => {
      const repository = await make();
      const account = await newAccount(repository);
      const code = await issue(repository, account.id);
      const results: Array<{ cancelled: boolean }> = [];
      await sequentially([1, 2, 3, 4, 5], async () => {
        results.push(await repository.recordWrongCode({ id: code.id, maxAttempts: 5, at: NOW }));
      });
      expect(results.map((result) => result.cancelled)).toEqual([false, false, false, false, true]);
      expect(await repository.findLiveCode(account.id, 'email_verify')).toBeNull();
    });

    it('xoay token làm mới có điều kiện: token sai hay đã xoay thì false', async () => {
      const repository = await make();
      const account = await newAccount(repository);
      const session = await repository.createSession({
        accountId: account.id,
        refreshTokenHash: 'hash-dau',
        deviceName: 'Máy',
        ip: null,
        userAgent: null,
        secondFactorAt: null,
        expiresAt: LATER,
        at: NOW,
      });
      const rotate = (expectedHash: string, nextHash: string) =>
        repository.rotateRefreshToken({
          sessionId: session.id,
          expectedHash,
          nextHash,
          at: NOW,
          expiresAt: LATER,
        });
      expect(await rotate('hash-sai', 'hash-a')).toBe(false);
      expect(await rotate('hash-dau', 'hash-b')).toBe(true);
      expect(await rotate('hash-dau', 'hash-c')).toBe(false);
      expect((await repository.findSessionById(session.id))?.prevRefreshTokenHash).toBe('hash-dau');
    });
  });
}
