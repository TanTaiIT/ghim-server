import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { prisma } from './db-helpers.js';
import { TEST_AUDIT } from './test-app.js';

/* Ca tuần tự của repository `identity` trên Postgres; ca đồng thời nằm ở `code-attempts.db.test.ts`, `session-refresh.db.test.ts`. */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const LATER = new Date('2026-10-10T05:00:00.000Z');
const repository = createIdentityRepository(prisma);

let seq = 0;
async function newAccount(emailNormalized?: string) {
  seq += 1;
  const email = emailNormalized ?? `hop-dong-${seq}@ghim.test`;
  return repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${seq}`,
    passwordHash: 'x',
    googleSub: null,
    status: 'pending_verification',
    displayName: `Người ${seq}`,
    at: NOW,
  });
}

const issue = (accountId: string, codeHash = 'ma') =>
  repository.issueCode({
    accountId,
    purpose: 'email_verify',
    codeHash,
    targetEmail: null,
    expiresAt: LATER,
    at: NOW,
  });

describe('IdentityRepository', () => {
  it('email chuẩn hoá unique: lượt tạo trùng ném đúng lỗi P2002 của Prisma', async () => {
    await newAccount('trung@ghim.test');
    const duplicate = newAccount('trung@ghim.test');
    await expect(duplicate).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(duplicate).rejects.toMatchObject({ code: 'P2002' });
  });

  it('một mã sống mỗi mục đích: phát mã mới thì mã cũ hết sống', async () => {
    const account = await newAccount();
    await issue(account.id, 'ma-cu');
    const fresh = await issue(account.id, 'ma-moi');
    expect((await repository.findLiveCode(account.id, 'email_verify'))?.id).toBe(fresh.id);
  });

  it('tiêu mã một lần: lượt thứ hai trả false và không đổi tài khoản', async () => {
    const account = await newAccount();
    const code = await issue(account.id);
    const verify = () =>
      repository.applyAccountChange({
        accountId: account.id,
        consumeCodeId: code.id,
        patch: { status: 'active' },
        at: NOW,
        events: [],
      });
    expect(await verify()).toBe(true);
    await repository.updateAccount(account.id, { status: 'pending_verification' });
    expect(await verify()).toBe(false);
    expect((await repository.findAccountById(account.id))?.status).toBe('pending_verification');
  });

  it('sai đủ trần thì mã bị huỷ, không còn mã sống', async () => {
    const account = await newAccount();
    const code = await issue(account.id);
    const results: Array<{ cancelled: boolean }> = [];
    await sequentially([1, 2, 3, 4, 5], async () => {
      results.push(await repository.recordWrongCode({ id: code.id, maxAttempts: 5, at: NOW }));
    });
    expect(results.map((result) => result.cancelled)).toEqual([false, false, false, false, true]);
    expect(await repository.findLiveCode(account.id, 'email_verify')).toBeNull();
  });

  it('phiên kèm tài khoản cho resolveActor: đủ cột, phiên lạ trả null', async () => {
    const account = await newAccount();
    await repository.lockAccount({
      accountId: account.id,
      reason: 'Thử',
      lockedBy: account.id,
      at: NOW,
      events: [],
      audit: TEST_AUDIT,
    });
    const session = await repository.createSession({
      accountId: account.id,
      refreshTokenHash: 'hash-actor',
      deviceName: 'Máy',
      ip: null,
      userAgent: null,
      secondFactorAt: NOW,
      expiresAt: LATER,
      at: NOW,
    });
    expect(await repository.findActorSession(session.id)).toEqual({
      sessionId: session.id,
      accountId: account.id,
      revokedAt: null,
      expiresAt: LATER,
      secondFactorAt: NOW,
      role: 'user',
      status: 'locked',
      lockedReason: 'Thử',
    });
    expect(await repository.findActorSession('00000000-0000-7000-8000-ffffffffffff')).toBeNull();
  });

  it('xoay token làm mới có điều kiện: token sai hay đã xoay thì false', async () => {
    const account = await newAccount();
    const session = await repository.createSession({
      accountId: account.id,
      refreshTokenHash: 'hash-dau',
      deviceName: 'Máy',
      ip: null,
      userAgent: null,
      secondFactorAt: null,
      expiresAt: LATER,
      at: NOW,
    });
    const rotate = (expectedHash: string, nextHash: string) =>
      repository.rotateRefreshToken({
        sessionId: session.id,
        expectedHash,
        nextHash,
        at: NOW,
        expiresAt: LATER,
      });
    expect(await rotate('hash-sai', 'hash-a')).toBe(false);
    expect(await rotate('hash-dau', 'hash-b')).toBe(true);
    expect(await rotate('hash-dau', 'hash-c')).toBe(false);
    expect((await repository.findSessionById(session.id))?.prevRefreshTokenHash).toBe('hash-dau');
  });
});

describe('anonymizeDeletedAccount (fix-audit-stuck-data, C9)', () => {
  const DAY = 86_400_000;
  async function deleted(daysAgo: number) {
    const account = await newAccount();
    await repository.softDeleteAccount({
      accountId: account.id,
      at: new Date(NOW.getTime() - daysAgo * DAY),
      events: [],
    });
    return account;
  }
  const cutoff = new Date(NOW.getTime() - 90 * DAY);

  it('đã xoá quá hạn: bỏ email, tên, mật khẩu, mã xác nhận; giữ dấu băm; gọi lại là no-op', async () => {
    const account = await deleted(91);
    await issue(account.id);
    expect(
      await repository.anonymizeDeletedAccount({ id: account.id, deletedBefore: cutoff }),
    ).toBe(true);
    expect(await prisma.account.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({
      status: 'deleted',
      email: `deleted:${account.id}`,
      emailNormalized: `deleted:${account.id}`,
      emailHash: account.emailHash,
      displayName: 'Tài khoản đã xoá',
      passwordHash: null,
    });
    expect(await prisma.verificationCode.count({ where: { accountId: account.id } })).toBe(0);
    expect(
      await repository.anonymizeDeletedAccount({ id: account.id, deletedBefore: cutoff }),
    ).toBe(false);
  });

  it('còn trong thời gian chờ hay đang hoạt động: không đổi gì', async () => {
    const recent = await deleted(10);
    const active = await newAccount();
    const accounts = [recent, active];
    const results = await Promise.all(
      accounts.map((account) =>
        repository.anonymizeDeletedAccount({ id: account.id, deletedBefore: cutoff }),
      ),
    );
    expect(results).toEqual([false, false]);
    const rows = await prisma.account.findMany({
      where: { id: { in: accounts.map((a) => a.id) } },
    });
    expect(rows.map((row) => row.email).toSorted()).toEqual(
      accounts.map((account) => account.email).toSorted(),
    );
  });
});
