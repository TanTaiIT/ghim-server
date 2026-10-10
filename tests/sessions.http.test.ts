import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { toOk } from '../src/common/schemas/response.js';
import { hashPassword } from '../src/modules/identity/password.calc.js';
import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { createFakePrivilegeSource } from './fakes/privilege-source.fake.js';
import { TEST_AUDIT } from './fakes/audit.fake.js';
import { buildTestApp } from './fakes/app.js';

/*
 * Requirement đăng nhập, trần phiên, hết hạn trượt, đăng xuất, xem / thu hồi thiết bị của spec
 * `sessions`. Trần phiên hạ xuống 2 / 1 qua RuntimeConfig giả: luật "đẩy phiên cũ nhất" không
 * phụ thuộc con số, và dựng 21 phiên chỉ làm test chậm.
 */
const START = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;
const PASSWORD = 'ghim-rao-vat-2026!';

let now = START;
let app: FastifyInstance;
let repository: FakeIdentityRepository;
let passwordHash: string;
const privilegeSource = createFakePrivilegeSource();

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  repository = createFakeIdentityRepository();
  app = await buildTestApp({
    repositories: { identity: repository },
    jobs: createFakeJobs(),
    privilegeSource,
    clock: () => now,
    config: createStaticRuntimeConfig({
      'identity.sessionCapUser': 2,
      'identity.sessionCapPrivileged': 1,
    }),
  });
  app.get('/__test/me', { preHandler: [app.authenticate] }, async (request) => toOk(request.actor));
  await app.ready();
});

afterAll(() => app.close());

beforeEach(() => {
  now = START;
});

const advance = (ms: number): void => {
  now = new Date(now.getTime() + ms);
};

let seq = 0;
async function account(
  overrides: { status?: 'active' | 'locked'; email?: string; passwordHash?: string | null } = {},
) {
  seq += 1;
  const email = overrides.email ?? `nguoi${seq}@ghim.test`;
  const row = await repository.createAccount({
    email,
    emailNormalized: email.toLowerCase(),
    emailHash: `hash-${seq}`,
    passwordHash: overrides.passwordHash === undefined ? passwordHash : overrides.passwordHash,
    googleSub: overrides.passwordHash === null ? `sub-${seq}` : null,
    status: 'active',
    displayName: `Người thử ${seq}`,
    at: now,
  });
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

const api = (
  method: 'GET' | 'POST' | 'DELETE' | 'PUT',
  url: string,
  options: { token?: string; payload?: object; headers?: Record<string, string> } = {},
) =>
  app.inject({
    method,
    url: url.startsWith('/__test') ? url : `/api/v1${url}`,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    ...(options.payload ? { payload: options.payload } : {}),
  });

const login = (email: string, extra: object = {}, headers: Record<string, string> = {}) =>
  api('POST', '/auth/login', { payload: { email, password: PASSWORD, ...extra }, headers });

async function tokens(email: string, deviceName = 'Máy thử') {
  const res = await login(email, { deviceName });
  expect(res.statusCode).toBe(200);
  return res.json().data as { accessToken: string; refreshToken: string; expiresIn: number };
}

const newestDeviceName = async (accountId: string): Promise<string | undefined> =>
  (await repository.listActiveSessions(accountId))[0]?.deviceName;

describe('POST /auth/login', () => {
  it('đúng email và mật khẩu → 200 với access token, refresh token, hạn 15 phút', async () => {
    const { email } = await account();
    const res = await login(email);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: 15 * 60,
    });
    const me = await api('GET', '/__test/me', { token: res.json().data.accessToken });
    expect(me.json().data).toMatchObject({ emailVerified: true, secondFactorAt: null });
  });

  it('đăng nhập bằng biến thể của email vào đúng tài khoản', async () => {
    await account({ email: 'lan@gmail.com' });
    expect((await login('Lan+ghim@gmail.com')).statusCode).toBe(200);
  });

  it('sai mật khẩu và email lạ → cùng 401 INVALID_CREDENTIALS, cùng câu', async () => {
    const { email } = await account();
    const wrong = await api('POST', '/auth/login', {
      payload: { email, password: 'sai-mat-khau-01' },
    });
    const unknown = await login('khong-co@ghim.test');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error).toEqual(unknown.json().error);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('tài khoản chỉ có Google gõ mật khẩu → 401 INVALID_CREDENTIALS', async () => {
    const { email } = await account({ passwordHash: null });
    expect((await login(email)).json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('đang bị khoá: đúng mật khẩu → 403 ACCOUNT_LOCKED kèm lý do, không tạo phiên; sai → 401', async () => {
    const { id, email } = await account({ status: 'locked' });
    const res = await login(email);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({
      code: 'ACCOUNT_LOCKED',
      message: expect.stringContaining('Thử'),
    });
    expect(await repository.listActiveSessions(id)).toHaveLength(0);
    const wrong = await api('POST', '/auth/login', {
      payload: { email, password: 'sai-mat-khau-01' },
    });
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('client web nhận refresh token qua cookie httpOnly, không có trong body', async () => {
    const { email } = await account();
    const res = await login(email, { client: 'web' });
    expect(res.json().data.refreshToken).toBeNull();
    const cookie = res.cookies.find((c) => c.name === 'ghim_refresh');
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/api/v1/auth',
    });
  });

  it('tên thiết bị: app gửi thì dùng; không thì từ user-agent; không nữa thì tên chung', async () => {
    const { id, email } = await account();
    await login(email, { deviceName: 'iPhone của Lan' });
    expect(await newestDeviceName(id)).toBe('iPhone của Lan');
    advance(1000);
    await login(email, {}, { 'user-agent': 'GhimApp/1.0 (Android 14)' });
    expect(await newestDeviceName(id)).toBe('GhimApp/1.0 (Android 14)');
    advance(1000);
    await login(email, {}, { 'user-agent': '' });
    expect(await newestDeviceName(id)).toBe('Thiết bị không tên');
  });
});

describe('trần phiên và hết hạn trượt', () => {
  it('người dùng (trần 2) đăng nhập thiết bị thứ 3 → vào được, phiên ít hoạt động nhất bị đẩy, thiết bị đó nhận SESSION_REVOKED', async () => {
    const { id, email } = await account();
    const first = await tokens(email, 'Máy 1');
    advance(1000);
    const second = await tokens(email, 'Máy 2');
    advance(1000);
    // Máy 1 vừa hoạt động nên máy 2 mới là ít hoạt động nhất.
    await api('POST', '/auth/refresh', { payload: { refreshToken: first.refreshToken } });
    advance(1000);
    const third = await tokens(email, 'Máy 3');
    expect(third.accessToken).toBeTruthy();

    const alive = await repository.listActiveSessions(id);
    expect(alive).toHaveLength(2);
    expect(alive.map((s) => s.deviceName).toSorted()).toEqual(['Máy 1', 'Máy 3']);
    const evicted = await api('GET', '/__test/me', { token: second.accessToken });
    expect(evicted.statusCode).toBe(401);
    expect(evicted.json().error.code).toBe('SESSION_REVOKED');
  });

  it('tài khoản mang quyền staff (trần 1) đăng nhập máy thứ 2 → máy 1 bị đẩy', async () => {
    const { id, email } = await account();
    privilegeSource.grant(id, ['support']);
    const first = await tokens(email, 'Máy 1');
    advance(1000);
    await tokens(email, 'Máy 2');
    expect((await repository.listActiveSessions(id)).map((s) => s.deviceName)).toEqual(['Máy 2']);
    expect((await api('GET', '/__test/me', { token: first.accessToken })).json().error.code).toBe(
      'SESSION_REVOKED',
    );
  });

  it('phiên quá 30 ngày không dùng → 401 SESSION_EXPIRED ở cả access token lẫn refresh', async () => {
    const { email } = await account();
    const { accessToken, refreshToken } = await tokens(email);
    advance(30 * DAY_MS + 1);
    // JWT ký theo giờ thật nên vẫn còn hạn; phiên mới là thứ hết hạn — và phiên quyết định.
    expect((await api('GET', '/__test/me', { token: accessToken })).json().error.code).toBe(
      'SESSION_EXPIRED',
    );
    const res = await api('POST', '/auth/refresh', { payload: { refreshToken } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('SESSION_EXPIRED');
  });

  it('refresh trong hạn kéo dài hạn trượt và xoay token; dùng lại token cũ → thu hồi cả phiên', async () => {
    const { email } = await account();
    const { refreshToken } = await tokens(email);
    advance(20 * DAY_MS);
    const rotated = await api('POST', '/auth/refresh', { payload: { refreshToken } });
    expect(rotated.statusCode).toBe(200);
    const fresh = rotated.json().data.refreshToken as string;
    expect(fresh).not.toBe(refreshToken);

    advance(20 * DAY_MS);
    // 40 ngày từ lúc đăng nhập nhưng mới 20 ngày từ lần refresh: vẫn sống.
    const me = await api('GET', '/__test/me', { token: rotated.json().data.accessToken });
    expect(me.statusCode).toBe(200);

    const reuse = await api('POST', '/auth/refresh', { payload: { refreshToken } });
    expect(reuse.json().error.code).toBe('SESSION_REVOKED');
    const after = await api('POST', '/auth/refresh', { payload: { refreshToken: fresh } });
    expect(after.json().error.code).toBe('SESSION_REVOKED');
  });

  it('refresh không có token nào → 401 UNAUTHORIZED; token bịa → 401 SESSION_REVOKED', async () => {
    expect((await api('POST', '/auth/refresh', { payload: {} })).json().error.code).toBe(
      'UNAUTHORIZED',
    );
    expect(
      (await api('POST', '/auth/refresh', { payload: { refreshToken: 'bia' } })).json().error.code,
    ).toBe('SESSION_REVOKED');
  });
});

describe('POST /auth/logout', () => {
  it('đăng xuất → 204; phiên cũ gọi tiếp → 401 SESSION_REVOKED', async () => {
    const { email } = await account();
    const { accessToken, refreshToken } = await tokens(email);
    expect((await api('POST', '/auth/logout', { token: accessToken })).statusCode).toBe(204);
    expect((await api('GET', '/__test/me', { token: accessToken })).json().error.code).toBe(
      'SESSION_REVOKED',
    );
    expect(
      (await api('POST', '/auth/refresh', { payload: { refreshToken } })).json().error.code,
    ).toBe('SESSION_REVOKED');
  });
});

describe('/me/sessions', () => {
  it('danh sách có tên thiết bị, lần hoạt động cuối, cờ hiện tại; không lộ băm token', async () => {
    const { email } = await account();
    await tokens(email, 'Máy B');
    advance(1000);
    const { accessToken } = await tokens(email, 'Máy C');
    const res = await api('GET', '/me/sessions', { token: accessToken });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      {
        id: expect.any(String),
        deviceName: 'Máy C',
        createdAt: expect.any(String),
        lastActiveAt: expect.any(String),
        current: true,
      },
      {
        id: expect.any(String),
        deviceName: 'Máy B',
        createdAt: expect.any(String),
        lastActiveAt: expect.any(String),
        current: false,
      },
    ]);
    expect(JSON.stringify(res.json())).not.toMatch(/refreshToken|Hash/);
  });

  it('thu hồi một thiết bị khác → 204, máy đó nhận SESSION_REVOKED, máy hiện tại vẫn dùng được', async () => {
    const { email } = await account();
    const other = await tokens(email, 'Máy khác');
    advance(1000);
    const current = await tokens(email, 'Máy này');
    const list = await api('GET', '/me/sessions', { token: current.accessToken });
    const otherId = list.json().data.find((s: { current: boolean }) => !s.current).id;

    expect(
      (await api('DELETE', `/me/sessions/${otherId}`, { token: current.accessToken })).statusCode,
    ).toBe(204);
    expect((await api('GET', '/__test/me', { token: other.accessToken })).json().error.code).toBe(
      'SESSION_REVOKED',
    );
    expect((await api('GET', '/__test/me', { token: current.accessToken })).statusCode).toBe(200);
  });

  it('thu hồi mọi thiết bị khác → chỉ còn phiên hiện tại', async () => {
    const { id, email } = await account();
    await tokens(email, 'Máy khác');
    advance(1000);
    const current = await tokens(email, 'Máy này');
    expect((await api('DELETE', '/me/sessions', { token: current.accessToken })).statusCode).toBe(
      204,
    );
    expect((await repository.listActiveSessions(id)).map((s) => s.deviceName)).toEqual(['Máy này']);
  });

  it('thu hồi phiên của người khác hoặc mã không tồn tại → 404 NOT_FOUND', async () => {
    const victim = await account();
    const victimTokens = await tokens(victim.email);
    const victimSession = (await repository.listActiveSessions(victim.id))[0];
    const { email } = await account();
    const { accessToken } = await tokens(email);

    const foreign = await api('DELETE', `/me/sessions/${victimSession?.id}`, {
      token: accessToken,
    });
    expect(foreign.statusCode).toBe(404);
    expect((await api('GET', '/__test/me', { token: victimTokens.accessToken })).statusCode).toBe(
      200,
    );
    expect(
      (
        await api('DELETE', '/me/sessions/00000000-0000-7000-8000-000000000000', {
          token: accessToken,
        })
      ).statusCode,
    ).toBe(404);
  });
});
