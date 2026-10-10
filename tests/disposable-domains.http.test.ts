import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { buildTestApp } from './fakes/app.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;

let app: FastifyInstance;
let repository: FakeIdentityRepository;
let masterToken: string;
let userToken: string;

async function tokenFor(role: 'user' | 'master'): Promise<string> {
  const email = `${role}@ghim.test`;
  const account = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: 'h',
    passwordHash: 'x',
    googleSub: null,
    status: 'active',
    displayName: role,
    at: NOW,
  });
  await repository.updateAccount(account.id, { role });
  const session = await repository.createSession({
    accountId: account.id,
    refreshTokenHash: `rt-${role}`,
    deviceName: 'Máy',
    ip: null,
    userAgent: null,
    secondFactorAt: NOW,
    expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
    at: NOW,
  });
  return app.jwt.sign({ sid: session.id });
}

beforeAll(async () => {
  repository = createFakeIdentityRepository();
  app = await buildTestApp({
    repositories: { identity: repository },
    jobs: createFakeJobs(),
    clock: () => NOW,
  });
  await app.ready();
  masterToken = await tokenFor('master');
  userToken = await tokenFor('user');
});

afterAll(() => app.close());

const call = (method: 'GET' | 'POST' | 'DELETE', url: string, token: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1/ops/disposable-domains${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });

describe('/ops/disposable-domains', () => {
  it('người thường → 403 FORBIDDEN ở cả ba route', async () => {
    expect((await call('GET', '', userToken)).statusCode).toBe(403);
    expect((await call('POST', '', userToken, { domain: 'x.example' })).statusCode).toBe(403);
    expect((await call('DELETE', '/x.example', userToken)).statusCode).toBe(403);
  });

  it('master thêm → 201, thấy trong danh sách, đăng ký bằng miền đó bị chặn; bỏ → 200, bỏ lần hai → 404', async () => {
    const added = await call('POST', '', masterToken, { domain: 'TempMail.Example' });
    expect(added.statusCode).toBe(201);
    expect(added.json().data).toMatchObject({ domain: 'tempmail.example', source: 'manual' });

    const list = await call('GET', '?limit=10', masterToken);
    expect(list.json().data.items.map((row: { domain: string }) => row.domain)).toContain(
      'tempmail.example',
    );

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'a@mx.tempmail.example',
        password: 'ghim-rao-vat-2026!',
        displayName: 'A B',
      },
    });
    expect(blocked.json().error.code).toBe('EMAIL_DISPOSABLE');

    expect((await call('DELETE', '/tempmail.example', masterToken)).statusCode).toBe(200);
    expect((await call('DELETE', '/tempmail.example', masterToken)).statusCode).toBe(404);
    expect(
      repository.audit
        .filter((row) => row.targetId === 'tempmail.example')
        .map((row) => row.action),
    ).toEqual(['identity.disposable_domain.add', 'identity.disposable_domain.remove']);
  });

  it('miền sai định dạng → 400 VALIDATION_ERROR', async () => {
    const res = await call('POST', '', masterToken, { domain: 'không phải miền' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
