import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { api, newMaster, newUser, type TestUser } from './group-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp } from './test-app.js';

/* Token đẩy gắn phiên (design add-notifications mục 2): một token một phiên; phiên chết thì máy hết nhận. */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const TOKEN = 'ExponentPushToken[may-mot]';
const setToken = (user: TestUser, token: string) =>
  api(app, 'PUT', '/me/push-token', user.token, { token });
const targetsOf = (accountId: string) => app.modules.identity.pushTargets([accountId]);
const sessionsWithToken = (token: string) =>
  prisma.session.findMany({ where: { pushToken: token }, select: { id: true, accountId: true } });

describe('PUT / DELETE /me/push-token', () => {
  it('gắn token vào phiên hiện tại → 204 và máy là đích đẩy; gỡ → không còn; token sai dạng → 400', async () => {
    const user = await newUser(app);
    expect((await setToken(user, TOKEN)).statusCode).toBe(204);
    expect(await targetsOf(user.id)).toMatchObject([{ accountId: user.id, token: TOKEN }]);
    expect((await api(app, 'DELETE', '/me/push-token', user.token)).statusCode).toBe(204);
    expect(await targetsOf(user.id)).toEqual([]);
    const bad = await setToken(user, 'abc');
    expect(bad.statusCode).toBe(400);
  });

  it('cùng máy đăng nhập tài khoản khác: token chuyển sang phiên mới, tài khoản trước hết nhận', async () => {
    const [a, b] = [await newUser(app), await newUser(app)];
    await setToken(a, TOKEN);
    expect((await setToken(b, TOKEN)).statusCode).toBe(204);
    expect(await sessionsWithToken(TOKEN)).toMatchObject([{ accountId: b.id }]);
    expect(await targetsOf(a.id)).toEqual([]);
    expect(await targetsOf(b.id)).toHaveLength(1);
  });

  it('đăng xuất máy đó, hay master khoá tài khoản: không còn đích đẩy; máy thứ hai của cùng người vẫn là đích riêng', async () => {
    const user = await newUser(app);
    const second = { ...user, token: await tokenFor(app, user.id) };
    await setToken(user, TOKEN);
    await setToken(second, 'ExponentPushToken[may-hai]');
    expect(await targetsOf(user.id)).toHaveLength(2);
    expect((await api(app, 'DELETE', '/me/sessions', second.token)).statusCode).toBe(204);
    expect(await targetsOf(user.id)).toMatchObject([{ token: 'ExponentPushToken[may-hai]' }]);

    const master = await newMaster(app);
    const locked = await seedAccount();
    const device = { id: locked.id, email: locked.email, token: await tokenFor(app, locked.id) };
    await setToken(device, 'ExponentPushToken[may-khoa]');
    expect(
      (await api(app, 'POST', `/ops/accounts/${locked.id}/lock`, master.token, { reason: 'Thử' }))
        .statusCode,
    ).toBe(204);
    expect(await targetsOf(locked.id)).toEqual([]);
  });
});
