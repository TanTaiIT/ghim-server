import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createUnit,
  deliverAll,
  newMaster,
  newUser,
  seedTier,
  type TestUser,
} from './group-helpers.js';
import {
  getOwn,
  groupSettings,
  listingApi,
  liveListingOf,
  machineHold,
  type OwnListing,
  submitted,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, grantStaff, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec review/group-escalation, delta group/group-lifecycle, group/membership và gỡ khỏi nhóm trực tiếp (design
 * add-review-queues mục 11) qua HTTP — task 6.1. Mọi lượt gửi tin của test dùng chung một mã máy, nên staff và điều
 * hành viên ở đây không đăng tin, trừ ca cố ý kiểm luật không xử tin của mình.
 */
const HOUR_MS = 3_600_000;
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
const codeOf = (res: Res) => (res.json() as { error: { code: string } }).error.code;
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;
type Decision = { decisionId: string; outcome: string; listingState: string };
const VIOLATION = { outcome: 'detach', platformViolation: true, note: 'Bán hàng giả' };

const staffOf = async (categoryIds: string[]): Promise<TestUser> => {
  const user = await newUser(app);
  await grantStaff(user.id, [], categoryIds);
  return user;
};
const taskIdOf = async (listingId: string) =>
  (await prisma.reviewTask.findFirstOrThrow({ where: { listingId, status: 'open' } })).id;
const openTasks = (listingId: string) =>
  prisma.reviewTask.findMany({ where: { listingId, status: 'open' } });
const lastTask = (listingId: string) =>
  prisma.reviewTask.findFirstOrThrow({ where: { listingId }, orderBy: { createdAt: 'desc' } });
const opsListingIds = async (user: TestUser): Promise<string[]> =>
  dataOf<{ items: { listingId: string }[] }>(
    await api(app, 'GET', '/ops/review/tasks', user.token),
  ).items.map((item) => item.listingId);
const groupListingIds = async (user: TestUser, groupId: string): Promise<string[]> =>
  dataOf<{ items: { listingId: string }[] }>(
    await api(app, 'GET', `/groups/${groupId}/review/tasks`, user.token),
  ).items.map((item) => item.listingId);

const opsClaim = (user: TestUser, taskId: string) =>
  api(app, 'POST', `/ops/review/tasks/${taskId}/claim`, user.token);
const groupClaim = (user: TestUser, groupId: string, taskId: string) =>
  api(app, 'POST', `/groups/${groupId}/review/tasks/${taskId}/claim`, user.token);
const groupDecide = (user: TestUser, groupId: string, taskId: string, body: object) =>
  api(app, 'POST', `/groups/${groupId}/review/tasks/${taskId}/decision`, user.token, body);
const detachDirectly = (user: TestUser, groupId: string, listingId: string, body: object = {}) =>
  api(app, 'POST', `/groups/${groupId}/review/listings/${listingId}/detach`, user.token, body);

async function heldBy(user: TestUser, fields: Record<string, unknown> = {}): Promise<OwnListing> {
  const held = await machineHold(app, user, await submitted(app, user, fields));
  await deliverAll(app);
  return held;
}

const inGroup = (group: ActiveGroup, categoryId: string) => ({
  placement: 'members_only',
  groupId: group.groupId,
  categoryId,
});

/** Nhóm trường: lớp 10A, 10B mỗi lớp một điều hành viên, một điều hành cả nhóm; người đăng ở 10A. */
async function school() {
  const group = await createActiveGroup(app, { master });
  const unit10a = await createUnit(app, group, `10A ${randomUUID().slice(0, 4)}`);
  const unit10b = await createUnit(app, group, `10B ${randomUUID().slice(0, 4)}`);
  const moderator = async (unitId: string | null) => {
    const user = await addMember(app, group.groupId, { unitId });
    await appointModerator(app, group, user, unitId);
    return user;
  };
  return {
    group,
    unit10a,
    mod10a: await moderator(unit10a),
    mod10b: await moderator(unit10b),
    whole: await moderator(null),
    poster: await addMember(app, group.groupId, { unitId: unit10a }),
  };
}

/** Điều hành viên nhận việc máy giữ của nhóm rồi gỡ tin khỏi nhóm kèm "trái quy định sàn". */
async function escalate(moderator: TestUser, group: ActiveGroup, listingId: string) {
  const taskId = await taskIdOf(listingId);
  const claim = await groupClaim(moderator, group.groupId, taskId);
  if (claim.statusCode !== 200) throw new Error(`Nhận việc hỏng: ${claim.body}`);
  const res = await groupDecide(moderator, group.groupId, taskId, VIOLATION);
  if (res.statusCode !== 200) throw new Error(`Chuyển lên hỏng: ${res.body}`);
  await deliverAll(app);
}

const closeGroup = async (group: ActiveGroup) => {
  const res = await api(app, 'POST', `/groups/${group.groupId}/close`, group.owner.token);
  expect(res.statusCode, res.body).toBe(204);
  await deliverAll(app);
};

describe('Điều hành nhóm chuyển tin trái quy định sàn lên staff', () => {
  it('chuyển lên: tin rời nhóm ngay, có việc hàng 4 hạn xử 72 giờ, staff danh mục thấy', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const { group, mod10a, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    await escalate(mod10a, group, held.id);
    expect((await getOwn(app, poster, held.id)).hideReasons).toContain('detached_by_group');
    const [task] = await openTasks(held.id);
    expect(task).toMatchObject({
      queue: 4,
      reasons: ['group_escalation'],
      dueAt: new Date(TEST_NOW.getTime() + 72 * HOUR_MS),
      escalatedBy: mod10a.id,
      escalationNote: 'Bán hàng giả',
    });
    expect(await opsListingIds(staff)).toContain(held.id);
  });

  it('đánh dấu "trái quy định sàn" mà bỏ trống lý do: 400, tin không đổi, không việc hàng 4', async () => {
    const category = await seedCategory();
    const { group, mod10a, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    const taskId = await taskIdOf(held.id);
    await groupClaim(mod10a, group.groupId, taskId);
    const res = await groupDecide(mod10a, group.groupId, taskId, {
      outcome: 'detach',
      platformViolation: true,
    });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect((await getOwn(app, poster, held.id)).hideReasons).toEqual([]);
    expect((await openTasks(held.id)).map((task) => task.queue)).toEqual([0]);
  });
});

describe('Staff xem việc nhóm chuyển lên', () => {
  it('staff bác: việc đóng, tin vẫn không thuộc nhóm, tài khoản người đăng không đổi', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const { group, mod10a, poster } = await school();
    await seedTier(poster.id, 'T2');
    const before = await prisma.trustTierResult.findUniqueOrThrow({
      where: { accountId: poster.id },
    });
    const held = await heldBy(poster, inGroup(group, category));
    await escalate(mod10a, group, held.id);
    const taskId = await taskIdOf(held.id);
    expect((await opsClaim(staff, taskId)).statusCode).toBe(200);
    const res = await api(app, 'POST', `/ops/review/tasks/${taskId}/decision`, staff.token, {
      outcome: 'dismiss',
      note: 'Không thấy dấu hiệu hàng giả',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<Decision>(res).outcome).toBe('dismiss');
    await deliverAll(app);
    expect(await prisma.reviewTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'decided',
    });
    expect((await getOwn(app, poster, held.id)).hideReasons).toContain('detached_by_group');
    expect(
      await prisma.trustTierResult.findUniqueOrThrow({ where: { accountId: poster.id } }),
    ).toEqual(before);
  });

  it('điều hành viên không mang quyền staff nhận việc hàng 4 bằng mã: 404', async () => {
    const category = await seedCategory();
    const { group, mod10a, whole, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    await escalate(mod10a, group, held.id);
    const res = await groupClaim(whole, group.groupId, await taskIdOf(held.id));
    expect(res.statusCode).toBe(404);
    expect(codeOf(res)).toBe('NOT_FOUND');
  });
});

describe('Quyền master chỉ ở bàn vận hành (fix-audit-security, C6)', () => {
  it('master xem, nhận việc của nhóm qua route nhóm → 404; hàng chờ nhóm → 403; ở bàn vận hành thì xử được', async () => {
    const category = await seedCategory();
    const { group, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    const taskId = await taskIdOf(held.id);

    const queue = await api(app, 'GET', `/groups/${group.groupId}/review/tasks`, master.token);
    expect(queue.statusCode).toBe(403);
    expect(codeOf(queue)).toBe('FORBIDDEN');
    const view = await api(
      app,
      'GET',
      `/groups/${group.groupId}/review/tasks/${taskId}`,
      master.token,
    );
    expect(view.statusCode).toBe(404);
    expect(codeOf(view)).toBe('NOT_FOUND');
    const claim = await groupClaim(master, group.groupId, taskId);
    expect(claim.statusCode).toBe(404);
    expect(codeOf(claim)).toBe('NOT_FOUND');
    expect(await prisma.reviewTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'open',
      claimedBy: null,
    });

    expect((await opsClaim(master, taskId)).statusCode).toBe(200);
    const res = await api(app, 'POST', `/ops/review/tasks/${taskId}/decision`, master.token, {
      outcome: 'pass',
      machineJudgment: 'machine_right',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await prisma.reviewDecision.findFirstOrThrow({ where: { taskId } })).toMatchObject({
      actorId: master.id,
      actorRole: 'master',
    });
  });
});

describe('Quyết định của điều hành nhóm chỉ có tác dụng trong nhóm', () => {
  it('gỡ khỏi nhóm và chuyển lên tin của T2: việc hàng 4 còn mở, vẫn T2, tin sàn vẫn hiện như cũ', async () => {
    const category = await seedCategory();
    const { group, mod10a, poster } = await school();
    await seedTier(poster.id, 'T2');
    const before = await prisma.trustTierResult.findUniqueOrThrow({
      where: { accountId: poster.id },
    });
    const market = await liveListingOf(app, poster, { categoryId: category });
    const held = await heldBy(poster, inGroup(group, category));
    await escalate(mod10a, group, held.id);
    expect((await openTasks(held.id))[0]?.queue).toBe(4);
    expect(
      await prisma.trustTierResult.findUniqueOrThrow({ where: { accountId: poster.id } }),
    ).toEqual(before);
    expect(await getOwn(app, poster, market.id)).toMatchObject({
      state: 'live',
      hideReasons: [],
      expiresAt: market.expiresAt,
    });
    expect((await listingApi(app, 'GET', `/listings/${market.id}`, null)).statusCode).toBe(200);
  });
});

describe('Gỡ khỏi nhóm trực tiếp, khi tin không có việc mở', () => {
  it('điều hành viên lớp của tin gỡ một tin đang hiện: tin rời nhóm, nhật ký không gắn việc', async () => {
    const category = await seedCategory();
    const { group, mod10a, poster } = await school();
    const live = await liveListingOf(app, poster, inGroup(group, category));
    await deliverAll(app);
    const res = await detachDirectly(mod10a, group.groupId, live.id);
    expect(res.statusCode, res.body).toBe(200);
    expect((await getOwn(app, poster, live.id)).hideReasons).toContain('detached_by_group');
    const row = await prisma.reviewDecision.findUniqueOrThrow({
      where: { id: dataOf<Decision>(res).decisionId },
    });
    expect(row).toMatchObject({
      taskId: null,
      actorId: mod10a.id,
      actorRole: 'moderator',
      outcome: 'detach',
    });
    expect(await openTasks(live.id)).toEqual([]);
  });

  it('chủ nhóm gỡ kèm "trái quy định sàn": có việc hàng 4 cho staff danh mục', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const { group, poster } = await school();
    const live = await liveListingOf(app, poster, inGroup(group, category));
    await deliverAll(app);
    const res = await detachDirectly(group.owner, group.groupId, live.id, {
      platformViolation: true,
      note: 'Bán thuốc không rõ nguồn gốc',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await lastTask(live.id)).toMatchObject({
      status: 'open',
      queue: 4,
      escalatedBy: group.owner.id,
    });
    expect(await opsListingIds(staff)).toContain(live.id);
  });

  it('tin đang có việc mở: 409 TASK_OPEN, tin không đổi', async () => {
    const category = await seedCategory();
    const { group, mod10a, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    const res = await detachDirectly(mod10a, group.groupId, held.id);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('TASK_OPEN');
    expect((await getOwn(app, poster, held.id)).hideReasons).toEqual([]);
  });

  it('điều hành viên lớp khác: 403; tin của chính mình: 403', async () => {
    const category = await seedCategory();
    const { group, mod10a, mod10b, poster } = await school();
    const live = await liveListingOf(app, poster, inGroup(group, category));
    const other = await detachDirectly(mod10b, group.groupId, live.id);
    expect(other.statusCode).toBe(403);
    expect(codeOf(other)).toBe('FORBIDDEN');
    const own = await liveListingOf(app, mod10a, inGroup(group, category));
    const self = await detachDirectly(mod10a, group.groupId, own.id);
    expect(self.statusCode).toBe(403);
    expect((await getOwn(app, mod10a, own.id)).hideReasons).toEqual([]);
  });
});

describe('Đóng nhóm huỷ việc đang chờ về tin trong nhóm', () => {
  it('nhóm đóng khi tin có việc hàng 0: việc huỷ, không còn ở hàng ai, tin không hiện', async () => {
    const category = await seedCategory();
    const { group, mod10a, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    const taskId = await taskIdOf(held.id);
    expect(await groupListingIds(mod10a, group.groupId)).toContain(held.id);
    await closeGroup(group);
    expect(await prisma.reviewTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'cancelled',
      closeCause: 'group_closed',
    });
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');
    expect((await listingApi(app, 'GET', `/listings/${held.id}`, null)).statusCode).toBe(404);
  });

  it('điều hành viên đang nhận việc hàng 5 lúc nhóm đóng rồi quyết: 409 TASK_CLOSED', async () => {
    const category = await seedCategory();
    const { group, mod10a, poster } = await school();
    const live = await liveListingOf(app, poster, inGroup(group, category));
    await deliverAll(app);
    await app.modules.review.addReason(live.id, { reason: 'sample_risk' });
    const taskId = await taskIdOf(live.id);
    expect((await groupClaim(mod10a, group.groupId, taskId)).statusCode).toBe(200);
    await closeGroup(group);
    const res = await groupDecide(mod10a, group.groupId, taskId, { outcome: 'pass' });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('TASK_CLOSED');
  });

  it('đóng nhóm không huỷ việc đã chuyển lên hàng 4: vẫn mở trong hàng staff danh mục', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const { group, mod10a, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    await escalate(mod10a, group, held.id);
    await closeGroup(group);
    expect((await openTasks(held.id)).map((task) => task.queue)).toEqual([4]);
    expect(await opsListingIds(staff)).toContain(held.id);
  });
});

/** Nhóm công khai có điều hành cả nhóm và một người đăng có hai tin chờ duyệt: "nhóm công khai" và "chỉ thành viên". */
async function twoHeld(allowOutsiders: boolean) {
  const category = await seedCategory();
  const group = await createActiveGroup(app, { master });
  if (allowOutsiders) {
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
  }
  const moderator = await addMember(app, group.groupId);
  await appointModerator(app, group, moderator, null);
  const poster = await addMember(app, group.groupId);
  const open = await heldBy(poster, {
    placement: 'group_public',
    groupId: group.groupId,
    categoryId: category,
  });
  const inside = await heldBy(poster, inGroup(group, category));
  return { group, moderator, poster, open, inside };
}

describe('Rời, bị gỡ hay bị cấm thì việc máy giữ trong nhóm của người đó bị huỷ', () => {
  it('bị gỡ khỏi nhóm khi có tin chờ duyệt: việc huỷ, tin không hiện trong nhóm', async () => {
    const category = await seedCategory();
    const { group, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    const taskId = await taskIdOf(held.id);
    const removed = await api(
      app,
      'DELETE',
      `/groups/${group.groupId}/members/${poster.id}`,
      group.owner.token,
    );
    expect(removed.statusCode, removed.body).toBe(204);
    await deliverAll(app);
    expect(await prisma.reviewTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'cancelled',
      closeCause: 'member_left',
    });
    expect((await getOwn(app, poster, held.id)).hideReasons).toContain('removed_from_group');
  });

  it('bị cấm khỏi nhóm: việc tin trong nhóm huỷ, việc tin sàn vẫn mở trong hàng staff danh mục', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const { group, poster } = await school();
    const inside = await heldBy(poster, inGroup(group, category));
    const market = await heldBy(poster, { categoryId: category });
    const ban = await api(
      app,
      'PUT',
      `/groups/${group.groupId}/bans/${poster.id}`,
      group.owner.token,
    );
    expect(ban.statusCode, ban.body).toBe(204);
    await deliverAll(app);
    expect(await openTasks(inside.id)).toEqual([]);
    expect(await openTasks(market.id)).toHaveLength(1);
    expect(await opsListingIds(staff)).toContain(market.id);
  });

  it('tự rời nhóm đang nhận tin người ngoài: việc tin "nhóm công khai" vẫn mở ở hàng điều hành, tin "chỉ thành viên" huỷ', async () => {
    const { group, moderator, poster, open, inside } = await twoHeld(true);
    const left = await api(app, 'POST', `/groups/${group.groupId}/leave`, poster.token);
    expect(left.statusCode, left.body).toBe(204);
    await deliverAll(app);
    expect(await openTasks(inside.id)).toEqual([]);
    expect(await openTasks(open.id)).toHaveLength(1);
    expect((await getOwn(app, poster, open.id)).hideReasons).toEqual([]);
    expect(await groupListingIds(moderator, group.groupId)).toContain(open.id);
  });

  it('tự rời nhóm không nhận tin người ngoài, hay bị cấm khi nhóm nhận: việc cả hai tin huỷ', async () => {
    const closed = await twoHeld(false);
    await api(app, 'POST', `/groups/${closed.group.groupId}/leave`, closed.poster.token);
    await deliverAll(app);
    expect(await openTasks(closed.open.id)).toEqual([]);
    expect(await openTasks(closed.inside.id)).toEqual([]);

    const banned = await twoHeld(true);
    const ban = await api(
      app,
      'PUT',
      `/groups/${banned.group.groupId}/bans/${banned.poster.id}`,
      banned.group.owner.token,
    );
    expect(ban.statusCode, ban.body).toBe(204);
    await deliverAll(app);
    expect(await openTasks(banned.open.id)).toEqual([]);
    expect(await openTasks(banned.inside.id)).toEqual([]);
  });

  it('rời nhóm rồi vào lại khi tin còn chờ duyệt: việc hàng 0 mới hạn 24 giờ từ lúc vào lại, ở hàng điều hành nhóm', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const whole = await addMember(app, group.groupId);
    await appointModerator(app, group, whole, null);
    const poster = await addMember(app, group.groupId);
    const held = await heldBy(poster, inGroup(group, category));
    const left = await api(app, 'POST', `/groups/${group.groupId}/leave`, poster.token);
    expect(left.statusCode, left.body).toBe(204);
    await deliverAll(app);
    expect(await openTasks(held.id)).toEqual([]);

    now = new Date(TEST_NOW.getTime() + 3 * HOUR_MS);
    const back = await repositories.group.joinDirect({
      groupId: group.groupId,
      accountId: poster.id,
      via: 'approved',
      unitId: null,
      at: now,
    });
    expect(typeof back).not.toBe('string');
    await deliverAll(app);
    const [task] = await openTasks(held.id);
    expect(task).toMatchObject({
      queue: 0,
      reasons: ['machine_hold'],
      dueAt: new Date(now.getTime() + 24 * HOUR_MS),
    });
    expect(await groupListingIds(whole, group.groupId)).toContain(held.id);
  });
});
