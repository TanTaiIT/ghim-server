import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type TestUser,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  newUser,
} from './group-helpers.js';
import { buildTestApp } from './test-app.js';

/*
 * Spec `badges` qua hai cửa người dùng thấy: danh sách `GET /me/group-badges` và `membership.badgeEligible` trên hồ
 * sơ nhóm. Đường vào bằng lời mời, đơn, bấm tham gia đi luồng thật; danh sách lớp dựng bằng `addMember` vì
 * `seedAccount` không mang dấu băm email thật để khớp.
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const badgesOf = async (user: TestUser): Promise<{ groupId: string; groupName: string }[]> => {
  const res = await api(app, 'GET', '/me/group-badges', user.token);
  expect(res.statusCode).toBe(200);
  return res.json().data;
};

/** `null` khi người đó không còn là thành viên — hồ sơ không có `membership`. */
const eligibleIn = async (user: TestUser, groupId: string): Promise<boolean | null> => {
  const res = await api(app, 'GET', `/groups/${groupId}`, user.token);
  expect(res.statusCode).toBe(200);
  return res.json().data.membership?.badgeEligible ?? null;
};

const badgesOfAll = (users: TestUser[]) => Promise.all(users.map(badgesOf));

const eligibleOf = (users: TestUser[], groupId: string) =>
  Promise.all(users.map((user) => eligibleIn(user, groupId)));

const settings = (actor: TestUser, groupId: string, payload: object) =>
  api(app, 'PATCH', `/groups/${groupId}/settings`, actor.token, payload);

const applyAndApprove = async (
  user: TestUser,
  groupId: string,
  approver: TestUser,
): Promise<void> => {
  const applied = await api(app, 'POST', `/groups/${groupId}/join`, user.token, {});
  expect(applied.statusCode).toBe(201);
  const decided = await api(
    app,
    'POST',
    `/group-join-requests/${applied.json().data.request.id as string}/decision`,
    approver.token,
    { approve: true },
  );
  expect(decided.statusCode).toBe(200);
};

const inviteAndAccept = async (user: TestUser, groupId: string, owner: TestUser): Promise<void> => {
  const invited = await api(app, 'POST', `/groups/${groupId}/invitations`, owner.token, {
    email: user.email,
  });
  expect(invited.statusCode).toBe(204);
  const mine = await api(app, 'GET', '/me/group-invitations', user.token);
  const invitation = (mine.json().data.invitations as { id: string; groupId: string }[]).find(
    (row) => row.groupId === groupId,
  );
  if (!invitation) throw new Error('Không thấy lời mời vừa gửi');
  const accepted = await api(app, 'POST', `/group-invitations/${invitation.id}/accept`, user.token);
  expect(accepted.statusCode).toBe(200);
};

const clickJoin = async (user: TestUser, groupId: string): Promise<void> => {
  const res = await api(app, 'POST', `/groups/${groupId}/join`, user.token, {});
  expect(res.statusCode).toBe(201);
  expect(res.json().data).toMatchObject({ result: 'member', membership: { joinedVia: 'joined' } });
};

describe('Ai có quyền mang huy hiệu', () => {
  it('Được duyệt vào nhóm xét duyệt', async () => {
    const group = await createActiveGroup(app, {
      mode: 'public_review',
      name: 'Lớp 12A1 xét duyệt',
    });
    const user = await newUser(app);

    await applyAndApprove(user, group.groupId, group.owner);

    expect(await badgesOf(user)).toEqual([
      { groupId: group.groupId, groupName: 'Lớp 12A1 xét duyệt' },
    ]);
    expect(await eligibleIn(user, group.groupId)).toBe(true);
  });

  it('Được mời vào nhóm mở cửa', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const user = await newUser(app);

    await inviteAndAccept(user, group.groupId, group.owner);

    expect(await badgesOf(user)).toEqual([]);
    const view = await api(app, 'GET', `/groups/${group.groupId}`, user.token);
    expect(view.json().data.membership).toMatchObject({
      joinedVia: 'invited',
      badgeEligible: false,
    });
  });

  it('Nhóm riêng tư chưa bật hiện tên', async () => {
    const group = await createActiveGroup(app, { mode: 'private_invite' });
    const user = await addMember(app, group.groupId, { via: 'roster' });

    expect(await badgesOf(user)).toEqual([]);
    expect(await eligibleIn(user, group.groupId)).toBe(false);
  });

  it('Nhóm riêng tư đã bật hiện tên', async () => {
    const group = await createActiveGroup(app, { mode: 'private_invite', name: 'Trường THPT A' });
    const user = await addMember(app, group.groupId, { via: 'roster' });

    const res = await settings(group.owner, group.groupId, { showNameOnMarketplace: true });

    expect(res.statusCode).toBe(200);
    expect(await badgesOf(user)).toEqual([{ groupId: group.groupId, groupName: 'Trường THPT A' }]);
    expect(await eligibleIn(user, group.groupId)).toBe(true);
  });

  it('Không còn là thành viên', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const leaver = await addMember(app, group.groupId, { via: 'approved' });
    const removed = await addMember(app, group.groupId, { via: 'invited' });
    const banned = await addMember(app, group.groupId, { via: 'approved' });
    const users = [leaver, removed, banned];
    expect((await badgesOfAll(users)).map((badges) => badges.length)).toEqual([1, 1, 1]);

    const results = [
      await api(app, 'POST', `/groups/${group.groupId}/leave`, leaver.token),
      await api(app, 'DELETE', `/groups/${group.groupId}/members/${removed.id}`, group.owner.token),
      await api(app, 'PUT', `/groups/${group.groupId}/bans/${banned.id}`, group.owner.token),
    ];

    expect(results.map((res) => res.statusCode)).toEqual([204, 204, 204]);
    expect(await badgesOfAll(users)).toEqual([[], [], []]);
    expect(await eligibleOf(users, group.groupId)).toEqual([null, null, null]);
  });

  it('Nhóm đóng', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const approved = await addMember(app, group.groupId, { via: 'approved' });
    const invited = await addMember(app, group.groupId, { via: 'invited' });
    expect(await badgesOf(approved)).toHaveLength(1);

    const res = await api(app, 'POST', `/groups/${group.groupId}/close`, group.owner.token);

    expect(res.statusCode).toBe(204);
    expect(await badgesOf(approved)).toEqual([]);
    expect(await badgesOf(invited)).toEqual([]);
  });
});

describe('Bấm tham gia không bao giờ có huy hiệu', () => {
  it('Nhóm mở cửa đổi sang xét duyệt', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const user = await newUser(app);
    await clickJoin(user, group.groupId);

    const res = await settings(group.owner, group.groupId, { mode: 'public_review' });

    expect(res.statusCode).toBe(200);
    expect(await badgesOf(user)).toEqual([]);
    expect(await eligibleIn(user, group.groupId)).toBe(false);
  });
});

describe('Người dùng xem huy hiệu mình được mang', () => {
  it('Thành viên của hai nhóm', async () => {
    const reviewed = await createActiveGroup(app, { mode: 'public_review', name: 'CLB Cờ vua' });
    const open = await createActiveGroup(app, { mode: 'public_open', name: 'Hội chạy bộ' });
    const user = await newUser(app);
    await applyAndApprove(user, reviewed.groupId, reviewed.owner);
    await clickJoin(user, open.groupId);

    const groups = await api(app, 'GET', '/me/groups', user.token);
    expect(groups.json().data).toHaveLength(2);
    expect(await badgesOf(user)).toEqual([{ groupId: reviewed.groupId, groupName: 'CLB Cờ vua' }]);
  });
});

describe('Công tắc hiện tên nhóm trên tin sàn', () => {
  it('Bật ở nhóm công khai', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });

    const res = await settings(group.owner, group.groupId, { showNameOnMarketplace: true });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GROUP_MODE_CONFLICT');
  });

  it('Điều hành viên thử bật', async () => {
    const group = await createActiveGroup(app, { mode: 'private_invite' });
    const moderator = await addMember(app, group.groupId, { via: 'invited' });
    await appointModerator(app, group, moderator);

    const res = await settings(moderator, group.groupId, { showNameOnMarketplace: true });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    const view = await api(app, 'GET', `/groups/${group.groupId}`, group.owner.token);
    expect(view.json().data.showNameOnMarketplace).toBe(false);
  });
});

describe('Quyền huy hiệu được tính lại ngay', () => {
  it('Nhóm xét duyệt đổi sang mở cửa', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const members = [
      await addMember(app, group.groupId, { via: 'approved' }),
      await addMember(app, group.groupId, { via: 'invited' }),
      await addMember(app, group.groupId, { via: 'roster' }),
    ];
    expect(await eligibleOf(members, group.groupId)).toEqual([true, true, true]);

    const res = await settings(group.owner, group.groupId, { mode: 'public_open' });

    expect(res.statusCode).toBe(200);
    expect(await eligibleOf(members, group.groupId)).toEqual([false, false, false]);
    expect(await badgesOfAll(members)).toEqual([[], [], []]);
  });

  it('Nhóm mở cửa đổi sang xét duyệt', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const invited = await newUser(app);
    await inviteAndAccept(invited, group.groupId, group.owner);
    const clicked = await newUser(app);
    await clickJoin(clicked, group.groupId);
    expect(await eligibleIn(invited, group.groupId)).toBe(false);

    const res = await settings(group.owner, group.groupId, { mode: 'public_review' });

    expect(res.statusCode).toBe(200);
    expect(await eligibleIn(invited, group.groupId)).toBe(true);
    expect(await badgesOf(invited)).toEqual([
      { groupId: group.groupId, groupName: expect.any(String) },
    ]);
    expect(await eligibleIn(clicked, group.groupId)).toBe(false);
    expect(await badgesOf(clicked)).toEqual([]);
  });

  it('Tắt hiện tên', async () => {
    const group = await createActiveGroup(app, { mode: 'private_invite' });
    const members = [
      await addMember(app, group.groupId, { via: 'roster' }),
      await addMember(app, group.groupId, { via: 'invited' }),
    ];
    expect(
      (await settings(group.owner, group.groupId, { showNameOnMarketplace: true })).statusCode,
    ).toBe(200);
    expect(await eligibleOf(members, group.groupId)).toEqual([true, true]);

    const res = await settings(group.owner, group.groupId, { showNameOnMarketplace: false });

    expect(res.statusCode).toBe(200);
    expect(await eligibleOf(members, group.groupId)).toEqual([false, false]);
    expect(await badgesOfAll(members)).toEqual([[], []]);
  });
});

describe('Người ngoài bấm vào huy hiệu nhóm riêng tư chỉ thấy tên', () => {
  it('Bấm huy hiệu nhóm riêng tư', async () => {
    const group = await createActiveGroup(app, {
      mode: 'private_invite',
      name: 'Phụ huynh lớp 5B',
    });
    await settings(group.owner, group.groupId, { showNameOnMarketplace: true });
    const outsider = await newUser(app);
    const nameOnly = { visibility: 'name_only', id: group.groupId, name: 'Phụ huynh lớp 5B' };

    const signedIn = await api(app, 'GET', `/groups/${group.groupId}`, outsider.token);
    const guest = await api(app, 'GET', `/groups/${group.groupId}`);

    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json().data).toEqual(nameOnly);
    expect(guest.statusCode).toBe(200);
    expect(guest.json().data).toEqual(nameOnly);
  });

  it('Thành viên mở nhóm riêng tư', async () => {
    const group = await createActiveGroup(app, {
      mode: 'private_invite',
      name: 'Phụ huynh lớp 5C',
    });
    const member = await addMember(app, group.groupId, { via: 'roster' });

    const res = await api(app, 'GET', `/groups/${group.groupId}`, member.token);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      visibility: 'full',
      id: group.groupId,
      name: 'Phụ huynh lớp 5C',
      mode: 'private_invite',
      memberCount: 2,
      membership: { role: 'member', joinedVia: 'roster' },
    });
  });
});
