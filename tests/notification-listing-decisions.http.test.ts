import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ListingTrustPort } from '../src/modules/listing/listing.ports.js';
import { prisma } from './db-helpers.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
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
import {
  liveListingOf,
  listingApi,
  machineHold,
  type OwnListing,
  submitted,
} from './listing-http-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec notification/listing-notices qua luồng thật (change notify-listing-decisions): lượt quyết của `review` hay lượt
 * giữ của máy → outbox → bên nghe của `notification` → hộp thư người đăng. Máy duyệt giả (interim): câu của máy thật
 * với ảnh trùng ở `screening-images.http.test.ts`.
 */
let app: FastifyInstance;
let master: TestUser;
const trust: ListingTrustPort = {
  tierOf: () => Promise.resolve('T1'),
  tierIn: () => Promise.resolve('T1'),
  assertCanSubmit: () => Promise.resolve(),
  strikePointsIn: () => Promise.resolve(0),
  strikePointsOf: () => Promise.resolve(0),
  struckAccounts: () => Promise.resolve(new Set<string>()),
};

beforeAll(async () => {
  app = await buildTestApp({ clock: () => TEST_NOW, trust, screening: interimScreening });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  master = await newMaster(app);
});

beforeEach(async () => {
  await deliverAll(app);
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;

const inbox = (user: TestUser, prefix = 'listing.') =>
  prisma.notification.findMany({
    where: { recipientId: user.id, type: { startsWith: prefix } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

const staffOf = async (categoryIds: string[]): Promise<TestUser> => {
  const user = await newUser(app);
  await grantStaff(user.id, [], categoryIds);
  return user;
};
const nameOf = async (user: TestUser) =>
  (await prisma.account.findUniqueOrThrow({ where: { id: user.id } })).displayName;
const taskIdOf = async (listingId: string) =>
  (await prisma.reviewTask.findFirstOrThrow({ where: { listingId, status: 'open' } })).id;

const templateId = async (text: string): Promise<string> => {
  const list = dataOf<{ id: string; text: string }[]>(
    await api(app, 'GET', '/ops/review/reason-templates', master.token),
  );
  const found = list.find((template) => template.text === text);
  if (!found) throw new Error(`Không có lý do mẫu "${text}"`);
  return found.id;
};

async function claimAndDecide(user: TestUser, listingId: string, body: object): Promise<Res> {
  const taskId = await taskIdOf(listingId);
  const claim = await api(app, 'POST', `/ops/review/tasks/${taskId}/claim`, user.token);
  if (claim.statusCode !== 200) throw new Error(`Nhận việc hỏng: ${claim.body}`);
  return api(app, 'POST', `/ops/review/tasks/${taskId}/decision`, user.token, body);
}

async function heldBy(user: TestUser, fields: Record<string, unknown>): Promise<OwnListing> {
  const held = await machineHold(app, user, await submitted(app, user, fields));
  await deliverAll(app);
  return held;
}

describe('Báo người đăng khi máy giữ tin', () => {
  it('máy giữ: người đăng nhận một thông báo có nhắc; tin vẫn chờ thì không nhắc lại', async () => {
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: await seedCategory() });
    await deliverAll(app);
    expect(await inbox(poster)).toEqual([
      expect.objectContaining({
        type: 'listing.machine.hold',
        category: 'your_listings',
        alert: true,
        data: expect.objectContaining({ listingId: held.id }),
      }),
    ]);
  });

  it('máy rút tin đang hiện về chờ duyệt: người đăng nhận thông báo có nhắc', async () => {
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster, { categoryId: await seedCategory() });
    await deliverAll(app);
    expect(await app.modules.listing.recallByMachine(live.id, live.version)).toBe(true);
    await deliverAll(app);
    expect(await inbox(poster)).toEqual([
      expect.objectContaining({
        type: 'listing.machine.recall',
        alert: true,
        body: expect.stringContaining('tạm ngừng hiển thị để chờ người duyệt xem lại'),
      }),
    ]);
  });
});

describe('Báo người đăng kết quả duyệt tin', () => {
  it('Tin chờ duyệt được duyệt: có nhắc, ký "Ghim", không tên staff', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const res = await claimAndDecide(staff, held.id, {
      outcome: 'pass',
      machineJudgment: 'machine_right',
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    const [notice] = await inbox(poster, 'listing.review.');
    expect(notice).toMatchObject({
      type: 'listing.review.approved',
      category: 'your_listings',
      title: 'Ghim',
      alert: true,
      body: expect.stringContaining('đã được duyệt và đang hiển thị'),
    });
    const staffName = await nameOf(staff);
    expect(JSON.stringify(notice)).not.toContain(staffName);
  });

  it('Bị từ chối vì sai sót: câu nhắc không lý do; nội dung trong app nêu lý do mẫu và cách sửa', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const res = await claimAndDecide(staff, held.id, {
      outcome: 'mistake',
      reasonTemplateId: await templateId('Ảnh chưa rõ sản phẩm'),
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await inbox(poster, 'listing.review.')).toEqual([
      expect.objectContaining({
        type: 'listing.review.rejected',
        alert: true,
        body: expect.not.stringContaining('Ảnh chưa rõ sản phẩm'),
        detail: expect.stringMatching(/Ảnh chưa rõ sản phẩm.*Sửa tin rồi gửi lại/),
      }),
    ]);
  });

  it('Bị gỡ vì sai sót rồi được khôi phục: hai thông báo có nhắc, đúng câu từng lượt', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster, { categoryId: category });
    await deliverAll(app);
    const removed = await api(app, 'POST', `/ops/review/listings/${live.id}/remove`, staff.token, {
      reasonTemplateId: await templateId('Giá ghi sai'),
    });
    expect(removed.statusCode, removed.body).toBe(200);
    const restored = await api(app, 'POST', `/ops/review/listings/${live.id}/restore`, staff.token);
    expect(restored.statusCode, restored.body).toBe(200);
    await deliverAll(app);
    expect(await inbox(poster, 'listing.review.')).toEqual([
      expect.objectContaining({
        type: 'listing.review.removed',
        alert: true,
        detail: expect.stringMatching(/Giá ghi sai.*Sửa tin rồi gửi lại để tin hiện lại/),
      }),
      expect.objectContaining({
        type: 'listing.review.restored',
        alert: true,
        body: expect.stringContaining('đã hiển thị lại'),
      }),
    ]);
  });

  it('Quyết định không còn áp được: 409 LISTING_CHANGED, người đăng không nhận gì về quyết định đó', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    const taskId = await taskIdOf(held.id);
    expect(
      (await api(app, 'POST', `/ops/review/tasks/${taskId}/claim`, staff.token)).statusCode,
    ).toBe(200);
    // Người đăng tự rút về: không ai được báo về việc đó.
    expect(
      (await listingApi(app, 'POST', `/listings/${held.id}/withdraw`, poster)).statusCode,
    ).toBe(200);
    const res = await api(app, 'POST', `/ops/review/tasks/${taskId}/decision`, staff.token, {
      outcome: 'mistake',
      reasonTemplateId: await templateId('Sai danh mục'),
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('LISTING_CHANGED');
    await deliverAll(app);
    expect(await inbox(poster, 'listing.review.')).toEqual([]);
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: 'review.listing.decided',
          payload: { path: ['listingId'], equals: held.id },
        },
      }),
    ).toBe(0);
  });
});

async function groupWithModerator(): Promise<{ group: ActiveGroup; moderator: TestUser }> {
  const group = await createActiveGroup(app, { master });
  const moderator = await addMember(app, group.groupId);
  await appointModerator(app, group, moderator);
  return { group, moderator };
}

describe('Không nêu tên người duyệt', () => {
  it('Quản trị nhóm từ chối tin trong nhóm: ký "Quản trị nhóm «tên nhóm»", không tên điều hành viên', async () => {
    const category = await seedCategory();
    const { group, moderator } = await groupWithModerator();
    const poster = await addMember(app, group.groupId);
    const held = await heldBy(poster, {
      placement: 'members_only',
      groupId: group.groupId,
      categoryId: category,
    });
    const taskId = await taskIdOf(held.id);
    const base = `/groups/${group.groupId}/review/tasks/${taskId}`;
    expect((await api(app, 'POST', `${base}/claim`, moderator.token)).statusCode).toBe(200);
    const res = await api(app, 'POST', `${base}/decision`, moderator.token, {
      outcome: 'mistake',
      reasonTemplateId: await templateId('Thiếu thông tin quan trọng'),
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    const groupName = (await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } })).name;
    const [notice] = await inbox(poster, 'listing.review.');
    expect(notice).toMatchObject({
      type: 'listing.review.rejected',
      title: `Quản trị nhóm «${groupName}»`,
    });
    expect(JSON.stringify(notice)).not.toContain(await nameOf(moderator));
  });
});

describe('Những chuyện về tin không báo', () => {
  it('Máy cho qua ngay: người đăng không nhận thông báo nào về kết quả duyệt', async () => {
    const poster = await newUser(app);
    await liveListingOf(app, poster, { categoryId: await seedCategory() });
    await deliverAll(app);
    expect(await inbox(poster)).toEqual([]);
  });

  it('Hậu kiểm đạt: người đăng không nhận thông báo nào', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster, { categoryId: category });
    await deliverAll(app);
    await app.modules.review.addReason(live.id, { reason: 'sample_risk' });
    const res = await claimAndDecide(staff, live.id, { outcome: 'pass' });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await inbox(poster)).toEqual([]);
  });
});
