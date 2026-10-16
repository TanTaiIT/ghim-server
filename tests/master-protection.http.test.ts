import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toOk } from '../src/common/schemas/response.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, repositories } from './test-app.js';

/* Requirement "Master không bị xoá hay khoá" của spec `master-accounts` (change fix-audit-security, C4). */
const NOW = new Date('2026-10-15T09:00:00+07:00');
const PASSWORD = 'ghim-rao-vat-2026!';

const repository = repositories.identity;
let app: FastifyInstance;
let master: Awaited<ReturnType<typeof seedAccount>>;
let masterToken: string;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => NOW });
  app.get('/__test/me', { preHandler: [app.authenticate] }, async (request) => toOk(request.actor));
  await app.ready();
  master = await seedAccount({ role: 'master', passwordHash: await hashPassword(PASSWORD) }, NOW);
  masterToken = await tokenFor(app, master.id, {}, NOW);
});

afterAll(() => app.close());

/** Master còn nguyên: đang hoạt động và phiên vẫn dùng được. */
async function expectMasterIntact() {
  expect((await repository.findAccountById(master.id))?.status).toBe('active');
  const me = await app.inject({
    method: 'GET',
    url: '/__test/me',
    headers: { authorization: `Bearer ${masterToken}` },
  });
  expect(me.statusCode).toBe(200);
}

describe('master không bị xoá hay khoá', () => {
  it('master tự xoá tài khoản trong app → 409 ACCOUNT_DELETE_BLOCKED, master và phiên còn nguyên', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${masterToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ACCOUNT_DELETE_BLOCKED');
    await expectMasterIntact();
  });

  it('xoá bằng đúng email và mật khẩu của master → 409 ACCOUNT_DELETE_BLOCKED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/deletion-requests',
      payload: { email: master.email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ACCOUNT_DELETE_BLOCKED');
    await expectMasterIntact();
  });

  it('master khoá chính mình → 409 CONFLICT, master và phiên còn nguyên', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/ops/accounts/${master.id}/lock`,
      headers: { authorization: `Bearer ${masterToken}` },
      payload: { reason: 'Thử tự khoá' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
    await expectMasterIntact();
  });
});
