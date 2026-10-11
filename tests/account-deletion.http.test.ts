import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../src/modules/identity/password.calc.js';
import { lastOutboxEvent } from './db-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, repositories } from './test-app.js';

/* Spec `account-deletion`: tự xoá, chặn khi bị khoá; đăng ký lại trong / sau 90 ngày ở registration.http.test.ts. */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const PASSWORD = 'ghim-rao-vat-2026!';

const repository = repositories.identity;
let app: FastifyInstance;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  app = await buildTestApp({ clock: () => NOW });
  await app.ready();
});

afterAll(() => app.close());

const login = (email: string, password = PASSWORD) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

describe('DELETE /me', () => {
  it('xoá thành công → 204, mọi phiên thu hồi, đăng nhập lại → 401 INVALID_CREDENTIALS, hồ sơ → 404, sự kiện deleted', async () => {
    const user = await seedAccount({ passwordHash }, NOW);
    const other = await tokenFor(app, user.id);
    const token = (await login(user.email)).json().data.accessToken as string;

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);

    expect(await repository.findAccountById(user.id)).toMatchObject({
      status: 'deleted',
      deletedAt: NOW,
    });
    expect(await repository.listActiveSessions(user.id)).toHaveLength(0);
    const again = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${other}` },
    });
    expect(again.json().error.code).toBe('SESSION_REVOKED');
    expect((await login(user.email)).json().error.code).toBe('INVALID_CREDENTIALS');
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/users/${user.id}` })).json().error.code,
    ).toBe('NOT_FOUND');
    expect(await lastOutboxEvent()).toMatchObject({
      type: 'identity.account.deleted',
      payload: { accountId: user.id },
    });
  });
});

describe('POST /auth/deletion-requests', () => {
  it('tài khoản đang bị khoá yêu cầu xoá → 409 ACCOUNT_DELETE_BLOCKED kèm lý do khoá, vẫn còn đó', async () => {
    const user = await seedAccount({ passwordHash, status: 'locked' }, NOW);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/deletion-requests',
      payload: { email: user.email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'ACCOUNT_DELETE_BLOCKED',
      message: expect.stringContaining('khoá'),
    });
    expect((await repository.findAccountById(user.id))?.status).toBe('locked');
  });

  it('tài khoản bình thường → 204 và xoá như DELETE /me; sai mật khẩu → 401', async () => {
    const user = await seedAccount({ passwordHash }, NOW);
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/deletion-requests',
      payload: { email: user.email, password: 'sai-mat-khau-01' },
    });
    expect(wrong.statusCode).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/deletion-requests',
      payload: { email: user.email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(204);
    expect((await repository.findAccountById(user.id))?.status).toBe('deleted');
  });
});
