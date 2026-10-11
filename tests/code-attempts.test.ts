import { describe, expect, it } from 'vitest';

import { hmacHex } from '../src/common/crypto/secrets.js';
import type { IdentityRepository } from '../src/modules/identity/identity.repository.js';
import { prisma } from './db-helpers.js';
import { buildIdentityService, TEST_HASH_KEY } from './identity-service.helpers.js';
import { repositories } from './test-app.js';

/*
 * Trần 5 lần sai phải đứng vững khi các lượt đoán tới CÙNG LÚC (rà soát 10/10/2026). Hình dạng của
 * cuộc đua là mọi lượt đọc mã sống trước khi lượt nào ghi; trên Postgres thứ tự đó tuỳ pool kết nối,
 * nên `readersInLockstep` giữ các lượt đọc lại cho đủ rồi mới thả. Bản đọc-rồi-ghi cũ để lọt cả 10 lượt
 * với bộ đếm dừng ở 1 — repository đúng mà service quay lại đọc-rồi-ghi thì chỉ ca này bắt được; hai
 * lượt tiêu cùng một mã nằm ở `code-attempts.db.test.ts`.
 */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const CODE = '123456';
const NEW_PASSWORD = 'mat-khau-moi-cua-lan-2026';

/** Repository thật, nhưng `readers` lượt đọc mã sống chờ nhau đủ rồi mới đi tiếp. */
function readersInLockstep(readers: number): IdentityRepository {
  const base = repositories.identity;
  let arrived = 0;
  const allRead = Promise.withResolvers<void>();
  return {
    ...base,
    async findLiveCode(accountId, purpose) {
      const live = await base.findLiveCode(accountId, purpose);
      arrived += 1;
      if (arrived >= readers) allRead.resolve();
      await allRead.promise;
      return live;
    },
  };
}

let seq = 0;
async function accountWithResetCode(repository: IdentityRepository) {
  const built = buildIdentityService({ repository });
  seq += 1;
  const email = `nguoi${seq}@ghim.test`;
  const account = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${email}`,
    passwordHash: 'argon2id-gia',
    googleSub: null,
    status: 'active',
    displayName: 'Người thử',
    at: NOW,
  });
  const code = await repository.issueCode({
    accountId: account.id,
    purpose: 'password_reset',
    codeHash: hmacHex(TEST_HASH_KEY, 'code', CODE),
    targetEmail: null,
    expiresAt: new Date(NOW.getTime() + 600_000),
    at: NOW,
  });
  return { ...built, email, codeId: code.id };
}

describe('đoán mã song song', () => {
  it('10 lượt sai cùng lúc: bộ đếm lên 10, mã bị huỷ, mã đúng nhập sau → CODE_EXPIRED', async () => {
    const { service, email, codeId } = await accountWithResetCode(readersInLockstep(10));
    const guesses = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        service.resetPassword({ email, code: String(200_000 + index), password: NEW_PASSWORD }),
      ),
    );

    expect(guesses.every((result) => result.status === 'rejected')).toBe(true);
    expect(await prisma.verificationCode.findUnique({ where: { id: codeId } })).toMatchObject({
      attempts: 10,
      consumedAt: NOW,
    });
    await expect(
      service.resetPassword({ email, code: CODE, password: NEW_PASSWORD }),
    ).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
  });
});
