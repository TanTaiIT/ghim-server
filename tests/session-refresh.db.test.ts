import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { prisma, truncateAll } from './db-helpers.js';

/* Xoay token làm mới có điều kiện trên Postgres thật, với transaction chạy đồng thời. */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const LATER = new Date('2026-11-09T04:00:00.000Z');
const repository = createIdentityRepository(prisma);

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

async function session() {
  const account = await prisma.account.create({
    data: {
      email: 'a@ghim.test',
      emailNormalized: 'a@ghim.test',
      emailHash: 'h',
      passwordHash: 'x',
      displayName: 'A',
      status: 'active',
    },
  });
  return repository.createSession({
    accountId: account.id,
    refreshTokenHash: 'hash-dang-dung',
    deviceName: 'Máy',
    ip: null,
    userAgent: null,
    secondFactorAt: null,
    expiresAt: LATER,
    at: NOW,
  });
}

const rotate = (sessionId: string, nextHash: string) =>
  repository.rotateRefreshToken({
    sessionId,
    expectedHash: 'hash-dang-dung',
    nextHash,
    at: NOW,
    expiresAt: LATER,
  });

describe('rotateRefreshToken', () => {
  it('hai lượt xoay cùng lúc từ một token: đúng một lượt ghi, token cũ thành token trước', async () => {
    const { id } = await session();
    const results = await Promise.all([rotate(id, 'hash-moi-a'), rotate(id, 'hash-moi-b')]);

    expect(results.toSorted()).toEqual([false, true]);
    const row = await prisma.session.findUniqueOrThrow({ where: { id } });
    expect(row.prevRefreshTokenHash).toBe('hash-dang-dung');
    expect(['hash-moi-a', 'hash-moi-b']).toContain(row.refreshTokenHash);
  });

  it('phiên đã thu hồi: không lượt nào ghi được', async () => {
    const { id } = await session();
    await prisma.session.update({
      where: { id },
      data: { revokedAt: NOW, revokeReason: 'logout' },
    });
    expect(await rotate(id, 'hash-moi')).toBe(false);
    expect((await prisma.session.findUniqueOrThrow({ where: { id } })).refreshTokenHash).toBe(
      'hash-dang-dung',
    );
  });
});
