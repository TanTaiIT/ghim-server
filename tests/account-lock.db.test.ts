import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { prisma, truncateAll } from './db-helpers.js';
import { TEST_AUDIT } from './fakes/audit.fake.js';

/* Luật 12: khoá, thu hồi phiên và dòng outbox phải cùng một transaction — rollback là mất cả ba. */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const LATER = new Date('2026-11-10T09:00:00+07:00');

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

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
      secondFactorAt: null,
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

  it('khoá một tài khoản không tồn tại thì cả transaction rollback: không có dòng outbox nào', async () => {
    await expect(
      repository.lockAccount({
        accountId: '00000000-0000-7000-8000-000000000000',
        reason: 'Thử',
        lockedBy: '00000000-0000-7000-8000-000000000001',
        at: NOW,
        events: [{ type: 'identity.account.locked', payload: { accountId: 'x' } }],
        audit: TEST_AUDIT,
      }),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect(await prisma.outboxEvent.count()).toBe(0);
  });
});
