import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createFakeMailer, type FakeMailer } from '../src/lib/mailer.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, grantStaff, repositories, TEST_AUDIT } from './test-app.js';

/* Spec `profile` (5 scenario) và spec `email-change` (4 scenario). */
const START = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;
const PASSWORD = 'ghim-rao-vat-2026!';

let now = START;
let app: FastifyInstance;
const repository = repositories.identity;
let jobs: FakeJobs;
let mailer: FakeMailer;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  jobs = createFakeJobs();
  mailer = createFakeMailer();
  app = await buildTestApp({ jobs, mailer, clock: () => now });
  await app.ready();
});

afterAll(() => app.close());

beforeEach(() => {
  now = START;
});

let seq = 0;
async function account(
  overrides: { status?: 'active' | 'locked' | 'deleted'; phone?: string } = {},
) {
  seq += 1;
  const email = `nguoi${seq}@ghim.test`;
  const row = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${seq}`,
    passwordHash,
    googleSub: null,
    status: 'active',
    displayName: `Người thử ${seq}`,
    at: now,
  });
  if (overrides.phone) await repository.updateAccount(row.id, { phone: overrides.phone });
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
  if (overrides.status === 'deleted') {
    await repository.softDeleteAccount({ accountId: row.id, at: now, events: [] });
  }
  return { ...row, email };
}

const api = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  options: { token?: string; payload?: object } = {},
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
    ...(options.payload ? { payload: options.payload } : {}),
  });

async function login(email: string): Promise<string> {
  const res = await api('POST', '/auth/login', {
    payload: { email, password: PASSWORD, deviceName: 'Máy' },
  });
  expect(res.statusCode).toBe(200);
  return res.json().data.accessToken as string;
}

async function signIn(email: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await api('POST', '/auth/login', {
    payload: { email, password: PASSWORD, deviceName: 'Máy' },
  });
  expect(res.statusCode).toBe(200);
  return res.json().data as { accessToken: string; refreshToken: string };
}

async function lastCode(): Promise<string> {
  await jobs.runAll();
  const code = /\d{6}/.exec(mailer.sent.at(-1)?.subject ?? '')?.[0];
  if (!code) throw new Error('Thư cuối không có mã');
  return code;
}

describe('GET /users/:id', () => {
  it('khách xem hồ sơ → 200 với tên, ảnh, ngày tham gia; không có email', async () => {
    const { id } = await account();
    const res = await api('GET', `/users/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      id,
      displayName: expect.stringContaining('Người thử'),
      avatarUrl: null,
      joinedAt: START.toISOString(),
      phone: null,
    });
    expect(JSON.stringify(res.json())).not.toContain('@ghim.test');
  });

  it('mã không tồn tại hoặc tài khoản đã xoá → 404 NOT_FOUND; bị khoá vẫn có hồ sơ', async () => {
    expect((await api('GET', '/users/00000000-0000-7000-8000-000000000000')).statusCode).toBe(404);
    const deleted = await account({ status: 'deleted' });
    expect((await api('GET', `/users/${deleted.id}`)).json().error.code).toBe('NOT_FOUND');
    const locked = await account({ status: 'locked' });
    expect((await api('GET', `/users/${locked.id}`)).statusCode).toBe(200);
  });

  it('có số điện thoại thì hiện kèm nhãn chưa xác minh; không có thì không có', async () => {
    const withPhone = await account({ phone: '0901234567' });
    expect((await api('GET', `/users/${withPhone.id}`)).json().data.phone).toEqual({
      number: '0901234567',
      verified: false,
    });
    const without = await account();
    expect((await api('GET', `/users/${without.id}`)).json().data.phone).toBeNull();
  });
});

describe('GET / PATCH /me', () => {
  it('thêm số điện thoại → hồ sơ công khai hiện số kèm chưa xác minh, không SMS nào được gửi', async () => {
    const { id, email } = await account();
    const token = await login(email);
    const sentBefore = jobs.sent.length;
    const res = await api('PATCH', '/me', { token, payload: { phone: '+84901234567' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.phone).toEqual({ number: '+84901234567', verified: false });
    expect((await api('GET', `/users/${id}`)).json().data.phone).toEqual({
      number: '+84901234567',
      verified: false,
    });
    expect(jobs.sent.length).toBe(sentBefore);

    expect(
      (await api('PATCH', '/me', { token, payload: { phone: null } })).json().data.phone,
    ).toBeNull();
    expect(
      (await api('PATCH', '/me', { token, payload: { phone: 'abc' } })).json().error.code,
    ).toBe('VALIDATION_ERROR');
  });

  it('GET /me có email và trạng thái xác nhận, không nhắc thiết bị hay đánh dấu kể cả khi bị đánh dấu', async () => {
    const { id, email } = await account();
    await repository.applyFlagChanges({
      create: [
        {
          accountId: id,
          kind: 'many_accounts_on_device',
          deviceHash: 'may-1',
          relatedAccountId: null,
          lookupCode: 'ABCDEFGH',
        },
      ],
      clear: { ids: [], clearedBy: null, clearedReason: '' },
      at: now,
      events: [],
      audit: TEST_AUDIT,
    });
    const res = await api('GET', '/me', { token: await login(email) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      id,
      email,
      emailVerified: true,
      role: 'user',
    });
    expect(res.json().data).not.toHaveProperty('twoFactorEnabled');
    expect(JSON.stringify(res.json())).not.toMatch(/device|flag|thiết bị|đánh dấu|ABCDEFGH|may-1/i);
  });

  it('đặt tên hiển thị giả bộ phận quản lý → 400 DISPLAY_NAME_RESERVED; tên thường thì đổi được', async () => {
    const { email } = await account();
    const token = await login(email);
    expect(
      (await api('PATCH', '/me', { token, payload: { displayName: 'quan tri he thong' } })).json()
        .error.code,
    ).toBe('DISPLAY_NAME_RESERVED');
    expect(
      (await api('PATCH', '/me', { token, payload: { displayName: ' Lan Hoàng ' } })).json().data
        .displayName,
    ).toBe('Lan Hoàng');
  });
});

const staffFlag = async (token: string) =>
  (await api('GET', '/me', { token })).json().data.staff as boolean;

describe('Hồ sơ của tôi cho biết quyền staff (add-me-staff-flag)', () => {
  it('staff còn hiệu lực → đúng, không kèm phạm vi hay danh mục; PATCH /me cũng trả cờ; người dùng thường → sai', async () => {
    const [staff, user] = [await account(), await account()];
    await grantStaff(staff.id, ['support'], []);
    const token = await login(staff.email);
    const res = await api('GET', '/me', { token });
    expect(res.json().data.staff).toBe(true);
    expect(JSON.stringify(res.json())).not.toMatch(/scope|categor|support/i);
    const patched = await api('PATCH', '/me', { token, payload: { showActivity: true } });
    expect(patched.json().data.staff).toBe(true);
    expect(await staffFlag(await login(user.email))).toBe(false);
  });

  it('quyền đang treo → sai', async () => {
    const staff = await account();
    await grantStaff(staff.id, ['support'], []);
    const token = await login(staff.email);
    await repositories.platform.suspendStaff({ accountId: staff.id, reason: 'Thử', at: now });
    expect(await staffFlag(token)).toBe(false);
  });

  it('master thu toàn bộ quyền → lần đọc hồ sơ sau là sai', async () => {
    const staff = await account();
    await grantStaff(staff.id, ['support'], []);
    const token = await login(staff.email);
    expect(await staffFlag(token)).toBe(true);
    const master = await seedAccount({ role: 'master' }, now);
    const revoked = await api('DELETE', `/ops/staff/${staff.id}`, {
      token: await tokenFor(app, master.id, now),
    });
    expect(revoked.statusCode).toBe(204);
    expect(await staffFlag(token)).toBe(false);
  });

  it('hồ sơ công khai của staff không có cờ', async () => {
    const staff = await account();
    await grantStaff(staff.id, ['support'], []);
    const res = await api('GET', `/users/${staff.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).not.toHaveProperty('staff');
  });
});

describe('đổi email', () => {
  it('xin đổi sang email chưa có tài khoản rồi nhập đúng mã → email đăng nhập đổi; chưa nhập mã thì vẫn email cũ', async () => {
    const { email } = await account();
    const token = await login(email);
    expect(
      (
        await api('POST', '/me/email-change', {
          token,
          payload: { email: 'moi@ghim.test', currentPassword: PASSWORD },
        })
      ).statusCode,
    ).toBe(200);
    expect(jobs.sent.at(-1)?.data).toMatchObject({ to: 'moi@ghim.test', purpose: 'email_change' });

    // Chưa xác nhận: cũ vẫn vào, mới chưa vào.
    expect(
      (await api('POST', '/auth/login', { payload: { email, password: PASSWORD } })).statusCode,
    ).toBe(200);
    expect(
      (
        await api('POST', '/auth/login', {
          payload: { email: 'moi@ghim.test', password: PASSWORD },
        })
      ).statusCode,
    ).toBe(401);

    const code = await lastCode();
    expect(
      (await api('POST', '/me/email-change/confirm', { token, payload: { code } })).statusCode,
    ).toBe(200);
    expect(
      (
        await api('POST', '/auth/login', {
          payload: { email: 'moi@ghim.test', password: PASSWORD },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await api('POST', '/auth/login', { payload: { email, password: PASSWORD } })).statusCode,
    ).toBe(401);
    expect((await api('GET', '/me', { token })).json().data.email).toBe('moi@ghim.test');
  });

  it('email mới trùng (sau chuẩn hoá) tài khoản khác → 409 EMAIL_TAKEN; email tạm → 400 EMAIL_DISPOSABLE', async () => {
    await account({});
    const other = await repository.createAccount({
      email: 'lan@gmail.com',
      emailNormalized: 'lan@gmail.com',
      emailHash: 'h',
      passwordHash,
      googleSub: null,
      status: 'active',
      displayName: 'Lan',
      at: now,
    });
    expect(other.id).toBeTruthy();
    const { email } = await account();
    const token = await login(email);
    expect(
      (
        await api('POST', '/me/email-change', {
          token,
          payload: { email: 'Lan+x@gmail.com', currentPassword: PASSWORD },
        })
      ).json().error.code,
    ).toBe('EMAIL_TAKEN');
    await repository.addManualDomain({ domain: 'tempmail.example', at: now, audit: TEST_AUDIT });
    expect(
      (
        await api('POST', '/me/email-change', {
          token,
          payload: { email: 'a@tempmail.example', currentPassword: PASSWORD },
        })
      ).json().error.code,
    ).toBe('EMAIL_DISPOSABLE');
  });

  it('đã đổi 10 ngày trước mà xin đổi tiếp → 429 EMAIL_CHANGE_TOO_SOON kèm ngày được đổi lại', async () => {
    const { id, email } = await account();
    await repository.updateAccount(id, { emailChangedAt: new Date(START.getTime() - 10 * DAY_MS) });
    const token = await login(email);
    const res = await api('POST', '/me/email-change', {
      token,
      payload: { email: 'khac@ghim.test', currentPassword: PASSWORD },
    });
    expect(res.statusCode).toBe(429);
    // 30 ngày sau lần đổi = 20 ngày sau START (2026-10-10) → 30/10/2026
    expect(res.json().error).toMatchObject({
      code: 'EMAIL_CHANGE_TOO_SOON',
      message: expect.stringContaining('30/10/2026'),
    });
  });
});

const requestChange = (token: string, payload: object) =>
  api('POST', '/me/email-change', { token, payload });

describe('Đổi email phải xác thực lại, báo email cũ (fix-audit-identity, T12)', () => {
  it('sai mật khẩu → 401 INVALID_CREDENTIALS, không thư mã nào được gửi', async () => {
    const { email } = await account();
    const token = await login(email);
    const sentBefore = jobs.sent.length;
    const res = await requestChange(token, {
      email: 'sai-mat-khau@ghim.test',
      currentPassword: 'mat-khau-sai-2026',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(jobs.sent.slice(sentBefore)).toEqual([]);
  });

  it('staff xin đổi email chỉ với đúng mật khẩu → thư mã gửi tới email mới', async () => {
    const { id, email } = await account();
    const token = await login(email);
    await grantStaff(id);
    const res = await requestChange(token, {
      email: 'staff-moi@ghim.test',
      currentPassword: PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    expect(jobs.sent.at(-1)?.data).toMatchObject({
      to: 'staff-moi@ghim.test',
      purpose: 'email_change',
    });
  });

  it('tài khoản chỉ đăng nhập bằng Google → 409 PASSWORD_NOT_SET', async () => {
    seq += 1;
    const email = `google${seq}@ghim.test`;
    const row = await repository.createAccount({
      email,
      emailNormalized: email,
      emailHash: `hash-google-${seq}`,
      passwordHash: null,
      googleSub: `google-sub-${seq}`,
      status: 'active',
      displayName: `Google ${seq}`,
      at: now,
    });
    const res = await requestChange(await tokenFor(app, row.id, now), {
      email: 'google-moi@ghim.test',
      currentPassword: 'bat-ky-mat-khau-nao',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PASSWORD_NOT_SET');
  });

  it('xác nhận từ máy thứ nhất: email cũ nhận thư báo đã che, máy thứ hai bị thu hồi, máy thứ nhất vẫn dùng được', async () => {
    const { email } = await account();
    const first = await signIn(email);
    const second = await signIn(email);
    const asked = await requestChange(first.accessToken, {
      email: 'hai-may@ghim.test',
      currentPassword: PASSWORD,
    });
    expect(asked.statusCode).toBe(200);
    const code = await lastCode();
    const confirmed = await api('POST', '/me/email-change/confirm', {
      token: first.accessToken,
      payload: { code },
    });
    expect(confirmed.statusCode).toBe(200);
    await jobs.runAll();
    const notice = mailer.sent.at(-1);
    expect(notice?.to).toBe(email);
    expect(notice?.text).toContain('h***@ghim.test');
    expect(notice?.text).not.toContain('hai-may@ghim.test');

    const refreshed = await api('POST', '/auth/refresh', {
      payload: { refreshToken: second.refreshToken },
    });
    expect(refreshed.statusCode).toBe(401);
    expect(refreshed.json().error.code).toBe('SESSION_REVOKED');
    const me = await api('GET', '/me', { token: first.accessToken });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.email).toBe('hai-may@ghim.test');
  });
});
