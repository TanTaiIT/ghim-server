import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { OpsScope, PrivilegeSource } from '../src/common/auth/privilege-source.js';
import { toOk } from '../src/common/schemas/response.js';
import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';

/*
 * Guard chạy trên app THẬT (JWT, cookie, error handler) với repository giả và đồng hồ cố định.
 * Route `/__test/*` chỉ tồn tại trong file này: mỗi route gắn đúng một tổ hợp guard để cô lập
 * từng câu trả lời.
 */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;

let app: FastifyInstance;
let repository: FakeIdentityRepository;
const staffScopes = new Map<string, Set<OpsScope>>();
const privilegeSource: PrivilegeSource = {
  hasStaffScope: async (accountId, scope) => staffScopes.get(accountId)?.has(scope) ?? false,
  isStaff: async (accountId) => staffScopes.has(accountId),
};

const whoami = async (request: { actor: unknown }) => toOk(request.actor);

beforeAll(async () => {
  repository = createFakeIdentityRepository();
  app = await buildApp({ repository, jobs: createFakeJobs(), privilegeSource, clock: () => NOW });
  app.get('/__test/me', { preHandler: [app.authenticate] }, whoami);
  app.get('/__test/verified', { preHandler: [app.authenticate, app.requireVerifiedEmail] }, whoami);
  app.get('/__test/master', { preHandler: [app.authenticate, app.requireMaster] }, whoami);
  app.get('/__test/ops', { preHandler: [app.authenticate, app.requireOps('support')] }, whoami);
  await app.ready();
});

afterAll(() => app.close());

let seq = 0;
async function account(
  overrides: {
    status?: 'pending_verification' | 'active' | 'locked';
    role?: 'user' | 'master';
  } = {},
) {
  seq += 1;
  const email = `nguoi${seq}@ghim.test`;
  const row = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${email}`,
    passwordHash: 'argon2id-gia',
    googleSub: null,
    status: overrides.status ?? 'active',
    displayName: `Người thử ${seq}`,
    at: NOW,
  });
  const patched = overrides.role
    ? await repository.updateAccount(row.id, { role: overrides.role })
    : row;
  if (overrides.status === 'locked') {
    await repository.lockAccount({
      accountId: row.id,
      reason: 'Thử',
      lockedBy: row.id,
      at: NOW,
      events: [],
    });
  }
  return patched;
}

async function token(
  accountId: string,
  overrides: { secondFactorAt?: Date; expiresAt?: Date; revoked?: boolean } = {},
) {
  const session = await repository.createSession({
    accountId,
    refreshTokenHash: `rt-${seq}-${Math.random()}`,
    deviceName: 'Máy thử',
    ip: null,
    userAgent: null,
    secondFactorAt: overrides.secondFactorAt ?? null,
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 30 * DAY_MS),
    at: NOW,
  });
  if (overrides.revoked) {
    await repository.updateSession(session.id, { revokedAt: NOW, revokeReason: 'logout' });
  }
  return app.jwt.sign({ sid: session.id });
}

const call = (url: string, bearer?: string) =>
  app.inject({ method: 'GET', url, headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });

describe('authenticate', () => {
  it('thiếu token → 401 UNAUTHORIZED', async () => {
    const res = await call('/__test/me');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('token hỏng → 401 UNAUTHORIZED', async () => {
    const res = await call('/__test/me', 'khong.phai.jwt');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('phiên sống → 200, actor không chứa email', async () => {
    const { id } = await account();
    const res = await call('/__test/me', await token(id));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ accountId: id, role: 'user', emailVerified: true });
    expect(JSON.stringify(res.json())).not.toContain('@ghim.test');
  });

  it('phiên bị thu hồi → 401 SESSION_REVOKED', async () => {
    const { id } = await account();
    const res = await call('/__test/me', await token(id, { revoked: true }));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('SESSION_REVOKED');
  });

  it('phiên quá 30 ngày không dùng → 401 SESSION_EXPIRED', async () => {
    const { id } = await account();
    const res = await call(
      '/__test/me',
      await token(id, { expiresAt: new Date(NOW.getTime() - 1) }),
    );
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('SESSION_EXPIRED');
  });

  it('tài khoản bị khoá → 403 ACCOUNT_LOCKED kèm lý do', async () => {
    const { id } = await account({ status: 'locked' });
    // Khoá đã thu hồi mọi phiên; phiên tạo sau (dữ liệu lệch) vẫn bị chặn bằng trạng thái tài khoản.
    const res = await call('/__test/me', await token(id));
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({
      code: 'ACCOUNT_LOCKED',
      message: expect.stringContaining('Thử'),
    });
  });
});

describe('requireVerifiedEmail / requireMaster', () => {
  it('chưa xác nhận email → 403 EMAIL_NOT_VERIFIED', async () => {
    const { id } = await account({ status: 'pending_verification' });
    const res = await call('/__test/verified', await token(id));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('người thường gọi route master → 403 FORBIDDEN; master cần lớp thứ hai rồi mới 200', async () => {
    const user = await account();
    expect((await call('/__test/master', await token(user.id))).json().error.code).toBe(
      'FORBIDDEN',
    );
    const master = await account({ role: 'master' });
    expect((await call('/__test/master', await token(master.id))).json().error.code).toBe(
      'TWO_FACTOR_REQUIRED',
    );
    expect(
      (await call('/__test/master', await token(master.id, { secondFactorAt: NOW }))).statusCode,
    ).toBe(200);
  });
});

describe('requireOps', () => {
  it('người không có việc → 403 FORBIDDEN', async () => {
    const { id } = await account();
    const res = await call('/__test/ops', await token(id, { secondFactorAt: NOW }));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('staff có việc nhưng phiên chưa qua lớp thứ hai → 403 TWO_FACTOR_REQUIRED', async () => {
    const { id } = await account();
    staffScopes.set(id, new Set(['support']));
    const res = await call('/__test/ops', await token(id));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('TWO_FACTOR_REQUIRED');
  });

  it('staff chỉ có việc khác → 403 FORBIDDEN', async () => {
    const { id } = await account();
    staffScopes.set(id, new Set(['id_verification']));
    const res = await call('/__test/ops', await token(id, { secondFactorAt: NOW }));
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('master cũng phải có lớp thứ hai; có rồi thì qua', async () => {
    const { id } = await account({ role: 'master' });
    expect((await call('/__test/ops', await token(id))).json().error.code).toBe(
      'TWO_FACTOR_REQUIRED',
    );
    expect((await call('/__test/ops', await token(id, { secondFactorAt: NOW }))).statusCode).toBe(
      200,
    );
  });

  it('staff có việc và đã qua lớp thứ hai → 200', async () => {
    const { id } = await account();
    staffScopes.set(id, new Set(['support']));
    expect((await call('/__test/ops', await token(id, { secondFactorAt: NOW }))).statusCode).toBe(
      200,
    );
  });
});
