import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { prisma } from './db-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Requirement "Ghi dấu thiết bị khi đăng nhập" (spec identity/device-registry) và `sharedDeviceAccounts` hợp hai nguồn
 * (delta review/conflict-of-interest) — change add-login-device-marks. Đăng nhập qua route thật để header đi đúng đường.
 */
const PASSWORD = 'ghim-rao-vat-2026!';
const DAY_MS = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  app = await buildTestApp({ clock: () => now });
  await app.ready();
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const login = (email: string, password: string, deviceId?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: deviceId ? { 'x-device-id': deviceId } : {},
    payload: { email, password },
  });
const marksOf = (accountId: string) => prisma.deviceLogin.findMany({ where: { accountId } });
const account = () => seedAccount({ passwordHash }, TEST_NOW);
const since = new Date(TEST_NOW.getTime() - 180 * DAY_MS);

describe('Ghi dấu thiết bị khi đăng nhập', () => {
  it('có mã máy: một dòng mang dấu băm, không đánh dấu, không dấu đăng tin; đăng nhập lại: giữ lần đầu, cập nhật lần gần nhất', async () => {
    const user = await account();
    expect((await login(user.email, PASSWORD, 'may-cua-toi')).statusCode).toBe(200);
    const [mark] = await marksOf(user.id);
    expect(mark).toMatchObject({
      deviceHash: app.modules.identity.deviceToken('may-cua-toi'),
      firstSeenAt: TEST_NOW,
      lastSeenAt: TEST_NOW,
    });
    expect(mark?.deviceHash).not.toContain('may-cua-toi');
    expect(await prisma.accountFlag.count({ where: { accountId: user.id } })).toBe(0);
    expect(await prisma.devicePost.count({ where: { accountId: user.id } })).toBe(0);

    now = new Date(TEST_NOW.getTime() + 3_600_000);
    expect((await login(user.email, PASSWORD, 'may-cua-toi')).statusCode).toBe(200);
    const marks = await marksOf(user.id);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ firstSeenAt: TEST_NOW, lastSeenAt: now });
  });

  it('không có mã máy, hay sai mật khẩu: không ghi gì', async () => {
    const user = await account();
    expect((await login(user.email, PASSWORD)).statusCode).toBe(200);
    expect((await login(user.email, 'sai-mat-khau-2026!', 'may-la')).statusCode).toBe(401);
    expect(await marksOf(user.id)).toEqual([]);
  });
});

describe('Tài khoản dùng chung máy: đăng tin hay đăng nhập đều tính', () => {
  it('A đăng tin, B và C chỉ đăng nhập cùng máy: ba bên thấy nhau; ngoài cửa sổ thì không', async () => {
    const [a, b, c] = [await account(), await account(), await account()];
    const device = `may-chung-${a.id.slice(0, 8)}`;
    await repositories.identity.upsertDevicePost({
      deviceHash: app.modules.identity.deviceToken(device),
      accountId: a.id,
      at: TEST_NOW,
    });
    expect((await login(b.email, PASSWORD, device)).statusCode).toBe(200);
    expect((await login(c.email, PASSWORD, device)).statusCode).toBe(200);

    const shared = app.modules.identity.sharedDeviceAccounts.bind(app.modules.identity);
    expect((await shared(a.id, since)).toSorted()).toEqual([b.id, c.id].toSorted());
    expect((await shared(b.id, since)).toSorted()).toEqual([a.id, c.id].toSorted());
    expect((await shared(c.id, since)).toSorted()).toEqual([a.id, b.id].toSorted());
    expect(await shared(a.id, new Date(TEST_NOW.getTime() + 1))).toEqual([]);
  });
});
