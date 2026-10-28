import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createStaticRuntimeConfig,
  type RuntimeConfig,
} from '../src/common/config/runtime-config.js';
import type { ListingTrustPort, TrustTier } from '../src/modules/listing/listing.ports.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
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
  listingApi,
  liveListingOf,
  machineHold,
  machinePass,
  type OwnListing,
  patch,
  submitted,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec review/decisions qua HTTP (add-review-queues task 5.1, 5.2). Mọi lượt gửi tin của test dùng chung một mã máy,
 * nên staff, điều hành viên, master ở đây không đăng tin — không thì họ "dùng chung thiết bị" với người đăng.
 */
const DAY_MS = 86_400_000;
let now = TEST_NOW;
let reviewerSamplePercent = 0;
const tiers = new Map<string, TrustTier>();
let app: FastifyInstance;
let master: TestUser;

const baseConfig = createStaticRuntimeConfig();
const config: RuntimeConfig = {
  get: (key) =>
    key === 'postcheck.reviewerPassSamplePercent' ? reviewerSamplePercent : baseConfig.get(key),
  version: () => baseConfig.version(),
};
/** Mức tin cậy theo từng người đăng (mặc định T1), không chặn lượt gửi nào. */
const trust: ListingTrustPort = {
  tierOf: (accountId) => Promise.resolve(tiers.get(accountId) ?? 'T1'),
  assertCanSubmit: () => Promise.resolve(),
  strikePointsIn: () => Promise.resolve(0),
  strikePointsOf: () => Promise.resolve(0),
  struckAccounts: () => Promise.resolve(new Set<string>()),
};

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, config, trust, screening: interimScreening });
  await app.ready();
  // Lý do mẫu khởi đầu: `truncateAll` đầu mỗi file xoá cả bảng, `buildTestApp` không chạy bước khởi động.
  await app.modules.review.ensureReasonTemplates();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
  reviewerSamplePercent = 0;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
const codeOf = (res: Res) => (res.json() as { error: { code: string } }).error.code;
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;
type Decision = { decisionId: string; outcome: string; listingState: string };
type Template = { id: string; text: string; active: boolean; sort: number };

const staffOf = async (categoryIds: string[]): Promise<TestUser> => {
  const user = await newUser(app);
  await grantStaff(user.id, [], categoryIds);
  return user;
};
const taskIdOf = async (listingId: string) =>
  (await prisma.reviewTask.findFirstOrThrow({ where: { listingId, status: 'open' } })).id;
const openTasks = (listingId: string) =>
  prisma.reviewTask.findMany({ where: { listingId, status: 'open' } });

const queueListingIds = async (user: TestUser): Promise<string[]> =>
  dataOf<{ items: { listingId: string }[] }>(
    await api(app, 'GET', '/ops/review/tasks', user.token),
  ).items.map((item) => item.listingId);
const opsClaim = (user: TestUser, taskId: string) =>
  api(app, 'POST', `/ops/review/tasks/${taskId}/claim`, user.token);
const opsDecide = (user: TestUser, taskId: string, body: object) =>
  api(app, 'POST', `/ops/review/tasks/${taskId}/decision`, user.token, body);
const groupClaim = (user: TestUser, groupId: string, taskId: string) =>
  api(app, 'POST', `/groups/${groupId}/review/tasks/${taskId}/claim`, user.token);
const groupDecide = (user: TestUser, groupId: string, taskId: string, body: object) =>
  api(app, 'POST', `/groups/${groupId}/review/tasks/${taskId}/decision`, user.token, body);

/** Nhận rồi quyết qua bàn vận hành — nhận hỏng thì nổ ngay, để ca test chỉ kiểm lượt quyết. */
async function claimAndDecide(user: TestUser, listingId: string, body: object): Promise<Res> {
  const taskId = await taskIdOf(listingId);
  const claim = await opsClaim(user, taskId);
  if (claim.statusCode !== 200)
    throw new Error(`Nhận việc hỏng: ${claim.statusCode} ${claim.body}`);
  return opsDecide(user, taskId, body);
}

async function heldBy(user: TestUser, fields: Record<string, unknown> = {}): Promise<OwnListing> {
  const held = await machineHold(app, user, await submitted(app, user, fields));
  await deliverAll(app);
  return held;
}

/** Tin sàn đang hiện đầy đủ, kèm việc mẫu hàng 5 theo rủi ro. */
async function sampledLive(user: TestUser, categoryId: string): Promise<OwnListing> {
  const live = await liveListingOf(app, user, { categoryId });
  await deliverAll(app);
  await app.modules.review.addReason(live.id, { reason: 'sample_risk' });
  return live;
}

const templateId = async (text: string): Promise<string> => {
  const list = dataOf<Template[]>(
    await api(app, 'GET', '/ops/review/reason-templates', master.token),
  );
  const found = list.find((template) => template.text === text);
  if (!found) throw new Error(`Không có lý do mẫu "${text}"`);
  return found.id;
};

const templateIdsSeenBy = async (user: TestUser): Promise<string[]> =>
  dataOf<Template[]>(await api(app, 'GET', '/ops/review/reason-templates', user.token)).map(
    (template) => template.id,
  );

/** Lượt máy đã kết luận cho tin — nhật ký quyết định chụp kết quả và luật đã trúng từ đây. */
const machineRun = (listing: OwnListing, ownerId: string, hits: string[]) => {
  const run: Prisma.ScreeningRunUncheckedCreateInput = {
    listingId: listing.id,
    listingVersion: listing.version - 1,
    accountId: ownerId,
    trigger: 'submission',
    startedAt: TEST_NOW,
    textResult: {},
    imageIds: [],
    decidedAt: TEST_NOW,
    outcome: 'hold',
    cause: 'gate',
    score: 35,
    band: 'medium',
    tier: 'T1',
    hits: hits.map((code) => ({ code, weight: 0, mode: 'on', refs: [] })),
    configVersion: 1,
    ruleVersion: 1,
  };
  return prisma.screeningRun.create({ data: run });
};

/** Nhóm có lớp 10A với hai điều hành viên; danh mục mặc định để nhóm duyệt tin trong nhóm. */
async function school() {
  const group = await createActiveGroup(app, { master });
  const unit10a = await createUnit(app, group, `10A ${randomUUID().slice(0, 4)}`);
  const moderator = async () => {
    const user = await addMember(app, group.groupId, { unitId: unit10a });
    await appointModerator(app, group, user, unit10a);
    return user;
  };
  return { group, unit10a, mod10a: await moderator(), mod10a2: await moderator() };
}

const inGroup = (group: ActiveGroup, categoryId: string) => ({
  placement: 'members_only',
  groupId: group.groupId,
  categoryId,
});

describe('Đạt cho tin máy giữ', () => {
  it('tin của T2 bị giữ vì giá vượt trần: đang hiển thị, đầy đủ', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    tiers.set(poster.id, 'T2');
    const held = await heldBy(poster, { categoryId: category });
    const res = await claimAndDecide(staff, held.id, {
      outcome: 'pass',
      machineJudgment: 'machine_overreach',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<Decision>(res)).toMatchObject({ outcome: 'pass', listingState: 'live' });
    expect(await getOwn(app, poster, held.id)).toMatchObject({ state: 'live', restrictions: [] });
  });

  it('tin sàn của T0: đang hiển thị đầy đủ — mức tin cậy không là lý do hạn chế', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    tiers.set(poster.id, 'T0');
    const held = await heldBy(poster, { categoryId: category });
    await claimAndDecide(staff, held.id, { outcome: 'pass', machineJudgment: 'machine_right' });
    expect(await getOwn(app, poster, held.id)).toMatchObject({ state: 'live', restrictions: [] });
  });

  it('T1 dải Vừa bị giữ vì ảnh trùng: đầy đủ, không lý do "máy", không việc hàng 3', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    await machineRun(held, poster.id, ['duplicate_image']);
    const res = await claimAndDecide(staff, held.id, {
      outcome: 'pass',
      machineJudgment: 'machine_overreach',
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect((await getOwn(app, poster, held.id)).restrictions).toEqual([]);
    expect(await openTasks(held.id)).toEqual([]);
  });

  it('nhận định về máy: nhật ký ghi "máy đúng" cùng các luật máy đã trúng', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    await machineRun(held, poster.id, ['price_over_cap']);
    const res = await claimAndDecide(staff, held.id, {
      outcome: 'pass',
      machineJudgment: 'machine_right',
    });
    const row = await prisma.reviewDecision.findUniqueOrThrow({
      where: { id: dataOf<Decision>(res).decisionId },
    });
    expect(row).toMatchObject({
      machineJudgment: 'machine_right',
      machineHits: ['price_over_cap'],
    });
  });

  it('thiếu nhận định về máy: 400 VALIDATION_ERROR, tin không đổi', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const res = await claimAndDecide(staff, held.id, { outcome: 'pass' });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');
    expect(await openTasks(held.id)).toHaveLength(1);
  });
});

describe('Đạt cho tin đang hậu kiểm', () => {
  it('hàng 3, tin T1 hạn chế chỉ vì "máy": đầy đủ, số ngày còn lại không đổi', async () => {
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
    expect((await openTasks(limited.id))[0]?.queue).toBe(3);
    now = new Date(TEST_NOW.getTime() + 2 * DAY_MS);
    const res = await claimAndDecide(staff, limited.id, { outcome: 'pass' });
    expect(res.statusCode, res.body).toBe(200);
    expect(await getOwn(app, poster, limited.id)).toMatchObject({
      state: 'live',
      restrictions: [],
      expiresAt: limited.expiresAt,
    });
  });

  it('hàng 5, tin đang hiện đầy đủ: việc đóng, tin giữ nguyên trạng thái, mức, số ngày còn lại', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const live = await sampledLive(poster, category);
    const taskId = await taskIdOf(live.id);
    expect((await opsClaim(staff, taskId)).statusCode).toBe(200);
    expect((await opsDecide(staff, taskId, { outcome: 'pass' })).statusCode).toBe(200);
    const after = await getOwn(app, poster, live.id);
    expect(after).toMatchObject({
      state: 'live',
      version: live.version,
      restrictions: live.restrictions,
      expiresAt: live.expiresAt,
    });
    expect(await prisma.reviewTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'decided',
      closeCause: 'decided',
      claimedBy: null,
    });
  });
});

describe('Từ chối hoặc gỡ vì sai sót', () => {
  it('từ chối tin máy giữ kèm "Ảnh chưa rõ sản phẩm": bị từ chối, người đăng thấy lý do', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const res = await claimAndDecide(staff, held.id, {
      outcome: 'mistake',
      reasonTemplateId: await templateId('Ảnh chưa rõ sản phẩm'),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<Decision>(res)).toMatchObject({ outcome: 'reject', listingState: 'rejected' });
    expect(await getOwn(app, poster, held.id)).toMatchObject({
      state: 'rejected',
      fault: 'mistake',
      faultReason: 'Ảnh chưa rõ sản phẩm',
    });
  });

  it('gỡ tin đang có việc hàng 5: bị gỡ, không còn hiện với người khác', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const live = await sampledLive(poster, category);
    expect((await listingApi(app, 'GET', `/listings/${live.id}`, null)).statusCode).toBe(200);
    const res = await claimAndDecide(staff, live.id, {
      outcome: 'mistake',
      reasonTemplateId: await templateId('Thiếu thông tin quan trọng'),
    });
    expect(dataOf<Decision>(res)).toMatchObject({ outcome: 'remove', listingState: 'removed' });
    expect((await getOwn(app, poster, live.id)).state).toBe('removed');
    expect((await listingApi(app, 'GET', `/listings/${live.id}`, null)).statusCode).toBe(404);
  });

  it('thiếu lý do mẫu: 400 VALIDATION_ERROR, tin không đổi', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const res = await claimAndDecide(staff, held.id, { outcome: 'mistake' });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');
  });

  it('tài khoản T2 bị từ chối vì sai sót: vẫn T2, không gậy, không đổi gì trên tài khoản', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    await seedTier(poster.id, 'T2');
    const before = await prisma.trustTierResult.findUniqueOrThrow({
      where: { accountId: poster.id },
    });
    const held = await heldBy(poster, { categoryId: category });
    await claimAndDecide(staff, held.id, {
      outcome: 'mistake',
      reasonTemplateId: await templateId('Giá ghi sai'),
    });
    await deliverAll(app);
    expect(
      await prisma.trustTierResult.findUniqueOrThrow({ where: { accountId: poster.id } }),
    ).toEqual(before);
    expect((await getOwn(app, poster, held.id)).fault).toBe('mistake');
  });
});

describe('Gỡ khỏi nhóm', () => {
  it('điều hành viên gỡ tin trong nhóm mình đang nhận việc: tin rời nhóm, không hiện trong nhóm', async () => {
    const category = await seedCategory();
    const { group, unit10a, mod10a } = await school();
    const poster = await addMember(app, group.groupId, { unitId: unit10a });
    const held = await heldBy(poster, inGroup(group, category));
    const taskId = await taskIdOf(held.id);
    expect((await groupClaim(mod10a, group.groupId, taskId)).statusCode).toBe(200);
    const res = await groupDecide(mod10a, group.groupId, taskId, { outcome: 'detach' });
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<Decision>(res).outcome).toBe('detach');
    expect((await getOwn(app, poster, held.id)).hideReasons).toContain('detached_by_group');
    expect(await openTasks(held.id)).toEqual([]);
  });

  it('chọn "gỡ khỏi nhóm" cho việc về tin sàn: 409 OUTCOME_NOT_ALLOWED, tin không đổi', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const res = await claimAndDecide(staff, held.id, { outcome: 'detach' });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('OUTCOME_NOT_ALLOWED');
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');
  });

  it('staff đang nhận việc về tin trong nhóm chọn "gỡ khỏi nhóm": 403 FORBIDDEN', async () => {
    const category = await seedCategory({ groupReview: 'platform' });
    const staff = await staffOf([category]);
    const { group, unit10a } = await school();
    const poster = await addMember(app, group.groupId, { unitId: unit10a });
    const held = await heldBy(poster, inGroup(group, category));
    const res = await claimAndDecide(staff, held.id, { outcome: 'detach' });
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect((await getOwn(app, poster, held.id)).hideReasons).toEqual([]);
  });
});

describe('Lý do mẫu do master soạn', () => {
  it('khởi đầu có sáu lý do; master thêm một lý do, staff thấy khi từ chối vì sai sót', async () => {
    // Bảng đã có lý do: bước khởi động không chèn lại, kể cả khi master đã sửa câu hay tắt lý do.
    expect(await app.modules.review.ensureReasonTemplates()).toEqual({ reasonTemplates: 0 });
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const text = `Ảnh chụp màn hình, không phải ảnh thật ${randomUUID().slice(0, 6)}`;
    const created = await api(app, 'POST', '/ops/review/reason-templates', master.token, {
      text,
      sort: 7,
    });
    expect(created.statusCode, created.body).toBe(201);
    const list = dataOf<Template[]>(
      await api(app, 'GET', '/ops/review/reason-templates', staff.token),
    );
    expect(list.map((template) => template.text)).toEqual(
      expect.arrayContaining([
        'Ảnh chưa rõ sản phẩm',
        'Thiếu thông tin quan trọng',
        'Sai danh mục',
        'Giá ghi sai',
        'Tiêu đề không mô tả món hàng',
        'Trùng tin đã đăng',
        text,
      ]),
    );
  });

  it('staff thêm lý do mẫu: 403 FORBIDDEN', async () => {
    const staff = await staffOf([await seedCategory()]);
    const res = await api(app, 'POST', '/ops/review/reason-templates', staff.token, {
      text: 'Staff tự soạn',
    });
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
  });

  it('dùng lý do master đã tắt: 400 VALIDATION_ERROR, tin không đổi; staff không còn thấy, master thấy', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const created = dataOf<Template>(
      await api(app, 'POST', '/ops/review/reason-templates', master.token, {
        text: `Sắp tắt ${randomUUID().slice(0, 6)}`,
      }),
    );
    const off = await api(
      app,
      'PATCH',
      `/ops/review/reason-templates/${created.id}`,
      master.token,
      { active: false },
    );
    expect(dataOf<Template>(off).active).toBe(false);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const res = await claimAndDecide(staff, held.id, {
      outcome: 'mistake',
      reasonTemplateId: created.id,
    });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');
    expect(await templateIdsSeenBy(staff)).not.toContain(created.id);
    expect(await templateIdsSeenBy(master)).toContain(created.id);
  });
});

describe('Gỡ trực tiếp tin sàn đang hiện', () => {
  it('staff Điện thoại gỡ thẳng tin sàn Điện thoại kèm "Sai danh mục": bị gỡ, nhật ký không gắn việc', async () => {
    const phone = await seedCategory();
    const staff = await staffOf([phone]);
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster, { categoryId: phone });
    await deliverAll(app);
    const res = await api(app, 'POST', `/ops/review/listings/${live.id}/remove`, staff.token, {
      reasonTemplateId: await templateId('Sai danh mục'),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await getOwn(app, poster, live.id)).toMatchObject({
      state: 'removed',
      fault: 'mistake',
      faultReason: 'Sai danh mục',
    });
    const row = await prisma.reviewDecision.findUniqueOrThrow({
      where: { id: dataOf<Decision>(res).decisionId },
    });
    expect(row).toMatchObject({ taskId: null, outcome: 'remove', severity: 'mistake' });
  });

  it('tin đang có việc hàng 3: 409 TASK_OPEN, tin không đổi', async () => {
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
    const res = await api(app, 'POST', `/ops/review/listings/${limited.id}/remove`, staff.token, {
      reasonTemplateId: await templateId('Sai danh mục'),
    });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('TASK_OPEN');
    expect((await getOwn(app, poster, limited.id)).state).toBe('live');
  });

  it('tin chỉ đăng trong nhóm: 409 OUTCOME_NOT_ALLOWED, tin không đổi', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const { group, unit10a } = await school();
    const poster = await addMember(app, group.groupId, { unitId: unit10a });
    const live = await liveListingOf(app, poster, inGroup(group, category));
    await deliverAll(app);
    const res = await api(app, 'POST', `/ops/review/listings/${live.id}/remove`, staff.token, {
      reasonTemplateId: await templateId('Sai danh mục'),
    });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('OUTCOME_NOT_ALLOWED');
    expect((await getOwn(app, poster, live.id)).state).toBe('live');
  });
});

describe('Khôi phục tin sàn đã bị gỡ', () => {
  it('bị gỡ lúc còn 12 ngày, 5 ngày sau khôi phục: hiển thị lại với 12 ngày còn lại', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster, { categoryId: category });
    await deliverAll(app);
    now = new Date(new Date(live.expiresAt ?? '').getTime() - 12 * DAY_MS);
    await api(app, 'POST', `/ops/review/listings/${live.id}/remove`, staff.token, {
      reasonTemplateId: await templateId('Giá ghi sai'),
    });
    expect((await getOwn(app, poster, live.id)).remainingMs).toBe(12 * DAY_MS);
    now = new Date(now.getTime() + 5 * DAY_MS);
    const res = await api(app, 'POST', `/ops/review/listings/${live.id}/restore`, staff.token);
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<Decision>(res)).toMatchObject({ outcome: 'restore', listingState: 'live' });
    expect(await getOwn(app, poster, live.id)).toMatchObject({
      state: 'live',
      fault: null,
      expiresAt: new Date(now.getTime() + 12 * DAY_MS).toISOString(),
    });
  });

  it('khôi phục tin đang hiển thị: 409 INVALID_TRANSITION, tin vẫn đang hiển thị', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster, { categoryId: category });
    const res = await api(app, 'POST', `/ops/review/listings/${live.id}/restore`, staff.token);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('INVALID_TRANSITION');
    expect((await getOwn(app, poster, live.id)).state).toBe('live');
  });

  it('staff chỉ được giao Xe máy khôi phục tin Điện thoại bị gỡ: 403 FORBIDDEN, tin vẫn bị gỡ', async () => {
    const [phone, motorbike] = [await seedCategory(), await seedCategory()];
    const [staffPhone, staffBike] = [await staffOf([phone]), await staffOf([motorbike])];
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster, { categoryId: phone });
    await deliverAll(app);
    await api(app, 'POST', `/ops/review/listings/${live.id}/remove`, staffPhone.token, {
      reasonTemplateId: await templateId('Sai danh mục'),
    });
    const res = await api(app, 'POST', `/ops/review/listings/${live.id}/restore`, staffBike.token);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect((await getOwn(app, poster, live.id)).state).toBe('removed');
  });
});

describe('Quyết định chỉ áp lên nội dung người xử đã thấy', () => {
  it('người đăng sửa tiêu đề lúc staff đang nhận: 409 LISTING_CHANGED; tải lại, nhận lại rồi quyết được', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const taskId = await taskIdOf(held.id);
    expect((await opsClaim(staff, taskId)).statusCode).toBe(200);
    const edited = await patch(app, poster, held, { title: 'Xe đạp cũ, mới thay lốp' });
    expect(edited.statusCode, edited.body).toBe(200);
    const stale = await opsDecide(staff, taskId, {
      outcome: 'pass',
      machineJudgment: 'machine_overreach',
    });
    expect(stale.statusCode).toBe(409);
    expect(codeOf(stale)).toBe('LISTING_CHANGED');
    expect((await getOwn(app, poster, held.id)).state).not.toBe('live');

    const heldAgain = await machineHold(app, poster, (edited.json() as { data: OwnListing }).data);
    await deliverAll(app);
    const again = await taskIdOf(held.id);
    const claim = await opsClaim(staff, again);
    expect(claim.statusCode, claim.body).toBe(200);
    expect(dataOf<{ listingVersion: number }>(claim).listingVersion).toBe(heldAgain.version);
    const res = await opsDecide(staff, again, {
      outcome: 'pass',
      machineJudgment: 'machine_overreach',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await getOwn(app, poster, held.id)).toMatchObject({
      state: 'live',
      title: 'Xe đạp cũ, mới thay lốp',
    });
  });
});

describe('Người quyết phải còn quyền lúc quyết', () => {
  it('điều hành viên bị bãi nhiệm khi đang nhận việc rồi quyết: 403 FORBIDDEN, không gì đổi', async () => {
    const category = await seedCategory();
    const { group, unit10a, mod10a } = await school();
    const poster = await addMember(app, group.groupId, { unitId: unit10a });
    const held = await heldBy(poster, inGroup(group, category));
    const taskId = await taskIdOf(held.id);
    expect((await groupClaim(mod10a, group.groupId, taskId)).statusCode).toBe(200);
    const dismissed = await api(
      app,
      'DELETE',
      `/groups/${group.groupId}/moderators/${mod10a.id}`,
      group.owner.token,
    );
    expect(dismissed.statusCode, dismissed.body).toBe(204);
    await deliverAll(app);
    const res = await groupDecide(mod10a, group.groupId, taskId, { outcome: 'detach' });
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await getOwn(app, poster, held.id)).toMatchObject({ state: 'pending', hideReasons: [] });
    expect(await openTasks(held.id)).toHaveLength(1);
  });
});

describe('Nhật ký quyết định', () => {
  it('staff từ chối vì sai sót tin máy giữ: một dòng đủ người, tin, việc, kết quả, lý do, máy, hậu quả', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category, title: 'Tiêu đề riêng của tin' });
    await machineRun(held, poster.id, ['price_over_cap']);
    const taskId = await taskIdOf(held.id);
    const res = await claimAndDecide(staff, held.id, {
      outcome: 'mistake',
      reasonTemplateId: await templateId('Ảnh chưa rõ sản phẩm'),
    });
    const row = await prisma.reviewDecision.findUniqueOrThrow({
      where: { id: dataOf<Decision>(res).decisionId },
    });
    expect(row).toMatchObject({
      actorId: staff.id,
      actorRole: 'staff',
      listingId: held.id,
      taskId,
      outcome: 'reject',
      severity: 'mistake',
      reasonText: 'Ảnh chưa rõ sản phẩm',
      machineOutcome: 'hold',
      listingStateAfter: 'rejected',
      posterTierAfter: 'T1',
    });
    // Nhật ký không chứa nội dung tin: không tiêu đề, mô tả, ảnh.
    const logged = JSON.stringify(row, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(logged).not.toContain('Tiêu đề riêng của tin');
    for (const image of held.images) expect(logged).not.toContain(image.id);
  });

  it('master quyết một việc: có dòng nhật ký như mọi người khác', async () => {
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: await seedCategory() });
    const res = await claimAndDecide(master, held.id, {
      outcome: 'pass',
      machineJudgment: 'machine_right',
    });
    expect(res.statusCode, res.body).toBe(200);
    const row = await prisma.reviewDecision.findUniqueOrThrow({
      where: { id: dataOf<Decision>(res).decisionId },
    });
    expect(row).toMatchObject({ actorId: master.id, actorRole: 'master', outcome: 'pass' });
  });
});

describe('Mẫu hậu kiểm người duyệt', () => {
  it('staff cho đạt việc máy giữ trúng mẫu: việc hàng 5 trừ người đó; người khác gỡ thì lật quyết định cũ', async () => {
    reviewerSamplePercent = 100;
    const category = await seedCategory();
    const [a, b] = [await staffOf([category]), await staffOf([category])];
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const passed = await claimAndDecide(a, held.id, {
      outcome: 'pass',
      machineJudgment: 'machine_overreach',
    });
    await deliverAll(app);
    const first = dataOf<Decision>(passed).decisionId;
    const [sample] = await openTasks(held.id);
    expect(sample).toMatchObject({
      queue: 5,
      reasons: ['sample_reviewer'],
      sampledDecisionId: first,
    });
    expect(sample?.excludedIds).toContain(a.id);
    // Hậu kiểm quyết định của chính mình (spec review/conflict-of-interest): không hiện cho A, hiện cho B.
    expect(await queueListingIds(a)).not.toContain(held.id);
    expect(await queueListingIds(b)).toContain(held.id);
    expect((await opsClaim(a, sample?.id ?? '')).statusCode).toBe(404);

    const removed = await claimAndDecide(b, held.id, {
      outcome: 'mistake',
      reasonTemplateId: await templateId('Trùng tin đã đăng'),
    });
    expect(removed.statusCode, removed.body).toBe(200);
    const row = await prisma.reviewDecision.findUniqueOrThrow({
      where: { id: dataOf<Decision>(removed).decisionId },
    });
    expect(row).toMatchObject({ outcome: 'remove', overturnsDecisionId: first });
  });

  it('master cho đạt: không lấy mẫu người duyệt', async () => {
    reviewerSamplePercent = 100;
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: await seedCategory() });
    await claimAndDecide(master, held.id, { outcome: 'pass', machineJudgment: 'machine_right' });
    await deliverAll(app);
    expect(await openTasks(held.id)).toEqual([]);
  });
});

/** Người giữ việc gửi cùng một quyết định hai lần một lúc. */
async function decideTwice(staff: TestUser, taskId: string, body: object) {
  const results = await Promise.all([
    opsDecide(staff, taskId, body),
    opsDecide(staff, taskId, body),
  ]);
  const statuses = results.map((res) => res.statusCode).toSorted((a, b) => a - b);
  expect(statuses, results.map((res) => res.body).join('\n')).toEqual([200, 409]);
  const rejected = results.find((res) => res.statusCode === 409);
  expect(rejected && codeOf(rejected)).toBe('TASK_CLOSED');
  expect(await prisma.reviewDecision.count({ where: { taskId } })).toBe(1);
}

describe('Một việc một quyết định (fix-audit-review, T6)', () => {
  it('cho đạt tin máy giữ hai lần một lúc: một 200, một 409 TASK_CLOSED, một dòng nhật ký', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const held = await heldBy(await newUser(app), { categoryId: category });
    const taskId = await taskIdOf(held.id);
    expect((await opsClaim(staff, taskId)).statusCode).toBe(200);
    await decideTwice(staff, taskId, { outcome: 'pass', machineJudgment: 'machine_right' });
  });

  it('cho đạt việc hàng 5 hai lần một lúc — tin không đổi nên chỉ lượt đóng việc chặn: một dòng nhật ký', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const live = await sampledLive(await newUser(app), category);
    const taskId = await taskIdOf(live.id);
    expect((await opsClaim(staff, taskId)).statusCode).toBe(200);
    await decideTwice(staff, taskId, { outcome: 'pass' });
  });
});
