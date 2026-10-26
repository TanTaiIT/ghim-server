import type { TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { groupSettings, listingApi } from './listing-http-helpers.js';
import { LATER, resubmitted, screened, tierPort } from './screening-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/*
 * Change add-group-manual-review qua lượt gửi thật: chủ nhóm bật "duyệt tay mọi tin" → máy vẫn chấm, lượt máy cho qua
 * thành giữ `group_manual` → việc hàng 0 về chuỗi quản trị nhóm kể cả danh mục do sàn duyệt. Sửa tin đang hiện chỉ qua
 * máy; tắt công tắc không thả tin đang chờ. Phần thuần ở `decide.calc` và `review-route.calc`.
 */
let now = LATER;
let app: FastifyInstance;
let master: TestUser;
const tiers = new Map<string, TrustTier>();

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, trust: tierPort(tiers) });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
});

beforeEach(() => {
  now = LATER;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;
type GroupTask = { id: string; listingId: string; groupManual: boolean; level: string };

const PLAIN_GROUP = /^Nhóm duyệt mọi tin trước khi hiện/;

const memberAt = async (group: ActiveGroup, tier: TrustTier = 'T3'): Promise<TestUser> => {
  const user = await addMember(app, group.groupId);
  tiers.set(user.id, tier);
  return user;
};
const manualGroup = async (): Promise<ActiveGroup> => {
  const group = await createActiveGroup(app, { master });
  await groupSettings(app, group.owner, group.groupId, { manualReview: true });
  return group;
};
const inGroup = (group: ActiveGroup, categoryId?: string) => ({
  placement: 'members_only',
  groupId: group.groupId,
  ...(categoryId ? { categoryId } : {}),
});
const groupTasks = async (user: TestUser, groupId: string): Promise<GroupTask[]> =>
  dataOf<{ items: GroupTask[] }>(
    await api(app, 'GET', `/groups/${groupId}/review/tasks`, user.token),
  ).items;
const openTask = (listingId: string) =>
  prisma.reviewTask.findFirst({ where: { listingId, status: 'open' } });
const profileOf = async (user: TestUser, groupId: string) =>
  dataOf<{ manualReview: boolean }>(await api(app, 'GET', `/groups/${groupId}`, user.token));
const noticeOf = async (user: TestUser, listingId: string) =>
  (
    (await listingApi(app, 'GET', `/listings/${listingId}`, user)).json() as {
      data: { machineNotice: { kind: string; message: string } | null };
    }
  ).data.machineNotice;

describe('Công tắc trong cài đặt nhóm', () => {
  it('chủ nhóm bật; mọi thành viên thấy trên hồ sơ nhóm', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await memberAt(group);
    expect((await profileOf(member, group.groupId)).manualReview).toBe(false);
    await groupSettings(app, group.owner, group.groupId, { manualReview: true });
    expect((await profileOf(member, group.groupId)).manualReview).toBe(true);
  });

  it('điều hành viên, thành viên không đổi được', async () => {
    const group = await createActiveGroup(app, { master });
    const moderator = await memberAt(group);
    await appointModerator(app, group, moderator, null);
    const member = await memberAt(group);
    const tries = await Promise.all(
      [moderator, member].map((user) =>
        api(app, 'PATCH', `/groups/${group.groupId}/settings`, user.token, { manualReview: true }),
      ),
    );
    expect(tries.map((res) => res.statusCode)).toEqual([403, 403]);
    expect((await profileOf(group.owner, group.groupId)).manualReview).toBe(false);
  });
});

describe('Tin gửi vào nhóm bật duyệt tay', () => {
  it('T3 tin sạch: máy cho qua nhưng giữ cho quản trị nhóm, câu báo nói nhóm duyệt', async () => {
    const group = await manualGroup();
    const member = await memberAt(group);
    const { listing, run } = await screened(app, member, inGroup(group));
    expect(run).toMatchObject({ outcome: 'hold', cause: 'group_manual', score: 0 });
    expect(listing.state).toBe('pending');
    expect((await noticeOf(member, listing.id))?.message).toMatch(PLAIN_GROUP);
    expect(await openTask(listing.id)).toMatchObject({
      reasons: ['machine_hold'],
      queue: 0,
      groupManual: true,
    });
    const task = (await groupTasks(group.owner, group.groupId)).find(
      (item) => item.listingId === listing.id,
    );
    expect(task).toMatchObject({ groupManual: true, level: 'group_owner' });
  });

  it('chủ nhóm cho đạt không cần chọn "máy đúng" hay "máy quá tay"; nhật ký không ghi nhận xét về máy', async () => {
    const group = await manualGroup();
    const member = await memberAt(group);
    const { listing } = await screened(app, member, inGroup(group));
    const task = await prisma.reviewTask.findFirstOrThrow({
      where: { listingId: listing.id, status: 'open' },
    });
    const base = `/groups/${group.groupId}/review/tasks/${task.id}`;
    expect((await api(app, 'POST', `${base}/claim`, group.owner.token)).statusCode).toBe(200);
    const res = await api(app, 'POST', `${base}/decision`, group.owner.token, { outcome: 'pass' });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(
      await prisma.reviewDecision.findFirstOrThrow({ where: { taskId: task.id } }),
    ).toMatchObject({
      machineJudgment: null,
      machineHits: [],
    });
    const after = await listingApi(app, 'GET', `/listings/${listing.id}`, member);
    expect(dataOf<{ state: string }>(after).state).toBe('live');
  });

  it('danh mục do sàn duyệt: tin giữ vì công tắc vẫn về nhóm, staff danh mục không thấy', async () => {
    const category = await seedCategory({ groupReview: 'platform' });
    const staff = await newUser(app);
    await grantStaff(staff.id, [], [category]);
    const group = await manualGroup();
    const member = await memberAt(group);
    const { listing } = await screened(app, member, inGroup(group, category));
    expect((await groupTasks(group.owner, group.groupId)).map((t) => t.listingId)).toContain(
      listing.id,
    );
    const ops = dataOf<{ items: { listingId: string }[] }>(
      await api(app, 'GET', '/ops/review/tasks', staff.token),
    );
    expect(ops.items.map((item) => item.listingId)).not.toContain(listing.id);
  });

  it('tin sàn chung của cùng thành viên không bị ảnh hưởng', async () => {
    const group = await manualGroup();
    const member = await memberAt(group);
    const { listing, run } = await screened(app, member);
    expect(run).toMatchObject({ outcome: 'pass_full', cause: 'score' });
    expect(listing.state).toBe('live');
  });

  it('sửa tin đang hiện chỉ qua máy: máy cho qua là hiện ngay', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await memberAt(group);
    const { listing } = await screened(app, member, inGroup(group));
    expect(listing.state).toBe('live');
    await groupSettings(app, group.owner, group.groupId, { manualReview: true });
    const edited = await resubmitted(app, member, listing, { description: 'Máy còn rất mới' });
    expect(edited.run).toMatchObject({ outcome: 'pass_full', cause: 'score' });
    expect(edited.listing.state).toBe('live');
  });

  it('sửa tin đang chờ là gửi lại: vẫn giữ cho quản trị nhóm', async () => {
    const group = await manualGroup();
    const member = await memberAt(group);
    const { listing } = await screened(app, member, inGroup(group));
    const edited = await resubmitted(app, member, listing, { description: 'Thêm ảnh hộp' });
    expect(edited.run).toMatchObject({ outcome: 'hold', cause: 'group_manual' });
    expect(edited.listing.state).toBe('pending');
    expect(await openTask(listing.id)).toMatchObject({ groupManual: true });
  });

  it('tắt công tắc: tin đang chờ vẫn chờ người, tin gửi sau đó máy cho qua', async () => {
    const group = await manualGroup();
    const member = await memberAt(group);
    const { listing } = await screened(app, member, inGroup(group));
    await groupSettings(app, group.owner, group.groupId, { manualReview: false });
    await deliverAll(app);
    const still = await listingApi(app, 'GET', `/listings/${listing.id}`, member);
    expect(dataOf<{ state: string }>(still).state).toBe('pending');
    expect(await openTask(listing.id)).toMatchObject({ groupManual: true });
    const next = await screened(app, member, inGroup(group));
    expect(next.listing.state).toBe('live');
  });
});
