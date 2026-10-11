import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createOutboxDispatcher } from '../src/common/outbox/dispatcher.js';
import { registerGroupListeners } from '../src/modules/group/group.events.js';
import { outboxEvents, prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  type TestUser,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createPendingGroup,
  newMaster,
  newUser,
} from './group-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Hai việc theo lịch của `group` (design mục 11), gọi thẳng qua service với đồng hồ được đẩy tới: test quyết định lúc
 * nào việc chạy. Mọi khẳng định lọc theo mã của chính ca đó, vì các ca trong file dùng chung một DB.
 */
const DAY_MS = 86_400_000;
const daysAfter = (n: number): Date => new Date(TEST_NOW.getTime() + n * DAY_MS);

let now = TEST_NOW;
let app: FastifyInstance;
const dispatcher = createOutboxDispatcher(prisma);

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
  registerGroupListeners(dispatcher, app.modules.group);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const expireDue = () => app.modules.group.expireDue();

const eventsFor = async (type: string, key: string, id: string) =>
  (await outboxEvents()).filter(
    (event) => event.type === type && (event.payload as Record<string, unknown>)[key] === id,
  );

const deliver = async (): Promise<void> => {
  const { published, failed } = await dispatcher.runOnce();
  expect(failed).toBe(0);
  if (published > 0) await deliver();
};

const applyTo = async (groupId: string): Promise<{ requestId: string; applicant: TestUser }> => {
  const applicant = await newUser(app);
  const res = await api(app, 'POST', `/groups/${groupId}/join`, applicant.token, {});
  expect(res.statusCode).toBe(201);
  return { requestId: res.json().data.request.id as string, applicant };
};

const inviteTo = async (
  groupId: string,
  owner: TestUser,
): Promise<{ invitationId: string; invitee: TestUser }> => {
  const invitee = await newUser(app);
  const res = await api(app, 'POST', `/groups/${groupId}/invitations`, owner.token, {
    email: invitee.email,
  });
  expect(res.statusCode).toBe(204);
  const mine = await api(app, 'GET', '/me/group-invitations', invitee.token);
  return { invitationId: mine.json().data.invitations[0].id as string, invitee };
};

const offerTo = async (master: TestUser, groupId: string, accountId: string): Promise<string> => {
  const res = await api(app, 'POST', `/ops/groups/${groupId}/owner-offers`, master.token, {
    accountId,
  });
  expect(res.statusCode).toBe(201);
  return res.json().data.id as string;
};

/** Chủ bị khoá qua route thật của `identity`, rồi bộ phát thật đưa sự kiện tới `group` — nhóm thiếu chủ từ `now`. */
const makeOwnerless = async (group: ActiveGroup): Promise<void> => {
  const res = await api(app, 'POST', `/ops/accounts/${group.owner.id}/lock`, group.master.token, {
    reason: 'Vi phạm quy định',
  });
  expect(res.statusCode).toBe(204);
  await deliver();
  expect(await repositories.group.findGroup(group.groupId)).toMatchObject({
    state: 'ownerless',
    ownerlessSince: now,
  });
};

const withModerator = async (): Promise<ActiveGroup> => {
  const group = await createActiveGroup(app);
  await appointModerator(app, group, await addMember(app, group.groupId));
  return group;
};

const statusOf = {
  request: async (id: string) =>
    (await prisma.groupJoinRequest.findUniqueOrThrow({ where: { id } })).status,
  invitation: async (id: string) =>
    (await prisma.groupInvitation.findUniqueOrThrow({ where: { id } })).status,
  offer: async (id: string) =>
    (await prisma.groupOwnerOffer.findUniqueOrThrow({ where: { id } })).status,
};

describe('group.expire-pending', () => {
  it('đơn xin vào quá 21 ngày thì hết hạn, phát group.join_request.decided với outcome expired', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const { requestId, applicant } = await applyTo(group.groupId);

    now = daysAfter(20);
    await expireDue();
    expect(await statusOf.request(requestId)).toBe('pending');

    now = daysAfter(21);
    expect((await expireDue()).requests).toBeGreaterThanOrEqual(1);

    expect(
      await prisma.groupJoinRequest.findUniqueOrThrow({ where: { id: requestId } }),
    ).toMatchObject({
      status: 'expired',
      decidedAt: now,
    });
    expect(await eventsFor('group.join_request.decided', 'requestId', requestId)).toMatchObject([
      {
        payload: {
          groupId: group.groupId,
          requestId,
          accountId: applicant.id,
          outcome: 'expired',
        },
      },
    ]);
  });

  it('lời mời quá 14 ngày thì hết hạn, phát group.invitation.decided với outcome expired', async () => {
    const group = await createActiveGroup(app, { mode: 'private_invite' });
    const { invitationId, invitee } = await inviteTo(group.groupId, group.owner);

    now = daysAfter(13);
    await expireDue();
    expect(await statusOf.invitation(invitationId)).toBe('pending');

    now = daysAfter(14);
    expect((await expireDue()).invitations).toBeGreaterThanOrEqual(1);

    expect(await statusOf.invitation(invitationId)).toBe('expired');
    expect(await eventsFor('group.invitation.decided', 'invitationId', invitationId)).toMatchObject(
      [
        {
          payload: {
            groupId: group.groupId,
            invitationId,
            accountId: invitee.id,
            outcome: 'expired',
          },
        },
      ],
    );
  });

  it('lời giao chủ và lời chuyển chủ quá 14 ngày thì hết hạn, phát group.owner.offer_decided với outcome expired', async () => {
    const master = await newMaster(app);
    const pendingId = await createPendingGroup(app, master);
    const lan = await newUser(app);
    const assignmentId = await offerTo(master, pendingId, lan.id);
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const transfer = await api(
      app,
      'POST',
      `/groups/${group.groupId}/owner-transfer`,
      group.owner.token,
      {
        accountId: minh.id,
      },
    );
    expect(transfer.statusCode).toBe(201);
    const transferId = transfer.json().data.id as string;

    now = daysAfter(13);
    await expireDue();
    expect(await statusOf.offer(assignmentId)).toBe('pending');
    expect(await statusOf.offer(transferId)).toBe('pending');

    now = daysAfter(14);
    expect((await expireDue()).offers).toBeGreaterThanOrEqual(2);

    expect(await statusOf.offer(assignmentId)).toBe('expired');
    expect(await statusOf.offer(transferId)).toBe('expired');
    expect(await eventsFor('group.owner.offer_decided', 'offerId', assignmentId)).toMatchObject([
      {
        payload: {
          groupId: pendingId,
          kind: 'assignment',
          toAccountId: lan.id,
          outcome: 'expired',
        },
      },
    ]);
    expect(await eventsFor('group.owner.offer_decided', 'offerId', transferId)).toMatchObject([
      {
        payload: {
          groupId: group.groupId,
          kind: 'transfer',
          toAccountId: minh.id,
          fromAccountId: group.owner.id,
          outcome: 'expired',
        },
      },
    ]);
    expect((await repositories.group.findGroup(pendingId))?.state).toBe('pending_owner');
    expect((await repositories.group.findMember(group.groupId, group.owner.id))?.role).toBe(
      'owner',
    );
  });

  it('chạy lại lần hai cùng lúc không đổi gì và không phát thêm sự kiện nào', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    await applyTo(group.groupId);
    await inviteTo(group.groupId, group.owner);
    const master = await newMaster(app);
    const pendingId = await createPendingGroup(app, master);
    await offerTo(master, pendingId, (await newUser(app)).id);

    now = daysAfter(21);
    expect(await expireDue()).toMatchObject({
      requests: expect.any(Number),
      invitations: expect.any(Number),
      offers: expect.any(Number),
    });
    const before = (await outboxEvents()).length;

    expect(await expireDue()).toEqual({ requests: 0, invitations: 0, offers: 0 });
    expect(await outboxEvents()).toHaveLength(before);
  });
});

describe('group.ownerless-timeout', () => {
  it('chỉ khoá nhóm thiếu chủ quá 30 ngày, phát group.state.locked với cause ownerless_timeout', async () => {
    const longest = await withModerator();
    const recent = await withModerator();
    const active = await withModerator();
    await makeOwnerless(longest);
    now = daysAfter(5);
    await makeOwnerless(recent);

    now = daysAfter(29);
    const early = await app.modules.group.lockOwnerlessTimedOut();
    expect(early).not.toContain(longest.groupId);
    expect(early).not.toContain(recent.groupId);

    now = daysAfter(31);
    const locked = await app.modules.group.lockOwnerlessTimedOut();

    expect(locked).toContain(longest.groupId);
    expect(locked).not.toContain(recent.groupId);
    expect(locked).not.toContain(active.groupId);
    expect(await repositories.group.findGroup(longest.groupId)).toMatchObject({
      state: 'locked',
      lockCause: 'ownerless_timeout',
      lockedAt: now,
    });
    expect((await repositories.group.findGroup(recent.groupId))?.state).toBe('ownerless');
    expect((await repositories.group.findGroup(active.groupId))?.state).toBe('active');
    expect(await eventsFor('group.state.locked', 'groupId', longest.groupId)).toMatchObject([
      { payload: { groupId: longest.groupId, cause: 'ownerless_timeout' } },
    ]);
    expect(await eventsFor('group.state.locked', 'groupId', recent.groupId)).toEqual([]);
  });
});
