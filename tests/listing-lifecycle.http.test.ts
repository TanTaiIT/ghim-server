import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { createListingService } from '../src/modules/listing/listing.service.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  getOwn,
  groupSettings,
  listingApi,
  liveListingOf,
  machineHold,
  machinePass,
  patch,
  signedInAt,
  submitted,
} from './listing-http-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/lifecycle`, `listing/editing` qua HTTP: mũi tên của người đăng qua route, của máy qua
 * `applyMachineOutcome`, của người duyệt và khiếu nại qua service (chưa có route — `add-review-queues`).
 * Mức tin cậy T1 để tin lên bảng ở mức đầy đủ: lý do "tài khoản mới" có ca riêng.
 */
const DAY_MS = 86_400_000;
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

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const post = (user: TestUser, listing: { id: string }, action: string, body?: object) =>
  listingApi(app, 'POST', `/listings/${listing.id}/${action}`, user, body);
const strangerSees = async (id: string) =>
  (await listingApi(app, 'GET', `/listings/${id}`, null)).statusCode === 200;
const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });
const review = (
  listing: { id: string; version: number },
  arrow: 'approve' | 'restore' | 'appealWin',
) => app.modules.listing.review({ listingId: listing.id, version: listing.version, arrow });
const decide = (
  listing: { id: string; version: number },
  arrow: 'reject' | 'remove',
  fault: 'mistake' | 'violation',
) => app.modules.listing.review({ listingId: listing.id, version: listing.version, arrow, fault });

async function pendingOf(owner: TestUser, fields: Record<string, unknown> = {}) {
  return machineHold(app, owner, await submitted(app, owner, fields));
}

/** Đi một lượt rồi kiểm 409 `INVALID_TRANSITION` và dòng tin không đổi một cột nào. */
async function expectNoArrow(
  id: string,
  attempt: () => Promise<{ statusCode: number; json(): unknown }>,
): Promise<void> {
  const before = await row(id);
  const res = await attempt();
  expect(res.statusCode).toBe(409);
  expect(codeOf(res)).toBe('INVALID_TRANSITION');
  expect(await row(id)).toEqual(before);
}

describe('Mũi tên của người đăng', () => {
  it('gia hạn sớm tin còn 5 ngày: sang đang kiểm, đi như sửa tin', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    now = new Date(TEST_NOW.getTime() + 25 * DAY_MS);
    try {
      const res = await post(owner, live, 'renew', { version: live.version });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().data).toMatchObject({ state: 'checking', renewal: 'early' });
      expect(
        await prisma.listingSubmission.findFirst({
          where: { listingId: live.id, kind: 'renew_early' },
        }),
      ).not.toBeNull();
    } finally {
      now = TEST_NOW;
    }
  });

  it('rút tin chờ duyệt về nháp', async () => {
    const owner = await newUser(app);
    const pending = await pendingOf(owner);
    const res = await post(owner, pending, 'withdraw');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.state).toBe('draft');
  });

  it('đánh dấu đã bán một tin hết hạn', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    now = new Date(TEST_NOW.getTime() + 31 * DAY_MS);
    try {
      await app.modules.listing.expireDue();
      const later = await signedInAt(app, owner, now);
      expect((await getOwn(app, later, live.id)).state).toBe('expired');
      expect((await post(later, live, 'sold')).json().data.state).toBe('sold');
    } finally {
      now = TEST_NOW;
    }
  });

  it('sửa tin bị gỡ vì sai sót: sang đang kiểm; bị gỡ vì vi phạm: 409', async () => {
    const owner = await newUser(app);
    const mistake = await liveListingOf(app, owner);
    const violation = await liveListingOf(app, owner);
    const removed = await decide(mistake, 'remove', 'mistake');
    const banned = await decide(violation, 'remove', 'violation');
    const fixed = await patch(app, owner, removed, { title: 'Đã sửa cho đúng' });
    expect(fixed.statusCode, fixed.body).toBe(200);
    expect(fixed.json().data).toMatchObject({ state: 'checking', fault: null });
    await expectNoArrow(banned.id, () => patch(app, owner, banned, { title: 'Sửa lách' }));
  });

  it('người khác đánh dấu đã bán tin đang hiển thị: 403, tin vẫn hiển thị', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const live = await liveListingOf(app, owner);
    const res = await post(other, live, 'sold');
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect((await row(live.id)).state).toBe('live');
  });
});

describe('Mũi tên của máy duyệt', () => {
  it('cho qua: đang hiển thị ở mức theo kết quả — hạn chế thì mang lý do "máy"', async () => {
    const owner = await newUser(app);
    const full = await machinePass(app, owner, await submitted(app, owner));
    const limited = await machinePass(app, owner, await submitted(app, owner), true);
    expect(full).toMatchObject({ state: 'live', restrictions: [] });
    expect(limited).toMatchObject({ state: 'live', restrictions: ['machine'] });
  });

  it('giữ cho người: chờ duyệt', async () => {
    const owner = await newUser(app);
    expect((await pendingOf(owner)).state).toBe('pending');
  });

  it('kết quả của nội dung cũ (tin đã sửa sau đó): bỏ qua, không lỗi', async () => {
    const owner = await newUser(app);
    const sent = await submitted(app, owner);
    const applied = await app.modules.listing.applyMachineOutcome({
      listingId: sent.id,
      listingVersion: sent.version - 1,
      outcome: 'pass',
      restrictMachine: false,
    });
    expect(applied).toBe(false);
    expect((await row(sent.id)).state).toBe('checking');
  });

  it('cụm từ cấm mới bật thật: tin đang hiện rút về chờ duyệt, người lạ không còn thấy', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    expect(await strangerSees(live.id)).toBe(true);
    expect(await app.modules.listing.recallByMachine(live.id, live.version)).toBe(true);
    expect((await row(live.id)).state).toBe('pending');
    expect(await strangerSees(live.id)).toBe(false);
  });
});

describe('Mũi tên của hệ thống', () => {
  it('tin chờ duyệt quá hạn xử: vẫn chờ duyệt, không tự lên bảng', async () => {
    const owner = await newUser(app);
    const pending = await pendingOf(owner);
    now = new Date(TEST_NOW.getTime() + 90 * DAY_MS);
    try {
      await app.modules.listing.expireDue();
      await app.modules.listing.remindExpiring();
      expect((await row(pending.id)).state).toBe('pending');
    } finally {
      now = TEST_NOW;
    }
  });
});

describe('Mũi tên của người duyệt và khiếu nại', () => {
  it('cho đạt: chờ duyệt → đang hiển thị', async () => {
    const owner = await newUser(app);
    expect((await review(await pendingOf(owner), 'approve')).state).toBe('live');
  });

  it('từ chối: bị từ chối, người lạ không thấy', async () => {
    const owner = await newUser(app);
    const rejected = await decide(await pendingOf(owner), 'reject', 'violation');
    expect(rejected).toMatchObject({ state: 'rejected', fault: 'violation' });
    expect(await strangerSees(rejected.id)).toBe(false);
  });

  it('gỡ rồi khôi phục: bị gỡ, rồi trở lại đang hiển thị', async () => {
    const owner = await newUser(app);
    const removed = await decide(await liveListingOf(app, owner), 'remove', 'violation');
    expect(removed.state).toBe('removed');
    const restored = await app.modules.listing.review({
      listingId: removed.id,
      version: removed.version,
      arrow: 'restore',
    });
    expect(restored).toMatchObject({ state: 'live', fault: null });
  });

  it('từ chối tin đang hiển thị: 409 INVALID_TRANSITION, tin vẫn hiển thị', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await expect(decide(live, 'reject', 'violation')).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_TRANSITION',
    });
    expect((await row(live.id)).state).toBe('live');
  });

  it('khiếu nại thắng: bị từ chối hay bị gỡ đều về đang hiển thị', async () => {
    const owner = await newUser(app);
    const rejected = await decide(await pendingOf(owner), 'reject', 'violation');
    const removed = await decide(await liveListingOf(app, owner), 'remove', 'violation');
    expect((await review(rejected, 'appealWin')).state).toBe('live');
    expect((await review(removed, 'appealWin')).state).toBe('live');
  });

  it('phiên bản lệch: 409 CONFLICT', async () => {
    const owner = await newUser(app);
    const pending = await pendingOf(owner);
    await expect(
      app.modules.listing.review({
        listingId: pending.id,
        version: pending.version - 1,
        arrow: 'approve',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('Không có mũi tên nào khác', () => {
  it('gia hạn tin đã bán', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    const sold = (await post(owner, live, 'sold')).json().data;
    await expectNoArrow(sold.id, () => post(owner, sold, 'renew', { version: sold.version }));
  });

  it('rút về nháp một tin đang hiển thị', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await expectNoArrow(live.id, () => post(owner, live, 'withdraw'));
  });

  it('đánh dấu đã bán một tin chờ duyệt', async () => {
    const owner = await newUser(app);
    const pending = await pendingOf(owner);
    await expectNoArrow(pending.id, () => post(owner, pending, 'sold'));
  });

  it('sửa tiêu đề tin đang kiểm', async () => {
    const owner = await newUser(app);
    const checking = await submitted(app, owner);
    await expectNoArrow(checking.id, () =>
      patch(app, owner, checking, { title: 'Sửa giữa chừng' }),
    );
  });

  it('sửa giá tin hết hạn mà không gia hạn', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    now = new Date(TEST_NOW.getTime() + 31 * DAY_MS);
    try {
      await app.modules.listing.expireDue();
      const later = await signedInAt(app, owner, now);
      const expired = await getOwn(app, later, live.id);
      await expectNoArrow(live.id, () => patch(app, later, expired, { price: 900_000 }));
    } finally {
      now = TEST_NOW;
    }
  });

  it('sửa giá tin đã bán', async () => {
    const owner = await newUser(app);
    const sold = (await post(owner, await liveListingOf(app, owner), 'sold')).json().data;
    await expectNoArrow(sold.id, () => patch(app, owner, sold, { price: 1 }));
  });
});

describe('Tạm ẩn và mức hiển thị không đổi trạng thái', () => {
  it('nhóm bị khoá rồi mở khoá: tin vẫn đang hiển thị, chỉ mang thêm rồi bỏ cờ tạm ẩn', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    await listingApi(app, 'POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    await deliverAll(app);
    expect(await row(live.id)).toMatchObject({ state: 'live', hideReasons: ['group_locked'] });
    await listingApi(app, 'POST', `/ops/groups/${group.groupId}/unlock`, master);
    await deliverAll(app);
    expect(await row(live.id)).toMatchObject({ state: 'live', hideReasons: [] });
  });

  it('gỡ lý do hạn chế cuối cùng: vẫn đang hiển thị, mức hiển thị sang đầy đủ', async () => {
    const owner = await newUser(app);
    const t0 = await buildTestApp({ clock: () => now });
    try {
      const live = await liveListingOf(t0, owner);
      expect(live.restrictions).toEqual(['new_account']);
      await app.modules.listing.onTierRaised(owner.id);
      expect(await row(live.id)).toMatchObject({ state: 'live', restrictions: [] });
    } finally {
      await t0.close();
    }
  });
});

describe('Sửa nội dung người mua đọc hay lọc theo thì qua máy lại', () => {
  it('sửa tiêu đề tin đang hiển thị: đang kiểm, người lạ không thấy tới khi máy cho qua', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    const edited = (await patch(app, owner, live, { title: 'Tiêu đề mới' })).json().data;
    expect(edited.state).toBe('checking');
    expect(await strangerSees(live.id)).toBe(false);
    await machinePass(app, owner, edited);
    expect(await strangerSees(live.id)).toBe(true);
  });

  it('chỉ đổi thứ tự ảnh: đang kiểm', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner, {}, 2);
    const [a, b] = live.images.map((image) => image.id);
    expect((await patch(app, owner, live, { imageIds: [b, a] })).json().data.state).toBe(
      'checking',
    );
  });

  it('sửa giá tin chờ duyệt: đang kiểm', async () => {
    const owner = await newUser(app);
    const pending = await pendingOf(owner);
    expect((await patch(app, owner, pending, { price: 999_000 })).json().data.state).toBe(
      'checking',
    );
  });

  it('app chỉ gửi ô mô tả với nội dung mới: đang kiểm', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    expect((await patch(app, owner, live, { description: 'Mô tả mới' })).json().data.state).toBe(
      'checking',
    );
  });

  it('hai thiết bị cùng sửa: lượt mang phiên bản cũ nhận 409 CONFLICT', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await patch(app, owner, live, { negotiable: true });
    const stale = await patch(app, owner, live, { delivery: true });
    expect(stale.statusCode).toBe(409);
    expect(codeOf(stale)).toBe('CONFLICT');
  });
});

describe('Nơi đăng khi sửa', () => {
  it('mở rộng hai nấc: "chỉ thành viên" có khu vực lên sàn chung → đang kiểm', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    const res = await patch(app, member, live, { placement: 'marketplace', groupId: null });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ state: 'checking', placement: 'marketplace' });
  });

  it('mở rộng lên sàn chung khi chưa có phường: 400 REGION_REQUIRED, tin không đổi', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
      provinceCode: null,
      wardCode: null,
    });
    const before = await row(live.id);
    const res = await patch(app, member, live, { placement: 'marketplace', groupId: null });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('REGION_REQUIRED');
    expect(await row(live.id)).toEqual(before);
  });

  it('thu hẹp sàn chung về "chỉ thành viên" nhóm mình: áp ngay, vẫn đang hiển thị', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member);
    const res = await patch(app, member, live, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect(res.json().data).toMatchObject({
      state: 'live',
      placement: 'members_only',
      groupId: group.groupId,
      expiresAt: live.expiresAt,
    });
    expect(await prisma.listingSubmission.count({ where: { listingId: live.id } })).toBe(1);
  });

  it('bật giao tận nơi; gửi lại nội dung y hệt kèm bật thương lượng: áp ngay, không qua máy', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    const delivery = (await patch(app, owner, live, { delivery: true })).json().data;
    expect(delivery).toMatchObject({ state: 'live' });
    const same = await patch(app, owner, delivery, {
      title: live.title,
      price: live.price,
      description: null,
      negotiable: true,
    });
    expect(same.json().data).toMatchObject({ state: 'live', negotiable: true, delivery: true });
  });

  it('thu hẹp tin đang chờ duyệt: 409 PLACEMENT_LOCKED; sửa giá thì được', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const pending = await pendingOf(member);
    const before = await row(pending.id);
    const narrow = await patch(app, member, pending, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect(narrow.statusCode).toBe(409);
    expect(codeOf(narrow)).toBe('PLACEMENT_LOCKED');
    expect(await row(pending.id)).toEqual(before);
    expect((await patch(app, member, pending, { price: 1 })).json().data.state).toBe('checking');
  });

  it('mở rộng tin có việc chờ (báo cáo chưa xử): 409 PLACEMENT_LOCKED', async () => {
    // Báo cáo và hậu kiểm là `add-review-queues`; ở đây cổng `OpenWork` giả nói "có việc chờ".
    const listing = createListingService({
      repository: repositories.listing,
      groups: app.modules.group,
      categories: app.modules.category,
      media: app.modules.media,
      identity: app.modules.identity,
      trust: createInterimTrust('T1'),
      screening: interimScreening,
      openWork: {
        blocksPlacement: () => Promise.resolve(true),
        reportHidden: () => Promise.resolve(false),
      },
      config: createStaticRuntimeConfig({}),
      clock: () => now,
    });
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    const actor = await app.modules.identity.resolveActor(sessionOf(member));
    await expect(
      listing.update(actor, live.id, { version: live.version, placement: 'group_public' }, 'may'),
    ).rejects.toMatchObject({ code: 'PLACEMENT_LOCKED' });
    expect((await row(live.id)).placement).toBe('members_only');
  });

  it('chuyển tin sàn chung vào nhóm mình không phải thành viên: theo luật người ngoài', async () => {
    const group = await createActiveGroup(app);
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    const body = { placement: 'group_public', groupId: group.groupId };
    const refused = await patch(app, owner, live, body);
    expect(refused.statusCode).toBe(403);
    expect(codeOf(refused)).toBe('OUTSIDER_POSTS_DISABLED');
    expect((await row(live.id)).placement).toBe('marketplace');
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    expect((await patch(app, owner, live, body)).json().data).toMatchObject({
      state: 'checking',
      placement: 'group_public',
      groupId: group.groupId,
    });
  });
});

async function detachedListing() {
  const group = await createActiveGroup(app);
  const member = await addMember(app, group.groupId);
  const live = await liveListingOf(app, member, {
    placement: 'members_only',
    groupId: group.groupId,
  });
  await listingApi(app, 'POST', `/groups/${group.groupId}/close`, group.owner);
  await deliverAll(app);
  return { member, listing: await getOwn(app, member, live.id) };
}

describe('Tin đã rời nhóm hẳn không sửa được', () => {
  it('đổi nơi đăng tin của nhóm đã đóng lên sàn chung: 409 LISTING_DETACHED, tin không đổi', async () => {
    const { member, listing } = await detachedListing();
    expect(listing.hideReasons).toEqual(['group_closed']);
    const before = await row(listing.id);
    const res = await patch(app, member, listing, { placement: 'marketplace', groupId: null });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('LISTING_DETACHED');
    expect(await row(listing.id)).toEqual(before);
  });

  it('xoá tin đã rời nhóm: được', async () => {
    const { member, listing } = await detachedListing();
    expect((await listingApi(app, 'DELETE', `/listings/${listing.id}`, member)).statusCode).toBe(
      204,
    );
  });
});

/** Phiên của người dùng test — để gọi thẳng service với đúng `Actor` như route dựng. */
function sessionOf(user: TestUser): string {
  const [, payload] = user.token.split('.');
  return (JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as { sid: string }).sid;
}

const LISTING_ROUTES = [
  'POST /listings',
  'PATCH /listings/{id}',
  'POST /listings/{id}/submit',
  'POST /listings/{id}/withdraw',
  'POST /listings/{id}/renew',
  'POST /listings/{id}/sold',
  'DELETE /listings/{id}',
  'POST /listings/{id}/move-to-marketplace',
  'GET /me/listings',
  'GET /listings',
  'GET /listings/{id}',
  'GET /listings/{id}/suggestions',
  'GET /groups/{groupId}/listings',
  'GET /users/{id}/listings',
  'DELETE /groups/{groupId}/listing-badges/{listingId}',
];
/** Lượt gửi (qua máy) — nhận `x-device-id` và có thể chạm hạn mức (429). */
const SUBMITTING = new Set([
  'PATCH /listings/{id}',
  'POST /listings/{id}/submit',
  'POST /listings/{id}/renew',
  'POST /listings/{id}/move-to-marketplace',
]);

describe('Swagger', () => {
  interface Operation {
    key: string;
    security?: unknown[];
    parameters?: { in: string; name: string }[];
    responses: Record<string, unknown>;
  }
  const listingOperations = async (): Promise<Operation[]> => {
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as {
      paths: Record<string, Record<string, Omit<Operation, 'key'> & { tags?: string[] }>>;
    };
    return Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.entries(methods)
        .filter(([, op]) => op.tags?.some((tag) => tag.startsWith('Listings')))
        .map(([method, op]) => ({
          key: `${method.toUpperCase()} ${path.replace('/api/v1', '')}`,
          ...op,
        })),
    );
  };

  it('đủ 15 route tin đăng, không thừa; route của người đăng và của nhóm đòi bearerAuth', async () => {
    const ops = await listingOperations();
    expect(ops.map((op) => op.key).toSorted()).toEqual(LISTING_ROUTES.toSorted());
    for (const op of ops) {
      const reader = op.key.startsWith('GET ') && op.key !== 'GET /me/listings';
      expect(op.security, op.key).toEqual(reader ? undefined : [{ bearerAuth: [] }]);
    }
  });

  it('lượt gửi khai header x-device-id và mã 400 / 403 / 404 / 409 / 429', async () => {
    for (const op of (await listingOperations()).filter((item) => SUBMITTING.has(item.key))) {
      expect(
        op.parameters?.some((p) => p.in === 'header' && p.name === 'x-device-id'),
        op.key,
      ).toBe(true);
      expect(Object.keys(op.responses), op.key).toEqual(
        expect.arrayContaining(['400', '401', '403', '404', '409', '429']),
      );
    }
  });
});
