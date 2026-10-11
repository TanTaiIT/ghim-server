import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { formatDateVN, formatTimeVN } from '../src/common/time/time.js';
import { lastOutboxEvent, prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  type TestUser,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createPendingGroup,
  createUnit,
  newMaster,
  newUser,
} from './group-helpers.js';
import { tokenFor } from './ops-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/* Mọi scenario của spec `group/membership` qua HTTP; đồng hồ đổi được để dựng các mốc hạn 7, 14, 21 ngày. */
const DAY_MS = 86_400_000;
const day = (n: number) => new Date(TEST_NOW.getTime() + n * DAY_MS);

const groups = repositories.group;
let app: FastifyInstance;
let now = TEST_NOW;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
});

afterAll(() => app.close());

beforeEach(() => {
  now = TEST_NOW;
});

const codeOf = (res: LightMyRequestResponse) => res.json().error.code as string;

const join = (user: TestUser, groupId: string, code?: string) =>
  api(app, 'POST', `/groups/${groupId}/join`, user.token, code === undefined ? {} : { code });

const decide = (user: TestUser, requestId: string, approve: boolean) =>
  api(app, 'POST', `/group-join-requests/${requestId}/decision`, user.token, { approve });

const invite = (user: TestUser, groupId: string, email: string, unitId?: string) =>
  api(app, 'POST', `/groups/${groupId}/invitations`, user.token, {
    email,
    ...(unitId ? { unitId } : {}),
  });

const acceptInvitation = (user: TestUser, invitationId: string) =>
  api(app, 'POST', `/group-invitations/${invitationId}/accept`, user.token);

const removeMember = (actor: TestUser, groupId: string, target: TestUser) =>
  api(app, 'DELETE', `/groups/${groupId}/members/${target.id}`, actor.token);

const ban = (actor: TestUser, groupId: string, target: TestUser) =>
  api(app, 'PUT', `/groups/${groupId}/bans/${target.id}`, actor.token);

const setUnit = (actor: TestUser, groupId: string, target: TestUser, unitId: string | null) =>
  api(app, 'PATCH', `/groups/${groupId}/members/${target.id}`, actor.token, { unitId });

const roster = (actor: TestUser, groupId: string, entries: { email: string; unitId?: string }[]) =>
  api(app, 'POST', `/groups/${groupId}/roster`, actor.token, { entries });

const memberOf = (groupId: string, user: TestUser) => groups.findMember(groupId, user.id);

async function requestJoin(user: TestUser, groupId: string): Promise<string> {
  const res = await join(user, groupId);
  expect(res.statusCode).toBe(201);
  expect(res.json().data).toMatchObject({ result: 'request', request: { status: 'pending' } });
  return res.json().data.request.id as string;
}

/** Lời mời đang chờ của người đó ở nhóm, đọc qua đúng route app dùng để hiện "nhóm mời bạn". */
async function invitationIdOf(user: TestUser, groupId: string): Promise<string> {
  const res = await api(app, 'GET', '/me/group-invitations', user.token);
  expect(res.statusCode).toBe(200);
  const found = (res.json().data.invitations as { id: string; groupId: string }[]).find(
    (row) => row.groupId === groupId,
  );
  if (!found) throw new Error(`Không thấy lời mời của nhóm ${groupId}`);
  return found.id;
}

async function moderatorOf(group: ActiveGroup, unitId: string | null = null): Promise<TestUser> {
  const user = await addMember(app, group.groupId);
  await appointModerator(app, group, user, unitId);
  return user;
}

let hashedSeq = 0;
/**
 * `seedAccount` ghi `email_hash` giả, nên danh sách lớp (khớp theo HMAC thật) không bao giờ thấy người đó — người
 * dùng của các ca danh sách lớp phải mang dấu băm thật.
 */
async function newHashedUser(): Promise<TestUser> {
  hashedSeq += 1;
  const email = `hoc-sinh-${hashedSeq}@ghim.test`;
  const account = await prisma.account.create({
    data: {
      email,
      emailNormalized: email,
      emailHash: app.modules.identity.emailHashOf(email),
      passwordHash: 'argon2id-gia',
      status: 'active',
      displayName: `Học sinh ${hashedSeq}`,
    },
  });
  return { id: account.id, email, token: await tokenFor(app, account.id) };
}

describe('nhóm chờ giao chủ, tạm khoá hay đã đóng không nhận thành viên', () => {
  it('Tham gia nhóm chờ giao chủ', async () => {
    const master = await newMaster(app);
    const groupId = await createPendingGroup(app, master, { mode: 'public_open' });
    const user = await newUser(app);

    const res = await join(user, groupId);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('GROUP_STATE_CONFLICT');
    expect(await memberOf(groupId, user)).toBeNull();
  });

  it('Tham gia nhóm tạm khoá', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const invited = await newUser(app);
    expect((await invite(group.owner, group.groupId, invited.email)).statusCode).toBe(204);
    const invitationId = await invitationIdOf(invited, group.groupId);
    const locked = await api(app, 'POST', `/ops/groups/${group.groupId}/lock`, group.master.token, {
      reason: 'Đang xác minh',
    });
    expect(locked.statusCode).toBe(204);

    const user = await newUser(app);
    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('GROUP_STATE_CONFLICT');
    expect(await memberOf(group.groupId, user)).toBeNull();
    // "Qua bất kỳ đường nào": lời mời gửi trước lúc khoá cũng không mở cửa.
    const accepted = await acceptInvitation(invited, invitationId);
    expect(accepted.statusCode).toBe(409);
    expect(codeOf(accepted)).toBe('GROUP_STATE_CONFLICT');
    expect(await memberOf(group.groupId, invited)).toBeNull();
  });
});

describe('tài khoản master không vào nhóm', () => {
  it('Master bấm tham gia', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });

    const res = await join(group.master, group.groupId);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await memberOf(group.groupId, group.master)).toBeNull();
  });

  it('Giao chủ nhóm cho tài khoản master', async () => {
    const master = await newMaster(app);
    const groupId = await createPendingGroup(app, master);
    const otherMaster = await newMaster(app);

    const res = await api(app, 'POST', `/ops/groups/${groupId}/owner-offers`, master.token, {
      accountId: otherMaster.id,
    });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('GROUP_ROLE_INELIGIBLE');
    expect(await groups.findPendingOffer(groupId)).toBeNull();
  });
});

describe('người bị cấm không vào lại', () => {
  it('Bị cấm rồi bấm tham gia', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const user = await newUser(app);
    expect((await join(user, group.groupId)).statusCode).toBe(201);
    expect((await ban(group.owner, group.groupId, user)).statusCode).toBe(204);

    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('GROUP_BANNED');
    expect(await memberOf(group.groupId, user)).toBeNull();
  });

  it('Bị cấm rồi nhận lời mời', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const user = await newUser(app);
    // Cấm trước rồi mới mời: cấm huỷ mọi lời mời đang chờ, nên đây là cách duy nhất có lời mời còn hạn.
    expect((await ban(group.owner, group.groupId, user)).statusCode).toBe(204);
    expect((await invite(group.owner, group.groupId, user.email)).statusCode).toBe(204);
    const invitationId = await invitationIdOf(user, group.groupId);

    const res = await acceptInvitation(user, invitationId);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('GROUP_BANNED');
    expect(await memberOf(group.groupId, user)).toBeNull();
  });

  it('Bị cấm rồi gửi đơn', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const user = await newUser(app);
    expect((await ban(group.owner, group.groupId, user)).statusCode).toBe(204);

    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('GROUP_BANNED');
    expect(await prisma.groupJoinRequest.count({ where: { accountId: user.id } })).toBe(0);
  });
});

describe('nhóm mở cửa thì bấm tham gia là vào', () => {
  it('Tham gia nhóm mở cửa', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const user = await newUser(app);

    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      result: 'member',
      membership: { role: 'member', joinedVia: 'joined', unitId: null },
    });
    const mine = await api(app, 'GET', '/me/groups', user.token);
    expect(mine.json().data).toMatchObject([
      { id: group.groupId, membership: { joinedVia: 'joined' } },
    ]);
  });

  it('Đã là thành viên', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const user = await newUser(app);
    expect((await join(user, group.groupId)).statusCode).toBe(201);

    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('ALREADY_MEMBER');
  });
});

describe('nhóm xét duyệt và nhóm có mã thì gửi đơn', () => {
  it('Gửi đơn', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const user = await newUser(app);

    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      result: 'request',
      request: { groupId: group.groupId, accountId: user.id, status: 'pending' },
    });
    expect(await memberOf(group.groupId, user)).toBeNull();
  });

  it('Đơn được duyệt', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const moderator = await moderatorOf(group);
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);

    const res = await decide(moderator, requestId, true);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('approved');
    expect(await memberOf(group.groupId, user)).toMatchObject({
      role: 'member',
      joinedVia: 'approved',
    });
  });

  it('Đơn bị từ chối', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const moderator = await moderatorOf(group);
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);

    const res = await decide(moderator, requestId, false);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('rejected');
    expect(await memberOf(group.groupId, user)).toBeNull();
    expect((await groups.findJoinRequest(requestId))?.status).toBe('rejected');
  });

  it('Nhập sai mã nhóm', async () => {
    const group = await createActiveGroup(app, { mode: 'private_code' });
    const user = await newUser(app);

    const lookup = await api(app, 'POST', '/groups/lookup-code', user.token, { code: 'ZZZZZZ' });
    expect(lookup.statusCode).toBe(404);
    expect(codeOf(lookup)).toBe('NOT_FOUND');
    const res = await join(user, group.groupId, 'ZZZZZZ');
    expect(res.statusCode).toBe(404);
    expect(codeOf(res)).toBe('NOT_FOUND');
    expect(await prisma.groupJoinRequest.count({ where: { accountId: user.id } })).toBe(0);
  });

  it('Gửi đơn trùng', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const user = await newUser(app);
    await requestJoin(user, group.groupId);

    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('CONFLICT');
    expect(
      await prisma.groupJoinRequest.count({ where: { accountId: user.id, status: 'pending' } }),
    ).toBe(1);
  });

  it('Thành viên thường thử duyệt đơn', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const member = await addMember(app, group.groupId);
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);

    const res = await decide(member, requestId, true);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect((await groups.findJoinRequest(requestId))?.status).toBe('pending');
  });

  it('Điều hành viên đơn vị con thử duyệt đơn', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review', kind: 'school' });
    const unitId = await createUnit(app, group, '12A1');
    const unitModerator = await moderatorOf(group, unitId);
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);

    const res = await decide(unitModerator, requestId, true);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await memberOf(group.groupId, user)).toBeNull();
  });

  it('Người xin rút đơn', async () => {
    const reviewGroups = await Promise.all(
      [1, 2, 3, 4].map(() => createActiveGroup(app, { mode: 'public_review' })),
    );
    const [first, second, third, fourth] = reviewGroups as [
      ActiveGroup,
      ActiveGroup,
      ActiveGroup,
      ActiveGroup,
    ];
    const user = await newUser(app);
    const requestId = await requestJoin(user, first.groupId);
    await requestJoin(user, second.groupId);
    await requestJoin(user, third.groupId);

    const withdrawn = await api(app, 'DELETE', `/groups/${first.groupId}/join-request`, user.token);
    expect(withdrawn.statusCode).toBe(204);
    expect((await groups.findJoinRequest(requestId))?.status).toBe('withdrawn');
    const listed = await api(
      app,
      'GET',
      `/groups/${first.groupId}/join-requests`,
      first.owner.token,
    );
    expect(listed.json().data.items).toEqual([]);
    const decided = await decide(first.owner, requestId, true);
    expect(decided.statusCode).toBe(409);
    expect(await memberOf(first.groupId, user)).toBeNull();
    // Đơn đã rút nhả chỗ trong trần 3 đơn chờ.
    await requestJoin(user, fourth.groupId);
  });

  it('Hai người cùng xử một đơn', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const approver = await moderatorOf(group);
    const rejecter = await moderatorOf(group);
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);

    const [approved, rejected] = await Promise.all([
      decide(approver, requestId, true),
      decide(rejecter, requestId, false),
    ]);
    expect([approved.statusCode, rejected.statusCode].toSorted()).toEqual([200, 409]);
    const loser = approved.statusCode === 409 ? approved : rejected;
    expect(codeOf(loser)).toBe('CONFLICT');
    const status = (await groups.findJoinRequest(requestId))?.status;
    expect(status).toBe(approved.statusCode === 200 ? 'approved' : 'rejected');
    expect((await memberOf(group.groupId, user)) !== null).toBe(status === 'approved');
  });
});

describe('đơn tự huỷ khi quá hạn', () => {
  it('Duyệt đơn ngày thứ 20', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const moderator = await moderatorOf(group);
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);

    now = day(20);
    const res = await decide(moderator, requestId, true);
    expect(res.statusCode).toBe(200);
    expect(await memberOf(group.groupId, user)).toMatchObject({ joinedVia: 'approved' });
  });

  it('Duyệt đơn đã quá hạn', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const moderator = await moderatorOf(group);
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);

    now = day(22);
    const res = await decide(moderator, requestId, true);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('JOIN_REQUEST_EXPIRED');
    expect(await memberOf(group.groupId, user)).toBeNull();
  });
});

describe('chờ trước khi gửi lại đơn bị từ chối', () => {
  it('Gửi lại quá sớm', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);
    expect((await decide(group.owner, requestId, false)).statusCode).toBe(200);

    now = day(3);
    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(429);
    expect(codeOf(res)).toBe('JOIN_REQUEST_TOO_SOON');
    const retryAt = day(7);
    expect(res.json().error.message).toContain(formatDateVN(retryAt));
    expect(res.json().error.message).toContain(formatTimeVN(retryAt));
  });

  it('Gửi lại sau 7 ngày', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);
    expect((await decide(group.owner, requestId, false)).statusCode).toBe(200);

    now = day(8);
    const newRequestId = await requestJoin(user, group.groupId);
    expect(newRequestId).not.toBe(requestId);
  });

  it('Đơn cũ tự huỷ', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const user = await newUser(app);
    const requestId = await requestJoin(user, group.groupId);

    now = day(22);
    await app.modules.group.expireDue();
    expect((await groups.findJoinRequest(requestId))?.status).toBe('expired');
    const newRequestId = await requestJoin(user, group.groupId);
    expect(newRequestId).not.toBe(requestId);
  });
});

describe('tối đa ba đơn đang chờ', () => {
  it('Đơn thứ tư', async () => {
    const reviewGroups = await Promise.all(
      [1, 2, 3, 4].map(() => createActiveGroup(app, { mode: 'public_review' })),
    );
    const user = await newUser(app);
    await Promise.all(reviewGroups.slice(0, 3).map((group) => requestJoin(user, group.groupId)));

    const res = await join(user, reviewGroups[3]?.groupId ?? '');
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('JOIN_REQUEST_LIMIT');
    expect(
      await prisma.groupJoinRequest.count({ where: { accountId: user.id, status: 'pending' } }),
    ).toBe(3);
  });

  it('Một đơn đã được xử', async () => {
    const reviewGroups = await Promise.all(
      [1, 2, 3, 4].map(() => createActiveGroup(app, { mode: 'public_review' })),
    );
    const [first, , , fourth] = reviewGroups as [
      ActiveGroup,
      ActiveGroup,
      ActiveGroup,
      ActiveGroup,
    ];
    const user = await newUser(app);
    const [firstRequestId] = await Promise.all(
      reviewGroups.slice(0, 3).map((group) => requestJoin(user, group.groupId)),
    );
    expect((await decide(first.owner, firstRequestId ?? '', true)).statusCode).toBe(200);

    const res = await join(user, fourth.groupId);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ result: 'request', request: { status: 'pending' } });
  });
});

describe('lời mời', () => {
  it('Nhận lời còn hạn', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const user = await newUser(app);
    expect((await invite(group.owner, group.groupId, user.email)).statusCode).toBe(204);
    const invitationId = await invitationIdOf(user, group.groupId);

    now = day(10);
    const res = await acceptInvitation(user, invitationId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      id: group.groupId,
      membership: { role: 'member', joinedVia: 'invited' },
    });
    expect(await memberOf(group.groupId, user)).toMatchObject({ joinedVia: 'invited' });
  });

  it('Nhận lời quá hạn', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const user = await newUser(app);
    expect((await invite(group.owner, group.groupId, user.email)).statusCode).toBe(204);
    const invitationId = await invitationIdOf(user, group.groupId);

    now = day(15);
    const res = await acceptInvitation(user, invitationId);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('INVITATION_EXPIRED');
    expect(await memberOf(group.groupId, user)).toBeNull();
  });

  it('Thành viên thường thử mời', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const member = await addMember(app, group.groupId);
    const user = await newUser(app);

    const res = await invite(member, group.groupId, user.email);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await prisma.groupInvitation.count({ where: { accountId: user.id } })).toBe(0);
  });

  it('Mời email không có tài khoản', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const moderator = await moderatorOf(group);
    const user = await newUser(app);

    const known = await invite(moderator, group.groupId, user.email);
    const event = await lastOutboxEvent();
    const unknown = await invite(moderator, group.groupId, 'chua-co-tai-khoan@ghim.test');
    expect({ status: unknown.statusCode, body: unknown.body }).toEqual({
      status: known.statusCode,
      body: known.body,
    });
    expect(unknown.statusCode).toBe(204);
    expect(
      (await prisma.groupInvitation.findMany({ where: { groupId: group.groupId } })).map(
        (row) => row.accountId,
      ),
    ).toEqual([user.id]);
    expect((await lastOutboxEvent())?.id).toBe(event?.id);
  });

  it('Điều hành viên đơn vị mời vào lớp mình', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review', kind: 'school' });
    const a1 = await createUnit(app, group, '12A1');
    const a2 = await createUnit(app, group, '12A2');
    const unitModerator = await moderatorOf(group, a1);
    const an = await newUser(app);

    const outside = await invite(unitModerator, group.groupId, an.email, a2);
    expect(outside.statusCode).toBe(403);
    expect(codeOf(outside)).toBe('FORBIDDEN');
    expect((await invite(unitModerator, group.groupId, an.email)).statusCode).toBe(204);
    const res = await acceptInvitation(an, await invitationIdOf(an, group.groupId));
    expect(res.statusCode).toBe(200);
    expect(res.json().data.membership).toMatchObject({ joinedVia: 'invited', unitId: a1 });
  });
});

describe('nhóm chỉ lời mời', () => {
  it('Không có lời mời, không có tên', async () => {
    const group = await createActiveGroup(app, { mode: 'private_invite' });
    const user = await newHashedUser();

    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('INVITATION_REQUIRED');
    expect(await memberOf(group.groupId, user)).toBeNull();
  });

  it('Có tên trong danh sách lớp', async () => {
    const group = await createActiveGroup(app, { mode: 'private_invite' });
    const user = await newHashedUser();
    expect((await roster(group.owner, group.groupId, [{ email: user.email }])).statusCode).toBe(
      200,
    );

    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      result: 'member',
      membership: { joinedVia: 'roster', unitId: null },
    });
  });
});

describe('mã nhóm', () => {
  it('Đổi mã bị lộ', async () => {
    const group = await createActiveGroup(app, { mode: 'private_code' });
    const user = await newUser(app);
    const profile = await api(app, 'GET', `/groups/${group.groupId}`, group.owner.token);
    const oldCode = profile.json().data.code as string;
    expect(oldCode).toHaveLength(6);

    const rotated = await api(app, 'POST', `/groups/${group.groupId}/code`, group.owner.token);
    expect(rotated.statusCode).toBe(200);
    const newCode = rotated.json().data.code as string;
    expect(newCode).not.toBe(oldCode);

    const oldLookup = await api(app, 'POST', '/groups/lookup-code', user.token, { code: oldCode });
    expect(oldLookup.statusCode).toBe(404);
    expect(codeOf(oldLookup)).toBe('NOT_FOUND');
    const oldJoin = await join(user, group.groupId, oldCode);
    expect(oldJoin.statusCode).toBe(404);
    expect(codeOf(oldJoin)).toBe('NOT_FOUND');
    const newLookup = await api(app, 'POST', '/groups/lookup-code', user.token, { code: newCode });
    expect(newLookup.statusCode).toBe(200);
    expect(newLookup.json().data.id).toBe(group.groupId);
    const newJoin = await join(user, group.groupId, newCode);
    expect(newJoin.statusCode).toBe(201);
    expect(newJoin.json().data).toMatchObject({
      result: 'request',
      request: { status: 'pending' },
    });
  });
});

describe('đường vào được ghi lại và không đổi', () => {
  it('Nhóm đổi chế độ sau khi đã vào', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const user = await newUser(app);
    expect((await join(user, group.groupId)).statusCode).toBe(201);

    const changed = await api(
      app,
      'PATCH',
      `/groups/${group.groupId}/settings`,
      group.owner.token,
      {
        mode: 'public_review',
      },
    );
    expect(changed.statusCode).toBe(200);
    expect(changed.json().data.mode).toBe('public_review');
    const mine = await api(app, 'GET', '/me/groups', user.token);
    expect(mine.json().data).toMatchObject([
      { id: group.groupId, mode: 'public_review', membership: { joinedVia: 'joined' } },
    ]);
  });

  it('Vào lại bằng đường khác', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const user = await newUser(app);
    expect((await join(user, group.groupId)).statusCode).toBe(201);
    expect((await removeMember(group.owner, group.groupId, user)).statusCode).toBe(204);
    expect((await invite(group.owner, group.groupId, user.email)).statusCode).toBe(204);

    const res = await acceptInvitation(user, await invitationIdOf(user, group.groupId));
    expect(res.statusCode).toBe(200);
    expect(res.json().data.membership.joinedVia).toBe('invited');
    expect(await memberOf(group.groupId, user)).toMatchObject({ joinedVia: 'invited' });
  });
});

describe('đơn vị con', () => {
  it('Xếp thành viên vào lớp', async () => {
    const group = await createActiveGroup(app, { kind: 'school' });
    const a1 = await createUnit(app, group, '12A1');
    await createUnit(app, group, '12A2');
    const an = await addMember(app, group.groupId);

    const res = await setUnit(group.owner, group.groupId, an, a1);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ accountId: an.id, unitId: a1 });
    expect(await memberOf(group.groupId, an)).toMatchObject({ unitId: a1 });
  });

  it('Chuyển sang lớp khác', async () => {
    const group = await createActiveGroup(app, { kind: 'school' });
    const a1 = await createUnit(app, group, '12A1');
    const a2 = await createUnit(app, group, '12A2');
    const an = await addMember(app, group.groupId, { unitId: a1 });

    const res = await setUnit(group.owner, group.groupId, an, a2);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.unitId).toBe(a2);
    const inUnit = async (unitId: string) =>
      (
        await api(
          app,
          'GET',
          `/groups/${group.groupId}/members?unitId=${unitId}`,
          group.owner.token,
        )
      )
        .json()
        .data.items.map((row: { accountId: string }) => row.accountId);
    expect(await inUnit(a1)).toEqual([]);
    expect(await inUnit(a2)).toEqual([an.id]);
  });

  it('Đơn vị không thuộc nhóm', async () => {
    const group = await createActiveGroup(app, { kind: 'school' });
    const other = await createActiveGroup(app, { kind: 'school' });
    const foreignUnit = await createUnit(app, other, '12A1');
    const an = await addMember(app, group.groupId);

    const res = await setUnit(group.owner, group.groupId, an, foreignUnit);
    expect(res.statusCode).toBe(404);
    expect(codeOf(res)).toBe('NOT_FOUND');
    expect(await memberOf(group.groupId, an)).toMatchObject({ unitId: null });
  });

  it('Xoá đơn vị còn thành viên', async () => {
    const group = await createActiveGroup(app, { kind: 'school' });
    const a1 = await createUnit(app, group, '12A1');
    await addMember(app, group.groupId, { unitId: a1 });

    const res = await api(app, 'DELETE', `/groups/${group.groupId}/units/${a1}`, group.owner.token);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('GROUP_UNIT_NOT_EMPTY');
    const profile = await api(app, 'GET', `/groups/${group.groupId}`, group.owner.token);
    expect(profile.json().data.units).toEqual([{ id: a1, name: '12A1' }]);
  });

  it('Đơn vị con ở nhóm cộng đồng', async () => {
    const group = await createActiveGroup(app, { kind: 'community' });

    const res = await api(app, 'POST', `/groups/${group.groupId}/units`, group.owner.token, {
      name: 'Tổ 1',
    });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('GROUP_KIND_CONFLICT');
    expect(await groups.listUnits(group.groupId)).toEqual([]);
  });

  it('Thành viên thường thử xếp lớp', async () => {
    const group = await createActiveGroup(app, { kind: 'school' });
    const a1 = await createUnit(app, group, '12A1');
    const member = await addMember(app, group.groupId);
    const an = await addMember(app, group.groupId);

    const res = await setUnit(member, group.groupId, an, a1);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await memberOf(group.groupId, an)).toMatchObject({ unitId: null });
  });
});

describe('danh sách thành viên', () => {
  it('Điều hành viên xem danh sách', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const moderator = await moderatorOf(group);
    const member = await addMember(app, group.groupId);

    const res = await api(app, 'GET', `/groups/${group.groupId}/members`, moderator.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBe(3);
    expect(
      (res.json().data.items as { accountId: string; role: string }[])
        .map(({ accountId, role }) => ({ accountId, role }))
        .toSorted((a, b) => a.accountId.localeCompare(b.accountId)),
    ).toEqual(
      [
        { accountId: group.owner.id, role: 'owner' },
        { accountId: moderator.id, role: 'moderator' },
        { accountId: member.id, role: 'member' },
      ].toSorted((a, b) => a.accountId.localeCompare(b.accountId)),
    );
  });

  it('Thành viên thường ở nhóm công khai', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const member = await addMember(app, group.groupId, { via: 'joined' });

    const res = await api(app, 'GET', `/groups/${group.groupId}/members`, member.token);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
  });

  it('Khách xem danh sách', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });

    const res = await api(app, 'GET', `/groups/${group.groupId}/members`);
    expect(res.statusCode).toBe(401);
    expect(codeOf(res)).toBe('UNAUTHORIZED');
  });
});

describe('tự rời nhóm', () => {
  it('Rời rồi vào lại nhóm mở cửa', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    // Vào lần đầu bằng lời mời: lần vào lại phải mang đường vào mới, không giữ đường cũ.
    const user = await addMember(app, group.groupId, { via: 'invited' });

    expect((await api(app, 'POST', `/groups/${group.groupId}/leave`, user.token)).statusCode).toBe(
      204,
    );
    expect(await memberOf(group.groupId, user)).toBeNull();
    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      result: 'member',
      membership: { role: 'member', joinedVia: 'joined' },
    });
  });

  it('Điều hành viên rời nhóm', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const moderator = await moderatorOf(group);

    const res = await api(app, 'POST', `/groups/${group.groupId}/leave`, moderator.token);
    expect(res.statusCode).toBe(204);
    expect(await memberOf(group.groupId, moderator)).toBeNull();
    expect((await groups.listModerators(group.groupId)).map((row) => row.accountId)).toEqual([]);
    const members = await api(app, 'GET', `/groups/${group.groupId}/members`, moderator.token);
    expect(members.statusCode).toBe(403);
  });

  it('Chủ nhóm thử rời', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });

    const res = await api(app, 'POST', `/groups/${group.groupId}/leave`, group.owner.token);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('GROUP_OWNER_MUST_TRANSFER');
    expect(await memberOf(group.groupId, group.owner)).toMatchObject({ role: 'owner' });
  });
});

describe('gỡ thành viên', () => {
  it('Gỡ ở nhóm xét duyệt', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const moderator = await moderatorOf(group);
    const member = await addMember(app, group.groupId);

    expect((await removeMember(moderator, group.groupId, member)).statusCode).toBe(204);
    expect(await memberOf(group.groupId, member)).toBeNull();
    await requestJoin(member, group.groupId);
    expect(await memberOf(group.groupId, member)).toBeNull();
  });

  it('Điều hành viên thử gỡ chủ nhóm', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const moderator = await moderatorOf(group);

    const removed = await removeMember(moderator, group.groupId, group.owner);
    expect(removed.statusCode).toBe(403);
    expect(codeOf(removed)).toBe('FORBIDDEN');
    const banned = await ban(moderator, group.groupId, group.owner);
    expect(banned.statusCode).toBe(403);
    expect(codeOf(banned)).toBe('FORBIDDEN');
    expect(await memberOf(group.groupId, group.owner)).toMatchObject({ role: 'owner' });
    expect(await groups.isBanned(group.groupId, group.owner.id)).toBe(false);
  });

  it('Điều hành viên gỡ điều hành viên khác', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const moderator = await moderatorOf(group);
    const other = await moderatorOf(group);

    const removed = await removeMember(moderator, group.groupId, other);
    expect(removed.statusCode).toBe(403);
    expect(codeOf(removed)).toBe('FORBIDDEN');
    const banned = await ban(moderator, group.groupId, other);
    expect(banned.statusCode).toBe(403);
    expect(await memberOf(group.groupId, other)).toMatchObject({ role: 'moderator' });
  });

  it('Điều hành viên đơn vị gỡ người ngoài đơn vị', async () => {
    const group = await createActiveGroup(app, { kind: 'school' });
    const a1 = await createUnit(app, group, '12A1');
    const a2 = await createUnit(app, group, '12A2');
    const unitModerator = await moderatorOf(group, a1);
    const outsider = await addMember(app, group.groupId, { unitId: a2 });
    const insider = await addMember(app, group.groupId, { unitId: a1 });

    const res = await removeMember(unitModerator, group.groupId, outsider);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await memberOf(group.groupId, outsider)).not.toBeNull();
    expect((await removeMember(unitModerator, group.groupId, insider)).statusCode).toBe(204);
  });

  it('Thành viên thường thử gỡ người khác', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const member = await addMember(app, group.groupId);
    const other = await addMember(app, group.groupId);

    const res = await removeMember(member, group.groupId, other);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await memberOf(group.groupId, other)).not.toBeNull();
  });
});

describe('cấm khỏi nhóm chỉ có tác dụng trong nhóm đó', () => {
  it('Cấm một thành viên', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const moderator = await moderatorOf(group);
    const member = await addMember(app, group.groupId);

    expect((await ban(moderator, group.groupId, member)).statusCode).toBe(204);
    expect(await memberOf(group.groupId, member)).toBeNull();
    expect(await groups.isBanned(group.groupId, member.id)).toBe(true);
  });

  it('Cấm người chưa từng vào nhóm', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const moderator = await moderatorOf(group);
    const stranger = await newUser(app);

    expect((await ban(moderator, group.groupId, stranger)).statusCode).toBe(204);
    const res = await join(stranger, group.groupId);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('GROUP_BANNED');
    expect(await memberOf(group.groupId, stranger)).toBeNull();
  });

  it('Bị cấm ở nhóm này, vào nhóm khác', async () => {
    const a = await createActiveGroup(app, { mode: 'public_open' });
    const b = await createActiveGroup(app, { mode: 'public_open' });
    const user = await addMember(app, a.groupId, { via: 'joined' });
    expect((await ban(a.owner, a.groupId, user)).statusCode).toBe(204);

    const res = await join(user, b.groupId);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      result: 'member',
      membership: { joinedVia: 'joined' },
    });
    expect(await repositories.identity.findAccountById(user.id)).toMatchObject({
      status: 'active',
      lockedAt: null,
      lockedReason: null,
    });
    expect(await prisma.accountFlag.count({ where: { accountId: user.id } })).toBe(0);
  });
});

describe('danh sách lớp', () => {
  it('Có tên kèm lớp', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review', kind: 'school' });
    const a1 = await createUnit(app, group, '12A1');
    const an = await newHashedUser();
    const loaded = await roster(group.owner, group.groupId, [
      { email: an.email.toUpperCase(), unitId: a1 },
    ]);
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().data).toEqual({ added: 1 });
    const rows = await prisma.groupRosterEntry.findMany({ where: { groupId: group.groupId } });
    expect(rows).toMatchObject([{ emailHash: app.modules.identity.emailHashOf(an.email) }]);
    expect(JSON.stringify(rows)).not.toContain(an.email);

    const res = await join(an, group.groupId);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      result: 'member',
      membership: { joinedVia: 'roster', unitId: a1 },
    });
    expect(await prisma.groupJoinRequest.count({ where: { accountId: an.id } })).toBe(0);
  });

  it('Điều hành viên đơn vị thử nạp danh sách', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review', kind: 'school' });
    const a1 = await createUnit(app, group, '12A1');
    const unitModerator = await moderatorOf(group, a1);
    const an = await newHashedUser();

    const res = await roster(unitModerator, group.groupId, [{ email: an.email, unitId: a1 }]);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await prisma.groupRosterEntry.count({ where: { groupId: group.groupId } })).toBe(0);
  });
});

describe('gỡ cấm', () => {
  it('Gỡ cấm rồi vào lại', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    // Vào lần đầu bằng lời mời: được gỡ cấm thì vào lại như người mới, không lấy lại đường cũ.
    const user = await addMember(app, group.groupId, { via: 'invited' });
    expect((await ban(group.owner, group.groupId, user)).statusCode).toBe(204);

    const unbanned = await api(
      app,
      'DELETE',
      `/groups/${group.groupId}/bans/${user.id}`,
      group.owner.token,
    );
    expect(unbanned.statusCode).toBe(204);
    const res = await join(user, group.groupId);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      result: 'member',
      membership: { joinedVia: 'joined' },
    });
  });

  it('Thành viên thường thử gỡ cấm', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const member = await addMember(app, group.groupId);
    const user = await newUser(app);
    expect((await ban(group.owner, group.groupId, user)).statusCode).toBe(204);

    const res = await api(app, 'DELETE', `/groups/${group.groupId}/bans/${user.id}`, member.token);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await groups.isBanned(group.groupId, user.id)).toBe(true);
  });
});
