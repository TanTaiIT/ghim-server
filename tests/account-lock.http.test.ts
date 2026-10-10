import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { OpsScope } from '../src/common/auth/privilege-source.js';
import { toOk } from '../src/common/schemas/response.js';
import { hashPassword } from '../src/modules/identity/password.calc.js';
import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { scopedPrivilegeSource, seedAccount, tokenFor } from './ops-helpers.js';

/* Bảy scenario của spec `account-lock`, cộng mở khoá đóng đánh dấu liên quan. */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const PASSWORD = 'ghim-rao-vat-2026!';

let app: FastifyInstance;
let repository: FakeIdentityRepository;
let passwordHash: string;
let masterToken: string;
const scopes = new Map<string, Set<OpsScope>>();

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  repository = createFakeIdentityRepository();
  app = await buildApp({
    repository,
    jobs: createFakeJobs(),
    privilegeSource: scopedPrivilegeSource(scopes),
    clock: () => NOW,
  });
  app.get('/__test/me', { preHandler: [app.authenticate] }, async (request) => toOk(request.actor));
  await app.ready();
  const master = await seedAccount({ repository, now: NOW }, { role: 'master' });
  masterToken = await tokenFor({ app, repository, now: NOW }, master.id);
});

afterAll(() => app.close());

const ctx = () => ({ app, repository, now: NOW });

const lock = (id: string, token: string, payload?: object) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/ops/accounts/${id}/lock`,
    headers: { authorization: `Bearer ${token}` },
    payload: payload ?? {},
  });

const unlock = (id: string, token: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/ops/accounts/${id}/unlock`,
    headers: { authorization: `Bearer ${token}` },
  });

const login = (email: string, password = PASSWORD) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

describe('POST /ops/accounts/:id/lock', () => {
  it('master khoá kèm lý do → 204, tài khoản bị khoá, mọi phiên thu hồi ngay, sự kiện locked', async () => {
    const user = await seedAccount(ctx(), { passwordHash });
    const userToken = await tokenFor(ctx(), user.id);
    expect((await lock(user.id, masterToken, { reason: 'Lừa đảo nhiều lần' })).statusCode).toBe(
      204,
    );

    expect(await repository.findAccountById(user.id)).toMatchObject({
      status: 'locked',
      lockedReason: 'Lừa đảo nhiều lần',
      lockedAt: NOW,
    });
    expect(await repository.listActiveSessions(user.id)).toHaveLength(0);
    const me = await app.inject({
      method: 'GET',
      url: '/__test/me',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(me.statusCode).toBe(401);
    expect(repository.events.at(-1)).toMatchObject({
      type: 'identity.account.locked',
      payload: { accountId: user.id, reason: 'Lừa đảo nhiều lần' },
    });
  });

  it('bỏ trống lý do → 400 VALIDATION_ERROR, tài khoản không đổi', async () => {
    const user = await seedAccount(ctx());
    const res = await lock(user.id, masterToken, { reason: '  ' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect((await repository.findAccountById(user.id))?.status).toBe('active');
  });

  it('staff (không phải master) thử khoá → 403 FORBIDDEN', async () => {
    const staff = await seedAccount(ctx());
    scopes.set(staff.id, new Set(['support']));
    const staffToken = await tokenFor(ctx(), staff.id);
    const user = await seedAccount(ctx());
    expect((await lock(user.id, staffToken, { reason: 'x' })).json().error.code).toBe('FORBIDDEN');
  });

  it('khoá tài khoản không có → 404; khoá lần hai → 409', async () => {
    expect(
      (await lock('00000000-0000-7000-8000-000000000000', masterToken, { reason: 'x' })).statusCode,
    ).toBe(404);
    const user = await seedAccount(ctx());
    await lock(user.id, masterToken, { reason: 'x' });
    expect((await lock(user.id, masterToken, { reason: 'x' })).statusCode).toBe(409);
  });
});

describe('tài khoản bị khoá', () => {
  it('đúng mật khẩu → 403 ACCOUNT_LOCKED kèm lý do, không phiên; sai mật khẩu → 401 không lộ lý do', async () => {
    const user = await seedAccount(ctx(), { passwordHash });
    await lock(user.id, masterToken, { reason: 'Bán hàng giả' });
    const right = await login(user.email);
    expect(right.statusCode).toBe(403);
    expect(right.json().error).toMatchObject({
      code: 'ACCOUNT_LOCKED',
      message: expect.stringContaining('Bán hàng giả'),
    });
    expect(await repository.listActiveSessions(user.id)).toHaveLength(0);
    const wrong = await login(user.email, 'sai-mat-khau-01');
    expect(wrong.statusCode).toBe(401);
    expect(JSON.stringify(wrong.json())).not.toContain('Bán hàng giả');
  });

  it('mở khoá → 204, chủ tài khoản đăng nhập lại được bằng thông tin cũ, sự kiện unlocked', async () => {
    const user = await seedAccount(ctx(), { passwordHash });
    await lock(user.id, masterToken, { reason: 'x' });
    expect((await unlock(user.id, masterToken)).statusCode).toBe(204);
    expect((await login(user.email)).statusCode).toBe(200);
    expect(await repository.findAccountById(user.id)).toMatchObject({
      status: 'active',
      lockedAt: null,
      lockedReason: null,
    });
    expect(repository.events.at(-1)).toMatchObject({
      type: 'identity.account.unlocked',
      payload: { accountId: user.id },
    });
    expect((await unlock(user.id, masterToken)).statusCode).toBe(409);
  });

  it('mở khoá A thì đánh dấu "dùng máy của tài khoản bị khoá" trỏ tới A được đóng', async () => {
    const a = await seedAccount(ctx());
    const b = await seedAccount(ctx());
    await lock(a.id, masterToken, { reason: 'x' });
    await repository.applyFlagChanges({
      create: [
        {
          accountId: b.id,
          kind: 'device_of_locked_account',
          deviceHash: 'may-1',
          relatedAccountId: a.id,
          lookupCode: 'KHOAMAY1',
        },
      ],
      clear: { ids: [], clearedBy: null, clearedReason: '' },
      at: NOW,
      events: [],
    });
    await unlock(a.id, masterToken);
    expect(await repository.findOpenFlags(b.id)).toEqual([]);
    const cleared = await repository.findFlagByLookupCode('KHOAMAY1');
    expect(cleared).toMatchObject({
      clearedAt: NOW,
      clearedReason: expect.stringContaining('mở khoá'),
    });
  });
});
