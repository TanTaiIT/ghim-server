import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';

/*
 * Mỗi ràng buộc chỉ DB trả lời được của module `identity` có đúng một ca ở đây: unique, partial
 * unique (`P2002`) và CHECK viết tay trong migration init_identity (SQLSTATE 23514). Ghi thẳng
 * bằng Prisma, cố tình tạo những dòng mà repository không bao giờ tạo — thứ đang kiểm là DB có
 * từ chối hay không, không phải service có kiểm trước hay không.
 */

const UNIQUE = 'P2002';
const CHECK = '23514';

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

let seq = 0;

function account(overrides: Partial<Prisma.AccountCreateInput> = {}): Prisma.AccountCreateInput {
  seq += 1;
  const email = `nguoi${seq}@ghim.test`;
  return {
    email,
    emailNormalized: email,
    emailHash: `hash-${email}`,
    passwordHash: 'argon2id-gia',
    displayName: `Người thử ${seq}`,
    ...overrides,
  };
}

const createAccount = (overrides?: Partial<Prisma.AccountCreateInput>) =>
  prisma.account.create({ data: account(overrides) });

const NOW = new Date('2026-10-10T04:00:00.000Z');
const LATER = new Date('2026-10-10T05:00:00.000Z');

const code = (
  accountId: string,
  overrides: Partial<Prisma.VerificationCodeUncheckedCreateInput> = {},
) =>
  prisma.verificationCode.create({
    data: { accountId, purpose: 'email_verify', codeHash: 'h', expiresAt: LATER, ...overrides },
  });

const session = (accountId: string, overrides: Partial<Prisma.SessionUncheckedCreateInput> = {}) =>
  prisma.session.create({
    data: {
      accountId,
      refreshTokenHash: `rt-${Math.random()}`,
      deviceName: 'Máy thử',
      expiresAt: LATER,
      ...overrides,
    },
  });

const flag = (accountId: string, overrides: Partial<Prisma.AccountFlagUncheckedCreateInput> = {}) =>
  prisma.accountFlag.create({
    data: {
      accountId,
      kind: 'many_accounts_on_device',
      deviceHash: 'may-1',
      lookupCode: `MA${seq}${Math.random().toString(36).slice(2, 7)}`,
      ...overrides,
    },
  });

const verification = (
  accountId: string,
  overrides: Partial<Prisma.IdVerificationUncheckedCreateInput> = {},
) =>
  prisma.idVerification.create({
    data: {
      accountId,
      documentType: 'cccd',
      documentNumberEnc: 'enc',
      fullName: 'Nguyễn Văn A',
      ...overrides,
    },
  });

describe('accounts', () => {
  it('id là uuid v7 do Postgres sinh, tăng theo thời gian', async () => {
    const first = await createAccount();
    const second = await createAccount();
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(second.id > first.id).toBe(true);
  });

  it('email_normalized unique — hai email khác chữ hoa vẫn chung một dòng chuẩn hoá', async () => {
    await createAccount({ email: 'Lan@gmail.com', emailNormalized: 'lan@gmail.com' });
    await expect(
      prismaErrorCode(
        createAccount({ email: 'lan+2@gmail.com', emailNormalized: 'lan@gmail.com' }),
      ),
    ).resolves.toBe(UNIQUE);
  });

  it('google_sub unique, nhưng nhiều tài khoản không có Google vẫn được', async () => {
    await createAccount({ passwordHash: null, googleSub: 'sub-1' });
    await expect(
      prismaErrorCode(createAccount({ passwordHash: null, googleSub: 'sub-1' })),
    ).resolves.toBe(UNIQUE);
    await createAccount();
    await createAccount();
  });

  it('CHECK accounts_credential_check: không mật khẩu và không Google thì từ chối', async () => {
    await expect(sqlStateOf(createAccount({ passwordHash: null, googleSub: null }))).resolves.toBe(
      CHECK,
    );
  });

  it('CHECK accounts_locked_check: locked đi đôi với locked_at', async () => {
    await expect(sqlStateOf(createAccount({ status: 'locked' }))).resolves.toBe(CHECK);
    await expect(sqlStateOf(createAccount({ status: 'active', lockedAt: NOW }))).resolves.toBe(
      CHECK,
    );
    await createAccount({ status: 'locked', lockedAt: NOW, lockedReason: 'Thử' });
  });

  it('CHECK accounts_deleted_check: deleted đi đôi với deleted_at', async () => {
    await expect(sqlStateOf(createAccount({ status: 'deleted' }))).resolves.toBe(CHECK);
    await createAccount({ status: 'deleted', deletedAt: NOW });
  });
});

describe('verification_codes', () => {
  it('một mã sống mỗi mục đích: mã thứ hai cùng mục đích bị từ chối tới khi mã cũ bị tiêu', async () => {
    const { id } = await createAccount();
    const live = await code(id);
    await expect(prismaErrorCode(code(id))).resolves.toBe(UNIQUE);
    await code(id, { purpose: 'password_reset' });

    await prisma.verificationCode.update({ where: { id: live.id }, data: { consumedAt: NOW } });
    await code(id);
  });

  it('CHECK verification_codes_attempts_check: số lần sai không âm', async () => {
    const { id } = await createAccount();
    await expect(sqlStateOf(code(id, { attempts: -1 }))).resolves.toBe(CHECK);
  });

  it('CHECK verification_codes_target_check: đổi email phải có email đích', async () => {
    const { id } = await createAccount();
    await expect(sqlStateOf(code(id, { purpose: 'email_change' }))).resolves.toBe(CHECK);
    await code(id, { purpose: 'email_change', targetEmail: 'moi@ghim.test' });
  });
});

describe('sessions', () => {
  it('refresh_token_hash unique', async () => {
    const { id } = await createAccount();
    await session(id, { refreshTokenHash: 'trung' });
    await expect(prismaErrorCode(session(id, { refreshTokenHash: 'trung' }))).resolves.toBe(UNIQUE);
  });

  it('CHECK sessions_revoke_check: revoked_at và revoke_reason cùng có hoặc cùng không', async () => {
    const { id } = await createAccount();
    await expect(sqlStateOf(session(id, { revokedAt: NOW }))).resolves.toBe(CHECK);
    await expect(sqlStateOf(session(id, { revokeReason: 'logout' }))).resolves.toBe(CHECK);
    await session(id, { revokedAt: NOW, revokeReason: 'logout' });
  });

  it('xoá hẳn tài khoản thì phiên đi theo (ON DELETE CASCADE) — dọn đăng ký dở dang dựa vào đây', async () => {
    const { id } = await createAccount();
    await session(id);
    await prisma.account.delete({ where: { id } });
    await expect(prisma.session.count({ where: { accountId: id } })).resolves.toBe(0);
  });
});

describe('device_posts', () => {
  it('khoá chính (device_hash, account_id): một máy ghi một tài khoản một dòng', async () => {
    const { id } = await createAccount();
    const data = { deviceHash: 'may-1', accountId: id, firstPostedAt: NOW, lastPostedAt: NOW };
    await prisma.devicePost.create({ data });
    await expect(prismaErrorCode(prisma.devicePost.create({ data }))).resolves.toBe(UNIQUE);
  });

  it('CHECK device_posts_order_check: lần đăng cuối không trước lần đầu', async () => {
    const { id } = await createAccount();
    await expect(
      sqlStateOf(
        prisma.devicePost.create({
          data: { deviceHash: 'may-1', accountId: id, firstPostedAt: LATER, lastPostedAt: NOW },
        }),
      ),
    ).resolves.toBe(CHECK);
  });
});

describe('device_clearances', () => {
  it('(device_hash, account_id) unique', async () => {
    const { id } = await createAccount();
    const data = { deviceHash: 'may-1', accountId: id, clearedBy: id, reason: 'Máy mua lại' };
    await prisma.deviceClearance.create({ data });
    await expect(prismaErrorCode(prisma.deviceClearance.create({ data }))).resolves.toBe(UNIQUE);
  });
});

describe('account_flags', () => {
  it('lookup_code unique', async () => {
    const { id } = await createAccount();
    await flag(id, { lookupCode: 'ABCDEFGH' });
    await expect(
      prismaErrorCode(flag(id, { lookupCode: 'ABCDEFGH', deviceHash: 'may-2' })),
    ).resolves.toBe(UNIQUE);
  });

  it('một đánh dấu mở mỗi (tài khoản, loại, máy); gỡ xong thì đánh dấu lại được', async () => {
    const { id } = await createAccount();
    const open = await flag(id);
    await expect(prismaErrorCode(flag(id))).resolves.toBe(UNIQUE);
    await flag(id, { deviceHash: 'may-2' });

    await prisma.accountFlag.update({
      where: { id: open.id },
      data: { clearedAt: NOW, clearedBy: id, clearedReason: 'Máy mua lại' },
    });
    await flag(id);
  });

  it('CHECK account_flags_cleared_check: gỡ đánh dấu phải có lý do', async () => {
    const { id } = await createAccount();
    await expect(sqlStateOf(flag(id, { clearedAt: NOW }))).resolves.toBe(CHECK);
    await expect(sqlStateOf(flag(id, { clearedReason: 'thiếu mốc' }))).resolves.toBe(CHECK);
  });

  it('CHECK account_flags_related_check: "dùng máy của tài khoản bị khoá" phải nói tài khoản nào', async () => {
    const { id } = await createAccount();
    await expect(sqlStateOf(flag(id, { kind: 'device_of_locked_account' }))).resolves.toBe(CHECK);
    const locked = await createAccount({ status: 'locked', lockedAt: NOW, lockedReason: 'Thử' });
    await flag(id, { kind: 'device_of_locked_account', relatedAccountId: locked.id });
  });
});

describe('disposable_domains', () => {
  it('domain là khoá chính — bia mộ (removed_at) chặn INSERT trùng của lượt cập nhật', async () => {
    await prisma.disposableDomain.create({
      data: { domain: 'tempmail.example', source: 'manual', removedAt: NOW },
    });
    await expect(
      prismaErrorCode(
        prisma.disposableDomain.create({ data: { domain: 'tempmail.example', source: 'seed' } }),
      ),
    ).resolves.toBe(UNIQUE);
  });
});

describe('id_verifications', () => {
  it('một hồ sơ chờ duyệt mỗi tài khoản; hồ sơ đã duyệt không chiếm chỗ', async () => {
    const { id } = await createAccount();
    await verification(id, { status: 'verified', reviewedAt: NOW });
    await verification(id);
    await expect(prismaErrorCode(verification(id))).resolves.toBe(UNIQUE);
  });

  it('CHECK id_verifications_reason_check: từ chối phải có lý do', async () => {
    const { id } = await createAccount();
    await expect(sqlStateOf(verification(id, { status: 'rejected' }))).resolves.toBe(CHECK);
    await verification(id, { status: 'rejected', reason: 'Ảnh mờ' });
  });
});

describe('outbox_events', () => {
  it('payload jsonb đi về nguyên vẹn, published_at mặc định trống', async () => {
    const event = await prisma.outboxEvent.create({
      data: { type: 'identity.account.locked', payload: { accountId: 'x', reason: 'Thử' } },
    });
    expect(event.payload).toEqual({ accountId: 'x', reason: 'Thử' });
    expect(event.publishedAt).toBeNull();
  });
});
