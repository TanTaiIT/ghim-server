import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { OpsScope } from '../src/common/auth/privilege-source.js';
import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { scopedPrivilegeSource, seedAccount, tokenFor } from './ops-helpers.js';

/* Hai requirement hỗ trợ của spec device-registry qua HTTP: tra mã, gỡ, không lộ mã thiết bị, 403 theo việc. */
const NOW = new Date('2026-10-10T09:00:00+07:00');

let app: FastifyInstance;
let repository: FakeIdentityRepository;
let supportToken: string;
let categoryStaffToken: string;
const scopes = new Map<string, Set<OpsScope>>();

beforeAll(async () => {
  repository = createFakeIdentityRepository();
  app = await buildApp({
    repository,
    jobs: createFakeJobs(),
    privilegeSource: scopedPrivilegeSource(scopes),
    clock: () => NOW,
  });
  await app.ready();
  const ctx = { app, repository, now: NOW };
  const support = await seedAccount(ctx);
  scopes.set(support.id, new Set(['support']));
  supportToken = await tokenFor(ctx, support.id);
  const categoryStaff = await seedAccount(ctx);
  scopes.set(categoryStaff.id, new Set(['id_verification']));
  categoryStaffToken = await tokenFor(ctx, categoryStaff.id);
});

afterAll(() => app.close());

async function flaggedAccount(): Promise<{ accountId: string; lookupCode: string }> {
  const user = await seedAccount({ repository, now: NOW });
  await repository.applyFlagChanges({
    create: [
      {
        accountId: user.id,
        kind: 'many_accounts_on_device',
        deviceHash: 'a'.repeat(64),
        relatedAccountId: null,
        lookupCode: `M${Math.random()
          .toString(36)
          .slice(2, 9)
          .toUpperCase()
          .replace(/[ILOU]/g, 'X')}`,
      },
    ],
    clear: { ids: [], clearedBy: null, clearedReason: '' },
    at: NOW,
    events: [],
  });
  const [flag] = await repository.findOpenFlags(user.id);
  return { accountId: user.id, lookupCode: flag?.lookupCode ?? '' };
}

const get = (code: string, token: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/ops/flags/${code}`,
    headers: { authorization: `Bearer ${token}` },
  });

const clear = (code: string, token: string, payload: object) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/ops/flags/${code}/clear`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });

describe('GET /ops/flags/:lookupCode', () => {
  it('staff có việc hỗ trợ thấy loại đánh dấu và tài khoản; response không chứa mã thiết bị', async () => {
    const { accountId, lookupCode } = await flaggedAccount();
    const res = await get(lookupCode, supportToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      lookupCode,
      kind: 'many_accounts_on_device',
      accountId,
      clearedAt: null,
    });
    expect(JSON.stringify(res.json())).not.toMatch(/deviceHash|aaaaaaaa/);
  });

  it('mã gõ thường, có khoảng trắng vẫn tra được (chuẩn hoá Crockford)', async () => {
    const { lookupCode } = await flaggedAccount();
    expect((await get(` ${lookupCode.toLowerCase()} `.trim(), supportToken)).statusCode).toBe(200);
  });

  it('mã không có thật → 404 NOT_FOUND; staff chỉ có việc khác → 403 FORBIDDEN', async () => {
    expect((await get('KHONGCO1', supportToken)).statusCode).toBe(404);
    const { lookupCode } = await flaggedAccount();
    expect((await get(lookupCode, categoryStaffToken)).json().error.code).toBe('FORBIDDEN');
  });
});

describe('POST /ops/flags/:lookupCode/clear', () => {
  it('gỡ kèm lý do → 204, tài khoản hết bị đánh dấu, có miễn trừ; gỡ lần hai → 409', async () => {
    const { accountId, lookupCode } = await flaggedAccount();
    expect((await clear(lookupCode, supportToken, { reason: 'Máy mua lại' })).statusCode).toBe(204);
    expect(await repository.findOpenFlags(accountId)).toEqual([]);
    expect([...repository.clearances.values()].some((row) => row.accountId === accountId)).toBe(
      true,
    );
    expect((await get(lookupCode, supportToken)).json().data.clearedReason).toBe('Máy mua lại');
    expect((await clear(lookupCode, supportToken, { reason: 'lại' })).statusCode).toBe(409);
  });

  it('bỏ trống lý do → 400 VALIDATION_ERROR và tài khoản vẫn bị đánh dấu', async () => {
    const { accountId, lookupCode } = await flaggedAccount();
    const res = await clear(lookupCode, supportToken, { reason: '' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await repository.findOpenFlags(accountId)).toHaveLength(1);
  });

  it('mã không có thật → 404; staff không có việc hỗ trợ → 403', async () => {
    expect((await clear('KHONGCO1', supportToken, { reason: 'x' })).statusCode).toBe(404);
    const { lookupCode } = await flaggedAccount();
    expect((await clear(lookupCode, categoryStaffToken, { reason: 'x' })).statusCode).toBe(403);
  });
});
