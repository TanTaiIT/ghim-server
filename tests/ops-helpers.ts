import type { FastifyInstance } from 'fastify';

import { repositories, TEST_AUDIT, TEST_NOW } from './test-app.js';

/**
 * Dựng tài khoản + phiên rồi ký access token — cho test bàn vận hành không phải đi hết luồng đăng nhập ở mỗi
 * ca. Quyền staff gắn bằng `grantStaff` của `test-app.ts`.
 */
const DAY_MS = 86_400_000;
let seq = 0;

export async function seedAccount(
  overrides: {
    role?: 'user' | 'master';
    status?: 'pending_verification' | 'active' | 'locked';
    passwordHash?: string;
  } = {},
  now: Date = TEST_NOW,
) {
  const repository = repositories.identity;
  seq += 1;
  const email = `tk${seq}@ghim.test`;
  const row = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-tk-${seq}`,
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
      audit: TEST_AUDIT,
    });
  }
  return { ...row, email };
}

export async function tokenFor(
  app: FastifyInstance,
  accountId: string,
  now: Date = TEST_NOW,
): Promise<string> {
  const session = await repositories.identity.createSession({
    accountId,
    refreshTokenHash: `rt-${accountId}-${Math.random()}`,
    deviceName: 'Máy test',
    ip: null,
    userAgent: null,
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    at: now,
  });
  return app.jwt.sign({ sid: session.id });
}
