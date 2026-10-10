import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createFakeMailer, type FakeMailer } from '../src/lib/mailer.js';
import { toOk } from '../src/common/schemas/response.js';
import { hashPassword, verifyPassword } from '../src/modules/identity/password.calc.js';
import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { buildTestApp } from './fakes/app.js';

/* Hai requirement mật khẩu của spec `sessions`: quên (mã qua email) và đổi (cần mật khẩu cũ). */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const PASSWORD = 'ghim-rao-vat-2026!';
const NEW_PASSWORD = 'mat-khau-moi-cua-lan-2026';

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
    clock: () => NOW,
  });
  app.get('/__test/me', { preHandler: [app.authenticate] }, async (request) => toOk(request.actor));
  await app.ready();
});

afterAll(() => app.close());

let seq = 0;
async function account(overrides: { passwordHash?: string | null } = {}) {
  seq += 1;
  const email = `nguoi${seq}@ghim.test`;
  const row = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${seq}`,
    passwordHash: overrides.passwordHash === undefined ? passwordHash : overrides.passwordHash,
    googleSub: overrides.passwordHash === null ? `sub-${seq}` : null,
    status: 'active',
    displayName: `Người thử ${seq}`,
    at: NOW,
  });
  return { ...row, email };
}

const post = (url: string, payload: object, token?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

async function login(email: string, password = PASSWORD): Promise<string> {
  const res = await post('/auth/login', { email, password, deviceName: `Máy ${Math.random()}` });
  expect(res.statusCode).toBe(200);
  return res.json().data.accessToken as string;
}

async function lastCode(): Promise<string> {
  await jobs.runAll();
  const code = /\d{6}/.exec(mailer.sent.at(-1)?.subject ?? '')?.[0];
  if (!code) throw new Error('Thư cuối không có mã');
  return code;
}

const me = (token: string) =>
  app.inject({ method: 'GET', url: '/__test/me', headers: { authorization: `Bearer ${token}` } });

describe('quên mật khẩu', () => {
  it('10 lượt đoán sai CÙNG LÚC vẫn chỉ được 5 lần: mã bị huỷ, mã đúng nhập sau → CODE_EXPIRED', async () => {
    const { email } = await account();
    await post('/auth/forgot-password', { email });
    const code = await lastCode();
    const wrong = (index: number) =>
      String((Number(code) + index + 1) % 1_000_000).padStart(6, '0');

    const guesses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        post('/auth/reset-password', { email, code: wrong(index), password: NEW_PASSWORD }),
      ),
    );
    // Lượt tới sau khi mã đã huỷ thấy 'không còn mã sống' — đúng như nhập tuần tự.
    const codes = guesses.map((res) => res.json().error.code as string);
    expect(codes.every((value) => value === 'CODE_INVALID' || value === 'CODE_EXPIRED')).toBe(true);
    expect(codes.filter((value) => value === 'CODE_INVALID').length).toBeGreaterThanOrEqual(5);
    const late = await post('/auth/reset-password', { email, code, password: NEW_PASSWORD });
    expect(late.json().error.code).toBe('CODE_EXPIRED');
    expect((await post('/auth/login', { email, password: PASSWORD })).statusCode).toBe(200);
  });

  it('hai lượt nhập đúng cùng lúc: đúng một lượt đổi mật khẩu, lượt kia CODE_EXPIRED', async () => {
    const { email } = await account();
    await post('/auth/forgot-password', { email });
    const code = await lastCode();
    const results = await Promise.all([
      post('/auth/reset-password', { email, code, password: NEW_PASSWORD }),
      post('/auth/reset-password', { email, code, password: `${NEW_PASSWORD}-2` }),
    ]);
    expect(results.map((res) => res.statusCode).toSorted()).toEqual([200, 400]);
    expect(results.find((res) => res.statusCode === 400)?.json().error.code).toBe('CODE_EXPIRED');
  });

  it('email lạ → 200 giống hệt email có tài khoản, và không gửi gì', async () => {
    const { email } = await account();
    const sentBefore = jobs.sent.length;
    const unknown = await post('/auth/forgot-password', { email: 'khong-co@ghim.test' });
    const known = await post('/auth/forgot-password', { email });
    expect(unknown.statusCode).toBe(200);
    expect(known.statusCode).toBe(200);
    expect(unknown.json()).toEqual(known.json());
    expect(jobs.sent.length - sentBefore).toBe(1);
    expect(jobs.sent.at(-1)?.data).toMatchObject({ to: email, purpose: 'password_reset' });
  });

  it('đúng mã còn hạn + mật khẩu mới hợp lệ → 200, mật khẩu mới dùng được, mọi phiên trước đó bị thu hồi', async () => {
    const { email } = await account();
    const tokenA = await login(email);
    const tokenB = await login(email);
    await post('/auth/forgot-password', { email });
    const code = await lastCode();

    const res = await post('/auth/reset-password', { email, code, password: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect((await me(tokenA)).json().error.code).toBe('SESSION_REVOKED');
    expect((await me(tokenB)).json().error.code).toBe('SESSION_REVOKED');
    expect((await post('/auth/login', { email, password: PASSWORD })).statusCode).toBe(401);
    expect((await post('/auth/login', { email, password: NEW_PASSWORD })).statusCode).toBe(200);
  });

  it('mật khẩu mới 5 ký tự → 400 PASSWORD_WEAK và mã vẫn còn hiệu lực', async () => {
    const { email } = await account();
    await post('/auth/forgot-password', { email });
    const code = await lastCode();
    const weak = await post('/auth/reset-password', { email, code, password: 'abcde' });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.code).toBe('PASSWORD_WEAK');
    expect(
      (await post('/auth/reset-password', { email, code, password: NEW_PASSWORD })).statusCode,
    ).toBe(200);
  });

  it('tài khoản chỉ có Google đặt được mật khẩu qua đường này', async () => {
    const { email } = await account({ passwordHash: null });
    await post('/auth/forgot-password', { email });
    const code = await lastCode();
    expect(
      (await post('/auth/reset-password', { email, code, password: NEW_PASSWORD })).statusCode,
    ).toBe(200);
    expect((await post('/auth/login', { email, password: NEW_PASSWORD })).statusCode).toBe(200);
  });

  it('sai mã → 400 CODE_INVALID; xin mã lại quá sớm → 429 RESEND_TOO_SOON', async () => {
    const { email } = await account();
    await post('/auth/forgot-password', { email });
    const code = await lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    expect(
      (await post('/auth/reset-password', { email, code: wrong, password: NEW_PASSWORD })).json()
        .error.code,
    ).toBe('CODE_INVALID');
    expect((await post('/auth/forgot-password', { email })).json().error.code).toBe(
      'RESEND_TOO_SOON',
    );
  });
});

describe('PUT /me/password', () => {
  it('đúng mật khẩu hiện tại → 204, phiên hiện tại giữ, hai phiên kia nhận SESSION_REVOKED', async () => {
    const { email } = await account();
    const other1 = await login(email);
    const other2 = await login(email);
    const current = await login(email);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/password',
      headers: { authorization: `Bearer ${current}` },
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.statusCode).toBe(204);
    expect((await me(current)).statusCode).toBe(200);
    expect((await me(other1)).json().error.code).toBe('SESSION_REVOKED');
    expect((await me(other2)).json().error.code).toBe('SESSION_REVOKED');
    const row = await repository.findAccountByEmail(email);
    expect(await verifyPassword(row?.passwordHash ?? '', NEW_PASSWORD)).toBe(true);
    expect(row?.passwordChangedAt).toEqual(NOW);
  });

  it('sai mật khẩu hiện tại → 401 INVALID_CREDENTIALS, mật khẩu không đổi', async () => {
    const { email } = await account();
    const token = await login(email);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'sai-mat-khau-01', newPassword: NEW_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    expect((await post('/auth/login', { email, password: PASSWORD })).statusCode).toBe(200);
  });

  it('mật khẩu mới yếu → 400 PASSWORD_WEAK', async () => {
    const { email } = await account();
    const token = await login(email);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: PASSWORD, newPassword: '12345678' },
    });
    expect(res.json().error.code).toBe('PASSWORD_WEAK');
  });
});
