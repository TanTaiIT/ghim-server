import type { FastifyInstance } from 'fastify';

import type { OpsScope } from '../src/common/auth/privilege-source.js';
import type { FakeIdentityRepository } from './fakes/identity-repository.fake.js';

/**
 * Dựng tài khoản + phiên có sẵn lớp thứ hai rồi ký access token — cho test bàn vận hành không
 * phải đi hết luồng đăng nhập / TOTP ở mỗi ca. Quyền staff do test gắn vào `PrivilegeSource` giả.
 */
export interface OpsTestAccess {
  app: FastifyInstance;
  repository: FakeIdentityRepository;
  now: Date;
}

const DAY_MS = 86_400_000;
let seq = 0;

export async function seedAccount(
  { repository, now }: Pick<OpsTestAccess, 'repository' | 'now'>,
  overrides: {
    role?: 'user' | 'master';
    status?: 'pending_verification' | 'active' | 'locked';
    passwordHash?: string;
  } = {},
) {
  seq += 1;
  const email = `tk${seq}@ghim.test`;
  const row = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${seq}`,
    passwordHash: overrides.passwordHash ?? 'argon2id-gia',
    googleSub: null,
    status: overrides.status === 'locked' ? 'active' : (overrides.status ?? 'active'),
    displayName: `Tài khoản ${seq}`,
    at: now,
  });
  if (overrides.role === 'master') await repository.updateAccount(row.id, { role: 'master' });
  if (overrides.status === 'locked') {
    await repository.lockAccount({
      accountId: row.id,
      reason: 'Thử',
      lockedBy: row.id,
      at: now,
      events: [],
    });
  }
  return { ...row, email };
}

export async function tokenFor(
  { app, repository, now }: OpsTestAccess,
  accountId: string,
  options: { secondFactor?: boolean } = {},
): Promise<string> {
  const session = await repository.createSession({
    accountId,
    refreshTokenHash: `rt-${accountId}-${Math.random()}`,
    deviceName: 'Máy test',
    ip: null,
    userAgent: null,
    secondFactorAt: options.secondFactor === false ? null : now,
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    at: now,
  });
  return app.jwt.sign({ sid: session.id });
}

export function scopedPrivilegeSource(scopes: Map<string, Set<OpsScope>>) {
  return {
    hasStaffScope: async (accountId: string, scope: OpsScope) =>
      scopes.get(accountId)?.has(scope) ?? false,
    isStaff: async (accountId: string) => scopes.has(accountId),
  };
}
