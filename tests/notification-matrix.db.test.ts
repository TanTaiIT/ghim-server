import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createUnit,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { buildTestApp } from './test-app.js';

/*
 * Ma trận N1–N30 (design add-notification-core mục 1) qua bên nghe thật trên DB thật: mỗi dòng một sự kiện, đúng
 * người nhận, đúng loại, đúng cờ nhắc (chưa ai tắt gì nên cờ = cột "nhắc" của ma trận); và không câu nào lộ lý do
 * khoá hay tên điều hành viên.
 */
const REASON = 'Lừa đảo chuyển khoản';
const UNIT = 'Lớp 12A1';
const ISO = '2026-10-24T10:00:00+07:00';

let app: FastifyInstance;
let group: ActiveGroup;
let unitId: string;
let moderator: TestUser;
let member: TestUser;
let outsider: TestUser;
let moderatorName: string;
let announcementId: string;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  group = await createActiveGroup(app, { kind: 'school', name: 'Trường Lê Lợi' });
  unitId = await createUnit(app, group, UNIT);
  moderator = await addMember(app, group.groupId, { unitId });
  await appointModerator(app, group, moderator, unitId);
  member = await addMember(app, group.groupId, { unitId });
  outsider = await newUser(app);
  moderatorName = (await prisma.account.findUniqueOrThrow({ where: { id: moderator.id } }))
    .displayName;
  const posted = await api(app, 'POST', `/groups/${group.groupId}/announcements`, moderator.token, {
    body: 'Chiều nay nghỉ học',
  });
  expect(posted.statusCode, posted.body).toBe(201);
  announcementId = posted.json().data.id as string;
});

afterAll(() => app.close());

/*
 * Dòng về trạng thái nhóm hay tư cách chỉ viết khi câu còn đúng (fix-stale-group-notices): các hàm dưới dựng đúng
 * trạng thái câu nói tới, trả hàm đưa nhóm về như cũ — mọi dòng dùng chung một nhóm.
 */
type Restore = () => Promise<void>;
const setRole = (accountId: string, role: 'owner' | 'member') =>
  prisma.groupMember.update({
    where: { groupId_accountId: { groupId: group.groupId, accountId } },
    data: { role, roleSince: role === 'owner' ? new Date() : null },
  });
async function memberIsOwner(): Promise<Restore> {
  await setRole(group.owner.id, 'member');
  await setRole(member.id, 'owner');
  return async () => {
    await setRole(member.id, 'member');
    await setRole(group.owner.id, 'owner');
  };
}
const activeAgain: Restore = async () => {
  await prisma.group.update({
    where: { id: group.groupId },
    data: {
      state: 'active',
      lockedAt: null,
      lockCause: null,
      lockedReason: null,
      ownerlessSince: null,
    },
  });
};
async function lockedGroup(): Promise<Restore> {
  await prisma.group.update({
    where: { id: group.groupId },
    data: { state: 'locked', lockedAt: new Date(), lockCause: 'master', lockedReason: REASON },
  });
  return activeAgain;
}
async function ownerlessGroup(): Promise<Restore> {
  await prisma.group.update({
    where: { id: group.groupId },
    data: { state: 'ownerless', ownerlessSince: new Date() },
  });
  return activeAgain;
}
async function outsiderBanned(): Promise<Restore> {
  await prisma.groupBan.create({
    data: {
      groupId: group.groupId,
      accountId: outsider.id,
      bannedBy: group.owner.id,
      bannedAt: new Date(),
    },
  });
  return async () => {
    await prisma.groupBan.deleteMany({ where: { groupId: group.groupId, accountId: outsider.id } });
  };
}

/** Phát một sự kiện với mã mới cho bên nghe thật, trả các dòng nó ghi. */
async function emit(type: string, payload: Record<string, unknown>) {
  const id = randomUUID();
  await app.modules.notification.handleEvent({ groupId: group.groupId, ...payload }, { id, type });
  return prisma.notification.findMany({ where: { sourceEventId: id } });
}

type Who = 'owner' | 'moderator' | 'member' | 'outsider';
const idOf = (who: Who) =>
  ({ owner: group.owner.id, moderator: moderator.id, member: member.id, outsider: outsider.id })[
    who
  ];

interface Row {
  n: string;
  event: string;
  payload: () => Record<string, unknown>;
  /** Người nhận → loại thông báo và cờ nhắc. Người không có ở đây thì không được nhận gì. */
  expect: Partial<Record<Who, { type: string; alert: boolean }>>;
  /** Dựng trạng thái câu của dòng nói tới; trả hàm đưa nhóm về như cũ. */
  arrange?: () => Promise<Restore>;
}

const ROWS: Row[] = [
  {
    n: 'N1',
    event: 'group.owner.offered',
    payload: () => ({ toAccountId: outsider.id, kind: 'assignment', expiresAt: ISO }),
    expect: { outsider: { type: 'group.owner_offer.received', alert: true } },
  },
  {
    n: 'N2',
    event: 'group.owner.offered',
    payload: () => ({
      toAccountId: member.id,
      fromAccountId: group.owner.id,
      kind: 'transfer',
      expiresAt: ISO,
    }),
    expect: { member: { type: 'group.owner_offer.received', alert: true } },
  },
  {
    n: 'N3',
    event: 'group.owner.changed',
    payload: () => ({ newOwnerId: member.id, previousOwnerId: group.owner.id, cause: 'transfer' }),
    arrange: memberIsOwner,
    expect: {
      owner: { type: 'group.owner.changed', alert: true },
      moderator: { type: 'group.owner.changed', alert: false },
    },
  },
  {
    n: 'N4',
    event: 'group.owner.offer_decided',
    payload: () => ({ kind: 'transfer', fromAccountId: group.owner.id, outcome: 'declined' }),
    expect: { owner: { type: 'group.owner_transfer.declined', alert: true } },
  },
  {
    n: 'N5',
    event: 'group.owner.offer_decided',
    payload: () => ({ kind: 'transfer', fromAccountId: group.owner.id, outcome: 'expired' }),
    expect: { owner: { type: 'group.owner_transfer.expired', alert: false } },
  },
  {
    n: 'N6',
    event: 'group.owner.changed',
    payload: () => ({
      newOwnerId: member.id,
      previousOwnerId: group.owner.id,
      cause: 'assignment',
    }),
    arrange: memberIsOwner,
    expect: {
      owner: { type: 'group.owner.changed', alert: true },
      moderator: { type: 'group.owner.changed', alert: false },
    },
  },
  {
    n: 'N7',
    event: 'group.moderator.changed',
    payload: () => ({ accountId: member.id, change: 'appointed', unitId }),
    expect: { member: { type: 'group.moderator.appointed', alert: true } },
  },
  {
    n: 'N8',
    event: 'group.moderator.changed',
    payload: () => ({ accountId: member.id, change: 'dismissed', unitId: null }),
    expect: { member: { type: 'group.moderator.dismissed', alert: true } },
  },
  {
    n: 'N9',
    event: 'group.moderator.changed',
    payload: () => ({ accountId: member.id, change: 'scope', unitId: null }),
    expect: { member: { type: 'group.moderator.scope_changed', alert: false } },
  },
  {
    n: 'N10',
    event: 'group.ownerless.started',
    payload: () => ({}),
    arrange: ownerlessGroup,
    expect: { moderator: { type: 'group.ownerless.started', alert: true } },
  },
  {
    n: 'N11',
    event: 'group.ownerless.resolved',
    payload: () => ({ outcome: 'owner_returned' }),
    expect: {
      owner: { type: 'group.owner.returned', alert: true },
      moderator: { type: 'group.owner.returned', alert: false },
    },
  },
  {
    n: 'N12',
    event: 'group.owner.changed',
    payload: () => ({
      newOwnerId: member.id,
      previousOwnerId: group.owner.id,
      cause: 'ownerless_confirmed',
    }),
    arrange: memberIsOwner,
    expect: {
      owner: { type: 'group.owner.changed', alert: false },
      moderator: { type: 'group.owner.changed', alert: false },
    },
  },
  {
    n: 'N13',
    event: 'group.state.locked',
    payload: () => ({ cause: 'master', reason: REASON }),
    arrange: lockedGroup,
    expect: {
      owner: { type: 'group.state.locked', alert: true },
      moderator: { type: 'group.state.locked', alert: true },
      member: { type: 'group.state.locked', alert: true },
    },
  },
  {
    n: 'N14',
    event: 'group.state.unlocked',
    payload: () => ({ cause: 'master' }),
    expect: {
      owner: { type: 'group.state.unlocked', alert: true },
      moderator: { type: 'group.state.unlocked', alert: true },
      member: { type: 'group.state.unlocked', alert: true },
    },
  },
  {
    n: 'N15',
    event: 'group.state.closed',
    payload: () => ({ closedBy: group.owner.id }),
    expect: {
      moderator: { type: 'group.state.closed', alert: true },
      member: { type: 'group.state.closed', alert: true },
    },
  },
  {
    n: 'N16',
    event: 'group.state.closed',
    payload: () => ({ closedBy: group.owner.id, cancelledRequestAccountIds: [outsider.id] }),
    expect: {
      outsider: { type: 'group.join_request.cancelled', alert: true },
      moderator: { type: 'group.state.closed', alert: true },
      member: { type: 'group.state.closed', alert: true },
    },
  },
  {
    n: 'N17',
    event: 'group.state.closed',
    payload: () => ({ closedBy: group.owner.id, cancelledInviteeIds: [outsider.id] }),
    expect: {
      outsider: { type: 'group.invitation.cancelled', alert: true },
      moderator: { type: 'group.state.closed', alert: true },
      member: { type: 'group.state.closed', alert: true },
    },
  },
  {
    n: 'N18',
    event: 'group.mode.changed',
    payload: () => ({ from: 'private_code', to: 'public_open', actorId: group.owner.id }),
    expect: {
      moderator: { type: 'group.mode.public', alert: true },
      member: { type: 'group.mode.public', alert: true },
    },
  },
  {
    n: 'N19',
    event: 'group.join_request.decided',
    payload: () => ({ accountId: outsider.id, outcome: 'cancelled', reason: 'mode_open' }),
    expect: { outsider: { type: 'group.join_request.cancelled', alert: true } },
  },
  {
    n: 'N20',
    event: 'group.join_request.created',
    payload: () => ({ accountId: outsider.id }),
    expect: { owner: { type: 'group.join_request.pending', alert: true } },
  },
  {
    n: 'N21',
    event: 'group.join_request.decided',
    payload: () => ({ accountId: outsider.id, outcome: 'approved' }),
    expect: { outsider: { type: 'group.join_request.approved', alert: true } },
  },
  {
    n: 'N22',
    event: 'group.join_request.decided',
    payload: () => ({ accountId: outsider.id, outcome: 'rejected', reapplyAt: ISO }),
    expect: { outsider: { type: 'group.join_request.rejected', alert: true } },
  },
  {
    n: 'N23',
    event: 'group.join_request.decided',
    payload: () => ({ accountId: outsider.id, outcome: 'expired' }),
    expect: { outsider: { type: 'group.join_request.expired', alert: false } },
  },
  {
    n: 'N24',
    event: 'group.invitation.created',
    payload: () => ({ accountId: outsider.id, expiresAt: ISO, invitationId: randomUUID() }),
    expect: { outsider: { type: 'group.invitation.received', alert: true } },
  },
  {
    n: 'N25',
    event: 'group.roster.matched',
    payload: () => ({ accountIds: [outsider.id] }),
    expect: { outsider: { type: 'group.roster.listed', alert: true } },
  },
  {
    n: 'N26',
    event: 'group.member.left',
    payload: () => ({ accountId: outsider.id, reason: 'removed' }),
    expect: { outsider: { type: 'group.member.removed', alert: true } },
  },
  {
    n: 'N27',
    event: 'group.member.left',
    payload: () => ({ accountId: outsider.id, reason: 'banned' }),
    arrange: outsiderBanned,
    expect: { outsider: { type: 'group.member.banned', alert: true } },
  },
  {
    n: 'N28',
    event: 'group.ban.lifted',
    payload: () => ({ accountId: outsider.id }),
    expect: { outsider: { type: 'group.ban.lifted', alert: false } },
  },
  {
    n: 'N29',
    event: 'group.member.unit_changed',
    payload: () => ({ accountId: member.id, unitId }),
    expect: { member: { type: 'group.member.unit_changed', alert: false } },
  },
  {
    n: 'N30',
    event: 'group.announcement.posted',
    payload: () => ({ announcementId, authorId: moderator.id, unitId }),
    expect: { member: { type: 'group.announcement.posted', alert: true } },
  },
];

describe('ma trận N1–N30', () => {
  it.each(ROWS)('$n $event: đúng người, đúng loại, đúng cờ nhắc', async (row) => {
    const restore = await row.arrange?.();
    const rows = await emit(row.event, row.payload()).finally(() => restore?.());
    const got = Object.fromEntries(
      rows.map((notice) => [notice.recipientId, { type: notice.type, alert: notice.alert }]),
    );
    const want = Object.fromEntries(
      Object.entries(row.expect).map(([who, value]) => [idOf(who as Who), value]),
    );
    expect(got).toEqual(want);
    for (const notice of rows) {
      expect(notice.title).toBe('Trường Lê Lợi');
      expect(notice.body.length).toBeGreaterThan(0);
    }
  });

  it('không câu nào chứa lý do khoá hay tên điều hành viên; lý do chỉ ở `detail` của quản trị', async () => {
    const written = await prisma.notification.findMany();
    expect(written.length).toBeGreaterThan(0);
    for (const notice of written) {
      expect(`${notice.title} ${notice.body}`).not.toContain(REASON);
      expect(`${notice.title} ${notice.body}`).not.toContain(moderatorName);
    }
    const withReason = written.filter((notice) => notice.detail?.includes(REASON));
    expect(new Set(withReason.map((notice) => notice.recipientId))).toEqual(
      new Set([group.owner.id, moderator.id]),
    );
  });

  it('câu mang đủ thông tin người nhận cần: hạn, ngày gửi lại, tên đơn vị', async () => {
    const [received] = await emit('group.owner.offered', {
      toAccountId: outsider.id,
      kind: 'assignment',
      expiresAt: ISO,
    });
    expect(received?.body).toContain('24/10/2026');
    const [rejected] = await emit('group.join_request.decided', {
      accountId: outsider.id,
      outcome: 'rejected',
      reapplyAt: ISO,
    });
    expect(rejected?.body).toContain('Quản trị nhóm');
    expect(rejected?.body).toContain('24/10/2026');
    const [appointed] = await emit('group.moderator.changed', {
      accountId: member.id,
      change: 'appointed',
      unitId,
    });
    expect(appointed?.body).toContain(UNIT);
  });
});

describe('Theo trạng thái hiện tại của nhóm (fix-stale-group-notices)', () => {
  /** Sự kiện cũ tới khi trạng thái đã đi tiếp: không ai nhận gì. */
  const STALE: {
    n: string;
    event: string;
    payload: () => Record<string, unknown>;
    arrange?: () => Promise<Restore>;
  }[] = [
    {
      n: 'N3 — chủ đã là người khác',
      event: 'group.owner.changed',
      payload: () => ({
        newOwnerId: member.id,
        previousOwnerId: group.owner.id,
        cause: 'transfer',
      }),
    },
    { n: 'N10 — nhóm đã có chủ', event: 'group.ownerless.started', payload: () => ({}) },
    {
      n: 'N11 — nhóm lại thiếu chủ',
      event: 'group.ownerless.resolved',
      payload: () => ({ outcome: 'owner_returned' }),
      arrange: ownerlessGroup,
    },
    {
      n: 'N13 — nhóm đã mở khoá',
      event: 'group.state.locked',
      payload: () => ({ cause: 'master', reason: REASON }),
    },
    {
      n: 'N14 — nhóm lại bị khoá',
      event: 'group.state.unlocked',
      payload: () => ({ cause: 'master' }),
      arrange: lockedGroup,
    },
    {
      n: 'N26 — người đó đã vào lại',
      event: 'group.member.left',
      payload: () => ({ accountId: member.id, reason: 'removed' }),
    },
    {
      n: 'N27 — người đó đã vào lại',
      event: 'group.member.left',
      payload: () => ({ accountId: member.id, reason: 'banned' }),
    },
    {
      n: 'N28 — người đó lại bị cấm',
      event: 'group.ban.lifted',
      payload: () => ({ accountId: outsider.id }),
      arrange: outsiderBanned,
    },
  ];

  it.each(STALE)('$n: không ai nhận gì', async (row) => {
    const restore = await row.arrange?.();
    const rows = await emit(row.event, row.payload()).finally(() => restore?.());
    expect(rows).toEqual([]);
  });

  it('N27 khi người đó đã được gỡ cấm: nhận câu "không còn là thành viên", không có câu "không vào lại được"', async () => {
    const [notice, ...rest] = await emit('group.member.left', {
      accountId: outsider.id,
      reason: 'banned',
    });
    expect(rest).toEqual([]);
    expect(notice).toMatchObject({ recipientId: outsider.id, type: 'group.member.removed' });
    expect(notice?.body).not.toContain('không vào lại');
  });
});
