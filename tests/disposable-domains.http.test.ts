import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditOf } from './db-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp } from './test-app.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');

let app: FastifyInstance;
let masterToken: string;
let userToken: string;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => NOW });
  await app.ready();
  masterToken = await tokenFor(app, (await seedAccount({ role: 'master' }, NOW)).id);
  userToken = await tokenFor(app, (await seedAccount({}, NOW)).id);
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
    expect((await auditOf('tempmail.example')).map((row) => row.action)).toEqual([
      'identity.disposable_domain.add',
      'identity.disposable_domain.remove',
    ]);
  });

  it('miền sai định dạng → 400 VALIDATION_ERROR', async () => {
    const res = await call('POST', '', masterToken, { domain: 'không phải miền' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
