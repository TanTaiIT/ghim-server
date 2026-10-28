import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  deliverAll,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/* Spec `notification/*` của add-notification-core: hộp thư, bật tắt, tắt tiếng, gộp, và ma trận chuyện của nhóm. */
const MINUTE_MS = 60_000;
let now = TEST_NOW;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
});

afterAll(() => app.close());

const deliver = () => deliverAll(app);

const inbox = async (user: TestUser) => {
  const res = await api(app, 'GET', '/me/notifications?limit=100', user.token);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data.items as Array<{
    id: string;
    category: string;
    type: string;
    title: string;
    body: string;
    detail: string | null;
    count: number;
    readAt: string | null;
  }>;
};

/** Cờ nhắc nằm ở DB (realtime và push sau này đọc nó) — test đọc thẳng để không cần nối socket. */
const alertOf = async (notificationId: string) =>
  (await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } })).alert;

const requestJoin = async (group: ActiveGroup, user: TestUser) => {
  const res = await api(app, 'POST', `/groups/${group.groupId}/join`, user.token, {});
  expect(res.statusCode, res.body).toBe(201);
  return res.json().data.request.id as string;
};

const decide = (group: ActiveGroup, requestId: string, approve: boolean, by = group.owner) =>
  api(app, 'POST', `/group-join-requests/${requestId}/decision`, by.token, { approve });

describe('hộp thư', () => {
  it('có thông báo mới: đơn được duyệt → một thông báo "nhóm của bạn" kèm thời điểm', async () => {
    const group = await createActiveGroup(app);
    const applicant = await newUser(app);
    await decide(group, await requestJoin(group, applicant), true);
    await deliver();
    const items = await inbox(applicant);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      category: 'your_groups',
      type: 'group.join_request.approved',
    });
  });

  it('chỉ chứa thông báo của chính mình; khách 401', async () => {
    const stranger = await newUser(app);
    expect(await inbox(stranger)).toEqual([]);
    expect((await api(app, 'GET', '/me/notifications')).statusCode).toBe(401);
  });

  it('đánh dấu thông báo của người khác → 404 như mã không tồn tại', async () => {
    const group = await createActiveGroup(app);
    const applicant = await newUser(app);
    await decide(group, await requestJoin(group, applicant), true);
    await deliver();
    const [item] = await inbox(applicant);
    const other = await newUser(app);
    const res = await api(app, 'POST', '/me/notifications/read', other.token, { ids: [item?.id] });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('đếm chưa đọc, đọc một, đọc tất cả', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    await appointModerator(app, group, member);
    await api(app, 'DELETE', `/groups/${group.groupId}/moderators/${member.id}`, group.owner.token);
    await deliver();
    const count = async () =>
      (await api(app, 'GET', '/me/notifications/unread-count', member.token)).json().data.count;
    expect(await count()).toBe(2);
    const [first] = await inbox(member);
    await api(app, 'POST', '/me/notifications/read', member.token, { ids: [first?.id] });
    expect(await count()).toBe(1);
    await api(app, 'POST', '/me/notifications/read', member.token, { all: true });
    expect(await count()).toBe(0);
  });
});

describe('gộp chuyện lặp lại', () => {
  it('ba đơn trong mười phút: một thông báo "3 đơn", chỉ lần đầu nhắc', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    await sequentially([1, 2, 3], async () => {
      await requestJoin(group, await newUser(app));
      now = new Date(now.getTime() + 3 * MINUTE_MS);
      await deliver();
    });
    const pending = (await inbox(group.owner)).filter(
      (row) => row.type === 'group.join_request.pending',
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.count).toBe(3);
    expect(pending[0]?.body).toContain('3 đơn');
    const row = await prisma.notification.findUniqueOrThrow({
      where: { id: pending[0]?.id ?? '' },
    });
    expect(row.alertedAt?.getTime()).toBeLessThan(row.updatedAt.getTime());
  });

  it('đã đọc rồi có đơn mới → dòng mới; quá 30 phút → nhắc lại', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    await requestJoin(group, await newUser(app));
    await deliver();
    await api(app, 'POST', '/me/notifications/read', group.owner.token, { all: true });
    await requestJoin(group, await newUser(app));
    await deliver();
    const rows = (await inbox(group.owner)).filter(
      (row) => row.type === 'group.join_request.pending',
    );
    expect(rows).toHaveLength(2);

    now = new Date(now.getTime() + 31 * MINUTE_MS);
    await requestJoin(group, await newUser(app));
    await deliver();
    const latest = (await inbox(group.owner)).find(
      (row) => row.type === 'group.join_request.pending' && !row.readAt,
    );
    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: latest?.id ?? '' } });
    expect(stored.count).toBe(2);
    expect(stored.alertedAt?.getTime()).toBe(stored.updatedAt.getTime());
  });
});

describe('bật tắt và tắt tiếng', () => {
  it('đủ mười một nhóm (ví Xu từ add-wallet), mặc định bật; nhóm "tài khoản" không tắt được; tên lạ 400', async () => {
    const user = await newUser(app);
    const prefs = (await api(app, 'GET', '/me/notification-preferences', user.token)).json().data;
    expect(prefs.categories).toHaveLength(11);
    expect(prefs.categories.at(-1)?.category).toBe('wallet');
    expect(prefs.categories.every((row: { enabled: boolean }) => row.enabled)).toBe(true);
    const account = await api(app, 'PUT', '/me/notification-preferences/account', user.token, {
      enabled: false,
    });
    expect(account.statusCode).toBe(400);
    expect(account.json().error.code).toBe('NOTIFICATION_GROUP_ALWAYS_ON');
    const unknown = await api(app, 'PUT', '/me/notification-preferences/khac', user.token, {
      enabled: false,
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('tắt "thông báo của nhóm": vào hộp thư, không nhắc; chuyện "nhóm của bạn" vẫn nhắc', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    await api(app, 'PUT', '/me/notification-preferences/group_announcements', member.token, {
      enabled: false,
    });
    await api(app, 'POST', `/groups/${group.groupId}/announcements`, group.owner.token, {
      body: 'Họp lớp tối nay',
    });
    await appointModerator(app, group, member);
    await deliver();
    const items = await inbox(member);
    const announcement = items.find((row) => row.type === 'group.announcement.posted');
    const appointed = items.find((row) => row.type === 'group.moderator.appointed');
    expect(await alertOf(announcement?.id ?? '')).toBe(false);
    expect(await alertOf(appointed?.id ?? '')).toBe(true);
  });

  it('tắt tiếng nhóm X: thông báo của X không nhắc, chuyện về chính mình vẫn nhắc, nhóm Y không ảnh hưởng', async () => {
    const x = await createActiveGroup(app);
    const y = await createActiveGroup(app);
    const member = await addMember(app, x.groupId);
    await prisma.groupMember.create({
      data: { groupId: y.groupId, accountId: member.id, joinedVia: 'approved', joinedAt: now },
    });
    expect((await api(app, 'PUT', `/me/group-mutes/${x.groupId}`, member.token)).statusCode).toBe(
      204,
    );
    await api(app, 'POST', `/groups/${x.groupId}/announcements`, x.owner.token, {
      body: 'Thông báo X',
    });
    await api(app, 'POST', `/groups/${y.groupId}/announcements`, y.owner.token, {
      body: 'Thông báo Y',
    });
    await appointModerator(app, x, member);
    await deliver();
    const items = await inbox(member);
    const fromX = items.find((row) => row.body === 'Thông báo X');
    const fromY = items.find((row) => row.body === 'Thông báo Y');
    const appointed = items.find((row) => row.type === 'group.moderator.appointed');
    expect(await alertOf(fromX?.id ?? '')).toBe(false);
    expect(await alertOf(fromY?.id ?? '')).toBe(true);
    expect(await alertOf(appointed?.id ?? '')).toBe(true);
  });

  it('tắt tiếng nhóm mình không ở → 409 NOT_GROUP_MEMBER', async () => {
    const group = await createActiveGroup(app);
    const outsider = await newUser(app);
    const res = await api(app, 'PUT', `/me/group-mutes/${group.groupId}`, outsider.token);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NOT_GROUP_MEMBER');
  });
});

describe('chuyện của nhóm', () => {
  it('đơn bị từ chối: không có tên điều hành viên, có ngày gửi lại', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    const applicant = await newUser(app);
    await decide(group, await requestJoin(group, applicant), false, moderator);
    await deliver();
    const rejected = (await inbox(applicant)).find(
      (row) => row.type === 'group.join_request.rejected',
    );
    expect(rejected?.body).toContain('Quản trị nhóm');
    expect(rejected?.body).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    const names = await prisma.account.findUniqueOrThrow({ where: { id: moderator.id } });
    expect(rejected?.body).not.toContain(names.displayName);
  });

  it('nhóm bị khoá: mọi thành viên được báo, lý do chỉ ở thông báo của chủ và điều hành viên, không trong câu', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    await api(app, 'POST', `/ops/groups/${group.groupId}/lock`, group.master.token, {
      reason: 'Lừa đảo',
    });
    await deliver();
    const ownerNotice = (await inbox(group.owner)).find((row) => row.type === 'group.state.locked');
    const memberNotice = (await inbox(member)).find((row) => row.type === 'group.state.locked');
    expect(ownerNotice?.detail).toContain('Lừa đảo');
    expect(ownerNotice?.body).not.toContain('Lừa đảo');
    expect(memberNotice?.detail).toBeNull();
  });

  it('chủ nhóm đóng nhóm: thành viên, người có đơn, người được mời được báo; chủ nhóm thì không', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const member = await addMember(app, group.groupId);
    const applicant = await newUser(app);
    await requestJoin(group, applicant);
    expect(
      (await api(app, 'POST', `/groups/${group.groupId}/close`, group.owner.token)).statusCode,
    ).toBe(204);
    await deliver();
    expect((await inbox(member)).some((row) => row.type === 'group.state.closed')).toBe(true);
    expect(
      (await inbox(applicant)).some((row) => row.type === 'group.join_request.cancelled'),
    ).toBe(true);
    expect((await inbox(group.owner)).some((row) => row.type === 'group.state.closed')).toBe(false);
  });

  it('thành viên tự rời: không ai nhận thông báo', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    await deliver();
    const before = await prisma.notification.count();
    await api(app, 'POST', `/groups/${group.groupId}/leave`, member.token);
    await deliver();
    expect(await prisma.notification.count()).toBe(before);
  });

  it('giao trùng một sự kiện không sinh hai thông báo', async () => {
    const group = await createActiveGroup(app);
    const applicant = await newUser(app);
    await decide(group, await requestJoin(group, applicant), true);
    await deliver();
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'group.join_request.decided' },
      orderBy: { createdAt: 'desc' },
    });
    await app.modules.notification.handleEvent(event.payload as Record<string, unknown>, {
      id: event.id,
      type: event.type,
    });
    const approved = (await inbox(applicant)).filter(
      (row) => row.type === 'group.join_request.approved',
    );
    expect(approved).toHaveLength(1);
  });
});
