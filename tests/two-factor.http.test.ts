import type { FastifyInstance } from 'fastify';
import { generate } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toOk } from '../src/common/schemas/response.js';
import { hashPassword } from '../src/modules/identity/password.calc.js';
import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { createFakePrivilegeSource } from './fakes/privilege-source.fake.js';
import { buildTestApp } from './fakes/app.js';

/*
 * Requirement hai lớp của spec `sessions`, với `otplib` sinh mã thật từ bí mật trong URI và
 * `PrivilegeSource` giả cấp quyền staff. Route `/__test/ops` đứng sau `requireOps('support')`.
 */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const PASSWORD = 'ghim-rao-vat-2026!';

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
    clock: () => NOW,
  });
  app.get(
    '/__test/ops',
    { preHandler: [app.authenticate, app.requireOps('support')] },
    async (request) => toOk(request.actor),
  );
  await app.ready();
});

afterAll(() => app.close());

let seq = 0;
async function account(role: 'user' | 'master' | 'staff') {
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
    at: NOW,
  });
  if (role === 'master') await repository.updateAccount(row.id, { role: 'master' });
  if (role === 'staff') privilegeSource.grant(row.id, ['support']);
  return { ...row, email };
}

const api = (method: 'GET' | 'POST', url: string, token?: string, payload?: object) =>
  app.inject({
    method,
    url: url.startsWith('/__test') ? url : `/api/v1${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload } : {}),
  });

async function login(email: string, extra: object = {}) {
  return api('POST', '/auth/login', undefined, {
    email,
    password: PASSWORD,
    deviceName: 'Máy',
    ...extra,
  });
}

function secretOf(otpauthUri: string): string {
  const secret = new URL(otpauthUri).searchParams.get('secret');
  if (!secret) throw new Error('URI không có secret');
  return secret;
}

/** Thiết lập trọn vẹn: setup → mã đầu tiên → confirm. Trả bí mật để sinh mã cho lần đăng nhập sau. */
async function enableTwoFactor(token: string): Promise<string> {
  const setup = await api('POST', '/me/two-factor/setup', token);
  expect(setup.statusCode).toBe(200);
  const uri = setup.json().data.otpauthUri as string;
  expect(uri).toMatch(/^otpauth:\/\/totp\/Ghim/);
  const secret = secretOf(uri);
  const confirm = await api('POST', '/me/two-factor/confirm', token, {
    code: await generate({ secret }),
  });
  expect(confirm.statusCode).toBe(204);
  return secret;
}

describe('đăng nhập hai lớp', () => {
  it('staff chưa thiết lập lớp thứ hai gọi bàn vận hành → 403 TWO_FACTOR_REQUIRED', async () => {
    const { email } = await account('staff');
    const token = (await login(email)).json().data.accessToken as string;
    const res = await api('GET', '/__test/ops', token);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('TWO_FACTOR_REQUIRED');
  });

  it('staff thiết lập xong thì phiên đó mở bàn vận hành ngay; đăng nhập lần sau đủ hai lớp → vào được', async () => {
    const { email } = await account('staff');
    const first = (await login(email)).json().data.accessToken as string;
    const secret = await enableTwoFactor(first);
    expect((await api('GET', '/__test/ops', first)).statusCode).toBe(200);

    const second = await login(email, { totpCode: await generate({ secret }) });
    expect(second.statusCode).toBe(200);
    expect((await api('GET', '/__test/ops', second.json().data.accessToken)).statusCode).toBe(200);
  });

  it('đúng mật khẩu nhưng sai mã lớp thứ hai (hoặc thiếu) → 401 INVALID_CREDENTIALS, không có phiên nào được tạo', async () => {
    const { id, email } = await account('staff');
    const token = (await login(email)).json().data.accessToken as string;
    await enableTwoFactor(token);
    const before = (await repository.listActiveSessions(id)).length;

    const wrong = await login(email, { totpCode: '000000' });
    const missing = await login(email);
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(missing.json().error.code).toBe('INVALID_CREDENTIALS');
    expect((await repository.listActiveSessions(id)).length).toBe(before);
  });

  it('master cũng đi qua cùng đường; người thường không được thiết lập (403); mã sai lúc xác nhận → CODE_INVALID', async () => {
    const master = await account('master');
    const token = (await login(master.email)).json().data.accessToken as string;
    await enableTwoFactor(token);
    expect((await api('GET', '/__test/ops', token)).statusCode).toBe(200);

    const user = await account('user');
    const userToken = (await login(user.email)).json().data.accessToken as string;
    expect((await api('POST', '/me/two-factor/setup', userToken)).statusCode).toBe(403);

    const staffAccount = await account('staff');
    const staffToken = (await login(staffAccount.email)).json().data.accessToken as string;
    expect(
      (await api('POST', '/me/two-factor/confirm', staffToken, { code: '000000' })).json().error
        .code,
    ).toBe('CODE_INVALID');
    await api('POST', '/me/two-factor/setup', staffToken);
    expect(
      (await api('POST', '/me/two-factor/confirm', staffToken, { code: '000000' })).json().error
        .code,
    ).toBe('CODE_INVALID');
  });
});
