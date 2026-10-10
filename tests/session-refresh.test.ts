import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../src/common/crypto/secrets.js';
import { buildIdentityService } from './identity.service.test.js';

/*
 * `refresh` song song trên repository giả (change fix-session-refresh-race): `Promise.all` cho hai lượt
 * cùng đọc phiên trước khi lượt nào ghi — bản đọc-rồi-ghi đè cũ để cả hai "thắng".
 */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const TOKEN = 'refresh-token-ban-dau';

async function sessionWithToken() {
  const built = buildIdentityService();
  const account = await built.repository.createAccount({
    email: 'a@ghim.test',
    emailNormalized: 'a@ghim.test',
    emailHash: 'h',
    passwordHash: 'x',
    googleSub: null,
    status: 'active',
    displayName: 'A',
    at: NOW,
  });
  const session = await built.repository.createSession({
    accountId: account.id,
    refreshTokenHash: sha256Hex(TOKEN),
    deviceName: 'Máy',
    ip: null,
    userAgent: null,
    secondFactorAt: null,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    at: NOW,
  });
  return { ...built, sessionId: session.id };
}

describe('refresh song song', () => {
  it('đúng một lượt thắng; lượt thua REFRESH_CONFLICT và phiên còn sống', async () => {
    const { service, repository, sessionId } = await sessionWithToken();
    const results = await Promise.allSettled([service.refresh(TOKEN), service.refresh(TOKEN)]);

    const won = results.filter((result) => result.status === 'fulfilled');
    expect(won).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ statusCode: 409, code: 'REFRESH_CONFLICT' }),
    });
    expect((await repository.findSessionById(sessionId))?.revokedAt).toBeNull();

    const next = (won[0] as PromiseFulfilledResult<{ refreshToken: string }>).value.refreshToken;
    await expect(service.refresh(next)).resolves.toMatchObject({ sessionId });
  });

  it('sau cuộc đua, gửi lại token cũ vẫn là dùng lại → thu hồi phiên', async () => {
    const { service, repository, sessionId } = await sessionWithToken();
    await Promise.allSettled([service.refresh(TOKEN), service.refresh(TOKEN)]);
    await expect(service.refresh(TOKEN)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect((await repository.findSessionById(sessionId))?.revokeReason).toBe('refresh_reuse');
  });
});
