import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOutboxDispatcher } from '../src/common/outbox/dispatcher.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { registerPlatformListeners } from '../src/modules/platform/platform.events.js';
import { prisma } from './db-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, repositories } from './test-app.js';

/*
 * Bốn spec của `platform` qua HTTP. KHÔNG truyền `privilegeSource`: guard hỏi đúng bản thật của
 * `platform` — gắn quyền qua route là guard thấy ngay, như production.
 */
let app: FastifyInstance;
let masterId: string;
let masterToken: string;
let phone: string;
let computer: string;
const dispatcher = createOutboxDispatcher(prisma);

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  registerPlatformListeners(dispatcher, app.modules.platform);
  await app.modules.platform.ensureConfigVersion();

  const master = await seedAccount({ role: 'master' });
  masterId = master.id;
  masterToken = await tokenFor(app, master.id);
  const create = async (name: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/ops/categories',
        headers: auth(masterToken),
        payload: { name },
      })
    ).json().data.id as string;
  phone = await create('Điện thoại');
  computer = await create('Máy tính');
});

afterAll(() => app.close());

const grant = (accountId: string, payload: object, token = masterToken) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/ops/staff/${accountId}`,
    headers: auth(token),
    payload,
  });

/** Một thao tác của bàn vận hành gắn với danh mục (đọc nháp mẫu — `requireCategoryOps`). */
const draftOf = (categoryId: string, token: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/ops/categories/${categoryId}/template/draft`,
    headers: auth(token),
  });

describe('PUT /ops/staff/:accountId', () => {
  it('gắn theo danh mục → 200; người đó dùng đúng tài khoản cũ, không tài khoản mới nào được tạo', async () => {
    const hung = await seedAccount();
    const before = await prisma.account.count();
    const res = await grant(hung.id, { scopes: [], categoryIds: [phone, computer] });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      accountId: hung.id,
      status: 'active',
      categoryIds: [phone, computer],
    });
    expect(await prisma.account.count()).toBe(before);
    expect((await draftOf(phone, await tokenFor(app, hung.id))).statusCode).toBe(200);
  });

  it('body mang role → 400 VALIDATION_ERROR, tài khoản không thành master', async () => {
    const user = await seedAccount();
    const res = await grant(user.id, { role: 'master', scopes: ['support'], categoryIds: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect((await repositories.identity.findAccountById(user.id))?.role).toBe('user');
  });

  it.each([
    ['phạm vi rỗng', { scopes: [], categoryIds: [] }],
    ['việc không có trong danh sách', { scopes: ['billing'], categoryIds: [] }],
  ])('%s → 400 VALIDATION_ERROR', async (_case, payload) => {
    const user = await seedAccount();
    const res = await grant(user.id, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('tài khoản không có → 404; danh mục không có → 404 và không mang thêm quyền nào', async () => {
    expect(
      (
        await grant('00000000-0000-7000-8000-ffffffffffff', {
          scopes: ['support'],
          categoryIds: [],
        })
      ).statusCode,
    ).toBe(404);
    const user = await seedAccount();
    const res = await grant(user.id, {
      scopes: [],
      categoryIds: [phone, '00000000-0000-7000-8000-0000000000ff'],
    });
    expect(res.statusCode).toBe(404);
    expect(await repositories.platform.findStaff(user.id)).toBeNull();
  });

  it('đang khoá / chưa xác nhận email → 409 STAFF_PERMISSION_INELIGIBLE', async () => {
    const locked = await seedAccount({ status: 'locked' });
    const pending = await seedAccount({ status: 'pending_verification' });
    for (const res of await Promise.all([
      grant(locked.id, { scopes: ['support'], categoryIds: [] }),
      grant(pending.id, { scopes: ['support'], categoryIds: [] }),
    ])) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('STAFF_PERMISSION_INELIGIBLE');
    }
  });

  it('chỉ việc toàn hệ thống → 200 không danh mục nào', async () => {
    const user = await seedAccount();
    const res = await grant(user.id, { scopes: ['support'], categoryIds: [] });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ scopes: ['support'], categoryIds: [] });
  });

  it('staff gắn quyền cho người khác, hay tự mở rộng phạm vi → 403', async () => {
    const staff = await seedAccount();
    await grant(staff.id, { scopes: ['support'], categoryIds: [phone] });
    const staffToken = await tokenFor(app, staff.id);
    const other = await seedAccount();

    expect(
      (await grant(other.id, { scopes: ['support'], categoryIds: [] }, staffToken)).statusCode,
    ).toBe(403);
    expect(await repositories.platform.findStaff(other.id)).toBeNull();
    expect(
      (await grant(staff.id, { scopes: ['support'], categoryIds: [phone, computer] }, staffToken))
        .statusCode,
    ).toBe(403);
  });
});

describe('GET /ops/staff', () => {
  it('lọc theo danh mục ra mọi người mang danh mục đó, kể cả người đang treo', async () => {
    const hung = await seedAccount();
    const mai = await seedAccount();
    await grant(hung.id, { scopes: [], categoryIds: [computer] });
    await grant(mai.id, { scopes: [], categoryIds: [computer] });
    // Treo chỉ áp cho tài khoản đang bị khoá (fix-audit-listeners).
    await prisma.account.update({
      where: { id: mai.id },
      data: {
        status: 'locked',
        statusBeforeLock: 'active',
        lockedAt: new Date(),
        lockedReason: 'Thử',
      },
    });
    await app.modules.platform.suspendStaffForLock(mai.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ops/staff?categoryId=${computer}`,
      headers: auth(masterToken),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as Array<{ accountId: string; status: string }>;
    expect(rows.find((row) => row.accountId === hung.id)?.status).toBe('active');
    expect(rows.find((row) => row.accountId === mai.id)?.status).toBe('suspended');
  });

  it('người dùng thường → 403', async () => {
    const user = await seedAccount();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ops/staff',
      headers: auth(await tokenFor(app, user.id)),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('thu quyền có hiệu lực ngay', () => {
  it('thu một danh mục: lượt kế tiếp trên danh mục đó 403, danh mục còn lại vẫn làm được', async () => {
    const hung = await seedAccount();
    const token = await tokenFor(app, hung.id);
    await grant(hung.id, { scopes: [], categoryIds: [phone, computer] });
    expect((await draftOf(computer, token)).statusCode).toBe(200);

    await grant(hung.id, { scopes: [], categoryIds: [phone] });
    expect((await draftOf(computer, token)).statusCode).toBe(403);
    expect((await draftOf(phone, token)).statusCode).toBe(200);
  });

  it('thu toàn bộ: mọi thao tác bàn vận hành 403, app vẫn dùng như người dùng', async () => {
    const hung = await seedAccount();
    const token = await tokenFor(app, hung.id);
    await grant(hung.id, { scopes: ['support'], categoryIds: [phone] });
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/v1/ops/staff/${hung.id}`,
      headers: auth(masterToken),
    });
    expect(revoke.statusCode).toBe(204);

    expect((await draftOf(phone, token)).statusCode).toBe(403);
    const flag = await app.inject({
      method: 'GET',
      url: '/api/v1/ops/flags/ABCD1234',
      headers: auth(token),
    });
    expect(flag.statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: auth(token) })).statusCode,
    ).toBe(200);
  });
});

describe('khoá → treo, mở khoá → vẫn treo, master trả lại', () => {
  it('đi trọn vòng của spec staff-permissions', async () => {
    const hung = await seedAccount();
    await grant(hung.id, { scopes: [], categoryIds: [phone] });

    const lock = await app.inject({
      method: 'POST',
      url: `/api/v1/ops/accounts/${hung.id}/lock`,
      headers: auth(masterToken),
      payload: { reason: 'Điều tra' },
    });
    expect(lock.statusCode).toBe(204);
    await dispatcher.runOnce();

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/ops/staff?categoryId=${phone}`,
      headers: auth(masterToken),
    });
    expect(listed.json().data).toContainEqual(
      expect.objectContaining({
        accountId: hung.id,
        status: 'suspended',
        suspendedReason: 'tài khoản bị khoá',
        categoryIds: [phone],
      }),
    );

    const restore = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/ops/staff/${hung.id}/restore`,
        headers: auth(masterToken),
      });
    const whileLocked = await restore();
    expect(whileLocked.statusCode).toBe(409);
    expect(whileLocked.json().error).toMatchObject({
      code: 'STAFF_PERMISSION_INELIGIBLE',
      message: expect.stringContaining('tài khoản đang bị khoá'),
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/ops/accounts/${hung.id}/unlock`,
      headers: auth(masterToken),
    });
    const token = await tokenFor(app, hung.id);
    const suspended = await draftOf(phone, token);
    expect(suspended.statusCode).toBe(403);
    expect(suspended.json().error.code).toBe('STAFF_PERMISSION_SUSPENDED');

    expect((await restore()).statusCode).toBe(200);
    expect((await draftOf(phone, token)).statusCode).toBe(200);
  });
});

const configVersionNow = async () =>
  (
    await app.inject({ method: 'GET', url: '/api/v1/ops/config', headers: auth(masterToken) })
  ).json().data.version as number;
const changeConfig = async (changes: object) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/ops/config',
    headers: auth(masterToken),
    payload: { baseVersion: await configVersionNow(), changes },
  });

describe('/ops/config', () => {
  it('hệ thống vừa dựng: phiên bản 1 với giá trị khởi đầu TK 28', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ops/config',
      headers: auth(masterToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      version: 1,
      values: { 'quota.liveListingsT0': 10, 'group.applicationExpiresDays': 21 },
    });
  });

  it('đổi → 201 phiên bản mới; tra phiên bản cũ thấy số cũ; phiên bản lệch → 409; không có → 404', async () => {
    const current = (
      await app.inject({ method: 'GET', url: '/api/v1/ops/config', headers: auth(masterToken) })
    ).json().data.version as number;
    const change = (baseVersion: number, changes: object) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/ops/config',
        headers: auth(masterToken),
        payload: { baseVersion, changes },
      });

    const created = await change(current, { 'quota.submitsPerHourT0': 4 });
    expect(created.statusCode).toBe(201);
    expect(created.json().data).toMatchObject({
      version: current + 1,
      createdBy: masterId,
      values: { 'quota.submitsPerHourT0': 4 },
    });

    const old = await app.inject({
      method: 'GET',
      url: `/api/v1/ops/config/versions/${current}`,
      headers: auth(masterToken),
    });
    expect(old.json().data.values['quota.submitsPerHourT0']).toBe(3);

    const stale = await change(current, { 'quota.submitsPerHourT0': 5 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('CONFLICT');

    const negative = await change(current + 1, { 'quota.liveListingsT1': -5 });
    expect(negative.statusCode).toBe(400);
    expect(negative.json().error.code).toBe('VALIDATION_ERROR');

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/ops/config/versions/999',
      headers: auth(masterToken),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('đổi hạn access token: lượt đăng nhập kế tiếp nhận hạn mới mà không khởi động lại', async () => {
    const password = 'ghim-rao-vat-2026!';
    const user = await seedAccount({ passwordHash: await hashPassword(password) });
    const login = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: user.email, password },
        })
      ).json().data as { accessToken: string; expiresIn: number };
    const lifetime = (token: string) => {
      const { exp, iat } = app.jwt.decode<{ exp: number; iat: number }>(token) ?? {
        exp: 0,
        iat: 0,
      };
      return exp - iat;
    };

    const before = await login();
    expect(before.expiresIn).toBe(15 * 60);
    expect(lifetime(before.accessToken)).toBe(15 * 60);

    const current = (
      await app.inject({ method: 'GET', url: '/api/v1/ops/config', headers: auth(masterToken) })
    ).json().data.version as number;
    const changed = await app.inject({
      method: 'POST',
      url: '/api/v1/ops/config',
      headers: auth(masterToken),
      payload: { baseVersion: current, changes: { 'identity.accessTokenMinutes': 5 } },
    });
    expect(changed.statusCode).toBe(201);

    const after = await login();
    expect(after.expiresIn).toBe(5 * 60);
    expect(lifetime(after.accessToken)).toBe(5 * 60);
  });

  it('staff đổi con số → 403', async () => {
    const staff = await seedAccount();
    await grant(staff.id, { scopes: ['support'], categoryIds: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ops/config',
      headers: auth(await tokenFor(app, staff.id)),
      payload: { baseVersion: 1, changes: { 'quota.liveListingsT0': 1 } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('ngoài khoảng hợp lệ hay lệch con số khác → 400, phiên bản không đổi; số 0 có nghĩa thì nhận', async () => {
    const start = await configVersionNow();
    const rejected = [
      { 'identity.sessionIdleDays': 0 },
      { 'screening.imageDuplicateMaxDistance': 5 },
      { 'listing.visibleDays': 40_000 },
      { 'listing.remindBeforeDays': 30 },
      { 'screening.mediumBandFrom': 70, 'screening.highBandFrom': 60 },
    ];
    const responses = await Promise.all(rejected.map((changes) => changeConfig(changes)));
    for (const res of responses) {
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(
      (await changeConfig({ 'screening.imageDuplicateMaxDistance': 5 })).json().error.message,
    ).toContain('screening.imageDuplicateMaxDistance: phải từ 0 tới 4');
    expect(await configVersionNow()).toBe(start);

    const zero = await changeConfig({ 'group.reapplyWaitDays': 0 });
    expect(zero.statusCode).toBe(201);
    expect(zero.json().data.values['group.reapplyWaitDays']).toBe(0);
    expect((await changeConfig({ 'group.reapplyWaitDays': 7 })).statusCode).toBe(201);
  });
});

const staffIds = async (categoryId: string) =>
  (
    (
      await app.inject({
        method: 'GET',
        url: `/api/v1/ops/staff?categoryId=${categoryId}`,
        headers: auth(masterToken),
      })
    ).json().data as Array<{ accountId: string }>
  ).map((row) => row.accountId);
const deleteMe = async (accountId: string) =>
  app.inject({
    method: 'DELETE',
    url: '/api/v1/me',
    headers: auth(await tokenFor(app, accountId)),
  });

describe('xoá tài khoản thì quyền staff bị thu', () => {
  it('staff xoá tài khoản của mình → không còn trong danh sách staff của danh mục', async () => {
    const hung = await seedAccount();
    await grant(hung.id, { scopes: [], categoryIds: [phone] });
    expect((await deleteMe(hung.id)).statusCode).toBe(204);
    await dispatcher.runOnce();
    expect(await staffIds(phone)).not.toContain(hung.id);
  });

  it('quyền đang treo (đã mở khoá, chưa trả lại) cũng bị thu', async () => {
    const mai = await seedAccount();
    await grant(mai.id, { scopes: [], categoryIds: [phone] });
    await app.modules.platform.suspendStaffForLock(mai.id);
    expect((await deleteMe(mai.id)).statusCode).toBe(204);
    await dispatcher.runOnce();
    expect(await repositories.platform.findStaff(mai.id)).toBeNull();
  });

  it('người dùng không mang quyền staff xoá tài khoản → danh sách staff không đổi', async () => {
    const before = await staffIds(phone);
    const user = await seedAccount();
    expect((await deleteMe(user.id)).statusCode).toBe(204);
    await dispatcher.runOnce();
    expect((await staffIds(phone)).toSorted()).toEqual(before.toSorted());
  });
});

describe('mặc định cấm giữ lại', () => {
  it('hồ sơ của tôi và bàn vận hành → cấm giữ lại', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: auth(masterToken) });
    const staff = await app.inject({
      method: 'GET',
      url: '/api/v1/ops/staff',
      headers: auth(masterToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(staff.statusCode).toBe(200);
    expect(staff.headers['cache-control']).toBe('no-store');
  });
});

describe('/ops/audit', () => {
  it('master tra theo đối tượng: khoá rồi mở khoá, xếp theo thời gian, lý do đi kèm', async () => {
    const user = await seedAccount();
    await app.inject({
      method: 'POST',
      url: `/api/v1/ops/accounts/${user.id}/lock`,
      headers: auth(masterToken),
      payload: { reason: 'Lừa đảo' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/ops/accounts/${user.id}/unlock`,
      headers: auth(masterToken),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ops/audit?targetType=account&targetId=${user.id}`,
      headers: auth(masterToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toMatchObject([
      { action: 'identity.account.lock', actorId: masterId, reason: 'Lừa đảo' },
      { action: 'identity.account.unlock', actorId: masterId },
    ]);
  });

  it('gắn quyền ghi một dòng dưới tên master', async () => {
    const user = await seedAccount();
    await grant(user.id, { scopes: ['support'], categoryIds: [] });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ops/audit?targetId=${user.id}`,
      headers: auth(masterToken),
    });
    expect(res.json().data.items).toMatchObject([
      { action: 'platform.staff.grant', actorId: masterId, actorRole: 'master' },
    ]);
  });

  it('staff tra nhật ký, kể cả về chính mình → 403; người dùng thường → 403', async () => {
    const staff = await seedAccount();
    await grant(staff.id, {
      scopes: ['support', 'user_reports', 'id_verification'],
      categoryIds: [phone],
    });
    const user = await seedAccount();
    const [asStaff, asUser] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/ops/audit?actorId=${staff.id}`,
        headers: auth(await tokenFor(app, staff.id)),
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/ops/audit',
        headers: auth(await tokenFor(app, user.id)),
      }),
    ]);
    expect(asStaff.statusCode).toBe(403);
    expect(asUser.statusCode).toBe(403);
  });

  it('không có thao tác xoá nhật ký → 404 NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/ops/audit/00000000-0000-7000-8000-000000000001',
      headers: auth(masterToken),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('Swagger', () => {
  it('liệt kê route Ops · Staff / Config / Audit với bearerAuth', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as {
      paths: Record<string, Record<string, { tags?: string[]; security?: unknown[] }>>;
    };
    const ops = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.values(methods).map((op) => ({ path, ...op })),
    );
    for (const tag of ['Ops · Staff', 'Ops · Config', 'Ops · Audit']) {
      const tagged = ops.filter((op) => op.tags?.includes(tag));
      expect(tagged.length).toBeGreaterThan(0);
      for (const op of tagged) expect(op.security).toEqual([{ bearerAuth: [] }]);
    }
  });
});
