import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createFakeMailer, type FakeMailer } from '../src/lib/mailer.js';
import { hashPassword } from '../src/modules/identity/password.calc.js';
import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { TEST_AUDIT } from './fakes/audit.fake.js';
import { buildTestApp } from './fakes/app.js';

/* Spec `profile` (5 scenario) và spec `email-change` (4 scenario). */
const START = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;
const PASSWORD = 'ghim-rao-vat-2026!';

let now = START;
let app: FastifyInstance;
let repository: FakeIdentityRepository;
let jobs: FakeJobs;
let mailer: FakeMailer;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  repository = createFakeIdentityRepository();
  jobs = createFakeJobs();
  mailer = createFakeMailer();
  app = await buildTestApp({
    repositories: { identity: repository },
    jobs,
    mailer,
    clock: () => now,
  });
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
  method: 'GET' | 'POST' | 'PATCH',
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
      twoFactorEnabled: false,
    });
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

describe('đổi email', () => {
  it('xin đổi sang email chưa có tài khoản rồi nhập đúng mã → email đăng nhập đổi; chưa nhập mã thì vẫn email cũ', async () => {
    const { email } = await account();
    const token = await login(email);
    expect(
      (await api('POST', '/me/email-change', { token, payload: { email: 'moi@ghim.test' } }))
        .statusCode,
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
        await api('POST', '/me/email-change', { token, payload: { email: 'Lan+x@gmail.com' } })
      ).json().error.code,
    ).toBe('EMAIL_TAKEN');
    await repository.addManualDomain({ domain: 'tempmail.example', at: now, audit: TEST_AUDIT });
    expect(
      (
        await api('POST', '/me/email-change', { token, payload: { email: 'a@tempmail.example' } })
      ).json().error.code,
    ).toBe('EMAIL_DISPOSABLE');
  });

  it('đã đổi 10 ngày trước mà xin đổi tiếp → 429 EMAIL_CHANGE_TOO_SOON kèm ngày được đổi lại', async () => {
    const { id, email } = await account();
    await repository.updateAccount(id, { emailChangedAt: new Date(START.getTime() - 10 * DAY_MS) });
    const token = await login(email);
    const res = await api('POST', '/me/email-change', {
      token,
      payload: { email: 'khac@ghim.test' },
    });
    expect(res.statusCode).toBe(429);
    // 30 ngày sau lần đổi = 20 ngày sau START (2026-10-10) → 30/10/2026
    expect(res.json().error).toMatchObject({
      code: 'EMAIL_CHANGE_TOO_SOON',
      message: expect.stringContaining('30/10/2026'),
    });
  });
});
