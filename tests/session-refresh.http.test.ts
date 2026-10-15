import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { IdentityRepository } from '../src/modules/identity/identity.repository.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { buildTestApp, repositories } from './test-app.js';

/*
 * Requirement "Làm mới phiên" (change fix-session-refresh-race). `app.inject` có thể xử hai request
 * gần như lần lượt — khi đó lượt sau thấy token đã xoay và (đúng luật) thu hồi phiên. Cổng dưới đây
 * giữ mọi lượt lại ngay sau khi đọc phiên cho tới khi đủ số lượt, tái hiện đúng cuộc đua của hai
 * request thật cùng tới server.
 */
const NOW = new Date('2026-10-10T09:00:00+07:00');
/** Quá khoảng ân hạn 30 giây của token vừa bị thay (fix-audit-identity, T11). */
const AFTER_GRACE_MS = 31_000;
const PASSWORD = 'ghim-rao-vat-2026!';

const base = repositories.identity;
let app: FastifyInstance;
let now = NOW;
let passwordHash: string;
let gate: { expected: number; arrived: number; open: () => void; opened: Promise<void> } | null =
  null;

function armGate(expected: number): void {
  const { promise, resolve } = Promise.withResolvers<void>();
  gate = { expected, arrived: 0, open: () => resolve(), opened: promise };
}

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  const gated: IdentityRepository = {
    ...base,
    async findSessionByRefreshHash(hash) {
      const row = await base.findSessionByRefreshHash(hash);
      const current = gate;
      if (current) {
        current.arrived += 1;
        if (current.arrived >= current.expected) current.open();
        await current.opened;
      }
      return row;
    },
  };
  app = await buildTestApp({ repositories: { identity: gated }, clock: () => now });
  await app.ready();
});

afterEach(() => {
  gate = null;
  now = NOW;
});

afterAll(() => app.close());

let seq = 0;
async function loggedIn() {
  seq += 1;
  const email = `nguoi${seq}@ghim.test`;
  await base.createAccount({
    email,
    emailNormalized: email,
    emailHash: `hash-${seq}`,
    passwordHash,
    googleSub: null,
    status: 'active',
    displayName: `Người thử ${seq}`,
    at: NOW,
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD, deviceName: `Máy ${seq}` },
  });
  return res.json().data as { accessToken: string; refreshToken: string };
}

const refresh = (refreshToken: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });

describe('Làm mới phiên', () => {
  it('bằng token đang dùng → 200 cặp token mới; token cũ không còn được chấp nhận', async () => {
    const { refreshToken } = await loggedIn();
    const res = await refresh(refreshToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.refreshToken).not.toBe(refreshToken);
    now = new Date(NOW.getTime() + AFTER_GRACE_MS);
    expect((await refresh(refreshToken)).statusCode).toBe(401);
  });

  it('token đã được thay quá 30 giây bị gửi lại → 401 SESSION_REVOKED, token mới của phiên cũng hết', async () => {
    const { refreshToken } = await loggedIn();
    const fresh = (await refresh(refreshToken)).json().data.refreshToken as string;
    now = new Date(NOW.getTime() + AFTER_GRACE_MS);
    const reuse = await refresh(refreshToken);
    expect(reuse.json().error.code).toBe('SESSION_REVOKED');
    expect((await refresh(fresh)).json().error.code).toBe('SESSION_REVOKED');
  });

  it('tab khác gửi token vừa được thay 10 giây sau → 409 REFRESH_CONFLICT; token mới làm mới tiếp được, phiên còn', async () => {
    const { refreshToken } = await loggedIn();
    const fresh = (await refresh(refreshToken)).json().data.refreshToken as string;
    now = new Date(NOW.getTime() + 10_000);
    const late = await refresh(refreshToken);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('REFRESH_CONFLICT');
    expect((await refresh(fresh)).statusCode).toBe(200);
  });

  it('hai lượt cùng lúc → một 200, một 409 REFRESH_CONFLICT; token của lượt 200 làm mới tiếp được', async () => {
    const { refreshToken } = await loggedIn();
    armGate(2);
    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    gate = null;

    expect(results.map((res) => res.statusCode).toSorted()).toEqual([200, 409]);
    expect(results.find((res) => res.statusCode === 409)?.json().error.code).toBe(
      'REFRESH_CONFLICT',
    );
    const winner = results.find((res) => res.statusCode === 200)?.json().data;
    expect((await refresh(winner.refreshToken)).statusCode).toBe(200);
  });

  it('lượt thua không thu hồi phiên: token của lượt thắng dùng được, thiết bị còn trong danh sách', async () => {
    const { refreshToken } = await loggedIn();
    armGate(2);
    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    gate = null;
    const winner = results.find((res) => res.statusCode === 200)?.json().data;

    const sessions = await app.inject({
      method: 'GET',
      url: '/api/v1/me/sessions',
      headers: { authorization: `Bearer ${winner.accessToken}` },
    });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().data).toHaveLength(1);
    expect(sessions.json().data[0]).toMatchObject({ current: true });
  });

  it('Swagger khai 409 và hợp đồng client cho /auth/refresh', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as {
      paths: Record<
        string,
        { post?: { responses: Record<string, unknown>; description?: string } }
      >;
    };
    const route = doc.paths['/api/v1/auth/refresh']?.post;
    expect(route?.responses).toHaveProperty('409');
    expect(route?.description).toContain('REFRESH_CONFLICT');
  });
});
