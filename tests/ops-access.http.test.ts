import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import type {
  GoogleIdentity,
  GoogleTokenVerifier,
} from '../src/modules/identity/google.verifier.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { prisma } from './db-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { buildTestApp, grantStaff, repositories } from './test-app.js';

/*
 * Bàn vận hành chỉ đòi phiên đăng nhập hợp lệ (change remove-two-factor): spec `identity/sessions`,
 * `platform/master-accounts`, `platform/staff-permissions`. Mọi phiên mở qua route đăng nhập thật —
 * không tự dựng phiên — để chứng minh không còn bước nào sau mật khẩu hay Google. Trần phiên có quyền
 * hạ xuống 1 qua RuntimeConfig giả: luật đẩy phiên không phụ thuộc con số.
 */
const NOW = new Date('2026-10-23T09:00:00+07:00');
const PASSWORD = 'ghim-rao-vat-2026!';

let app: FastifyInstance;
let passwordHash: string;
const identities = new Map<string, GoogleIdentity>();
const verifier: GoogleTokenVerifier = {
  verify: async (idToken) => identities.get(idToken) ?? null,
};

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  app = await buildTestApp({
    clock: () => NOW,
    googleVerifier: verifier,
    config: createStaticRuntimeConfig({ 'identity.sessionCapPrivileged': 1 }),
  });
  await app.ready();
});

afterAll(() => app.close());

const api = (method: 'GET' | 'POST', url: string, token?: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload } : {}),
  });

async function login(email: string, extra: object = {}): Promise<string> {
  const res = await api('POST', '/auth/login', undefined, { email, password: PASSWORD, ...extra });
  expect(res.statusCode).toBe(200);
  return res.json().data.accessToken;
}

const account = (role: 'user' | 'master' = 'user') => seedAccount({ role, passwordHash }, NOW);

const draftOf = (categoryId: string, token: string) =>
  api('GET', `/ops/categories/${categoryId}/template/draft`, token);

describe('Bàn vận hành chỉ đòi phiên đăng nhập hợp lệ', () => {
  it('staff vừa được gắn quyền danh mục, đăng nhập bằng mật khẩu → mở được danh mục đó ngay', async () => {
    const staff = await account();
    const phone = await seedCategory();
    await grantStaff(staff.id, [], [phone]);
    const res = await draftOf(phone, await login(staff.email));
    expect(res.statusCode).toBe(200);
  });

  it('staff ngoài phạm vi vẫn bị chặn → 403 FORBIDDEN', async () => {
    const staff = await account();
    const [phone, cars] = [await seedCategory(), await seedCategory()];
    await grantStaff(staff.id, [], [phone]);
    const res = await draftOf(cars, await login(staff.email));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('master đăng nhập bằng mật khẩu, không mã nào, rồi dùng bàn vận hành', async () => {
    const master = await account('master');
    const res = await api('GET', '/ops/disposable-domains', await login(master.email));
    expect(res.statusCode).toBe(200);
  });

  it('client cũ gửi kèm mã 6 số lúc đăng nhập → phiên vẫn mở, mã bị bỏ qua', async () => {
    const master = await account('master');
    const token = await login(master.email, { totpCode: '123456' });
    expect((await api('GET', '/ops/disposable-domains', token)).statusCode).toBe(200);
  });

  it('staff đã liên kết Google đăng nhập bằng Google → làm được việc trong phạm vi', async () => {
    const staff = await account();
    const phone = await seedCategory();
    await grantStaff(staff.id, [], [phone]);
    identities.set('tok-staff', {
      sub: `g-${staff.id}`,
      email: staff.email,
      emailVerified: true,
      name: null,
      picture: null,
    });
    const res = await api('POST', '/auth/google', undefined, {
      idToken: 'tok-staff',
      deviceName: 'Pixel',
    });
    expect(res.statusCode).toBe(200);
    expect((await draftOf(phone, res.json().data.accessToken)).statusCode).toBe(200);
  });

  it('thao tác thiết lập lớp thứ hai cũ → 404 NOT_FOUND', async () => {
    const staff = await account();
    await grantStaff(staff.id, ['support']);
    const token = await login(staff.email);
    const responses = await Promise.all(
      ['/me/two-factor/setup', '/me/two-factor/confirm'].map((path) =>
        api('POST', path, token, { code: '123456' }),
      ),
    );
    for (const res of responses) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });

  it('hồ sơ của tôi không còn trường lớp thứ hai', async () => {
    const master = await account('master');
    const me = await api('GET', '/me', await login(master.email));
    expect(me.json().data).not.toHaveProperty('twoFactorEnabled');
  });
});

describe('Hệ thống chỉ có một master', () => {
  it('master vừa tạo bằng công cụ đăng nhập rồi dùng bàn vận hành ngay', async () => {
    await prisma.account.updateMany({ where: { role: 'master' }, data: { role: 'user' } });
    const { accountId } = await app.modules.identity.createMaster({
      email: 'master-moi@ghim.test',
      password: PASSWORD,
      displayName: 'Master mới',
    });
    const token = await login('master-moi@ghim.test');
    expect((await api('GET', '/ops/disposable-domains', token)).statusCode).toBe(200);
    expect((await api('GET', '/me', token)).json().data).toMatchObject({
      id: accountId,
      role: 'master',
    });
  });
});

describe('Tài khoản bị khoá thì quyền staff tự treo', () => {
  it('quyền treo được mở khoá đăng nhập lại → vẫn chịu trần phiên của staff', async () => {
    const staff = await account();
    await grantStaff(staff.id, ['support']);
    await repositories.platform.suspendStaff({ accountId: staff.id, reason: 'Thử', at: NOW });
    await login(staff.email);
    await login(staff.email);
    const live = await repositories.identity.listActiveSessions(staff.id);
    expect(live).toHaveLength(1);
  });
});
