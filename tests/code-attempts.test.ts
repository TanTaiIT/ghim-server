import { describe, expect, it } from 'vitest';

import { hmacHex } from '../src/common/crypto/secrets.js';
import { buildIdentityService } from './identity.service.test.js';

/*
 * Trần 5 lần sai phải đứng vững khi các lượt đoán tới CÙNG LÚC (rà soát 10/10/2026). `Promise.all`
 * trên repository giả cho mọi lượt đọc mã trước khi lượt nào ghi — đúng hình dạng của cuộc đua;
 * bản đọc-rồi-ghi cũ để lọt cả 10 lượt với bộ đếm dừng ở 1.
 */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const HASH_KEY = 'identity-hash-key-thu-du-ba-muoi-hai-ky-tu-01';
const CODE = '123456';
const NEW_PASSWORD = 'mat-khau-moi-cua-lan-2026';

async function accountWithResetCode() {
  const built = buildIdentityService();
  const email = 'nguoi@ghim.test';
  const account = await built.repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: 'h',
    passwordHash: 'argon2id-gia',
    googleSub: null,
    status: 'active',
    displayName: 'Người thử',
    at: NOW,
  });
  const code = await built.repository.issueCode({
    accountId: account.id,
    purpose: 'password_reset',
    codeHash: hmacHex(HASH_KEY, 'code', CODE),
    targetEmail: null,
    expiresAt: new Date(NOW.getTime() + 600_000),
    at: NOW,
  });
  return { ...built, email, codeId: code.id };
}

describe('đoán mã song song', () => {
  it('10 lượt sai cùng lúc: bộ đếm lên 10, mã bị huỷ, mã đúng nhập sau → CODE_EXPIRED', async () => {
    const { service, repository, email, codeId } = await accountWithResetCode();
    const guesses = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        service.resetPassword({ email, code: String(200_000 + index), password: NEW_PASSWORD }),
      ),
    );

    expect(guesses.every((result) => result.status === 'rejected')).toBe(true);
    expect(repository.codes.get(codeId)).toMatchObject({ attempts: 10 });
    expect(repository.codes.get(codeId)?.consumedAt).toEqual(NOW);
    await expect(
      service.resetPassword({ email, code: CODE, password: NEW_PASSWORD }),
    ).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
  });

  it('mã đúng tới giữa loạt đoán sai: chỉ thắng khi tới trước lượt sai thứ 5', async () => {
    const { service, email } = await accountWithResetCode();
    const attempts = [
      ...Array.from({ length: 6 }, (_, index) => String(300_000 + index)),
      CODE,
    ].map((code) => service.resetPassword({ email, code, password: NEW_PASSWORD }));
    const results = await Promise.allSettled(attempts);

    expect(results.at(-1)).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'CODE_EXPIRED' }),
    });
  });

  it('hai lượt nhập đúng cùng lúc: đúng một lượt đổi mật khẩu', async () => {
    const { service, email } = await accountWithResetCode();
    const results = await Promise.allSettled([
      service.resetPassword({ email, code: CODE, password: NEW_PASSWORD }),
      service.resetPassword({ email, code: CODE, password: `${NEW_PASSWORD}-2` }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'CODE_EXPIRED' }),
    });
  });
});
