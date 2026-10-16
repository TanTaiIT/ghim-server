import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOutboxDispatcher } from '../src/common/outbox/dispatcher.js';
import { registerGroupListeners } from '../src/modules/group/group.events.js';
import { auditOf, prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createPendingGroup,
  createUnit,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, grantStaff, repositories } from './test-app.js';

/*
 * Spec `group-lifecycle` qua HTTP, mỗi scenario một ca. Nhóm thiếu chủ dựng bằng đường thật — master khoá tài khoản
 * chủ, bộ phát outbox đưa sự kiện của `identity` tới `group` — để ca khoá / mở khoá chạy đúng trên dữ liệu hệ thống
 * tự sinh ra, không trên một trạng thái ghi tay.
 */
const REASON = 'Đăng tin lừa đảo nhiều lần';

let app: FastifyInstance;
let master: TestUser;
const dispatcher = createOutboxDispatcher(prisma);

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  registerGroupListeners(dispatcher, app.modules.group);
  master = await newMaster(app);
});

afterAll(() => app.close());

let seq = 0;
const groupBody = (overrides: object = {}) => {
  seq += 1;
  return { name: `Nhóm vòng đời ${seq}`, kind: 'school', mode: 'public_review', ...overrides };
};

const errorOf = (res: LightMyRequestResponse) => ({
  status: res.statusCode,
  code: res.body ? res.json().error?.code : undefined,
});

const stateOf = async (groupId: string) => (await repositories.group.findGroup(groupId))?.state;
const auditActions = async (groupId: string) => (await auditOf(groupId)).map((row) => row.action);
const eventsOf = (type: string, groupId: string) =>
  prisma.outboxEvent.findMany({
    where: { type, payload: { path: ['groupId'], equals: groupId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

const createGroup = (body: object, token = master.token) =>
  api(app, 'POST', '/ops/groups', token, body);
const lockGroup = (groupId: string, payload: object = { reason: REASON }, token = master.token) =>
  api(app, 'POST', `/ops/groups/${groupId}/lock`, token, payload);
const unlockGroup = (groupId: string) =>
  api(app, 'POST', `/ops/groups/${groupId}/unlock`, master.token);
const closeAsMaster = (groupId: string) =>
  api(app, 'POST', `/ops/groups/${groupId}/close`, master.token);
const closeAsMember = (groupId: string, token: string) =>
  api(app, 'POST', `/groups/${groupId}/close`, token);
const settings = (groupId: string, token: string, payload: object) =>
  api(app, 'PATCH', `/groups/${groupId}/settings`, token, payload);
const join = (groupId: string, user: TestUser, payload: object = {}) =>
  api(app, 'POST', `/groups/${groupId}/join`, user.token, payload);

/** Bộ phát lấy lô 100 sự kiện; dữ liệu dồn qua các ca nên một lượt chưa chắc tới sự kiện khoá tài khoản. */
const drainOutbox = async (): Promise<void> => {
  if ((await dispatcher.runOnce()).published > 0) await drainOutbox();
};

async function moderatorOf(group: ActiveGroup): Promise<TestUser> {
  const user = await addMember(app, group.groupId);
  await appointModerator(app, group, user);
  return user;
}

/** Thiếu chủ: tài khoản chủ bị khoá trong khi nhóm còn một điều hành viên dùng được để đề cử. */
async function ownerlessGroup(): Promise<ActiveGroup> {
  const group = await createActiveGroup(app, { master });
  await moderatorOf(group);
  const locked = await api(app, 'POST', `/ops/accounts/${group.owner.id}/lock`, master.token, {
    reason: 'Mạo danh nhà trường',
  });
  expect(locked.statusCode).toBe(204);
  await drainOutbox();
  expect(await stateOf(group.groupId)).toBe('ownerless');
  return group;
}

describe('Chỉ master lập nhóm', () => {
  it('Master lập nhóm', async () => {
    const res = await createGroup({
      name: 'THPT Lê Quý Đôn',
      kind: 'school',
      mode: 'public_review',
      description: 'Bảng tin của học sinh và phụ huynh trường',
    });
    expect(res.statusCode).toBe(201);
    const group = res.json().data;
    expect(group).toMatchObject({
      name: 'THPT Lê Quý Đôn',
      kind: 'school',
      mode: 'public_review',
      state: 'pending_owner',
      description: 'Bảng tin của học sinh và phụ huynh trường',
      memberCount: 0,
    });
    expect(await auditOf(group.id)).toMatchObject([
      {
        actorId: master.id,
        actorRole: 'master',
        action: 'group.group.create',
        targetType: 'group',
      },
    ]);
  });

  it('Người dùng thử lập nhóm', async () => {
    const user = await newUser(app);
    const body = groupBody();
    expect(errorOf(await createGroup(body, user.token))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await prisma.group.count({ where: { name: body.name } })).toBe(0);
  });

  it('Staff thử lập nhóm', async () => {
    const staff = await seedAccount();
    await grantStaff(staff.id, ['support']);
    const body = groupBody();
    expect(errorOf(await createGroup(body, await tokenFor(app, staff.id)))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await prisma.group.count({ where: { name: body.name } })).toBe(0);
  });

  it('Loại nhóm không có trong danh sách', async () => {
    expect(errorOf(await createGroup(groupBody({ kind: 'club' })))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('Thiếu tên nhóm', async () => {
    expect(errorOf(await createGroup(groupBody({ name: '   ' })))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(errorOf(await createGroup({ kind: 'school', mode: 'public_review' }))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('Mô tả quá dài', async () => {
    expect(errorOf(await createGroup(groupBody({ description: 'a'.repeat(1001) })))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    // Mốc 1000 ký tự vẫn nhận: trần là "tối đa 1000", không phải "dưới 1000".
    expect((await createGroup(groupBody({ description: 'a'.repeat(1000) }))).statusCode).toBe(201);
  });
});

describe('Loại nhóm chỉ để chọn sẵn cài đặt', () => {
  it('Đổi cài đặt khác với cài đặt chọn sẵn', async () => {
    const group = await createActiveGroup(app, { master, kind: 'company', mode: 'private_invite' });
    const res = await settings(group.groupId, group.owner.token, {
      mode: 'public_open',
      allowOutsiders: true,
      boardStyle: 'grid',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      kind: 'company',
      mode: 'public_open',
      allowOutsiders: true,
      boardStyle: 'grid',
    });
  });
});

describe('Trạng thái nhóm chỉ đổi theo đường đã định', () => {
  it('Mở khoá nhóm không bị khoá', async () => {
    const group = await createActiveGroup(app, { master });
    expect(errorOf(await unlockGroup(group.groupId))).toEqual({
      status: 409,
      code: 'GROUP_STATE_CONFLICT',
    });
    expect(await stateOf(group.groupId)).toBe('active');
  });

  it('Khoá nhóm đã đóng', async () => {
    const group = await createActiveGroup(app, { master });
    expect((await closeAsMaster(group.groupId)).statusCode).toBe(204);
    expect(errorOf(await lockGroup(group.groupId))).toEqual({
      status: 409,
      code: 'GROUP_STATE_CONFLICT',
    });
    expect(await stateOf(group.groupId)).toBe('closed');
  });
});

describe('Master tạm khoá và mở khoá nhóm', () => {
  it('Master khoá nhóm', async () => {
    const group = await createActiveGroup(app, { master });
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);
    expect(await repositories.group.findGroup(group.groupId)).toMatchObject({
      state: 'locked',
      lockCause: 'master',
      lockedReason: REASON,
      lockedBy: master.id,
    });
    expect(await eventsOf('group.state.locked', group.groupId)).toMatchObject([
      { payload: { groupId: group.groupId, cause: 'master', reason: REASON } },
    ]);
    expect(await auditOf(group.groupId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: master.id,
          actorRole: 'master',
          action: 'group.group.lock',
          reason: REASON,
        }),
      ]),
    );
  });

  it('Mở khoá nhóm có chủ', async () => {
    const group = await createActiveGroup(app, { master });
    const unitId = await createUnit(app, group, 'Lớp 12A1');
    await addMember(app, group.groupId, { unitId });
    await addMember(app, group.groupId, { via: 'invited' });
    await appointModerator(app, group, await addMember(app, group.groupId), unitId);
    await moderatorOf(group);
    expect(
      (
        await settings(group.groupId, group.owner.token, {
          boardStyle: 'grid',
          allowOutsiders: true,
          description: 'Nhóm của khối 12',
        })
      ).statusCode,
    ).toBe(200);
    const snapshot = async () => ({
      profile: (await api(app, 'GET', `/ops/groups/${group.groupId}`, master.token)).json().data,
      members: (
        await api(app, 'GET', `/groups/${group.groupId}/members?limit=100`, master.token)
      ).json().data.items,
    });
    const before = await snapshot();

    expect((await lockGroup(group.groupId)).statusCode).toBe(204);
    expect((await unlockGroup(group.groupId)).statusCode).toBe(204);

    expect(before.profile.state).toBe('active');
    expect(before.members).toHaveLength(5);
    expect(await snapshot()).toEqual(before);
    expect(await eventsOf('group.state.unlocked', group.groupId)).toHaveLength(1);
    expect(await auditActions(group.groupId)).toEqual(
      expect.arrayContaining(['group.group.lock', 'group.group.unlock']),
    );
  });

  it('Chủ nhóm thử khoá nhóm', async () => {
    const group = await createActiveGroup(app, { master });
    expect(errorOf(await lockGroup(group.groupId, { reason: REASON }, group.owner.token))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await stateOf(group.groupId)).toBe('active');
  });

  it('Khoá không ghi lý do', async () => {
    const group = await createActiveGroup(app, { master });
    expect(errorOf(await lockGroup(group.groupId, { reason: '   ' }))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(errorOf(await lockGroup(group.groupId, {}))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(await stateOf(group.groupId)).toBe('active');
  });

  it('Khoá nhóm đang thiếu chủ', async () => {
    const group = await ownerlessGroup();
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);
    expect(await repositories.group.findGroup(group.groupId)).toMatchObject({
      state: 'locked',
      lockCause: 'master',
      lockedReason: REASON,
    });
  });

  it('Mở khoá nhóm chưa có chủ dùng được', async () => {
    const group = await ownerlessGroup();
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);
    expect(errorOf(await unlockGroup(group.groupId))).toEqual({
      status: 409,
      code: 'GROUP_OWNER_REQUIRED',
    });
    expect(await stateOf(group.groupId)).toBe('locked');
  });

  it('Thành viên thường xem nhóm bị khoá', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);
    const res = await api(app, 'GET', `/groups/${group.groupId}`, member.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      state: 'locked',
      lockedReason: null,
      membership: { role: 'member' },
    });
    expect(res.body).not.toContain(REASON);
  });

  it('chủ nhóm, điều hành viên và master thấy lý do khoá', async () => {
    const group = await createActiveGroup(app, { master });
    const moderator = await moderatorOf(group);
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);
    const reasonFor = async (token: string) =>
      (await api(app, 'GET', `/groups/${group.groupId}`, token)).json().data.lockedReason;
    expect(await reasonFor(group.owner.token)).toBe(REASON);
    expect(await reasonFor(moderator.token)).toBe(REASON);
    expect(await reasonFor(master.token)).toBe(REASON);
    expect(
      (await api(app, 'GET', `/ops/groups/${group.groupId}`, master.token)).json().data
        .lockedReason,
    ).toBe(REASON);
  });
});

describe('Đóng nhóm là vĩnh viễn', () => {
  it('Chủ nhóm đóng nhóm', async () => {
    const group = await createActiveGroup(app, { master });
    expect((await closeAsMember(group.groupId, group.owner.token)).statusCode).toBe(204);
    expect(await repositories.group.findGroup(group.groupId)).toMatchObject({
      state: 'closed',
      closedBy: group.owner.id,
    });
    expect(await eventsOf('group.state.closed', group.groupId)).toHaveLength(1);
  });

  it('Master huỷ nhóm chưa có chủ', async () => {
    const groupId = await createPendingGroup(app, master);
    const candidate = await newUser(app);
    const offer = await api(app, 'POST', `/ops/groups/${groupId}/owner-offers`, master.token, {
      accountId: candidate.id,
    });
    expect(offer.statusCode).toBe(201);
    const offerId = offer.json().data.id as string;

    expect((await closeAsMaster(groupId)).statusCode).toBe(204);

    expect(await stateOf(groupId)).toBe('closed');
    expect(await prisma.groupOwnerOffer.findUnique({ where: { id: offerId } })).toMatchObject({
      status: 'cancelled',
    });
    expect((await api(app, 'GET', '/me/group-owner-offers', candidate.token)).json().data).toEqual(
      [],
    );
    expect(
      errorOf(await api(app, 'POST', `/group-owner-offers/${offerId}/accept`, candidate.token)),
    ).toEqual({ status: 409, code: 'GROUP_STATE_CONFLICT' });
    expect(await auditActions(groupId)).toEqual(
      expect.arrayContaining(['group.group.create', 'group.owner.offer', 'group.group.close']),
    );
  });

  it('Điều hành viên thử đóng nhóm', async () => {
    const group = await createActiveGroup(app, { master });
    const moderator = await moderatorOf(group);
    expect(errorOf(await closeAsMember(group.groupId, moderator.token))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await stateOf(group.groupId)).toBe('active');
  });

  it('Thao tác trên nhóm đã đóng', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    expect((await closeAsMember(group.groupId, group.owner.token)).statusCode).toBe(204);
    expect(
      errorOf(await settings(group.groupId, group.owner.token, { mode: 'public_open' })),
    ).toEqual({ status: 409, code: 'GROUP_STATE_CONFLICT' });
    expect(await repositories.group.findGroup(group.groupId)).toMatchObject({
      state: 'closed',
      mode: 'public_review',
    });
  });
});

describe('Đóng nhóm huỷ đơn, lời mời và mã nhóm', () => {
  it('Nhận lời mời sau khi nhóm đóng', async () => {
    const group = await createActiveGroup(app, { master });
    const invitee = await newUser(app);
    const invited = await api(
      app,
      'POST',
      `/groups/${group.groupId}/invitations`,
      group.owner.token,
      {
        email: invitee.email,
      },
    );
    expect(invited.statusCode).toBe(204);
    const mine = (await api(app, 'GET', '/me/group-invitations', invitee.token)).json().data;
    expect(mine.invitations).toMatchObject([{ groupId: group.groupId }]);
    const invitationId = mine.invitations[0].id as string;

    expect((await closeAsMember(group.groupId, group.owner.token)).statusCode).toBe(204);

    expect(
      errorOf(await api(app, 'POST', `/group-invitations/${invitationId}/accept`, invitee.token)),
    ).toEqual({ status: 409, code: 'GROUP_STATE_CONFLICT' });
    expect(await repositories.group.findMember(group.groupId, invitee.id)).toBeNull();
  });

  it('Nhập mã của nhóm đã đóng', async () => {
    const group = await createActiveGroup(app, { master, mode: 'private_code' });
    const outsider = await newUser(app);
    const code = (await api(app, 'GET', `/groups/${group.groupId}`, group.owner.token)).json().data
      .code as string;
    const lookup = () => api(app, 'POST', '/groups/lookup-code', outsider.token, { code });
    // Mã phải còn dùng được trước khi đóng, không thì 404 sau đó không chứng minh được gì.
    expect((await lookup()).statusCode).toBe(200);

    expect((await closeAsMember(group.groupId, group.owner.token)).statusCode).toBe(204);

    expect(errorOf(await lookup())).toEqual({ status: 404, code: 'NOT_FOUND' });
    expect(errorOf(await join(group.groupId, outsider, { code }))).toEqual({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('Đơn đang chờ', async () => {
    const applicant = await newUser(app);
    const closing = await createActiveGroup(app, { master });
    const second = await createActiveGroup(app, { master });
    const third = await createActiveGroup(app, { master });
    const fourth = await createActiveGroup(app, { master });
    expect((await join(closing.groupId, applicant)).json().data.result).toBe('request');
    expect((await join(second.groupId, applicant)).json().data.result).toBe('request');
    expect((await join(third.groupId, applicant)).json().data.result).toBe('request');
    // Đủ ba đơn chờ thì đơn thứ tư bị chặn — mốc để thấy đơn của nhóm đóng thôi được tính.
    expect(errorOf(await join(fourth.groupId, applicant))).toEqual({
      status: 409,
      code: 'JOIN_REQUEST_LIMIT',
    });

    expect((await closeAsMember(closing.groupId, closing.owner.token)).statusCode).toBe(204);

    expect(
      await prisma.groupJoinRequest.findFirst({
        where: { groupId: closing.groupId, accountId: applicant.id },
      }),
    ).toMatchObject({ status: 'cancelled' });
    expect(await eventsOf('group.state.closed', closing.groupId)).toMatchObject([
      { payload: { cancelledRequestAccountIds: [applicant.id] } },
    ]);
    const res = await join(fourth.groupId, applicant);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.result).toBe('request');
  });
});

describe('Nhóm tạm khoá chỉ đọc', () => {
  it('Duyệt đơn khi nhóm khoá', async () => {
    const group = await createActiveGroup(app, { master, mode: 'public_review' });
    const moderator = await moderatorOf(group);
    const applicant = await newUser(app);
    const requestId = (await join(group.groupId, applicant)).json().data.request.id as string;
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);

    const res = await api(
      app,
      'POST',
      `/group-join-requests/${requestId}/decision`,
      moderator.token,
      {
        approve: true,
      },
    );
    expect(errorOf(res)).toEqual({ status: 409, code: 'GROUP_STATE_CONFLICT' });
    expect(await repositories.group.findMember(group.groupId, applicant.id)).toBeNull();
    expect(await prisma.groupJoinRequest.findUnique({ where: { id: requestId } })).toMatchObject({
      status: 'pending',
    });
  });

  it('Đổi cài đặt khi nhóm khoá', async () => {
    const group = await createActiveGroup(app, { master });
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);
    expect(
      errorOf(await settings(group.groupId, group.owner.token, { boardStyle: 'grid' })),
    ).toEqual({ status: 409, code: 'GROUP_STATE_CONFLICT' });
    expect(await repositories.group.findGroup(group.groupId)).toMatchObject({
      state: 'locked',
      boardStyle: 'list',
    });
  });

  it('Đóng nhóm khi đang khoá', async () => {
    const group = await createActiveGroup(app, { master });
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);
    expect((await closeAsMember(group.groupId, group.owner.token)).statusCode).toBe(204);
    expect(await stateOf(group.groupId)).toBe('closed');
  });

  it('chủ nhóm không mời, gỡ, cấm, xếp đơn vị hay gửi thông báo khi nhóm khoá', async () => {
    const group = await createActiveGroup(app, { master, kind: 'school' });
    const unitId = await createUnit(app, group, 'Lớp 10A2');
    const member = await addMember(app, group.groupId);
    const outsider = await newUser(app);
    expect((await lockGroup(group.groupId)).statusCode).toBe(204);

    const { groupId } = group;
    const token = group.owner.token;
    const results = await Promise.all([
      api(app, 'POST', `/groups/${groupId}/invitations`, token, { email: outsider.email }),
      api(app, 'DELETE', `/groups/${groupId}/members/${member.id}`, token),
      api(app, 'PUT', `/groups/${groupId}/bans/${outsider.id}`, token),
      api(app, 'PATCH', `/groups/${groupId}/members/${member.id}`, token, { unitId }),
      api(app, 'POST', `/groups/${groupId}/announcements`, token, { body: 'Họp phụ huynh' }),
    ]);
    expect(results.map(errorOf)).toEqual(
      results.map(() => ({ status: 409, code: 'GROUP_STATE_CONFLICT' })),
    );
    expect(await repositories.group.findMember(groupId, member.id)).toMatchObject({
      unitId: null,
    });
    expect(await repositories.group.isBanned(groupId, outsider.id)).toBe(false);
  });
});

describe('Bàn vận hành: danh sách nhóm', () => {
  it('GET /ops/groups?state= chỉ trả nhóm đúng trạng thái', async () => {
    const pendingId = await createPendingGroup(app, master);
    const active = await createActiveGroup(app, { master });
    const locked = await createActiveGroup(app, { master });
    expect((await lockGroup(locked.groupId)).statusCode).toBe(204);
    const list = async (state: string) => {
      const res = await api(app, 'GET', `/ops/groups?state=${state}&limit=100`, master.token);
      expect(res.statusCode).toBe(200);
      return res.json().data.items as { id: string; state: string }[];
    };

    const lockedItems = await list('locked');
    expect(lockedItems.every((item) => item.state === 'locked')).toBe(true);
    expect(lockedItems.map((item) => item.id)).toContain(locked.groupId);
    expect(lockedItems.map((item) => item.id)).not.toContain(active.groupId);

    const pendingItems = await list('pending_owner');
    expect(pendingItems.every((item) => item.state === 'pending_owner')).toBe(true);
    expect(pendingItems.map((item) => item.id)).toContain(pendingId);

    expect(errorOf(await api(app, 'GET', '/ops/groups?state=sleeping', master.token))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});

/** Design mục 17 — thêm hay bỏ route nhóm thì sửa danh sách này cùng lượt. */
const GROUP_ROUTES = [
  'GET /groups',
  'GET /groups/{groupId}',
  'POST /groups/lookup-code',
  'POST /groups/{groupId}/join',
  'DELETE /groups/{groupId}/join-request',
  'POST /groups/{groupId}/leave',
  'GET /groups/{groupId}/announcements',
  'POST /groups/{groupId}/announcements',
  'GET /me/groups',
  'GET /me/group-badges',
  'GET /me/group-invitations',
  'GET /me/group-owner-offers',
  'POST /group-invitations/{id}/accept',
  'POST /group-invitations/{id}/decline',
  'POST /group-owner-offers/{id}/accept',
  'POST /group-owner-offers/{id}/decline',
  'GET /groups/{groupId}/members',
  'PATCH /groups/{groupId}/members/{accountId}',
  'DELETE /groups/{groupId}/members/{accountId}',
  'GET /groups/{groupId}/bans',
  'PUT /groups/{groupId}/bans/{accountId}',
  'DELETE /groups/{groupId}/bans/{accountId}',
  'GET /groups/{groupId}/join-requests',
  'POST /group-join-requests/{id}/decision',
  'GET /groups/{groupId}/invitations',
  'POST /groups/{groupId}/invitations',
  'DELETE /groups/{groupId}/invitations/{invitationId}',
  'POST /groups/{groupId}/roster',
  'POST /groups/{groupId}/roster/remove',
  'PATCH /groups/{groupId}/settings',
  'POST /groups/{groupId}/code',
  'POST /groups/{groupId}/units',
  'PATCH /groups/{groupId}/units/{unitId}',
  'DELETE /groups/{groupId}/units/{unitId}',
  'PUT /groups/{groupId}/moderators/{accountId}',
  'DELETE /groups/{groupId}/moderators/{accountId}',
  'POST /groups/{groupId}/owner-transfer',
  'DELETE /groups/{groupId}/owner-transfer',
  'POST /groups/{groupId}/close',
  'POST /ops/groups',
  'GET /ops/groups',
  'GET /ops/groups/{groupId}',
  'POST /ops/groups/{groupId}/owner-offers',
  'POST /ops/groups/{groupId}/lock',
  'POST /ops/groups/{groupId}/unlock',
  'POST /ops/groups/{groupId}/close',
];
/** Đếm theo lượt: vượt trần đơn hay trần thông báo trong ngày. */
const RATE_LIMITED = new Set([
  'POST /groups/{groupId}/join',
  'POST /groups/{groupId}/announcements',
]);

const groupOperations = async () => {
  const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as {
    paths: Record<
      string,
      Record<string, { tags?: string[]; security?: unknown[]; responses: Record<string, unknown> }>
    >;
  };
  return Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods)
      .map(([method, op]) => ({
        key: `${method.toUpperCase()} ${path.replace('/api/v1', '')}`,
        ...op,
      }))
      .filter((op) => op.tags?.some((tag) => tag.includes('Groups'))),
  );
};

describe('Swagger', () => {
  it('liệt kê đủ route nhóm, không thừa, mỗi route một tag nhóm', async () => {
    const ops = await groupOperations();
    expect(ops.map((op) => op.key).toSorted()).toEqual(GROUP_ROUTES.toSorted());
  });

  it('mỗi route khai mã lỗi nó có thể trả', async () => {
    for (const op of await groupOperations()) {
      const codes = Object.keys(op.responses);
      const [method = '', path = ''] = op.key.split(' ');
      if (op.key === 'GET /groups') {
        expect(op.security, op.key).toBeUndefined();
        expect(codes, op.key).toContain('400');
        continue;
      }
      expect(op.security, op.key).toContainEqual({ bearerAuth: [] });
      expect(codes, op.key).toEqual(expect.arrayContaining(['401', '403']));
      if (path.includes('{')) expect(codes, op.key).toContain('404');
      if (method !== 'GET') expect(codes, op.key).toEqual(expect.arrayContaining(['400', '409']));
      if (RATE_LIMITED.has(op.key)) expect(codes, op.key).toContain('429');
    }
  });

  it('hồ sơ nhóm nhận token tuỳ chọn: khai cả lượt không token', async () => {
    const view = (await groupOperations()).find((op) => op.key === 'GET /groups/{groupId}');
    expect(view?.security).toEqual([{}, { bearerAuth: [] }]);
  });
});
