import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bandsOf, toStored } from '../src/modules/screening/calc/dhash.calc.js';
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
  type TestUser,
} from './group-helpers.js';
import {
  getOwn,
  listingApi,
  liveListingOf,
  machineHold,
  machinePass,
  type OwnListing,
  patch,
  submitted,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, grantStaff, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec review/queues ("việc vào hàng của ai", "xem hàng chờ"), review/task-handling, review/conflict-of-interest và
 * delta platform/staff-permissions qua HTTP (add-review-queues task 4.1–4.3). Mọi lượt gửi tin của test dùng chung một
 * mã máy (`DEVICE`), nên mọi người đã đăng tin đều "dùng chung thiết bị" với nhau: staff và điều hành viên ở đây không
 * đăng tin, trừ ca cố ý kiểm luật đó.
 */
const MINUTE_MS = 60_000;
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

type Item = { id: string; listingId: string; level: string; claim: { state: string } };
const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const itemsOf = (res: { json(): unknown }) =>
  (res.json() as { data: { items: Item[] } }).data.items;
const listingIdsOf = (res: { json(): unknown }) => itemsOf(res).map((item) => item.listingId);

const staffOf = async (categoryIds: string[]): Promise<TestUser> => {
  const user = await newUser(app);
  await grantStaff(user.id, [], categoryIds);
  return user;
};
const opsQueue = (user: TestUser | null, query = '') =>
  api(app, 'GET', `/ops/review/tasks${query}`, user?.token);
const opsClaim = (user: TestUser, taskId: string) =>
  api(app, 'POST', `/ops/review/tasks/${taskId}/claim`, user.token);
const groupQueue = (user: TestUser, groupId: string) =>
  api(app, 'GET', `/groups/${groupId}/review/tasks`, user.token);
const groupClaim = (user: TestUser, groupId: string, taskId: string) =>
  api(app, 'POST', `/groups/${groupId}/review/tasks/${taskId}/claim`, user.token);
const taskIdOf = async (listingId: string) =>
  (await prisma.reviewTask.findFirstOrThrow({ where: { listingId, status: 'open' } })).id;

async function heldBy(user: TestUser, fields: Record<string, unknown> = {}): Promise<OwnListing> {
  const held = await machineHold(app, user, await submitted(app, user, fields));
  await deliverAll(app);
  return held;
}

/** Nhóm trường có lớp 10A (hai điều hành viên), 10B (một), một điều hành cả nhóm. */
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
    mod10a2: await moderator(unit10a),
    mod10b: await moderator(unit10b),
    whole: await moderator(null),
  };
}

const inGroup = (group: ActiveGroup, categoryId: string) => ({
  placement: 'members_only',
  groupId: group.groupId,
  categoryId,
});

/** Mấy tài khoản từng đăng tin từ cùng một máy riêng, ngoài máy chung `DEVICE` của mọi lượt gửi trong test. */
const shareDevice = async (...accountIds: string[]): Promise<void> => {
  const device = `may-rieng-${randomUUID()}`;
  await prisma.devicePost.createMany({
    data: accountIds.map((accountId) => ({
      deviceHash: device,
      accountId,
      firstPostedAt: TEST_NOW,
      lastPostedAt: TEST_NOW,
    })),
  });
};

const anyTemplateId = async (user: TestUser): Promise<string> =>
  (await api(app, 'GET', '/ops/review/reason-templates', user.token)).json().data[0].id as string;

/**
 * Nhóm không có điều hành viên: việc máy giữ về tin trong nhóm ở bậc chủ nhóm; chủ nhóm nhận rồi gỡ tin khỏi nhóm kèm
 * "trái quy định sàn", sinh việc hàng 4. `prepare` dựng quan hệ của chủ nhóm trước lúc đó.
 */
async function escalatedByOwner(
  categoryId: string,
  prepare: (owner: TestUser) => Promise<unknown>,
) {
  const group = await createActiveGroup(app, { master });
  await prepare(group.owner);
  const held = await heldBy(await addMember(app, group.groupId), inGroup(group, categoryId));
  const groupTask = await taskIdOf(held.id);
  const claim = await groupClaim(group.owner, group.groupId, groupTask);
  if (claim.statusCode !== 200) throw new Error(`Chủ nhóm nhận việc hỏng: ${claim.body}`);
  const detached = await api(
    app,
    'POST',
    `/groups/${group.groupId}/review/tasks/${groupTask}/decision`,
    group.owner.token,
    { outcome: 'detach', platformViolation: true, note: 'Bán hàng giả' },
  );
  if (detached.statusCode !== 200) throw new Error(`Chuyển lên hỏng: ${detached.body}`);
  await deliverAll(app);
  return { owner: group.owner, held, taskId: await taskIdOf(held.id) };
}

/** Hai staff cùng danh mục và một tin sàn bị giữ của danh mục đó. */
const setup = async () => {
  const category = await seedCategory();
  const [a, b] = [await staffOf([category]), await staffOf([category])];
  const held = await heldBy(await newUser(app), { categoryId: category });
  return { category, a, b, held, taskId: await taskIdOf(held.id) };
};

const bands = (hash: bigint) => {
  const values = bandsOf(hash);
  const band = (index: number) => values[index] ?? 0;
  return { band0: band(0), band1: band(1), band2: band(2), band3: band(3), band4: band(4) };
};

const checked = (imageId: string, ownerAccountId: string, value: bigint) =>
  prisma.imageCheck.upsert({
    where: { imageId },
    create: {
      imageId,
      ownerAccountId,
      status: 'done',
      dhash: toStored(value),
      ...bands(value),
      checkedAt: TEST_NOW,
    },
    update: { status: 'done', dhash: toStored(value), ...bands(value), checkedAt: TEST_NOW },
  });

describe('Việc vào hàng của ai', () => {
  it('tin sàn Điện thoại bị giữ: staff Điện thoại thấy, staff Xe máy không; nhận bằng mã → 404', async () => {
    const [phone, motorbike] = [await seedCategory(), await seedCategory()];
    const staffPhone = await staffOf([phone]);
    const staffBike = await staffOf([motorbike]);
    const held = await heldBy(await newUser(app), { categoryId: phone });
    expect(listingIdsOf(await opsQueue(staffPhone))).toContain(held.id);
    expect(listingIdsOf(await opsQueue(staffBike))).not.toContain(held.id);
    const claim = await opsClaim(staffBike, await taskIdOf(held.id));
    expect(claim.statusCode).toBe(404);
    expect(codeOf(claim)).toBe('NOT_FOUND');
  });

  it('tin trong nhóm, danh mục để nhóm duyệt: điều hành 10A thấy; 10B, điều hành cả nhóm, chủ nhóm không', async () => {
    const category = await seedCategory();
    const { group, unit10a, mod10a, mod10b, whole } = await school();
    const poster = await addMember(app, group.groupId, { unitId: unit10a });
    const held = await heldBy(poster, inGroup(group, category));
    expect(listingIdsOf(await groupQueue(mod10a, group.groupId))).toContain(held.id);
    const others = await Promise.all(
      [mod10b, whole, group.owner].map((other) => groupQueue(other, group.groupId)),
    );
    for (const res of others) expect(listingIdsOf(res)).not.toContain(held.id);
  });

  it('danh mục "tin nhóm bị giữ do sàn duyệt": staff danh mục thấy, điều hành nhóm không', async () => {
    const category = await seedCategory({ groupReview: 'platform' });
    const staff = await staffOf([category]);
    const { group, unit10a, mod10a } = await school();
    const held = await heldBy(
      await addMember(app, group.groupId, { unitId: unit10a }),
      inGroup(group, category),
    );
    expect(listingIdsOf(await opsQueue(staff))).toContain(held.id);
    expect(listingIdsOf(await groupQueue(mod10a, group.groupId))).not.toContain(held.id);
  });

  it('mức rủi ro không quyết ai xử: danh mục rủi ro cao để nhóm duyệt → điều hành nhóm', async () => {
    const category = await seedCategory({ riskLevel: 'high', groupReview: 'group' });
    const staff = await staffOf([category]);
    const { group, unit10a, mod10a } = await school();
    const held = await heldBy(
      await addMember(app, group.groupId, { unitId: unit10a }),
      inGroup(group, category),
    );
    expect(listingIdsOf(await groupQueue(mod10a, group.groupId))).toContain(held.id);
    expect(listingIdsOf(await opsQueue(staff))).not.toContain(held.id);
  });

  it('mở rộng tin nhóm lên sàn chung rồi bị giữ: staff danh mục, không phải điều hành nhóm', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const { group, unit10a, mod10a } = await school();
    const poster = await addMember(app, group.groupId, { unitId: unit10a });
    const live = await liveListingOf(app, poster, inGroup(group, category));
    const widened = await patch(app, poster, live, { placement: 'marketplace', groupId: null });
    expect(widened.statusCode, widened.body).toBe(200);
    await machineHold(app, poster, widened.json().data);
    await deliverAll(app);
    expect(listingIdsOf(await opsQueue(staff))).toContain(live.id);
    expect(listingIdsOf(await groupQueue(mod10a, group.groupId))).not.toContain(live.id);
  });

  it('danh mục chưa có staff: việc ở hàng master', async () => {
    const held = await heldBy(await newUser(app), { categoryId: await seedCategory() });
    const queue = itemsOf(await opsQueue(master, '?atMaster=true'));
    expect(queue.find((item) => item.listingId === held.id)?.level).toBe('master');
  });

  it('việc hạn chế do máy về tin sàn: staff danh mục, hàng 3', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const limited = await machinePass(
      app,
      poster,
      await submitted(app, poster, { categoryId: category }),
      true,
    );
    await deliverAll(app);
    const item = itemsOf(await opsQueue(staff)).find((row) => row.listingId === limited.id);
    expect(item).toMatchObject({ level: 'category_staff' });
  });
});

describe('Xem hàng chờ', () => {
  it('staff: 200, mỗi việc kèm số hàng, lý do và hạn xử', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const held = await heldBy(await newUser(app), { categoryId: category });
    const res = await opsQueue(staff);
    expect(res.statusCode).toBe(200);
    expect(itemsOf(res).find((item) => item.listingId === held.id)).toMatchObject({
      queue: 0,
      reasons: ['machine_hold'],
      dueAt: new Date(TEST_NOW.getTime() + 24 * 60 * MINUTE_MS).toISOString(),
    });
  });

  it('người dùng không có vai điều hành hay quyền staff: 403; khách: 401', async () => {
    const plain = await newUser(app);
    const res = await opsQueue(plain);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    const group = await createActiveGroup(app, { master });
    expect((await groupQueue(plain, group.groupId)).statusCode).toBe(403);
    expect((await opsQueue(null)).statusCode).toBe(401);
  });
});

describe('Nhận việc và giữ trong 10 phút', () => {
  it('nhận: 200 kèm hạn giữ 10 phút; người khác thấy "đang có người xử" và nhận → 409 TASK_CLAIMED', async () => {
    const { a, b, held, taskId } = await setup();
    const claim = await opsClaim(a, taskId);
    expect(claim.statusCode, claim.body).toBe(200);
    expect(claim.json().data).toMatchObject({
      claimExpiresAt: new Date(TEST_NOW.getTime() + 10 * MINUTE_MS).toISOString(),
      listingVersion: held.version,
    });
    expect(itemsOf(await opsQueue(b)).find((item) => item.id === taskId)?.claim.state).toBe(
      'taken',
    );
    const second = await opsClaim(b, taskId);
    expect(second.statusCode).toBe(409);
    expect(codeOf(second)).toBe('TASK_CLAIMED');
  });

  it('hai người nhận cùng lúc: đúng một người được', async () => {
    const { a, b, taskId } = await setup();
    const statuses = (await Promise.all([opsClaim(a, taskId), opsClaim(b, taskId)]))
      .map((res) => res.statusCode)
      .toSorted();
    expect(statuses).toEqual([200, 409]);
  });

  it('việc vừa bị huỷ: 409 TASK_CLOSED', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const taskId = await taskIdOf(held.id);
    await listingApi(app, 'POST', `/listings/${held.id}/withdraw`, poster);
    await deliverAll(app);
    const claim = await opsClaim(staff, taskId);
    expect(claim.statusCode).toBe(409);
    expect(codeOf(claim)).toBe('TASK_CLOSED');
  });

  it('giữ quá 10 phút: việc trở về hàng chờ, người khác nhận được', async () => {
    const { a, b, taskId } = await setup();
    await opsClaim(a, taskId);
    now = new Date(TEST_NOW.getTime() + 11 * MINUTE_MS);
    expect((await opsClaim(b, taskId)).statusCode).toBe(200);
  });

  it('master cũng không giành việc người khác đang giữ: 409 TASK_CLAIMED', async () => {
    const { a, taskId } = await setup();
    await opsClaim(a, taskId);
    const claim = await opsClaim(master, taskId);
    expect(claim.statusCode).toBe(409);
    expect(codeOf(claim)).toBe('TASK_CLAIMED');
  });
});

describe('Mất vai hay mất quyền thì việc đang nhận trả về ngay', () => {
  it('điều hành viên 10A bị bãi nhiệm khi đang nhận: điều hành viên kia của 10A nhận được ngay', async () => {
    const category = await seedCategory();
    const { group, unit10a, mod10a, mod10a2 } = await school();
    const held = await heldBy(
      await addMember(app, group.groupId, { unitId: unit10a }),
      inGroup(group, category),
    );
    const taskId = await taskIdOf(held.id);
    expect((await groupClaim(mod10a, group.groupId, taskId)).statusCode).toBe(200);
    const dismissed = await api(
      app,
      'DELETE',
      `/groups/${group.groupId}/moderators/${mod10a.id}`,
      group.owner.token,
    );
    expect(dismissed.statusCode, dismissed.body).toBe(200);
    await deliverAll(app);
    expect((await groupClaim(mod10a2, group.groupId, taskId)).statusCode).toBe(200);
  });

  it('staff bị treo quyền khi đang nhận: việc trở về ngay, staff khác nhận được', async () => {
    const category = await seedCategory();
    const [a, b] = [await staffOf([category]), await staffOf([category])];
    const taskId = await taskIdOf((await heldBy(await newUser(app), { categoryId: category })).id);
    await opsClaim(a, taskId);
    await repositories.platform.suspendStaff({ accountId: a.id, reason: 'thử', at: TEST_NOW });
    await deliverAll(app);
    expect((await opsClaim(b, taskId)).statusCode).toBe(200);
  });

  it('staff bị thu danh mục khi đang nhận: việc trở về ngay, staff khác của danh mục nhận được', async () => {
    const [phone, other] = [await seedCategory(), await seedCategory()];
    const [a, b] = [await staffOf([phone]), await staffOf([phone])];
    const taskId = await taskIdOf((await heldBy(await newUser(app), { categoryId: phone })).id);
    await opsClaim(a, taskId);
    await grantStaff(a.id, [], [other]);
    await deliverAll(app);
    expect((await opsClaim(b, taskId)).statusCode).toBe(200);
  });
});

describe('Người xử thấy đủ bối cảnh', () => {
  it('tin bị giữ vì ảnh trùng: thấy tin của tài khoản X, điểm và luật đã trúng, số tin sạch', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const [poster, other] = [await newUser(app), await newUser(app)];
    const theirs = await liveListingOf(app, other);
    const held = await heldBy(poster, { categoryId: category });
    const hash = 0x1234_5678_9abc_def0n;
    const [ownImage, theirImage] = [held.images[0]?.id ?? '', theirs.images[0]?.id ?? ''];
    await checked(ownImage, poster.id, hash);
    await checked(theirImage, other.id, hash ^ 1n);
    const run: Prisma.ScreeningRunUncheckedCreateInput = {
      listingId: held.id,
      listingVersion: held.version - 1,
      accountId: poster.id,
      trigger: 'submission',
      startedAt: TEST_NOW,
      textResult: {},
      imageIds: [ownImage],
      decidedAt: TEST_NOW,
      outcome: 'hold',
      cause: 'gate',
      score: 35,
      band: 'medium',
      tier: 'T1',
      hits: [{ code: 'duplicate_image', weight: 0, mode: 'on', refs: [ownImage] }],
      configVersion: 1,
      ruleVersion: 1,
    };
    await prisma.screeningRun.create({ data: run });
    await prisma.trustTierResult.upsert({
      where: { accountId: poster.id },
      create: {
        accountId: poster.id,
        tier: 'T1',
        countedClean: 4,
        factsHash: 'h',
        configVersion: 1,
        computedAt: TEST_NOW,
      },
      update: { countedClean: 4 },
    });
    const res = await api(app, 'GET', `/ops/review/tasks/${await taskIdOf(held.id)}`, staff.token);
    expect(res.statusCode, res.body).toBe(200);
    const detail = res.json().data;
    expect(detail.duplicates).toContainEqual(
      expect.objectContaining({ accountId: other.id, listingId: theirs.id }),
    );
    expect(detail.machine).toMatchObject({ score: 35, hits: ['duplicate_image'] });
    expect(detail.seller).toMatchObject({ accountId: poster.id, cleanListings: 4 });
  });

  it('người đăng dùng chung thiết bị với Y: thấy Y, không thấy mã thiết bị', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const [poster, y] = [await newUser(app), await newUser(app)];
    const device = `may-rieng-${randomUUID()}`;
    await prisma.devicePost.createMany({
      data: [poster.id, y.id].map((accountId) => ({
        deviceHash: device,
        accountId,
        firstPostedAt: TEST_NOW,
        lastPostedAt: TEST_NOW,
      })),
    });
    const held = await heldBy(poster, { categoryId: category });
    const res = await api(app, 'GET', `/ops/review/tasks/${await taskIdOf(held.id)}`, staff.token);
    expect(res.json().data.sharedDeviceAccounts).toContainEqual(
      expect.objectContaining({ accountId: y.id }),
    );
    expect(res.body).not.toContain(device);
  });
});

describe('Không ai, trừ master, xử việc của chính mình', () => {
  it('staff đăng tin trong danh mục của mình: không hiện trong hàng của mình, nhận bằng mã → 404, staff khác thấy', async () => {
    const category = await seedCategory();
    const [poster, other] = [await staffOf([category]), await staffOf([category])];
    const held = await heldBy(poster, { categoryId: category });
    expect(listingIdsOf(await opsQueue(poster))).not.toContain(held.id);
    expect((await opsClaim(poster, await taskIdOf(held.id))).statusCode).toBe(404);
    expect(listingIdsOf(await opsQueue(other))).toContain(held.id);
  });

  it('tài khoản phụ trên cùng máy: việc về tin của B không hiện cho staff S', async () => {
    const category = await seedCategory();
    const s = await staffOf([category]);
    await heldBy(s, { categoryId: await seedCategory() });
    const b = await newUser(app);
    const held = await heldBy(b, { categoryId: category });
    expect(listingIdsOf(await opsQueue(s))).not.toContain(held.id);
  });

  it('chuỗi trong nhóm: điều hành viên duy nhất của lớp đăng tin → điều hành cả nhóm', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const unit = await createUnit(app, group, `11A ${randomUUID().slice(0, 4)}`);
    const only = await addMember(app, group.groupId, { unitId: unit });
    await appointModerator(app, group, only, unit);
    const whole = await addMember(app, group.groupId);
    await appointModerator(app, group, whole, null);
    const held = await heldBy(only, inGroup(group, category));
    expect(listingIdsOf(await groupQueue(only, group.groupId))).not.toContain(held.id);
    expect(listingIdsOf(await groupQueue(whole, group.groupId))).toContain(held.id);
  });

  it('chuỗi trong nhóm: còn điều hành viên khác cùng lớp → điều hành viên kia', async () => {
    const category = await seedCategory();
    const { group, mod10a, mod10a2 } = await school();
    const held = await heldBy(mod10a, inGroup(group, category));
    expect(listingIdsOf(await groupQueue(mod10a2, group.groupId))).toContain(held.id);
  });

  it('chủ nhóm đăng tin trong nhóm không có điều hành viên → staff danh mục', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const group = await createActiveGroup(app, { master });
    const held = await heldBy(group.owner, inGroup(group, category));
    expect(listingIdsOf(await opsQueue(staff))).toContain(held.id);
  });

  it('chuỗi trong nhóm: mọi điều hành viên dùng chung máy với người đăng → chủ nhóm', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const unit = await createUnit(app, group, `12A ${randomUUID().slice(0, 4)}`);
    const moderator = await addMember(app, group.groupId, { unitId: unit });
    await appointModerator(app, group, moderator, unit);
    const poster = await addMember(app, group.groupId, { unitId: unit });
    await shareDevice(moderator.id, poster.id);
    const held = await heldBy(poster, inGroup(group, category));
    expect(listingIdsOf(await groupQueue(moderator, group.groupId))).not.toContain(held.id);
    expect(listingIdsOf(await groupQueue(group.owner, group.groupId))).toContain(held.id);
  });

  it('chuỗi trên sàn: staff duy nhất của danh mục đăng tin bị giữ → hàng master', async () => {
    const category = await seedCategory();
    const only = await staffOf([category]);
    const held = await heldBy(only, { categoryId: category });
    expect(listingIdsOf(await opsQueue(only))).not.toContain(held.id);
    const detail = await api(
      app,
      'GET',
      `/ops/review/tasks/${await taskIdOf(held.id)}`,
      master.token,
    );
    expect(detail.json().data.level).toBe('master');
  });

  it('danh mục "tin nhóm bị giữ do sàn duyệt": staff A đăng vào nhóm → staff B thấy, điều hành nhóm không', async () => {
    const pets = await seedCategory({ groupReview: 'platform' });
    const { group, unit10a, mod10a } = await school();
    const a = await addMember(app, group.groupId, { unitId: unit10a });
    await grantStaff(a.id, [], [pets]);
    const b = await staffOf([pets]);
    const held = await heldBy(a, inGroup(group, pets));
    expect(listingIdsOf(await opsQueue(b))).toContain(held.id);
    expect(listingIdsOf(await opsQueue(a))).not.toContain(held.id);
    expect(listingIdsOf(await groupQueue(mod10a, group.groupId))).not.toContain(held.id);
  });

  it('staff khôi phục tin sàn đang bị gỡ do chính mình đăng: 403, tin vẫn bị gỡ', async () => {
    const category = await seedCategory();
    const [a, b] = [await staffOf([category]), await staffOf([category])];
    const live = await liveListingOf(app, a, { categoryId: category });
    await deliverAll(app);
    const removed = await api(app, 'POST', `/ops/review/listings/${live.id}/remove`, b.token, {
      reasonTemplateId: await anyTemplateId(b),
    });
    expect(removed.statusCode, removed.body).toBe(200);
    const res = await api(app, 'POST', `/ops/review/listings/${live.id}/restore`, a.token);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect((await getOwn(app, a, live.id)).state).toBe('removed');
  });

  it('master đứng ngoài: tài khoản cá nhân dùng chung máy với master vẫn để master nhận và quyết việc', async () => {
    const owner = await newMaster(app);
    const personal = await newUser(app);
    await shareDevice(owner.id, personal.id);
    const held = await heldBy(personal, { categoryId: await seedCategory() });
    const taskId = await taskIdOf(held.id);
    expect(
      (await prisma.reviewTask.findUniqueOrThrow({ where: { id: taskId } })).excludedIds,
    ).toContain(owner.id);
    expect((await opsClaim(owner, taskId)).statusCode).toBe(200);
    const decided = await api(app, 'POST', `/ops/review/tasks/${taskId}/decision`, owner.token, {
      outcome: 'pass',
      machineJudgment: 'machine_right',
    });
    expect(decided.statusCode, decided.body).toBe(200);
  });
});

describe('Việc cần hai người do hai người khác nhau làm', () => {
  it('chủ nhóm đồng thời là staff chuyển lên hàng 4: không hiện cho chính người đó, hiện cho staff khác', async () => {
    const category = await seedCategory();
    const other = await staffOf([category]);
    const { owner, held } = await escalatedByOwner(category, (escalator) =>
      grantStaff(escalator.id, [], [category]),
    );
    expect(itemsOf(await opsQueue(other)).find((item) => item.listingId === held.id)).toMatchObject(
      { queue: 4, reasons: ['group_escalation'] },
    );
    expect(listingIdsOf(await opsQueue(owner))).not.toContain(held.id);
  });

  it('người đã chuyển lên nhận chính việc hàng 4 bằng mã: 403, việc vẫn chờ người khác', async () => {
    const category = await seedCategory();
    const { owner, taskId } = await escalatedByOwner(category, (escalator) =>
      grantStaff(escalator.id, [], [category]),
    );
    const res = await opsClaim(owner, taskId);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await prisma.reviewTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'open',
      claimedBy: null,
    });
  });

  it('staff S từng đăng tin cùng máy với chủ nhóm L đã chuyển lên: không hiện cho S, hiện cho staff khác', async () => {
    const category = await seedCategory();
    const [s, other] = [await staffOf([category]), await staffOf([category])];
    const { held } = await escalatedByOwner(category, (escalator) =>
      shareDevice(escalator.id, s.id),
    );
    expect(listingIdsOf(await opsQueue(other))).toContain(held.id);
    expect(listingIdsOf(await opsQueue(s))).not.toContain(held.id);
  });
});
