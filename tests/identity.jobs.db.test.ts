import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import {
  createPurgeExpiredHandler,
  createPurgeUnverifiedHandler,
} from '../src/modules/identity/identity.jobs.js';
import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { prisma, truncateAll } from './db-helpers.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

const repository = createIdentityRepository(prisma);

const account = (email: string, status: 'pending_verification' | 'active', daysAgo: number) => ({
  email,
  emailNormalized: email,
  emailHash: `hash-${email}`,
  passwordHash: 'argon2id-gia',
  googleSub: null,
  status,
  displayName: 'Người thử',
  at: new Date(NOW.getTime() - daysAgo * DAY_MS),
});

describe('identity.purge-unverified trên Postgres thật', () => {
  it('dòng chưa xác nhận quá 7 ngày biến mất cùng mã và phiên; email đó đăng ký lại được', async () => {
    const old = await repository.createAccount(account('cu@ghim.test', 'pending_verification', 8));
    await repository.issueCode({
      accountId: old.id,
      purpose: 'email_verify',
      codeHash: 'h',
      targetEmail: null,
      expiresAt: NOW,
      at: NOW,
    });
    const recent = await repository.createAccount(
      account('moi@ghim.test', 'pending_verification', 6),
    );
    const active = await repository.createAccount(account('xong@ghim.test', 'active', 30));

    await createPurgeUnverifiedHandler({
      repository,
      config: createStaticRuntimeConfig(),
      clock: () => NOW,
    })();

    expect(await repository.findAccountById(old.id)).toBeNull();
    expect(await prisma.verificationCode.count({ where: { accountId: old.id } })).toBe(0);
    expect(await repository.findAccountById(recent.id)).not.toBeNull();
    expect(await repository.findAccountById(active.id)).not.toBeNull();

    const again = await repository.createAccount(
      account('cu@ghim.test', 'pending_verification', 0),
    );
    expect(again.id).not.toBe(old.id);
  });
});

describe('identity.purge-expired trên Postgres thật', () => {
  it('xoá mã quá hạn / đã tiêu và phiên thu hồi hay hết hạn quá 30 ngày; giữ mã sống và phiên sống', async () => {
    const owner = await repository.createAccount(account('a@ghim.test', 'active', 60));
    const code = (
      purpose: 'email_verify' | 'password_reset' | 'email_change',
      expiresInDays: number,
      consumedDaysAgo: number | null,
    ) =>
      repository.issueCode({
        accountId: owner.id,
        purpose,
        codeHash: 'h',
        targetEmail: purpose === 'email_change' ? 'x@ghim.test' : null,
        expiresAt: new Date(NOW.getTime() + expiresInDays * DAY_MS),
        at: new Date(NOW.getTime() - (consumedDaysAgo ?? 0) * DAY_MS),
      });
    const expired = await code('email_verify', -1, null);
    const live = await code('password_reset', 1, null);
    const consumed = await code('email_change', 1, null);
    await repository.updateCode(consumed.id, { consumedAt: new Date(NOW.getTime() - DAY_MS) });

    const session = (daysAgoRevoked: number | null, expiresInDays: number) =>
      repository
        .createSession({
          accountId: owner.id,
          refreshTokenHash: `rt-${Math.random()}`,
          deviceName: 'Máy',
          ip: null,
          userAgent: null,
          expiresAt: new Date(NOW.getTime() + expiresInDays * DAY_MS),
          at: NOW,
        })
        .then(async (row) =>
          daysAgoRevoked === null
            ? row
            : repository.updateSession(row.id, {
                revokedAt: new Date(NOW.getTime() - daysAgoRevoked * DAY_MS),
                revokeReason: 'logout',
              }),
        );
    const oldRevoked = await session(31, 30);
    const recentRevoked = await session(5, 30);
    const longExpired = await session(null, -31);
    const alive = await session(null, 30);

    await createPurgeExpiredHandler({ repository, clock: () => NOW })();

    const codeIds = (await prisma.verificationCode.findMany()).map((row) => row.id);
    expect(codeIds).toEqual([live.id]);
    expect(codeIds).not.toContain(expired.id);
    const sessionIds = (await prisma.session.findMany()).map((row) => row.id).toSorted();
    expect(sessionIds).toEqual([recentRevoked.id, alive.id].toSorted());
    expect(sessionIds).not.toContain(oldRevoked.id);
    expect(sessionIds).not.toContain(longExpired.id);
  });
});
