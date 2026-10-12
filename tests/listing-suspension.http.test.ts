import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TooManyRequestsError } from '../src/common/errors/app-error.js';
import { createInterimTrust } from '../src/modules/listing/listing.ports.js';
import { outboxEvents, prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  createCategory,
  getOwn,
  groupSettings,
  listingApi,
  liveListingOf,
  machineHold,
  machinePass,
  type OwnListing,
  patch,
  readyDraft,
  signedInAt,
  someRegion,
  submit,
  submitted,
} from './listing-http-helpers.js';
import { firstByteAt } from './media-helpers.js';
import { repositories, buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/suspension` qua bên nghe thật (bộ phát outbox của app) và HTTP — task 5.6, 6.1. Mức tin cậy T1 để tin
 * lên bảng đầy đủ; mọi ca kiểm cả phía người đăng (lý do) lẫn phía người khác (404 / không còn trên bảng).
 */
const DAY_MS = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, trust: createInterimTrust('T1') });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });
const reasonsOf = async (id: string) => (await row(id)).hideReasons;
const opens = async (id: string, viewer: TestUser | null = null) =>
  (await listingApi(app, 'GET', `/listings/${id}`, viewer)).statusCode;
/** Làm một việc qua API rồi giao ngay sự kiện vừa phát cho bên nghe thật. */
const act = async (
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  actor: TestUser,
  body?: object,
) => {
  const res = await listingApi(app, method, url, await signedInAt(app, actor, now), body);
  await deliverAll(app);
  return res;
};
const inGroup = (
  user: TestUser,
  group: ActiveGroup,
  placement: 'members_only' | 'group_public',
  fields: Record<string, unknown> = {},
) => liveListingOf(app, user, { placement, groupId: group.groupId, ...fields });
const rejoin = async (group: ActiveGroup, user: TestUser) => {
  await repositories.group.joinDirect({
    groupId: group.groupId,
    accountId: user.id,
    via: 'approved',
    unitId: null,
    at: now,
  });
  await deliverAll(app);
};

describe('Tạm ẩn là cờ có lý do, hết mọi lý do mới hiện lại', () => {
  it('nhóm khoá rồi danh mục tắt, mở khoá nhóm: vẫn ẩn; bật danh mục: hiện lại đúng như cũ', async () => {
    const group = await createActiveGroup(app, { master });
    const [member, viewer] = [
      await addMember(app, group.groupId),
      await addMember(app, group.groupId),
    ];
    const categoryId = await createCategory(app, master);
    const live = await inGroup(member, group, 'members_only', { categoryId });
    const before = await row(live.id);
    await act('POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    await act('POST', `/ops/categories/${categoryId}/disable`, master);
    expect(await reasonsOf(live.id)).toEqual(['group_locked', 'category_disabled']);
    await act('POST', `/ops/groups/${group.groupId}/unlock`, master);
    expect(await reasonsOf(live.id)).toEqual(['category_disabled']);
    expect(await opens(live.id, viewer)).toBe(404);
    await act('POST', `/ops/categories/${categoryId}/enable`, master);
    expect(await row(live.id)).toMatchObject({
      state: before.state,
      placement: before.placement,
      restrictions: before.restrictions,
      hideReasons: [],
      expiresAt: before.expiresAt,
    });
    expect(await opens(live.id, viewer)).toBe(200);
  });

  it('người đăng xem tin đang tạm ẩn của mình: thấy lý do "nhóm bị tạm khoá"', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const live = await inGroup(member, group, 'members_only');
    await act('POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    expect((await getOwn(app, member, live.id)).hideReasons).toEqual(['group_locked']);
  });

  it('hiện lại không hỏi hạn mức: bên nghe không gọi cổng `trust`', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const live = await inGroup(member, group, 'members_only');
    await act('POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    // App thứ hai mà cổng `trust` từ chối mọi lượt gửi giao sự kiện mở khoá: tin vẫn hiện lại.
    const full = await buildTestApp({
      clock: () => now,
      trust: {
        ...createInterimTrust('T1'),
        assertCanSubmit: () => Promise.reject(new TooManyRequestsError('Đủ tin sống')),
      },
    });
    try {
      await listingApi(full, 'POST', `/ops/groups/${group.groupId}/unlock`, master);
      await deliverAll(full);
      expect(await reasonsOf(live.id)).toEqual([]);
    } finally {
      await full.close();
    }
  });

  it('nhận trùng sự kiện: không đổi gì, không phát thêm thông báo', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const live = await inGroup(member, group, 'members_only');
    await act('POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    const hiddenEvents = async () =>
      (await outboxEvents()).filter(
        (event) =>
          event.type === 'listing.hidden.changed' &&
          (event.payload as { listingIds: string[] }).listingIds.includes(live.id),
      ).length;
    const before = { listing: await row(live.id), events: await hiddenEvents() };
    await prisma.outboxEvent.create({
      data: { type: 'group.state.locked', payload: { groupId: group.groupId, cause: 'master' } },
    });
    await deliverAll(app);
    expect(await row(live.id)).toEqual(before.listing);
    expect(await hiddenEvents()).toBe(before.events);
  });
});

describe('Tài khoản người đăng', () => {
  it('khoá: người khác 404, không còn trên bảng tin, tìm kiếm, hồ sơ; mở khoá: hiện lại như cũ', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner, { title: 'Khoá tài khoản thử nghiệm' });
    const surfaces = async () => [
      (await listingApi(app, 'GET', `/listings?categoryId=${live.categoryId}`, null)).json().data
        .items.length,
      (await listingApi(app, 'GET', '/listings?q=khoa%20tai%20khoan%20thu', null)).json().data.items
        .length,
      (await listingApi(app, 'GET', `/users/${owner.id}/listings`, null)).json().data.items.length,
    ];
    expect(await surfaces()).toEqual([1, 1, 1]);
    await act('POST', `/ops/accounts/${owner.id}/lock`, master, { reason: 'Thử' });
    expect(await opens(live.id)).toBe(404);
    expect(await surfaces()).toEqual([0, 0, 0]);
    await act('POST', `/ops/accounts/${owner.id}/unlock`, master);
    expect(await opens(live.id)).toBe(200);
    expect(await surfaces()).toEqual([1, 1, 1]);
  });

  it('tự xoá tài khoản: tin ẩn với lý do "tài khoản đã xoá", người khác 404', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    const res = await act('DELETE', '/me', owner);
    expect(res.statusCode, res.body).toBe(204);
    expect(await reasonsOf(live.id)).toEqual(['account_deleted']);
    expect(await opens(live.id)).toBe(404);
  });
});

describe('Người đăng rời nhóm', () => {
  it('tự rời: tin "chỉ thành viên" ẩn "đã rời nhóm", tin sàn chung vẫn hiện; vào lại thì hiện', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const inside = await inGroup(member, group, 'members_only');
    const market = await liveListingOf(app, member);
    await act('POST', `/groups/${group.groupId}/leave`, member);
    expect(await reasonsOf(inside.id)).toEqual(['left_group']);
    expect(await reasonsOf(market.id)).toEqual([]);
    await rejoin(group, member);
    expect(await reasonsOf(inside.id)).toEqual([]);
  });

  it('bị gỡ khỏi nhóm: lý do "bị gỡ khỏi nhóm", không phải "đã rời nhóm"', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const inside = await inGroup(member, group, 'members_only');
    await act('DELETE', `/groups/${group.groupId}/members/${member.id}`, group.owner);
    expect(await reasonsOf(inside.id)).toEqual(['removed_from_group']);
  });

  it('tin "nhóm công khai", nhóm tắt nhận tin người ngoài lúc rời: ẩn; bật sau đó vẫn ẩn tới khi vào lại', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const open = await inGroup(member, group, 'group_public');
    await act('POST', `/groups/${group.groupId}/leave`, member);
    expect(await reasonsOf(open.id)).toEqual(['left_group']);
    expect(await opens(open.id)).toBe(404);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    await deliverAll(app);
    expect(await reasonsOf(open.id)).toEqual(['left_group']);
    await rejoin(group, member);
    expect(await reasonsOf(open.id)).toEqual([]);
  });

  it('nhóm bật nhận tin người ngoài, bị gỡ: "nhóm công khai" ở lại như tin người ngoài, "chỉ thành viên" ẩn', async () => {
    const group = await createActiveGroup(app);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    const member = await addMember(app, group.groupId);
    const open = await inGroup(member, group, 'group_public');
    const inside = await inGroup(member, group, 'members_only');
    await act('DELETE', `/groups/${group.groupId}/members/${member.id}`, group.owner);
    expect(await reasonsOf(open.id)).toEqual([]);
    expect(await reasonsOf(inside.id)).toEqual(['removed_from_group']);
    const feed = await listingApi(app, 'GET', `/groups/${group.groupId}/listings`, null);
    expect(feed.json().data.items.map((item: { id: string }) => item.id)).toEqual([open.id]);
  });
});

describe('Người đăng bị cấm khỏi nhóm', () => {
  it('cấm thành viên: hai tin trong nhóm ẩn "bị cấm", "chỉ thành viên" thêm "bị gỡ"; tin sàn chung vẫn hiện', async () => {
    const group = await createActiveGroup(app);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    const member = await addMember(app, group.groupId);
    const inside = await inGroup(member, group, 'members_only');
    const open = await inGroup(member, group, 'group_public');
    const market = await liveListingOf(app, member);
    await act('PUT', `/groups/${group.groupId}/bans/${member.id}`, group.owner);
    expect(await reasonsOf(inside.id)).toEqual(['removed_from_group', 'group_banned']);
    expect(await reasonsOf(open.id)).toEqual(['group_banned']);
    expect(await reasonsOf(market.id)).toEqual([]);
    const mine = await listingApi(app, 'GET', '/me/listings', member);
    const reasons = new Map(
      (mine.json().data.items as OwnListing[]).map((item) => [item.id, item.hideReasons]),
    );
    expect(reasons.get(open.id)).toEqual(['group_banned']);
    await act('DELETE', `/groups/${group.groupId}/bans/${member.id}`, group.owner);
    expect(await reasonsOf(open.id)).toEqual([]);
    expect(await reasonsOf(inside.id)).toEqual(['removed_from_group']);
  });

  it('cấm người ngoài chưa từng vào: tin người ngoài ẩn, khách 404; gỡ cấm: hiện lại như cũ', async () => {
    const group = await createActiveGroup(app);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    const outsider = await newUser(app);
    const open = await inGroup(outsider, group, 'group_public');
    await act('PUT', `/groups/${group.groupId}/bans/${outsider.id}`, group.owner);
    expect(await reasonsOf(open.id)).toEqual(['group_banned']);
    expect(await opens(open.id)).toBe(404);
    await act('DELETE', `/groups/${group.groupId}/bans/${outsider.id}`, group.owner);
    expect(await reasonsOf(open.id)).toEqual([]);
    expect(await opens(open.id)).toBe(200);
  });

  it('người bị cấm đưa tin "nhóm công khai" đang ẩn lên sàn chung: gỡ "bị cấm", đang kiểm ở sàn chung', async () => {
    const group = await createActiveGroup(app);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    const outsider = await newUser(app);
    const open = await inGroup(outsider, group, 'group_public');
    await act('PUT', `/groups/${group.groupId}/bans/${outsider.id}`, group.owner);
    const res = await patch(app, outsider, await getOwn(app, outsider, open.id), {
      placement: 'marketplace',
      groupId: null,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({
      state: 'checking',
      placement: 'marketplace',
      hideReasons: [],
    });
  });
});

describe('Nhóm bị tạm khoá, đã đóng, gỡ tin khỏi nhóm', () => {
  it('khoá: tin "chỉ thành viên" và "nhóm công khai" ẩn, tin sàn chung của thành viên vẫn hiện; mở khoá: hiện lại', async () => {
    const group = await createActiveGroup(app, { master });
    const [member, viewer] = [
      await addMember(app, group.groupId),
      await addMember(app, group.groupId),
    ];
    const inside = await inGroup(member, group, 'members_only');
    const open = await inGroup(member, group, 'group_public');
    const market = await liveListingOf(app, member);
    await act('POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    expect([await opens(inside.id, viewer), await opens(open.id), await opens(market.id)]).toEqual([
      404, 404, 200,
    ]);
    await act('POST', `/ops/groups/${group.groupId}/unlock`, master);
    expect([await opens(inside.id, viewer), await opens(open.id)]).toEqual([200, 200]);
  });

  it('đóng: người khác 404, tin không còn trên bảng tin nhóm', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const open = await inGroup(member, group, 'group_public');
    await act('POST', `/groups/${group.groupId}/close`, group.owner);
    expect(await reasonsOf(open.id)).toEqual(['group_closed']);
    expect(await opens(open.id)).toBe(404);
    const feed = await listingApi(app, 'GET', `/groups/${group.groupId}/listings`, null);
    expect(feed.json().data.items).toEqual([]);
  });

  it('gỡ tin khỏi nhóm: thành viên 404, người đăng thấy vẫn đang hiển thị kèm lý do', async () => {
    const group = await createActiveGroup(app);
    const [poster, member] = [
      await addMember(app, group.groupId),
      await addMember(app, group.groupId),
    ];
    const inside = await inGroup(poster, group, 'members_only');
    // Bên phát là `add-review-queues`; bên nhận của `listing` đã có từ đợt này.
    await app.modules.listing.onHideEvent(
      { id: inside.id },
      { kind: 'detached_by_group' },
      group.groupId,
    );
    expect(await opens(inside.id, member)).toBe(404);
    expect(await getOwn(app, poster, inside.id)).toMatchObject({
      state: 'live',
      hideReasons: ['detached_by_group'],
    });
  });
});

async function closedGroupListing(fields: Record<string, unknown> = {}) {
  const group = await createActiveGroup(app);
  const member = await addMember(app, group.groupId);
  const old = await inGroup(member, group, 'members_only', fields);
  await act('POST', `/groups/${group.groupId}/close`, group.owner);
  return { member, old: await getOwn(app, member, old.id) };
}
const move = async (user: TestUser, id: string, body: object = {}) =>
  listingApi(
    app,
    'POST',
    `/listings/${id}/move-to-marketplace`,
    await signedInAt(app, user, now),
    body,
  );

describe('Chuyển tin đã rời nhóm lên sàn chung', () => {
  it('10 ngày sau khi nhóm đóng: tin mới ở sàn chung đang kiểm, chép nội dung và ảnh; tin cũ vẫn ẩn', async () => {
    const { member, old } = await closedGroupListing();
    now = new Date(TEST_NOW.getTime() + 10 * DAY_MS);
    const before = await row(old.id);
    const res = await move(member, old.id);
    expect(res.statusCode, res.body).toBe(201);
    const moved = res.json().data as OwnListing;
    expect(moved).toMatchObject({
      state: 'checking',
      placement: 'marketplace',
      groupId: null,
      title: old.title,
      price: old.price,
      provinceCode: old.provinceCode,
      wardCode: old.wardCode,
      badge: null,
    });
    expect(moved.id).not.toBe(old.id);
    expect(moved.images.map((image) => image.id)).not.toEqual(old.images.map((image) => image.id));
    expect(await firstByteAt(moved.images[0]?.url ?? '')).toBe(1);
    expect(await row(old.id)).toEqual(before);
    expect((await row(moved.id)).movedFromListingId).toBe(old.id);
  });

  it('tin mới được máy cho qua: đủ 30 ngày từ lúc lên bảng, vị trí của tin vừa đăng', async () => {
    const { member, old } = await closedGroupListing();
    now = new Date(TEST_NOW.getTime() + 10 * DAY_MS);
    const moved = (await move(member, old.id)).json().data as OwnListing;
    await machinePass(app, await signedInAt(app, member, now), moved);
    expect(await row(moved.id)).toMatchObject({
      firstLiveAt: now,
      expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    });
  });

  it('5 ngày sau khi tin bị gỡ khỏi nhóm: chuyển được', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const inside = await inGroup(member, group, 'members_only');
    await app.modules.listing.onHideEvent(
      { id: inside.id },
      { kind: 'detached_by_group' },
      group.groupId,
    );
    now = new Date(TEST_NOW.getTime() + 5 * DAY_MS);
    expect((await move(member, inside.id)).json().data.state).toBe('checking');
  });

  it('thiếu phường: 400 REGION_REQUIRED, không tin mới, tin cũ không đổi; kèm khu vực thì được', async () => {
    const { member, old } = await closedGroupListing({ provinceCode: null, wardCode: null });
    const before = await row(old.id);
    const res = await move(member, old.id);
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('REGION_REQUIRED');
    expect(await prisma.listing.count({ where: { movedFromListingId: old.id } })).toBe(0);
    expect(await row(old.id)).toEqual(before);
    expect((await move(member, old.id, await someRegion(app))).statusCode).toBe(201);
  });

  it('chuyển lần thứ hai: 409 ALREADY_MOVED; hai lượt song song: đúng một tin mới', async () => {
    const { member, old } = await closedGroupListing();
    const [a, b] = await Promise.all([move(member, old.id), move(member, old.id)]);
    expect([a.statusCode, b.statusCode].toSorted()).toEqual([201, 409]);
    expect(codeOf(a.statusCode === 409 ? a : b)).toBe('ALREADY_MOVED');
    const again = await move(member, old.id);
    expect(codeOf(again)).toBe('ALREADY_MOVED');
    expect(await prisma.listing.count({ where: { movedFromListingId: old.id } })).toBe(1);
  });

  it('31 ngày sau khi nhóm đóng: 409 MOVE_WINDOW_EXPIRED, tin không đổi', async () => {
    const { member, old } = await closedGroupListing();
    now = new Date(TEST_NOW.getTime() + 31 * DAY_MS);
    const before = await row(old.id);
    const res = await move(member, old.id);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('MOVE_WINDOW_EXPIRED');
    expect(await row(old.id)).toEqual(before);
  });

  it('tin chưa rời nhóm hẳn (chỉ tạm ẩn): 409 INVALID_TRANSITION', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const inside = await inGroup(member, group, 'members_only');
    await act('POST', `/groups/${group.groupId}/leave`, member);
    expect(codeOf(await move(member, inside.id))).toBe('INVALID_TRANSITION');
  });
});

describe('Nhóm đổi chế độ', () => {
  it('sang riêng tư: tin "nhóm công khai" của thành viên hạ về "chỉ thành viên"; người ngoài rời nhóm', async () => {
    const group = await createActiveGroup(app);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    const member = await addMember(app, group.groupId);
    const outsider = await newUser(app);
    const mine = await inGroup(member, group, 'group_public');
    const theirs = await inGroup(outsider, group, 'group_public');
    await groupSettings(app, group.owner, group.groupId, { mode: 'private_code' });
    // Chưa giao sự kiện: nhóm đang chuyển, chưa thành riêng tư — không có lúc riêng tư mà còn tin "nhóm công khai".
    expect(await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } })).toMatchObject({
      state: 'going_private',
      mode: 'public_review',
    });
    await deliverAll(app);
    expect(await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } })).toMatchObject({
      state: 'active',
      mode: 'private_code',
    });
    expect(
      await prisma.listing.count({
        where: {
          groupId: group.groupId,
          placement: 'group_public',
          hideReasons: { isEmpty: true },
        },
      }),
    ).toBe(0);
    expect(await row(mine.id)).toMatchObject({
      placement: 'members_only',
      state: 'live',
      version: mine.version,
    });
    expect([await opens(mine.id), await opens(mine.id, member)]).toEqual([404, 200]);
    expect((await getOwn(app, outsider, theirs.id)).hideReasons).toEqual(['group_privatized']);
    expect(await opens(theirs.id)).toBe(404);
  });

  it('đang chuyển sang riêng tư: gửi "nhóm công khai" 409 GROUP_MODE_CHANGING; "chỉ thành viên" thì được', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    await inGroup(member, group, 'group_public');
    const open = await readyDraft(app, member, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    const inside = await readyDraft(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    await groupSettings(app, group.owner, group.groupId, { mode: 'private_code' });
    const refused = await submit(app, member, open);
    expect(refused.statusCode).toBe(409);
    expect(codeOf(refused)).toBe('GROUP_MODE_CHANGING');
    expect((await row(open.id)).state).toBe('draft');
    expect((await submit(app, member, inside)).json().data.state).toBe('checking');
    await deliverAll(app);
  });

  it('riêng tư sang công khai: tin "chỉ thành viên" giữ nguyên mức, khách vẫn 404', async () => {
    const group = await createActiveGroup(app, { mode: 'private_code' });
    const member = await addMember(app, group.groupId);
    const inside = await inGroup(member, group, 'members_only');
    await groupSettings(app, group.owner, group.groupId, { mode: 'public_review' });
    await deliverAll(app);
    expect((await row(inside.id)).placement).toBe('members_only');
    expect(await opens(inside.id)).toBe(404);
  });

  it('tắt nhận tin người ngoài: tin đang hiện giữ nguyên, tin chờ duyệt được đạt vẫn lên; tin mới thì 403', async () => {
    const group = await createActiveGroup(app);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    const outsider = await newUser(app);
    const live = await inGroup(outsider, group, 'group_public');
    const pending = await machineHold(
      app,
      outsider,
      await submitted(app, outsider, { placement: 'group_public', groupId: group.groupId }),
    );
    const draft = await readyDraft(app, outsider, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: false });
    await deliverAll(app);
    expect(await reasonsOf(live.id)).toEqual([]);
    await app.modules.listing.review({
      listingId: pending.id,
      version: pending.version,
      arrow: 'approve',
    });
    const feed = await listingApi(app, 'GET', `/groups/${group.groupId}/listings`, null);
    expect(new Set(feed.json().data.items.map((item: { id: string }) => item.id))).toEqual(
      new Set([live.id, pending.id]),
    );
    const refused = await submit(app, outsider, draft);
    expect(refused.statusCode).toBe(403);
    expect(codeOf(refused)).toBe('OUTSIDER_POSTS_DISABLED');
  });
});

describe('Danh mục bị tắt', () => {
  it('tắt: ẩn "danh mục bị tắt"; đổi sang danh mục đang bật: gỡ lý do, đang kiểm', async () => {
    const owner = await newUser(app);
    const categoryId = await createCategory(app, master);
    const live = await liveListingOf(app, owner, { categoryId });
    await act('POST', `/ops/categories/${categoryId}/disable`, master);
    expect(await reasonsOf(live.id)).toEqual(['category_disabled']);
    const other = await createCategory(app, master);
    const res = await patch(app, owner, await getOwn(app, owner, live.id), { categoryId: other });
    expect(res.json().data).toMatchObject({
      state: 'checking',
      hideReasons: [],
      categoryId: other,
    });
  });

  it('"chỉ thành viên" ẩn vì đã rời nhóm và danh mục tắt, đổi lên sàn chung: rơi "đã rời", giữ "danh mục"', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const categoryId = await createCategory(app, master);
    const inside = await inGroup(member, group, 'members_only', { categoryId });
    await act('POST', `/groups/${group.groupId}/leave`, member);
    await act('POST', `/ops/categories/${categoryId}/disable`, master);
    expect(await reasonsOf(inside.id)).toEqual(['left_group', 'category_disabled']);
    const res = await patch(app, member, await getOwn(app, member, inside.id), {
      placement: 'marketplace',
      groupId: null,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({
      state: 'checking',
      placement: 'marketplace',
      hideReasons: ['category_disabled'],
    });
  });
});
