import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/actor.js';
import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { createOutboxDispatcher } from '../src/common/outbox/dispatcher.js';
import { registerGroupListeners } from '../src/modules/group/group.events.js';
import { createGroupService } from '../src/modules/group/group.service.js';
import { outboxEvents, prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  type TestUser,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createPendingGroup,
  createUnit,
  deliverAll,
  newMaster,
  newUser,
  seedTier,
} from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { tokenFor } from './ops-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec `group-roles` và phần chủ nhóm của `identity/account-deletion`. Khoá / mở khoá / xoá tài khoản đi qua route
 * thật của `identity` rồi bộ phát outbox thật, vì thiếu chủ chỉ xảy ra khi `group` nghe được sự kiện đó.
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MISSING_ACCOUNT = '00000000-0000-7000-8000-00000000abcd';

/** Spec đếm ngày từ 1: ngày thứ 1 là hôm lời giao gửi đi, hay hôm nhóm bắt đầu thiếu chủ (TEST_NOW). */
const onDay = (n: number): Date => new Date(TEST_NOW.getTime() + (n - 1) * DAY_MS);
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

/** Bộ phát nhận lô 100 sự kiện: lặp tới khi cạn để sự kiện của ca này chắc chắn tới bên nghe. */
const deliver = async (): Promise<void> => {
  const { published, failed } = await dispatcher.runOnce();
  expect(failed).toBe(0);
  if (published > 0) await deliver();
};

/** Phiên mới theo đồng hồ hiện tại: phiên cũ bị thu hồi lúc khoá, hoặc đã quá 30 ngày khi đồng hồ chạy xa. */
const fresh = async (user: TestUser): Promise<TestUser> => ({
  ...user,
  token: await tokenFor(app, user.id, {}, now),
});

const lockAccount = async (master: TestUser, accountId: string): Promise<void> => {
  const { token } = await fresh(master);
  const res = await api(app, 'POST', `/ops/accounts/${accountId}/lock`, token, {
    reason: 'Vi phạm quy định',
  });
  expect(res.statusCode).toBe(204);
  await deliver();
};

const unlockAccount = async (master: TestUser, accountId: string): Promise<void> => {
  const { token } = await fresh(master);
  const res = await api(app, 'POST', `/ops/accounts/${accountId}/unlock`, token);
  expect(res.statusCode).toBe(204);
  await deliver();
};

const groupRow = async (groupId: string) => {
  const group = await repositories.group.findGroup(groupId);
  if (!group) throw new Error(`Không thấy nhóm ${groupId}`);
  return group;
};

const roleOf = async (groupId: string, accountId: string) =>
  (await repositories.group.findMember(groupId, accountId))?.role ?? null;

const offerOwner = (master: TestUser, groupId: string, accountId: string) =>
  api(app, 'POST', `/ops/groups/${groupId}/owner-offers`, master.token, { accountId });

const transfer = (owner: TestUser, groupId: string, accountId: string) =>
  api(app, 'POST', `/groups/${groupId}/owner-transfer`, owner.token, { accountId });

// Người nhận vai ở T1 như dữ liệu nền: file này kiểm luật vai, luật mức tin cậy ở `trust-roles.http.test.ts`.
const acceptOffer = async (user: TestUser, offerId: string) => {
  await seedTier(user.id);
  return api(app, 'POST', `/group-owner-offers/${offerId}/accept`, user.token);
};

const declineOffer = (user: TestUser, offerId: string) =>
  api(app, 'POST', `/group-owner-offers/${offerId}/decline`, user.token);

const appoint = async (
  actor: TestUser,
  groupId: string,
  accountId: string,
  unitId: string | null,
) => {
  await seedTier(accountId);
  return api(app, 'PUT', `/groups/${groupId}/moderators/${accountId}`, actor.token, { unitId });
};

const deleteMe = (user: TestUser) => api(app, 'DELETE', '/me', user.token);

const accountStatus = async (accountId: string) =>
  (await repositories.identity.findAccountById(accountId))?.status;

const offerIdOf = (res: LightMyRequestResponse): string => {
  expect(res.statusCode).toBe(201);
  return res.json().data.id as string;
};

const expectError = (res: LightMyRequestResponse, status: number, code: string): void => {
  expect(res.statusCode).toBe(status);
  expect(res.json().error.code).toBe(code);
};

interface OwnerlessGroup extends ActiveGroup {
  moderator: TestUser;
}

/** Nhóm có một điều hành viên cả nhóm, rồi tài khoản chủ bị khoá qua luồng thật. */
async function ownerlessGroup(): Promise<OwnerlessGroup> {
  const group = await createActiveGroup(app);
  const moderator = await addMember(app, group.groupId);
  await appointModerator(app, group, moderator);
  await lockAccount(group.master, group.owner.id);
  expect((await groupRow(group.groupId)).state).toBe('ownerless');
  return { ...group, moderator };
}

describe('Master giao chủ nhóm lần đầu', () => {
  it('Người được giao đồng ý', async () => {
    const master = await newMaster(app);
    const groupId = await createPendingGroup(app, master);
    const lan = await newUser(app);

    const res = await acceptOffer(lan, offerIdOf(await offerOwner(master, groupId, lan.id)));

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      id: groupId,
      state: 'active',
      membership: { role: 'owner', joinedVia: 'assigned' },
    });
    expect(await repositories.group.findMember(groupId, lan.id)).toMatchObject({
      role: 'owner',
      joinedVia: 'assigned',
    });
    expect((await groupRow(groupId)).state).toBe('active');
  });

  it('Chưa đồng ý', async () => {
    const master = await newMaster(app);
    const groupId = await createPendingGroup(app, master);
    const lan = await newUser(app);
    offerIdOf(await offerOwner(master, groupId, lan.id));

    const outsider = await newUser(app);
    expectError(
      await api(app, 'POST', `/groups/${groupId}/join`, outsider.token, {}),
      409,
      'GROUP_STATE_CONFLICT',
    );
    expectError(
      await api(app, 'POST', `/groups/${groupId}/join`, lan.token, {}),
      409,
      'GROUP_STATE_CONFLICT',
    );
    expect((await groupRow(groupId)).state).toBe('pending_owner');
    expect((await repositories.group.countMembers([groupId])).get(groupId) ?? 0).toBe(0);
  });

  it('Người được giao từ chối', async () => {
    const master = await newMaster(app);
    const groupId = await createPendingGroup(app, master);
    const lan = await newUser(app);

    const declined = await declineOffer(lan, offerIdOf(await offerOwner(master, groupId, lan.id)));
    expect(declined.statusCode).toBe(204);
    expect((await groupRow(groupId)).state).toBe('pending_owner');

    const minh = await newUser(app);
    const accepted = await acceptOffer(minh, offerIdOf(await offerOwner(master, groupId, minh.id)));
    expect(accepted.statusCode).toBe(200);
    expect(await roleOf(groupId, minh.id)).toBe('owner');
    expect(await roleOf(groupId, lan.id)).toBeNull();
  });

  it('Đồng ý lời giao đã quá hạn', async () => {
    const master = await newMaster(app);
    const groupId = await createPendingGroup(app, master);
    const lan = await newUser(app);
    const offerId = offerIdOf(await offerOwner(master, groupId, lan.id));

    now = onDay(15);
    expectError(await acceptOffer(lan, offerId), 409, 'INVITATION_EXPIRED');
    expect((await groupRow(groupId)).state).toBe('pending_owner');
    expect(await roleOf(groupId, lan.id)).toBeNull();
  });

  it('Người dùng thử giao chủ', async () => {
    const master = await newMaster(app);
    const groupId = await createPendingGroup(app, master);
    const user = await newUser(app);
    const lan = await newUser(app);

    expectError(await offerOwner(user, groupId, lan.id), 403, 'FORBIDDEN');
    expect(await repositories.group.findPendingOffer(groupId)).toBeNull();
  });

  it('Tài khoản không tồn tại', async () => {
    const master = await newMaster(app);
    const groupId = await createPendingGroup(app, master);

    expectError(await offerOwner(master, groupId, MISSING_ACCOUNT), 404, 'NOT_FOUND');
    expect(await repositories.group.findPendingOffer(groupId)).toBeNull();
  });
});

describe('Chuyển nhượng chủ nhóm', () => {
  it('Người nhận đồng ý trong hạn', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const offerId = offerIdOf(await transfer(group.owner, group.groupId, minh.id));

    now = onDay(3);
    const res = await acceptOffer(minh, offerId);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.membership.role).toBe('owner');
    expect(await roleOf(group.groupId, minh.id)).toBe('owner');
    expect(await repositories.group.findMember(group.groupId, group.owner.id)).toMatchObject({
      role: 'member',
      moderatorUnitId: null,
    });
  });

  it('Người nhận đồng ý quá hạn', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const offerId = offerIdOf(await transfer(group.owner, group.groupId, minh.id));

    now = onDay(15);
    expectError(await acceptOffer(minh, offerId), 409, 'INVITATION_EXPIRED');
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
    expect(await roleOf(group.groupId, minh.id)).toBe('member');
  });

  it('Người nhận từ chối', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const offerId = offerIdOf(await transfer(group.owner, group.groupId, minh.id));

    expect((await declineOffer(minh, offerId)).statusCode).toBe(204);
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
    expect(await roleOf(group.groupId, minh.id)).toBe('member');
  });

  it('Chuyển cho người ngoài nhóm', async () => {
    const group = await createActiveGroup(app);
    const outsider = await newUser(app);

    expectError(await transfer(group.owner, group.groupId, outsider.id), 409, 'NOT_GROUP_MEMBER');
    expect(await repositories.group.findPendingOffer(group.groupId)).toBeNull();
  });

  it('Huỷ lời chuyển', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const offerId = offerIdOf(await transfer(group.owner, group.groupId, minh.id));

    const cancelled = await api(
      app,
      'DELETE',
      `/groups/${group.groupId}/owner-transfer`,
      group.owner.token,
    );
    expect(cancelled.statusCode).toBe(204);
    expectError(await acceptOffer(minh, offerId), 409, 'GROUP_STATE_CONFLICT');
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
    expect(await roleOf(group.groupId, minh.id)).toBe('member');
  });

  it('Điều hành viên thử chuyển chủ', async () => {
    const group = await createActiveGroup(app);
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    const minh = await addMember(app, group.groupId);

    expectError(await transfer(moderator, group.groupId, minh.id), 403, 'FORBIDDEN');
    expect(await repositories.group.findPendingOffer(group.groupId)).toBeNull();
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
  });
});

describe('Bổ nhiệm và bãi nhiệm điều hành viên', () => {
  it('Bổ nhiệm phụ trách một lớp', async () => {
    const group = await createActiveGroup(app);
    const unitId = await createUnit(app, group, '12A1');
    const binh = await addMember(app, group.groupId);

    const res = await appoint(group.owner, group.groupId, binh.id, unitId);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      accountId: binh.id,
      role: 'moderator',
      moderatorUnitId: unitId,
    });
    const view = await api(app, 'GET', `/groups/${group.groupId}`, binh.token);
    expect(view.json().data.membership).toMatchObject({
      role: 'moderator',
      moderatorUnitId: unitId,
    });
  });

  it('Bổ nhiệm người ngoài nhóm', async () => {
    const group = await createActiveGroup(app);
    const outsider = await newUser(app);

    expectError(
      await appoint(group.owner, group.groupId, outsider.id, null),
      409,
      'NOT_GROUP_MEMBER',
    );
    expect(await roleOf(group.groupId, outsider.id)).toBeNull();
  });

  it('Đơn vị con không thuộc nhóm', async () => {
    const group = await createActiveGroup(app);
    const other = await createActiveGroup(app);
    const foreignUnit = await createUnit(app, other, '12A1');
    const binh = await addMember(app, group.groupId);

    expectError(await appoint(group.owner, group.groupId, binh.id, foreignUnit), 404, 'NOT_FOUND');
    expect(await roleOf(group.groupId, binh.id)).toBe('member');
  });

  it('Điều hành viên thử bổ nhiệm', async () => {
    const group = await createActiveGroup(app);
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    const binh = await addMember(app, group.groupId);

    expectError(await appoint(moderator, group.groupId, binh.id, null), 403, 'FORBIDDEN');
    expect(await roleOf(group.groupId, binh.id)).toBe('member');
  });

  it('Bãi nhiệm', async () => {
    const group = await createActiveGroup(app);
    const binh = await addMember(app, group.groupId);
    await appointModerator(app, group, binh);
    const members = () => api(app, 'GET', `/groups/${group.groupId}/members`, binh.token);
    expect((await members()).statusCode).toBe(200);

    const res = await api(
      app,
      'DELETE',
      `/groups/${group.groupId}/moderators/${binh.id}`,
      group.owner.token,
    );

    expect(res.statusCode).toBe(204);
    expect(await repositories.group.findMember(group.groupId, binh.id)).toMatchObject({
      role: 'member',
      moderatorUnitId: null,
    });
    expectError(await members(), 403, 'FORBIDDEN');
  });
});

describe('Tài khoản bị khoá tạm mất vai', () => {
  it('Điều hành viên bị khoá rồi mở khoá', async () => {
    const group = await createActiveGroup(app);
    const unitId = await createUnit(app, group, '12A1');
    const binh = await addMember(app, group.groupId, { unitId });
    await appointModerator(app, group, binh, unitId);
    const members = (token: string) =>
      api(app, 'GET', `/groups/${group.groupId}/members?unitId=${unitId}`, token);

    await lockAccount(group.master, binh.id);
    // Vai không bị xoá khỏi dòng thành viên: mất vai nghĩa là không còn phiên nào làm được việc của vai.
    expect((await members(binh.token)).statusCode).toBe(401);
    expectError(await members((await fresh(binh)).token), 403, 'ACCOUNT_LOCKED');

    await unlockAccount(group.master, binh.id);
    const back = await fresh(binh);
    const view = await api(app, 'GET', `/groups/${group.groupId}`, back.token);
    expect(view.json().data.membership).toMatchObject({
      role: 'moderator',
      moderatorUnitId: unitId,
    });
    expect((await members(back.token)).statusCode).toBe(200);
  });

  it('Giao vai cho tài khoản đang bị khoá', async () => {
    const master = await newMaster(app);
    const pendingId = await createPendingGroup(app, master);
    const lan = await newUser(app);
    await lockAccount(master, lan.id);

    const offer = await offerOwner(master, pendingId, lan.id);
    expectError(offer, 409, 'GROUP_ROLE_INELIGIBLE');
    expect(offer.json().error.message).toContain('tài khoản đang bị khoá');
    expect(await repositories.group.findPendingOffer(pendingId)).toBeNull();

    const group = await createActiveGroup(app);
    const binh = await addMember(app, group.groupId);
    await lockAccount(group.master, binh.id);
    const appointed = await appoint(group.owner, group.groupId, binh.id, null);
    expectError(appointed, 409, 'GROUP_ROLE_INELIGIBLE');
    expect(appointed.json().error.message).toContain('tài khoản đang bị khoá');
    expect(await roleOf(group.groupId, binh.id)).toBe('member');
  });
});

describe('Chủ nhóm bị khoá thì nhóm thiếu chủ', () => {
  it('Chủ nhóm bị khoá', async () => {
    const group = await createActiveGroup(app);
    const unitId = await createUnit(app, group, '12A1');
    // Điều hành viên đơn vị nhận vai sớm nhất vẫn thua điều hành viên cả nhóm; giữa hai người cả nhóm, ai sớm hơn thắng.
    const unitModerator = await addMember(app, group.groupId, { unitId });
    await appointModerator(app, group, unitModerator, unitId);
    now = new Date(TEST_NOW.getTime() + HOUR_MS);
    const senior = await addMember(app, group.groupId);
    await appointModerator(app, group, senior);
    now = new Date(TEST_NOW.getTime() + 2 * HOUR_MS);
    const junior = await addMember(app, group.groupId);
    await appointModerator(app, group, junior);

    await lockAccount(group.master, group.owner.id);

    const ops = await api(app, 'GET', `/ops/groups/${group.groupId}`, group.master.token);
    expect(ops.json().data).toMatchObject({
      state: 'ownerless',
      nomineeId: senior.id,
      ownerlessSince: now.toISOString(),
    });
    // Đề cử chưa phải chủ: master còn phải xác nhận và người đó còn phải đồng ý.
    expect(await roleOf(group.groupId, senior.id)).toBe('moderator');
    expect((await api(app, 'GET', `/groups/${group.groupId}`, group.owner.token)).statusCode).toBe(
      401,
    );
    const started = (await outboxEvents()).filter(
      (event) => event.type === 'group.ownerless.started',
    );
    expect(started.map((event) => event.payload)).toContainEqual({
      groupId: group.groupId,
      nomineeId: senior.id,
    });
  });

  it('Chỉ còn điều hành viên đơn vị con', async () => {
    const group = await createActiveGroup(app);
    const unitId = await createUnit(app, group, '12A1');
    const unitModerator = await addMember(app, group.groupId, { unitId });
    await appointModerator(app, group, unitModerator, unitId);

    await lockAccount(group.master, group.owner.id);

    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'ownerless',
      lockCause: null,
      lockedAt: null,
      nomineeId: unitModerator.id,
    });
  });

  it('Master chọn người khác đề cử', async () => {
    const group = await ownerlessGroup();
    const minh = await addMember(app, group.groupId);

    const offerId = offerIdOf(await offerOwner(group.master, group.groupId, minh.id));
    expect((await acceptOffer(minh, offerId)).statusCode).toBe(200);

    expect(await roleOf(group.groupId, minh.id)).toBe('owner');
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'active',
      nomineeId: null,
      ownerlessSince: null,
    });
  });

  it('Master xác nhận chủ mới', async () => {
    const group = await ownerlessGroup();

    const offerId = offerIdOf(await offerOwner(group.master, group.groupId, group.moderator.id));
    expect((await acceptOffer(group.moderator, offerId)).statusCode).toBe(200);

    expect(await roleOf(group.groupId, group.moderator.id)).toBe('owner');
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'active',
      nomineeId: null,
      ownerlessSince: null,
    });
  });

  it('Người không phải master thử xác nhận', async () => {
    const group = await ownerlessGroup();
    const self = group.moderator;

    expectError(await offerOwner(self, group.groupId, self.id), 403, 'FORBIDDEN');
    expectError(await transfer(self, group.groupId, self.id), 403, 'FORBIDDEN');

    expect((await groupRow(group.groupId)).state).toBe('ownerless');
    expect(await roleOf(group.groupId, self.id)).toBe('moderator');
    expect(await repositories.group.findPendingOffer(group.groupId)).toBeNull();
  });
});

describe('Chủ cũ trở lại khi được mở khoá trước', () => {
  it('Mở khoá chủ cũ', async () => {
    const group = await ownerlessGroup();

    now = onDay(10);
    await unlockAccount(group.master, group.owner.id);

    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'active',
      nomineeId: null,
      ownerlessSince: null,
    });
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
    expect(await roleOf(group.groupId, group.moderator.id)).toBe('moderator');
  });

  it('lượt khoá chủ được xử lại sau khi mở khoá: nhóm vẫn có chủ cũ, không đề cử (fix-audit-listeners)', async () => {
    const group = await ownerlessGroup();
    await unlockAccount(group.master, group.owner.id);
    await prisma.outboxEvent.create({
      data: { type: 'identity.account.locked', payload: { accountId: group.owner.id } },
    });
    await deliver();

    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'active',
      nomineeId: null,
      ownerlessSince: null,
    });
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
  });

  it('Xác nhận đề cử đã bị huỷ', async () => {
    const group = await ownerlessGroup();
    const offerId = offerIdOf(await offerOwner(group.master, group.groupId, group.moderator.id));

    await unlockAccount(group.master, group.owner.id);

    expectError(await acceptOffer(group.moderator, offerId), 409, 'GROUP_STATE_CONFLICT');
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
    expect(await roleOf(group.groupId, group.moderator.id)).toBe('moderator');
    expect((await groupRow(group.groupId)).state).toBe('active');
  });
});

describe('Thiếu chủ không quá 30 ngày', () => {
  it('Quá 30 ngày', async () => {
    const group = await ownerlessGroup();

    now = daysAfter(31);
    expect(await app.modules.group.lockOwnerlessTimedOut()).toContain(group.groupId);

    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'locked',
      lockCause: 'ownerless_timeout',
    });
  });

  it('Có chủ trong hạn', async () => {
    const group = await ownerlessGroup();

    now = onDay(29);
    const offerId = offerIdOf(await offerOwner(group.master, group.groupId, group.moderator.id));
    expect((await acceptOffer(group.moderator, offerId)).statusCode).toBe(200);

    now = daysAfter(31);
    expect(await app.modules.group.lockOwnerlessTimedOut()).not.toContain(group.groupId);
    expect(await groupRow(group.groupId)).toMatchObject({ state: 'active', lockCause: null });
    expect(await roleOf(group.groupId, group.moderator.id)).toBe('owner');
  });

  it('Điều hành viên cuối cùng rời nhóm', async () => {
    const group = await ownerlessGroup();

    const res = await api(app, 'POST', `/groups/${group.groupId}/leave`, group.moderator.token);

    expect(res.statusCode).toBe(204);
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'locked',
      lockCause: 'no_moderators',
    });
  });

  it('Nhóm không có điều hành viên nào', async () => {
    const group = await createActiveGroup(app);
    await addMember(app, group.groupId);

    await lockAccount(group.master, group.owner.id);

    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'locked',
      lockCause: 'no_moderators',
    });
  });
});

describe('Việc hằng ngày trong lúc thiếu chủ', () => {
  it('Duyệt đơn khi thiếu chủ', async () => {
    const group = await ownerlessGroup();
    const applicant = await newUser(app);
    const applied = await api(app, 'POST', `/groups/${group.groupId}/join`, applicant.token, {});
    expect(applied.statusCode).toBe(201);

    const res = await api(
      app,
      'POST',
      `/group-join-requests/${applied.json().data.request.id as string}/decision`,
      group.moderator.token,
      { approve: true },
    );

    expect(res.statusCode).toBe(200);
    expect(await repositories.group.findMember(group.groupId, applicant.id)).toMatchObject({
      role: 'member',
      joinedVia: 'approved',
    });
  });

  it('Bổ nhiệm khi thiếu chủ', async () => {
    const group = await ownerlessGroup();
    const binh = await addMember(app, group.groupId);

    const res = await appoint(group.moderator, group.groupId, binh.id, null);

    expectError(res, 403, 'FORBIDDEN');
    expect(await roleOf(group.groupId, binh.id)).toBe('member');
  });

  it('Đổi cài đặt khi thiếu chủ', async () => {
    const group = await ownerlessGroup();

    const res = await api(
      app,
      'PATCH',
      `/groups/${group.groupId}/settings`,
      group.moderator.token,
      { mode: 'public_open' },
    );

    expectError(res, 403, 'FORBIDDEN');
    expect((await groupRow(group.groupId)).mode).toBe('public_review');
  });

  it('Master đổi chế độ khi thiếu chủ', async () => {
    const group = await ownerlessGroup();

    const res = await api(app, 'PATCH', `/groups/${group.groupId}/settings`, group.master.token, {
      mode: 'public_open',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.mode).toBe('public_open');
    expect(await groupRow(group.groupId)).toMatchObject({
      mode: 'public_open',
      state: 'ownerless',
    });
  });
});

// Bộ đếm tin "nhóm công khai" giả: đường duy nhất để biết lượt đổi chế độ có đi qua trạng thái chuyển hay không.
const counting = (count: number) =>
  createGroupService({
    repository: repositories.group,
    identity: app.modules.identity,
    config: createStaticRuntimeConfig(),
    clock: () => TEST_NOW,
    publicListings: { countInGroup: () => Promise.resolve(count) },
  });
const masterOf = (group: OwnerlessGroup): Actor => ({
  accountId: group.master.id,
  role: 'master',
  sessionId: group.master.id,
  secondFactorAt: TEST_NOW,
  emailVerified: true,
});

describe('Nhóm thiếu chủ không bắt đầu chuyển sang riêng tư (fix-audit-stuck-data, C10)', () => {
  it('còn tin "nhóm công khai": 409 GROUP_OWNER_REQUIRED, nhóm vẫn thiếu chủ, không có sự kiện riêng tư hoá', async () => {
    const group = await ownerlessGroup();
    const before = await groupRow(group.groupId);
    await expect(
      counting(1).updateSettings(masterOf(group), group.groupId, { mode: 'private_code' }),
    ).rejects.toMatchObject({ code: 'GROUP_OWNER_REQUIRED' });
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'ownerless',
      mode: before.mode,
      targetMode: null,
      ownerlessSince: before.ownerlessSince,
    });
    const started = (await outboxEvents()).filter(
      (event) =>
        event.type === 'group.privatization.started' &&
        (event.payload as { groupId: string }).groupId === group.groupId,
    );
    expect(started).toEqual([]);
  });

  it('không còn tin "nhóm công khai": đổi chế độ ngay, nhóm vẫn thiếu chủ', async () => {
    const group = await ownerlessGroup();
    const result = await counting(0).updateSettings(masterOf(group), group.groupId, {
      mode: 'private_code',
    });
    expect(result.mode).toBe('private_code');
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'ownerless',
      mode: 'private_code',
    });
  });
});

describe('Master giao chủ mới cho nhóm đang có chủ', () => {
  it('Master giao đè', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);

    const offerId = offerIdOf(await offerOwner(group.master, group.groupId, minh.id));
    expect((await acceptOffer(minh, offerId)).statusCode).toBe(200);

    expect(await roleOf(group.groupId, minh.id)).toBe('owner');
    expect(await repositories.group.findMember(group.groupId, group.owner.id)).toMatchObject({
      role: 'member',
      moderatorUnitId: null,
    });
  });
});

describe('Khoá do hệ thống tự mở khi nhóm có chủ', () => {
  it('Chủ cũ được mở khoá sau khi nhóm đã khoá', async () => {
    const group = await ownerlessGroup();
    now = daysAfter(31);
    await app.modules.group.lockOwnerlessTimedOut();
    expect((await groupRow(group.groupId)).state).toBe('locked');

    await unlockAccount(group.master, group.owner.id);

    expect(await groupRow(group.groupId)).toMatchObject({ state: 'active', lockCause: null });
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
  });

  it('Người nhận lời giao của master', async () => {
    const group = await ownerlessGroup();
    const minh = await addMember(app, group.groupId);
    now = daysAfter(31);
    await app.modules.group.lockOwnerlessTimedOut();
    expect((await groupRow(group.groupId)).state).toBe('locked');

    const master = await fresh(group.master);
    const offerId = offerIdOf(await offerOwner(master, group.groupId, minh.id));
    expect((await acceptOffer(await fresh(minh), offerId)).statusCode).toBe(200);

    expect(await roleOf(group.groupId, minh.id)).toBe('owner');
    expect(await groupRow(group.groupId)).toMatchObject({ state: 'active', lockCause: null });
  });

  it('khoá vì hết điều hành viên cũng tự mở khi chủ cũ được mở khoá', async () => {
    const group = await createActiveGroup(app);
    await lockAccount(group.master, group.owner.id);
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'locked',
      lockCause: 'no_moderators',
    });

    await unlockAccount(group.master, group.owner.id);

    expect(await groupRow(group.groupId)).toMatchObject({ state: 'active', lockCause: null });
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
  });

  it('Nhóm do master khoá', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const locked = await api(app, 'POST', `/ops/groups/${group.groupId}/lock`, group.master.token, {
      reason: 'Đăng nội dung vi phạm',
    });
    expect(locked.statusCode).toBe(204);

    const offerId = offerIdOf(await offerOwner(group.master, group.groupId, minh.id));
    expect((await acceptOffer(minh, offerId)).statusCode).toBe(200);

    expect(await roleOf(group.groupId, minh.id)).toBe('owner');
    expect(await groupRow(group.groupId)).toMatchObject({ state: 'locked', lockCause: 'master' });
  });
});

describe('Chủ nhóm phải chuyển chủ trước khi xoá tài khoản', () => {
  it('Chủ nhóm xin xoá tài khoản', async () => {
    const group = await createActiveGroup(app);

    const res = await deleteMe(group.owner);

    expectError(res, 409, 'ACCOUNT_DELETE_BLOCKED');
    expect(res.json().error.message).toContain('chủ nhóm');
    expect(await accountStatus(group.owner.id)).toBe('active');
  });

  it('Lời chuyển chủ chưa được nhận', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    offerIdOf(await transfer(group.owner, group.groupId, minh.id));

    const res = await deleteMe(group.owner);

    expectError(res, 409, 'ACCOUNT_DELETE_BLOCKED');
    expect(res.json().error.message).toContain('chủ nhóm');
    expect(await accountStatus(group.owner.id)).toBe('active');
  });

  it('Đã chuyển chủ xong', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const offerId = offerIdOf(await transfer(group.owner, group.groupId, minh.id));
    expect((await acceptOffer(minh, offerId)).statusCode).toBe(200);

    expect((await deleteMe(group.owner)).statusCode).toBe(204);
    expect(await accountStatus(group.owner.id)).toBe('deleted');
  });

  it('tài khoản bị xoá rời mọi nhóm khi identity.account.deleted tới group', async () => {
    const first = await createActiveGroup(app);
    const second = await createActiveGroup(app, { mode: 'public_open' });
    const member = await addMember(app, first.groupId);
    const joined = await api(app, 'POST', `/groups/${second.groupId}/join`, member.token, {});
    expect(joined.statusCode).toBe(201);

    expect((await deleteMe(member)).statusCode).toBe(204);
    await deliver();

    expect(await roleOf(first.groupId, member.id)).toBeNull();
    expect(await roleOf(second.groupId, member.id)).toBeNull();
    const left = (await outboxEvents()).filter((event) => event.type === 'group.member.left');
    expect(left.map((event) => event.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupId: first.groupId,
          accountId: member.id,
          reason: 'account_deleted',
        }),
        expect.objectContaining({
          groupId: second.groupId,
          accountId: member.id,
          reason: 'account_deleted',
        }),
      ]),
    );
  });
});

const ownerActor = (group: ActiveGroup): Actor => ({
  accountId: group.owner.id,
  role: 'user',
  sessionId: group.owner.id,
  secondFactorAt: null,
  emailVerified: true,
});

/** Sự kiện "đã xử" (đơn, lời giao chủ) của một nhóm — bộ đếm và thông báo đọc theo nó. */
const decided = async (type: string, groupId: string) =>
  (await outboxEvents())
    .filter((event) => event.type === type)
    .map((event) => event.payload as Record<string, unknown>)
    .filter((payload) => payload.groupId === groupId);

describe('Chủ nhóm mất tài khoản giữa chừng (fix-audit-group-low)', () => {
  it('L4: chủ bị khoá lúc nhóm đang chuyển sang riêng tư → chuyển xong rồi mới thiếu chủ, đề cử điều hành viên', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    await counting(1).updateSettings(ownerActor(group), group.groupId, { mode: 'private_code' });

    await lockAccount(group.master, group.owner.id);
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'going_private',
      targetMode: 'private_code',
    });

    await app.modules.group.completePrivatization(group.groupId);
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'ownerless',
      mode: 'private_code',
      targetMode: null,
      nomineeId: moderator.id,
    });
  });

  it('L4: chủ bị khoá lúc đang chuyển, nhóm không có điều hành viên → chuyển xong rồi tạm khoá', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    await counting(1).updateSettings(ownerActor(group), group.groupId, { mode: 'private_invite' });
    await lockAccount(group.master, group.owner.id);

    await app.modules.group.completePrivatization(group.groupId);
    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'locked',
      lockCause: 'no_moderators',
      mode: 'private_invite',
      targetMode: null,
    });
  });

  it('L3: tài khoản chủ bị xoá (lượt xoá chen lượt nhận làm chủ) → nhóm thiếu chủ như chủ bị khoá', async () => {
    const group = await createActiveGroup(app);
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    // Lượt kiểm "còn làm chủ nhóm nào" đã qua trước khi lượt nhận làm chủ commit: ghi xoá thẳng như lượt đó.
    await repositories.identity.softDeleteAccount({
      accountId: group.owner.id,
      at: now,
      events: [{ type: 'identity.account.deleted', payload: { accountId: group.owner.id } }],
    });
    await deliver();

    expect(await groupRow(group.groupId)).toMatchObject({
      state: 'ownerless',
      nomineeId: moderator.id,
    });
  });
});

describe('Huỷ kèm theo vẫn phát sự kiện (fix-audit-group-low, L5)', () => {
  it('người chưa là thành viên nhận lời giao chủ: đơn chờ của họ huỷ kèm sự kiện "đã vào"', async () => {
    const group = await createActiveGroup(app, { mode: 'public_review' });
    const lan = await newUser(app);
    const joined = await api(app, 'POST', `/groups/${group.groupId}/join`, lan.token, {});
    expect(joined.json().data).toMatchObject({ result: 'request' });
    const offerId = offerIdOf(await offerOwner(group.master, group.groupId, lan.id));

    expect((await acceptOffer(lan, offerId)).statusCode).toBe(200);
    expect(await roleOf(group.groupId, lan.id)).toBe('owner');
    expect(await decided('group.join_request.decided', group.groupId)).toEqual([
      expect.objectContaining({ accountId: lan.id, outcome: 'cancelled', reason: 'joined' }),
    ]);
  });

  it('nhóm tạm khoá vì không còn ai giữ: lời chuyển chủ đang chờ huỷ kèm sự kiện', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const offerId = offerIdOf(await transfer(group.owner, group.groupId, minh.id));

    await lockAccount(group.master, group.owner.id);
    expect(await groupRow(group.groupId)).toMatchObject({ state: 'locked' });
    // Lời giao chủ lần đầu (master, đã nhận) của nhóm cũng có sự kiện "đã xử" — chỉ xét lượt huỷ.
    const cancelled = (await decided('group.owner.offer_decided', group.groupId)).filter(
      (payload) => payload.outcome === 'cancelled',
    );
    expect(cancelled).toEqual([expect.objectContaining({ offerId, kind: 'transfer' })]);
  });
});

describe('Nhận làm chủ khi đang bị cấm', () => {
  it('Master giao chủ cho người đang bị cấm: lệnh cấm được gỡ như gỡ cấm, tin của người đó hết lý do "bị cấm"', async () => {
    const group = await createActiveGroup(app);
    const minh = await addMember(app, group.groupId);
    const listing = await seedListing(
      liveListing(minh.id, await seedCategory(), {
        placement: 'members_only',
        groupId: group.groupId,
      }),
    );
    const hideReasons = async () =>
      (await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).hideReasons;
    const banned = await api(
      app,
      'PUT',
      `/groups/${group.groupId}/bans/${minh.id}`,
      group.owner.token,
    );
    expect(banned.statusCode, banned.body).toBe(204);
    // Bộ phát của app: có cả bên nghe của `listing` (bộ phát riêng của file này chỉ nghe `group`).
    await deliverAll(app);
    expect(await hideReasons()).toContain('group_banned');

    const offerId = offerIdOf(await offerOwner(group.master, group.groupId, minh.id));
    expect((await acceptOffer(minh, offerId)).statusCode).toBe(200);
    await deliverAll(app);

    expect(await roleOf(group.groupId, minh.id)).toBe('owner');
    expect(await repositories.group.isBanned(group.groupId, minh.id)).toBe(false);
    expect(
      (await outboxEvents()).filter(
        (event) =>
          event.type === 'group.ban.lifted' &&
          (event.payload as { accountId?: string }).accountId === minh.id,
      ),
    ).toHaveLength(1);
    expect(await hideReasons()).not.toContain('group_banned');
  });
});
