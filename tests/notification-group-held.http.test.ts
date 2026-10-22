import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createUnit,
  deliverAll,
  newMaster,
  type TestUser,
} from './group-helpers.js';
import { machineHold, type OwnListing, submitted } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * N36 qua luồng thật (change add-trust-notices, delta notification/group-notices): máy giữ tin trong nhóm → `review` mở
 * việc và phát `review.task.group_held` → `notification` hỏi lại người xử được và số việc đang chờ → hộp thư quản trị
 * nhóm. Ai xử được theo spec review/queues "Việc vào hàng của ai".
 */
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => TEST_NOW,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

const pendingRows = (user: TestUser) =>
  prisma.notification.findMany({
    where: { recipientId: user.id, type: 'group.review.pending' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
const heldEvents = (groupId: string) =>
  prisma.outboxEvent.findMany({
    where: { type: 'review.task.group_held', payload: { path: ['groupId'], equals: groupId } },
  });
const taskIdOf = async (listingId: string) =>
  (await prisma.reviewTask.findFirstOrThrow({ where: { listingId, status: 'open' } })).id;

async function heldBy(user: TestUser, fields: Record<string, unknown>): Promise<OwnListing> {
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

async function passInGroup(moderator: TestUser, group: ActiveGroup, listingId: string) {
  const taskId = await taskIdOf(listingId);
  const claim = await api(
    app,
    'POST',
    `/groups/${group.groupId}/review/tasks/${taskId}/claim`,
    moderator.token,
  );
  expect(claim.statusCode, claim.body).toBe(200);
  const res = await api(
    app,
    'POST',
    `/groups/${group.groupId}/review/tasks/${taskId}/decision`,
    moderator.token,
    { outcome: 'pass', machineJudgment: 'machine_right' },
  );
  expect(res.statusCode, res.body).toBe(200);
  await deliverAll(app);
}

describe('Báo quản trị nhóm có tin chờ duyệt (N36)', () => {
  it('tin lớp 10A bị giữ: điều hành 10A được báo, có nhắc; điều hành 10B, cả nhóm, chủ nhóm thì không', async () => {
    const category = await seedCategory();
    const { group, mod10a, mod10b, whole, poster } = await school();
    const held = await heldBy(poster, inGroup(group, category));
    const groupName = (await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } })).name;
    expect(await pendingRows(mod10a)).toMatchObject([
      {
        category: 'your_groups',
        title: groupName,
        body: `«${groupName}» có 1 tin chờ duyệt.`,
        alert: true,
        groupId: group.groupId,
        data: { groupId: group.groupId },
      },
    ]);
    expect(await Promise.all([mod10b, whole, group.owner].map(pendingRows))).toEqual([[], [], []]);
    // Không nêu lý do máy giữ hay người đăng.
    const [row] = await pendingRows(mod10a);
    const posterName = (await prisma.account.findUniqueOrThrow({ where: { id: poster.id } }))
      .displayName;
    expect(`${row?.body} ${row?.detail ?? ''}`).not.toContain(posterName);
    expect(await heldEvents(group.groupId)).toHaveLength(1);
    // Gộp thêm lý do máy giữ vào việc đã ở hàng 0: không phát lại.
    await app.modules.review.addReason(held.id, { reason: 'machine_hold' });
    await deliverAll(app);
    expect(await heldEvents(group.groupId)).toHaveLength(1);
    expect(await pendingRows(mod10a)).toHaveLength(1);
  });

  it('ba tin trong mười phút: đúng một dòng "3 tin chờ duyệt", chỉ lần đầu có nhắc; xử hai việc rồi thêm một tin → "2 tin"', async () => {
    const category = await seedCategory();
    const { group, mod10a, poster } = await school();
    const first = await heldBy(poster, inGroup(group, category));
    const second = await heldBy(poster, inGroup(group, category));
    await heldBy(poster, inGroup(group, category));
    const groupName = (await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } })).name;
    const rows = await pendingRows(mod10a);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      body: `«${groupName}» có 3 tin chờ duyệt.`,
      alertedAt: TEST_NOW,
    });

    await passInGroup(mod10a, group, first.id);
    await passInGroup(mod10a, group, second.id);
    await heldBy(poster, inGroup(group, category));
    expect(await pendingRows(mod10a)).toMatchObject([
      { body: `«${groupName}» có 2 tin chờ duyệt.` },
    ]);
  });

  it('danh mục do sàn duyệt: không quản trị nào của nhóm được báo', async () => {
    const category = await seedCategory({ groupReview: 'platform' });
    const { group, mod10a, whole, poster } = await school();
    await heldBy(poster, inGroup(group, category));
    expect(await Promise.all([mod10a, whole, group.owner].map(pendingRows))).toEqual([[], [], []]);
  });

  it('điều hành viên duy nhất của lớp 10A đang bị khoá: điều hành cả nhóm được báo, người bị khoá thì không', async () => {
    const category = await seedCategory();
    const { group, mod10a, whole, poster } = await school();
    const locked = await api(app, 'POST', `/ops/accounts/${mod10a.id}/lock`, master.token, {
      reason: 'Thử khoá',
    });
    expect(locked.statusCode, locked.body).toBe(204);
    await deliverAll(app);
    await heldBy(poster, inGroup(group, category));
    expect(await pendingRows(mod10a)).toEqual([]);
    expect(await pendingRows(whole)).toHaveLength(1);
  });

  it('tin của chính điều hành viên lớp 10A: người đó không được báo về tin của mình', async () => {
    const category = await seedCategory();
    const { group, mod10a, whole } = await school();
    await heldBy(mod10a, inGroup(group, category));
    expect(await pendingRows(mod10a)).toEqual([]);
    // Lớp 10A không còn ai xử được tin này → bậc điều hành cả nhóm.
    expect(await pendingRows(whole)).toHaveLength(1);
  });

  it('tin sàn bị giữ: không phát sự kiện nào của nhóm', async () => {
    const category = await seedCategory();
    const { group, poster } = await school();
    const before = await prisma.outboxEvent.count({ where: { type: 'review.task.group_held' } });
    await heldBy(poster, { placement: 'marketplace', categoryId: category });
    expect(await prisma.outboxEvent.count({ where: { type: 'review.task.group_held' } })).toBe(
      before,
    );
    expect(await heldEvents(group.groupId)).toEqual([]);
  });
});
