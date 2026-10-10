import { describe, expect, it } from 'vitest';

import { createFakeIdentityRepository } from './fakes/identity-repository.fake.js';

/*
 * Bản giả phải vấp đúng những chốt mà `identity.db.test.ts` chứng minh DB giữ — unique và partial
 * unique — nếu không thì test HTTP chạy trên bản giả sẽ xanh ở chỗ DB thật đỏ.
 */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const LATER = new Date('2026-10-10T05:00:00.000Z');

let seq = 0;
const account = (overrides: { emailNormalized?: string; googleSub?: string | null } = {}) => {
  seq += 1;
  const email = overrides.emailNormalized ?? `nguoi${seq}@ghim.test`;
  return {
    email,
    emailNormalized: email,
    emailHash: `hash-${email}`,
    passwordHash: 'argon2id-gia',
    googleSub: overrides.googleSub ?? null,
    status: 'active' as const,
    displayName: `Người thử ${seq}`,
    at: NOW,
  };
};

describe('createFakeIdentityRepository — unique như DB', () => {
  it('email_normalized unique, kể cả khi update', async () => {
    const repo = createFakeIdentityRepository();
    await repo.createAccount(account({ emailNormalized: 'lan@gmail.com' }));
    const other = await repo.createAccount(account());
    await expect(
      repo.createAccount(account({ emailNormalized: 'lan@gmail.com' })),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      repo.updateAccount(other.id, { emailNormalized: 'lan@gmail.com' }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('google_sub unique nhưng nhiều null vẫn được', async () => {
    const repo = createFakeIdentityRepository();
    await repo.createAccount(account({ googleSub: 'sub-1' }));
    await repo.createAccount(account());
    await repo.createAccount(account());
    await expect(repo.createAccount(account({ googleSub: 'sub-1' }))).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('refresh_token_hash unique', async () => {
    const repo = createFakeIdentityRepository();
    const { id } = await repo.createAccount(account());
    const session = {
      accountId: id,
      refreshTokenHash: 'trung',
      deviceName: 'Máy',
      ip: null,
      userAgent: null,
      secondFactorAt: null,
      expiresAt: LATER,
      at: NOW,
    };
    await repo.createSession(session);
    await expect(repo.createSession(session)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('một mã sống mỗi mục đích: issueCode tiêu mã cũ, updateCode không hồi sinh hai mã', async () => {
    const repo = createFakeIdentityRepository();
    const { id } = await repo.createAccount(account());
    const first = await repo.issueCode({
      accountId: id,
      purpose: 'email_verify',
      codeHash: 'h1',
      targetEmail: null,
      expiresAt: LATER,
      at: NOW,
    });
    const second = await repo.issueCode({
      accountId: id,
      purpose: 'email_verify',
      codeHash: 'h2',
      targetEmail: null,
      expiresAt: LATER,
      at: NOW,
    });
    expect((await repo.findLiveCode(id, 'email_verify'))?.id).toBe(second.id);
    await expect(repo.updateCode(first.id, { consumedAt: null })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('một đánh dấu mở mỗi (tài khoản, loại, máy) và lookup_code unique', async () => {
    const repo = createFakeIdentityRepository();
    const { id } = await repo.createAccount(account());
    const flag = {
      accountId: id,
      kind: 'many_accounts_on_device' as const,
      deviceHash: 'may-1',
      relatedAccountId: null,
      lookupCode: 'ABCDEFGH',
    };
    await repo.applyFlagChanges({
      create: [flag],
      clear: { ids: [], clearedBy: null, clearedReason: '' },
      at: NOW,
      events: [],
    });
    await expect(
      repo.applyFlagChanges({
        create: [{ ...flag, lookupCode: 'ZZZZZZZZ' }],
        clear: { ids: [], clearedBy: null, clearedReason: '' },
        at: NOW,
        events: [],
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      repo.applyFlagChanges({
        create: [{ ...flag, deviceHash: 'may-2' }],
        clear: { ids: [], clearedBy: null, clearedReason: '' },
        at: NOW,
        events: [],
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('một hồ sơ chờ duyệt mỗi tài khoản; (device_hash, account_id) miễn trừ unique', async () => {
    const repo = createFakeIdentityRepository();
    const { id } = await repo.createAccount(account());
    const verification = {
      accountId: id,
      documentType: 'cccd',
      documentNumberEnc: 'enc',
      fullName: 'A',
      at: NOW,
    };
    await repo.createIdVerification(verification);
    await expect(repo.createIdVerification(verification)).rejects.toMatchObject({ code: 'P2002' });

    const clearance = {
      deviceHash: 'may-1',
      accountId: id,
      clearedBy: id,
      reason: 'Máy mua lại',
      at: NOW,
    };
    await repo.createDeviceClearance(clearance);
    await expect(repo.createDeviceClearance(clearance)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('upsertDevicePost giữ first_posted_at, cập nhật last_posted_at', async () => {
    const repo = createFakeIdentityRepository();
    const { id } = await repo.createAccount(account());
    await repo.upsertDevicePost({ deviceHash: 'may-1', accountId: id, at: NOW });
    const row = await repo.upsertDevicePost({ deviceHash: 'may-1', accountId: id, at: LATER });
    expect(row).toMatchObject({ firstPostedAt: NOW, lastPostedAt: LATER });
    expect(await repo.findDevicePosts('may-1')).toHaveLength(1);
  });
});
