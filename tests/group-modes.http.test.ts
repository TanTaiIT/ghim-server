import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/actor.js';
import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { createGroupService } from '../src/modules/group/group.service.js';
import { auditOf, prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/* Spec `group-modes` qua HTTP, mỗi scenario một ca. */
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

const errorOf = (res: LightMyRequestResponse) => ({
  status: res.statusCode,
  code: res.body ? res.json().error?.code : undefined,
});

const groupRow = (groupId: string) => repositories.group.findGroup(groupId);
const eventsOf = (type: string, groupId: string) =>
  prisma.outboxEvent.findMany({
    where: { type, payload: { path: ['groupId'], equals: groupId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

const settings = (group: ActiveGroup, payload: object, token = group.owner.token) =>
  api(app, 'PATCH', `/groups/${group.groupId}/settings`, token, payload);
const profile = async (groupId: string, token?: string) =>
  (await api(app, 'GET', `/groups/${groupId}`, token)).json().data;
const search = async (q: string): Promise<string[]> => {
  const res = await api(app, 'GET', `/groups?q=${encodeURIComponent(q)}&limit=100`);
  expect(res.statusCode).toBe(200);
  return (res.json().data.items as { id: string }[]).map((item) => item.id);
};
const lookup = (code: string, user: TestUser) =>
  api(app, 'POST', '/groups/lookup-code', user.token, { code });
const join = (groupId: string, user: TestUser, payload: object = {}) =>
  api(app, 'POST', `/groups/${groupId}/join`, user.token, payload);

async function moderatorOf(group: ActiveGroup): Promise<TestUser> {
  const user = await addMember(app, group.groupId);
  await appointModerator(app, group, user);
  return user;
}

describe('Bốn chế độ', () => {
  it('Đặt nhóm riêng tư mở cửa', async () => {
    const created = await api(app, 'POST', '/ops/groups', master.token, {
      name: 'Nhóm riêng tư mở cửa',
      kind: 'community',
      mode: 'private_open',
    });
    expect(errorOf(created)).toEqual({ status: 400, code: 'VALIDATION_ERROR' });

    const group = await createActiveGroup(app, { master, mode: 'private_code' });
    expect(errorOf(await settings(group, { mode: 'private_open' }))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(await groupRow(group.groupId)).toMatchObject({ mode: 'private_code' });
  });
});

describe('Ai tìm thấy nhóm', () => {
  it('Khách tìm nhóm', async () => {
    const open = await createActiveGroup(app, {
      master,
      name: 'Lê Quý Đôn',
      mode: 'public_review',
    });
    const hidden = await createActiveGroup(app, {
      master,
      name: 'Lê Quý Đôn',
      mode: 'private_code',
    });

    const found = await search('le quy don');
    expect(found).toContain(open.groupId);
    expect(found).not.toContain(hidden.groupId);

    // Nhóm riêng tư · có mã chỉ lộ ra với người nhập đúng mã.
    const code = (await profile(hidden.groupId, hidden.owner.token)).code as string;
    const res = await lookup(code, await newUser(app));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: hidden.groupId, mode: 'private_code' });
  });

  it('Khách xem hồ sơ nhóm công khai', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_open' });
    const res = await api(app, 'GET', `/groups/${group.groupId}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      visibility: 'full',
      id: group.groupId,
      mode: 'public_open',
      state: 'active',
      memberCount: 1,
      code: null,
      lockedReason: null,
      membership: null,
    });
  });

  it('Nhóm riêng tư chỉ lời mời', async () => {
    const group = await createActiveGroup(app, {
      master,
      name: 'CLB Cờ Vua Hà Đông',
      mode: 'private_invite',
    });
    expect(await search('CLB Cờ Vua Hà Đông')).not.toContain(group.groupId);
  });
});

describe('Chủ nhóm hoặc master đổi chế độ', () => {
  it('Đổi cách vào của nhóm công khai', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_open' });
    const res = await settings(group, { mode: 'public_review' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ state: 'active', mode: 'public_review' });

    const joined = await join(group.groupId, await newUser(app));
    expect(joined.statusCode).toBe(201);
    expect(joined.json().data).toMatchObject({ result: 'request', request: { status: 'pending' } });
    expect(await eventsOf('group.mode.changed', group.groupId)).toMatchObject([
      { payload: { groupId: group.groupId, from: 'public_open', to: 'public_review' } },
    ]);
  });

  it('Xét duyệt sang mở cửa', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    const applicant = await newUser(app);
    expect((await join(group.groupId, applicant)).json().data.result).toBe('request');

    expect((await settings(group, { mode: 'public_open' })).statusCode).toBe(200);

    expect(
      await prisma.groupJoinRequest.findFirst({
        where: { groupId: group.groupId, accountId: applicant.id },
      }),
    ).toMatchObject({ status: 'cancelled' });
    const pending = await api(
      app,
      'GET',
      `/groups/${group.groupId}/join-requests`,
      group.owner.token,
    );
    expect(pending.json().data.total).toBe(0);
    const again = await join(group.groupId, applicant);
    expect(again.statusCode).toBe(201);
    expect(again.json().data).toMatchObject({
      result: 'member',
      membership: { role: 'member', joinedVia: 'joined' },
    });
    expect(await eventsOf('group.mode.changed', group.groupId)).toMatchObject([
      { payload: { from: 'public_review', to: 'public_open' } },
    ]);
  });

  it('Có mã sang chỉ lời mời', async () => {
    const group = await createActiveGroup(app, { master, mode: 'private_code' });
    const applicant = await newUser(app);
    const code = (await profile(group.groupId, group.owner.token)).code as string;
    const applied = await join(group.groupId, applicant, { code });
    expect(applied.json().data.result).toBe('request');
    const requestId = applied.json().data.request.id as string;

    const res = await settings(group, { mode: 'private_invite' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ mode: 'private_invite', code: null });

    expect(errorOf(await lookup(code, await newUser(app)))).toEqual({
      status: 404,
      code: 'NOT_FOUND',
    });
    const pending = await api(
      app,
      'GET',
      `/groups/${group.groupId}/join-requests`,
      group.owner.token,
    );
    expect(pending.json().data.items).toMatchObject([{ id: requestId, accountId: applicant.id }]);
    const decided = await api(
      app,
      'POST',
      `/group-join-requests/${requestId}/decision`,
      group.owner.token,
      { approve: true },
    );
    expect(decided.statusCode).toBe(200);
    expect(decided.json().data).toMatchObject({ status: 'approved' });
    expect(await repositories.group.findMember(group.groupId, applicant.id)).toMatchObject({
      joinedVia: 'approved',
    });
    expect(await eventsOf('group.mode.changed', group.groupId)).toMatchObject([
      { payload: { from: 'private_code', to: 'private_invite' } },
    ]);
  });

  it('Chỉ lời mời sang có mã', async () => {
    const group = await createActiveGroup(app, { master, mode: 'private_invite' });
    expect((await groupRow(group.groupId))?.code).toBeNull();

    const res = await settings(group, { mode: 'private_code' });
    expect(res.statusCode).toBe(200);
    const { code } = res.json().data;
    expect(code).toMatch(/^[0-9A-Z]{6}$/);
    expect((await lookup(code, await newUser(app))).json().data).toMatchObject({
      id: group.groupId,
    });
    expect(await eventsOf('group.mode.changed', group.groupId)).toMatchObject([
      { payload: { from: 'private_invite', to: 'private_code' } },
    ]);
  });

  it('Điều hành viên thử đổi chế độ', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    const moderator = await moderatorOf(group);
    expect(errorOf(await settings(group, { mode: 'public_open' }, moderator.token))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await groupRow(group.groupId)).toMatchObject({ mode: 'public_review' });
    expect(await eventsOf('group.mode.changed', group.groupId)).toEqual([]);
  });
});

describe('Công khai sang riêng tư qua trạng thái chuyển', () => {
  it('Bắt đầu chuyển', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    expect((await settings(group, { allowOutsiders: true })).statusCode).toBe(200);
    // Đợt này chưa có `listing`: app không nối bộ đếm tin "nhóm công khai", nên dựng service với bộ đếm giả
    // báo nhóm còn một tin — đường duy nhất để đi vào trạng thái chuyển.
    const withListing = createGroupService({
      repository: repositories.group,
      identity: app.modules.identity,
      config: createStaticRuntimeConfig(),
      clock: () => TEST_NOW,
      publicListings: { countInGroup: () => Promise.resolve(1) },
    });
    const owner: Actor = {
      accountId: group.owner.id,
      role: 'user',
      sessionId: group.owner.id,
      secondFactorAt: null,
      emailVerified: true,
    };

    const result = await withListing.updateSettings(owner, group.groupId, { mode: 'private_code' });

    expect(result).toMatchObject({ state: 'going_private', mode: 'public_review', code: null });
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'going_private',
      mode: 'public_review',
      targetMode: 'private_code',
      allowOutsiders: false,
      code: null,
    });
    expect(await eventsOf('group.privatization.started', group.groupId)).toMatchObject([
      { payload: { targetMode: 'private_code' } },
    ]);
    expect(await eventsOf('group.mode.changed', group.groupId)).toEqual([]);
  });

  it('Chuyển xong', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    const withListing = createGroupService({
      repository: repositories.group,
      identity: app.modules.identity,
      config: createStaticRuntimeConfig(),
      clock: () => TEST_NOW,
      publicListings: { countInGroup: () => Promise.resolve(1) },
    });
    const owner: Actor = {
      accountId: group.owner.id,
      role: 'user',
      sessionId: group.owner.id,
      secondFactorAt: null,
      emailVerified: true,
    };
    await withListing.updateSettings(owner, group.groupId, { mode: 'private_code' });

    // Đợt 2 `listing` gọi bước này khi đã hạ hết tin "nhóm công khai" của nhóm.
    await app.modules.group.completePrivatization(group.groupId);

    const row = await groupRow(group.groupId);
    expect(row).toMatchObject({
      state: 'active',
      mode: 'private_code',
      targetMode: null,
      allowOutsiders: false,
      showNameOnMarketplace: false,
    });
    expect(row?.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(await eventsOf('group.privatization.completed', group.groupId)).toHaveLength(1);
    await expect(app.modules.group.completePrivatization(group.groupId)).rejects.toMatchObject({
      code: 'GROUP_STATE_CONFLICT',
    });
  });

  it('Nhóm không có tin công khai', async () => {
    const group = await createActiveGroup(app, {
      master,
      name: 'Hội phụ huynh Nguyễn Trãi',
      mode: 'public_review',
    });
    expect((await settings(group, { allowOutsiders: true })).statusCode).toBe(200);
    expect(await search('hoi phu huynh nguyen trai')).toContain(group.groupId);

    const res = await settings(group, { mode: 'private_code' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      state: 'active',
      mode: 'private_code',
      allowOutsiders: false,
      showNameOnMarketplace: false,
      code: expect.stringMatching(/^[0-9A-Z]{6}$/),
    });
    expect(await groupRow(group.groupId)).toMatchObject({ state: 'active', targetMode: null });
    expect(await search('hoi phu huynh nguyen trai')).not.toContain(group.groupId);
    expect(await eventsOf('group.mode.changed', group.groupId)).toMatchObject([
      { payload: { from: 'public_review', to: 'private_code' } },
    ]);
  });

  it('bật "hiện tên nhóm trên tin sàn" cùng lượt chuyển phải qua trạng thái chuyển → 409 GROUP_MODE_CONFLICT (fix-audit-group-low, L6)', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    const withListing = createGroupService({
      repository: repositories.group,
      identity: app.modules.identity,
      config: createStaticRuntimeConfig(),
      clock: () => TEST_NOW,
      publicListings: { countInGroup: () => Promise.resolve(1) },
    });
    const owner: Actor = {
      accountId: group.owner.id,
      role: 'user',
      sessionId: group.owner.id,
      secondFactorAt: null,
      emailVerified: true,
    };

    await expect(
      withListing.updateSettings(owner, group.groupId, {
        mode: 'private_code',
        showNameOnMarketplace: true,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'GROUP_MODE_CONFLICT' });
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'active',
      mode: 'public_review',
      targetMode: null,
    });
  });

  it('Đổi tiếp khi đang chuyển', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    // Trạng thái chuyển chỉ vào được khi còn tin "nhóm công khai" — đợt này chưa có tin nên ghi thẳng.
    await prisma.group.update({
      where: { id: group.groupId },
      data: { state: 'going_private', targetMode: 'private_code' },
    });

    expect(errorOf(await settings(group, { mode: 'private_invite' }))).toEqual({
      status: 409,
      code: 'GROUP_STATE_CONFLICT',
    });
    expect(errorOf(await settings(group, { mode: 'public_open' }))).toEqual({
      status: 409,
      code: 'GROUP_STATE_CONFLICT',
    });
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'going_private',
      mode: 'public_review',
      targetMode: 'private_code',
    });
  });
});

describe('Riêng tư sang công khai không hạ gì', () => {
  it('Nhóm riêng tư thành công khai', async () => {
    const group = await createActiveGroup(app, {
      master,
      name: 'Hội cựu học sinh Chu Văn An',
      mode: 'private_invite',
    });
    await addMember(app, group.groupId, { via: 'invited' });
    await addMember(app, group.groupId, { via: 'roster' });
    await moderatorOf(group);
    const members = async () =>
      (
        await api(app, 'GET', `/groups/${group.groupId}/members?limit=100`, group.owner.token)
      ).json().data.items;
    const before = await members();
    expect(before).toHaveLength(4);
    expect(await search('chu van an')).not.toContain(group.groupId);

    const res = await settings(group, { mode: 'public_review' }, master.token);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ state: 'active', mode: 'public_review' });
    expect(await search('chu van an')).toContain(group.groupId);
    expect(await members()).toEqual(before);
    expect(await eventsOf('group.mode.changed', group.groupId)).toMatchObject([
      { payload: { from: 'private_invite', to: 'public_review' } },
    ]);
    expect(await auditOf(group.groupId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: master.id,
          actorRole: 'master',
          action: 'group.settings.update',
        }),
      ]),
    );
  });
});

describe('Nhận tin người ngoài chỉ ở nhóm công khai', () => {
  it('Bật ở nhóm công khai', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    const res = await settings(group, { allowOutsiders: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.allowOutsiders).toBe(true);
    expect((await profile(group.groupId)).allowOutsiders).toBe(true);
  });

  it('Bật ở nhóm riêng tư', async () => {
    const group = await createActiveGroup(app, { master, mode: 'private_invite' });
    expect(errorOf(await settings(group, { allowOutsiders: true }))).toEqual({
      status: 409,
      code: 'GROUP_MODE_CONFLICT',
    });
    expect(await groupRow(group.groupId)).toMatchObject({ allowOutsiders: false });
  });

  it('Điều hành viên thử bật', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    const moderator = await moderatorOf(group);
    expect(errorOf(await settings(group, { allowOutsiders: true }, moderator.token))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await groupRow(group.groupId)).toMatchObject({ allowOutsiders: false });
  });
});

describe('Kiểu bảng tin', () => {
  it('Chọn dạng lưới', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    expect((await profile(group.groupId)).boardStyle).toBe('list');
    expect((await settings(group, { boardStyle: 'grid' })).statusCode).toBe(200);
    expect((await profile(group.groupId)).boardStyle).toBe('grid');
  });

  it('Kiểu không có', async () => {
    const group = await createActiveGroup(app, { master });
    expect(errorOf(await settings(group, { boardStyle: 'masonry' }))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(await groupRow(group.groupId)).toMatchObject({ boardStyle: 'list' });
  });

  it('Điều hành viên thử đổi kiểu', async () => {
    const group = await createActiveGroup(app, { master });
    const moderator = await moderatorOf(group);
    expect(errorOf(await settings(group, { boardStyle: 'grid' }, moderator.token))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await groupRow(group.groupId)).toMatchObject({ boardStyle: 'list' });
  });
});

describe('Mô tả nhóm', () => {
  it('Sửa mô tả', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    const description = 'Nơi trao đổi sách cũ của khối 12';
    expect((await settings(group, { description })).statusCode).toBe(200);
    expect((await profile(group.groupId)).description).toBe(description);
  });

  it('Điều hành viên thử sửa mô tả', async () => {
    const group = await createActiveGroup(app, { master });
    const moderator = await moderatorOf(group);
    expect(errorOf(await settings(group, { description: 'Sửa trộm' }, moderator.token))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await groupRow(group.groupId)).toMatchObject({ description: null });
  });
});

describe('Mã nhóm', () => {
  it('đổi mã nhóm: mã cũ hết hiệu lực ngay, mã mới tìm được nhóm', async () => {
    const group = await createActiveGroup(app, { master, mode: 'private_code' });
    const outsider = await newUser(app);
    const oldCode = (await profile(group.groupId, group.owner.token)).code as string;

    const res = await api(app, 'POST', `/groups/${group.groupId}/code`, group.owner.token);

    expect(res.statusCode).toBe(200);
    const newCode = res.json().data.code as string;
    expect(newCode).not.toBe(oldCode);
    expect(errorOf(await lookup(oldCode, outsider))).toEqual({ status: 404, code: 'NOT_FOUND' });
    expect((await lookup(newCode, outsider)).json().data).toMatchObject({ id: group.groupId });
  });
});
