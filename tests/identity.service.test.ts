import { describe, expect, it } from 'vitest';

import { buildIdentityService } from './identity-service.helpers.js';
import { repositories, TEST_AUDIT } from './test-app.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;
const repository = repositories.identity;
/** `sessions.id` là uuid: một id lạ vẫn phải đúng dạng uuid, như mọi `sid` trong token do server ký. */
const MISSING_SESSION_ID = '00000000-0000-7000-8000-000000000000';

let seq = 0;
async function seedAccount(
  status: 'pending_verification' | 'active' | 'locked' | 'deleted' = 'active',
) {
  seq += 1;
  const email = `nguoi${seq}@ghim.test`;
  const account = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${email}`,
    passwordHash: 'argon2id-gia',
    googleSub: null,
    status: 'active',
    displayName: `Người thử ${seq}`,
    at: NOW,
  });
  if (status === 'locked') {
    await repository.lockAccount({
      accountId: account.id,
      reason: 'Thử',
      lockedBy: account.id,
      at: NOW,
      events: [],
      audit: TEST_AUDIT,
    });
  } else if (status === 'deleted') {
    await repository.softDeleteAccount({ accountId: account.id, at: NOW, events: [] });
  } else if (status !== 'active') {
    await repository.updateAccount(account.id, { status });
  }
  return repository.findAccountById(account.id);
}

const session = (accountId: string, overrides: Partial<{ expiresAt: Date }> = {}) => ({
  accountId,
  refreshTokenHash: `rt-${Math.random()}`,
  deviceName: 'Máy thử',
  ip: null,
  userAgent: null,
  expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 30 * DAY_MS),
  at: NOW,
});

describe('createIdentityService — khung', () => {
  it('dựng được trên repository thật của worker', () => {
    expect(buildIdentityService().service.resolveActor).toBeTypeOf('function');
  });
});

describe('resolveActor', () => {
  it('phiên sống của tài khoản đã xác nhận → actor đủ trường, không email', async () => {
    const { service } = buildIdentityService();
    const account = await seedAccount();
    const { id: sessionId } = await repository.createSession(session(account!.id));
    await expect(service.resolveActor(sessionId)).resolves.toEqual({
      accountId: account!.id,
      role: 'user',
      sessionId,
      emailVerified: true,
    });
  });

  it('tài khoản chưa xác nhận → emailVerified false', async () => {
    const { service } = buildIdentityService();
    const account = await seedAccount('pending_verification');
    const { id } = await repository.createSession(session(account!.id));
    await expect(service.resolveActor(id)).resolves.toMatchObject({ emailVerified: false });
  });

  it('phiên không tồn tại hoặc đã thu hồi → 401 SESSION_REVOKED', async () => {
    const { service } = buildIdentityService();
    const account = await seedAccount();
    const { id } = await repository.createSession(session(account!.id));
    await repository.updateSession(id, { revokedAt: NOW, revokeReason: 'logout' });
    await expect(service.resolveActor(id)).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_REVOKED',
    });
    await expect(service.resolveActor(MISSING_SESSION_ID)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });

  it('phiên quá hạn trượt → 401 SESSION_EXPIRED', async () => {
    const { service } = buildIdentityService();
    const account = await seedAccount();
    const { id } = await repository.createSession(
      session(account!.id, { expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await expect(service.resolveActor(id)).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_EXPIRED',
    });
  });

  it('tài khoản bị khoá → 403 ACCOUNT_LOCKED kèm lý do; đã xoá → 401 SESSION_REVOKED', async () => {
    const { service } = buildIdentityService();
    const locked = await seedAccount('locked');
    const { id: lockedSession } = await repository.createSession(session(locked!.id));
    await expect(service.resolveActor(lockedSession)).rejects.toMatchObject({
      statusCode: 403,
      code: 'ACCOUNT_LOCKED',
      message: expect.stringContaining('Thử'),
    });

    const deleted = await seedAccount('deleted');
    const { id: deletedSession } = await repository.createSession(session(deleted!.id));
    await expect(service.resolveActor(deletedSession)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });
});
