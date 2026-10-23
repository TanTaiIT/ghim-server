import { beforeEach, describe, expect, it } from 'vitest';

import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { prisma, truncateAll } from './db-helpers.js';
import { TEST_AUDIT } from './test-app.js';

/* Luật 12: khoá, thu hồi phiên và dòng outbox phải cùng một transaction — rollback là mất cả ba. */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const LATER = new Date('2026-11-10T09:00:00+07:00');

beforeEach(truncateAll);

const repository = createIdentityRepository(prisma);

async function account(email: string) {
  return repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${email}`,
    passwordHash: 'argon2id-gia',
    googleSub: null,
    status: 'active',
    displayName: 'Người thử',
    at: NOW,
  });
}

describe('lockAccount trên Postgres thật', () => {
  it('khoá xong thì dòng outbox locked nằm cùng transaction với trạng thái và phiên thu hồi', async () => {
    const user = await account('a@ghim.test');
    const master = await account('m@ghim.test');
    await repository.createSession({
      accountId: user.id,
      refreshTokenHash: 'rt-1',
      deviceName: 'Máy',
      ip: null,
      userAgent: null,
      expiresAt: LATER,
      at: NOW,
    });

    await repository.lockAccount({
      accountId: user.id,
      reason: 'Thử',
      lockedBy: master.id,
      at: NOW,
      events: [{ type: 'identity.account.locked', payload: { accountId: user.id, reason: 'Thử' } }],
      audit: TEST_AUDIT,
    });

    expect(await prisma.account.findUnique({ where: { id: user.id } })).toMatchObject({
      status: 'locked',
      lockedAt: NOW,
    });
    expect(await prisma.session.findMany({ where: { accountId: user.id } })).toEqual([
      expect.objectContaining({ revokedAt: NOW, revokeReason: 'account_locked' }),
    ]);
    expect(await prisma.outboxEvent.findMany()).toEqual([
      expect.objectContaining({
        type: 'identity.account.locked',
        payload: { accountId: user.id, reason: 'Thử' },
      }),
    ]);
  });

  it('khoá một tài khoản không tồn tại → false, không có dòng outbox nào', async () => {
    await expect(
      repository.lockAccount({
        accountId: '00000000-0000-7000-8000-000000000000',
        reason: 'Thử',
        lockedBy: '00000000-0000-7000-8000-000000000001',
        at: NOW,
        events: [{ type: 'identity.account.locked', payload: { accountId: 'x' } }],
        audit: TEST_AUDIT,
      }),
    ).resolves.toBe(false);
    expect(await prisma.outboxEvent.count()).toBe(0);
  });

  it('khoá tài khoản đang bị khoá, mở khoá tài khoản không bị khoá → false, không ghi gì (fix-audit-identity-low, L1)', async () => {
    const user = await account('b@ghim.test');
    const lockInput = {
      accountId: user.id,
      reason: 'Thử',
      lockedBy: user.id,
      at: NOW,
      events: [{ type: 'identity.account.locked' as const, payload: { accountId: user.id } }],
      audit: TEST_AUDIT,
    };
    const unlockInput = {
      accountId: user.id,
      unlockedBy: user.id,
      at: NOW,
      events: [{ type: 'identity.account.unlocked' as const, payload: { accountId: user.id } }],
      audit: TEST_AUDIT,
    };
    await expect(repository.unlockAccount(unlockInput)).resolves.toBe(false);
    await expect(repository.lockAccount(lockInput)).resolves.toBe(true);
    await expect(repository.lockAccount(lockInput)).resolves.toBe(false);
    expect(await prisma.outboxEvent.count()).toBe(1);
    expect(await prisma.account.findUnique({ where: { id: user.id } })).toMatchObject({
      status: 'locked',
      statusBeforeLock: 'active',
    });
  });
});
