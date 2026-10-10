import { describe, expect, it } from 'vitest';

import { noStaffPrivilegeSource } from '../src/common/auth/privilege-source.js';
import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { createSecretBox } from '../src/common/crypto/secrets.js';
import { createIdentityService } from '../src/modules/identity/identity.service.js';
import { createFakeIdentityRepository } from './fakes/identity-repository.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { TEST_AUDIT } from './fakes/audit.fake.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;

/** Khung dựng service với toàn bộ deps giả — các file test service khác bắt đầu từ đây. */
export function buildIdentityService(
  overrides: { now?: Date; repository?: ReturnType<typeof createFakeIdentityRepository> } = {},
) {
  const repository = overrides.repository ?? createFakeIdentityRepository();
  const jobs = createFakeJobs();
  const service = createIdentityService({
    repository,
    jobs,
    privilegeSource: noStaffPrivilegeSource,
    config: createStaticRuntimeConfig(),
    clock: () => overrides.now ?? NOW,
    hashKey: 'identity-hash-key-thu-du-ba-muoi-hai-ky-tu-01',
    secrets: createSecretBox(Buffer.alloc(32, 1).toString('base64')),
    googleVerifier: { verify: async () => null },
  });
  return { service, repository, jobs };
}

let seq = 0;
async function seedAccount(
  repository: ReturnType<typeof createFakeIdentityRepository>,
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

const session = (
  accountId: string,
  overrides: Partial<{ expiresAt: Date; secondFactorAt: Date | null }> = {},
) => ({
  accountId,
  refreshTokenHash: `rt-${Math.random()}`,
  deviceName: 'Máy thử',
  ip: null,
  userAgent: null,
  secondFactorAt: overrides.secondFactorAt ?? null,
  expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 30 * DAY_MS),
  at: NOW,
});

describe('createIdentityService — khung', () => {
  it('dựng được với toàn bộ deps giả', () => {
    expect(buildIdentityService().service.resolveActor).toBeTypeOf('function');
  });
});

describe('resolveActor', () => {
  it('phiên sống của tài khoản đã xác nhận → actor đủ trường, không email', async () => {
    const { service, repository } = buildIdentityService();
    const account = await seedAccount(repository);
    const { id: sessionId } = await repository.createSession(
      session(account!.id, { secondFactorAt: NOW }),
    );
    await expect(service.resolveActor(sessionId)).resolves.toEqual({
      accountId: account!.id,
      role: 'user',
      sessionId,
      secondFactorAt: NOW,
      emailVerified: true,
    });
  });

  it('tài khoản chưa xác nhận → emailVerified false', async () => {
    const { service, repository } = buildIdentityService();
    const account = await seedAccount(repository, 'pending_verification');
    const { id } = await repository.createSession(session(account!.id));
    await expect(service.resolveActor(id)).resolves.toMatchObject({ emailVerified: false });
  });

  it('phiên không tồn tại hoặc đã thu hồi → 401 SESSION_REVOKED', async () => {
    const { service, repository } = buildIdentityService();
    const account = await seedAccount(repository);
    const { id } = await repository.createSession(session(account!.id));
    await repository.updateSession(id, { revokedAt: NOW, revokeReason: 'logout' });
    await expect(service.resolveActor(id)).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_REVOKED',
    });
    await expect(service.resolveActor('khong-co')).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });

  it('phiên quá hạn trượt → 401 SESSION_EXPIRED', async () => {
    const { service, repository } = buildIdentityService();
    const account = await seedAccount(repository);
    const { id } = await repository.createSession(
      session(account!.id, { expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await expect(service.resolveActor(id)).rejects.toMatchObject({
      statusCode: 401,
      code: 'SESSION_EXPIRED',
    });
  });

  it('tài khoản bị khoá → 403 ACCOUNT_LOCKED kèm lý do; đã xoá → 401 SESSION_REVOKED', async () => {
    const { service, repository } = buildIdentityService();
    const locked = await seedAccount(repository, 'locked');
    const { id: lockedSession } = await repository.createSession(session(locked!.id));
    await expect(service.resolveActor(lockedSession)).rejects.toMatchObject({
      statusCode: 403,
      code: 'ACCOUNT_LOCKED',
      message: expect.stringContaining('Thử'),
    });

    const deleted = await seedAccount(repository, 'deleted');
    const { id: deletedSession } = await repository.createSession(session(deleted!.id));
    await expect(service.resolveActor(deletedSession)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });
});
