import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from '../src/modules/listing/listing.ports.js';
import { auditOf, outboxEvents, prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  appointModerator,
  createActiveGroup,
  deliverAll,
  newMaster,
  type TestUser,
} from './group-helpers.js';
import {
  getOwn,
  groupSettings,
  listingApi,
  liveListingOf,
  machinePass,
  type OwnListing,
  patch,
} from './listing-http-helpers.js';
import { buildTestApp } from './test-app.js';

/* Delta `group/badges` (phần tin đăng) và phần huy hiệu của spec `listing/editing` qua HTTP và bên nghe thật. */
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({ trust: createInterimTrust('T1'), screening: interimScreening });
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });
const removeBadge = (actor: TestUser, groupId: string, listingId: string) =>
  listingApi(app, 'DELETE', `/groups/${groupId}/listing-badges/${listingId}`, actor);

/** Thành viên đủ quyền mang huy hiệu (vào nhóm xét duyệt qua đơn được duyệt) và một tin sàn chung đang hiển thị. */
async function badgeHolder(group?: ActiveGroup) {
  const target = group ?? (await createActiveGroup(app, { master }));
  const member = await addMember(app, target.groupId, { via: 'approved' });
  return { group: target, member, live: await liveListingOf(app, member) };
}

/** Gắn huy hiệu qua sửa tin rồi máy cho qua — tin đang hiển thị mang huy hiệu. */
async function withBadge(member: TestUser, live: OwnListing, groupId: string): Promise<OwnListing> {
  const res = await patch(app, member, live, { badgeGroupId: groupId });
  expect(res.statusCode, res.body).toBe(200);
  return machinePass(app, member, res.json().data);
}

describe('Gắn huy hiệu nhóm lên tin sàn chung', () => {
  it('vào nhóm xét duyệt qua đơn được duyệt: gắn được, qua máy, lên bảng hiện tên nhóm', async () => {
    const { group, member, live } = await badgeHolder();
    const sent = await patch(app, member, live, { badgeGroupId: group.groupId });
    expect(sent.json().data.state).toBe('checking');
    const shown = await machinePass(app, member, sent.json().data);
    const { name } = await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } });
    expect(shown.badge).toEqual({ groupId: group.groupId, name });
    expect((await listingApi(app, 'GET', `/listings/${live.id}`, null)).json().data.badge).toEqual({
      groupId: group.groupId,
      name,
    });
  });

  it('vào nhóm mở cửa bằng bấm tham gia: 403 BADGE_NOT_ELIGIBLE, tin không đổi', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const member = await addMember(app, group.groupId, { via: 'joined' });
    const live = await liveListingOf(app, member);
    const before = await row(live.id);
    const res = await patch(app, member, live, { badgeGroupId: group.groupId });
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('BADGE_NOT_ELIGIBLE');
    expect(await row(live.id)).toEqual(before);
  });

  it('gắn lên tin "nhóm công khai": 400 VALIDATION_ERROR, tin không đổi', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    const before = await row(live.id);
    const res = await patch(app, member, live, { badgeGroupId: group.groupId });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect(await row(live.id)).toEqual(before);
  });
});

describe('Mỗi tin một huy hiệu', () => {
  it('gắn huy hiệu nhóm Y lên tin đang mang huy hiệu nhóm X: 409 BADGE_ALREADY_ATTACHED', async () => {
    const { group: x, member, live } = await badgeHolder();
    const y = await createActiveGroup(app, { master });
    await prisma.groupMember.create({
      data: {
        groupId: y.groupId,
        accountId: member.id,
        joinedVia: 'approved',
        joinedAt: new Date(),
      },
    });
    const badged = await withBadge(member, live, x.groupId);
    const res = await patch(app, member, badged, { badgeGroupId: y.groupId });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('BADGE_ALREADY_ATTACHED');
    expect((await row(live.id)).badgeGroupId).toBe(x.groupId);
  });

  it('gắn lại huy hiệu nhóm đã gỡ khỏi chính tin đó: 403 BADGE_REMOVED_BY_GROUP', async () => {
    const { group, member, live } = await badgeHolder();
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    await withBadge(member, live, group.groupId);
    expect((await removeBadge(moderator, group.groupId, live.id)).statusCode).toBe(204);
    const current = await getOwn(app, member, live.id);
    const res = await patch(app, member, current, { badgeGroupId: group.groupId });
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('BADGE_REMOVED_BY_GROUP');
    expect((await row(live.id)).badgeGroupId).toBeNull();
  });
});

describe('Huy hiệu tự gỡ khỏi tin khi người đăng mất quyền', () => {
  it('rời nhóm: tin mất huy hiệu, vẫn đang hiển thị như cũ, không qua máy', async () => {
    const { group, member, live } = await badgeHolder();
    const badged = await withBadge(member, live, group.groupId);
    await listingApi(app, 'POST', `/groups/${group.groupId}/leave`, member);
    await deliverAll(app);
    expect(await row(live.id)).toMatchObject({
      badgeGroupId: null,
      state: 'live',
      version: badged.version,
      placement: 'marketplace',
      restrictions: [],
    });
    const removed = (await outboxEvents()).filter(
      (event) =>
        event.type === 'listing.badge.removed' &&
        (event.payload as { listingId?: string }).listingId === live.id,
    );
    expect(removed.map((event) => event.payload)).toEqual([
      expect.objectContaining({ ownerId: member.id, groupId: group.groupId, cause: 'rights' }),
    ]);
  });

  it('nhóm đóng: huy hiệu biến khỏi mọi tin sàn chung', async () => {
    const holderA = await badgeHolder();
    const holderB = await badgeHolder(holderA.group);
    await withBadge(holderA.member, holderA.live, holderA.group.groupId);
    await withBadge(holderB.member, holderB.live, holderA.group.groupId);
    await listingApi(app, 'POST', `/groups/${holderA.group.groupId}/close`, holderA.group.owner);
    await deliverAll(app);
    const rows = await prisma.listing.findMany({
      where: { id: { in: [holderA.live.id, holderB.live.id] } },
    });
    expect(rows.map((listing) => [listing.badgeGroupId, listing.state])).toEqual([
      [null, 'live'],
      [null, 'live'],
    ]);
  });

  it('nhóm riêng tư tắt hiện tên: huy hiệu gỡ ngay; bật lại không tự trở lại, người đủ quyền gắn lại được', async () => {
    const group = await createActiveGroup(app, { master, mode: 'private_code' });
    await groupSettings(app, group.owner, group.groupId, { showNameOnMarketplace: true });
    const { member, live } = await badgeHolder(group);
    await withBadge(member, live, group.groupId);
    await groupSettings(app, group.owner, group.groupId, { showNameOnMarketplace: false });
    await deliverAll(app);
    expect((await row(live.id)).badgeGroupId).toBeNull();
    await groupSettings(app, group.owner, group.groupId, { showNameOnMarketplace: true });
    await deliverAll(app);
    expect((await row(live.id)).badgeGroupId).toBeNull();
    const again = await withBadge(member, await getOwn(app, member, live.id), group.groupId);
    expect(again.badge?.groupId).toBe(group.groupId);
  });
});

describe('Nhóm tạm khoá thì huy hiệu ẩn theo', () => {
  it('trong lúc khoá: tin vẫn hiện nhưng không có huy hiệu; mở khoá: huy hiệu về đúng tin cũ', async () => {
    const { group, member, live } = await badgeHolder();
    await withBadge(member, live, group.groupId);
    const badgeSeen = async () =>
      (await listingApi(app, 'GET', `/listings/${live.id}`, null)).json().data.badge as {
        groupId: string;
      } | null;
    await listingApi(app, 'POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    await deliverAll(app);
    expect((await listingApi(app, 'GET', `/listings/${live.id}`, null)).statusCode).toBe(200);
    expect(await badgeSeen()).toBeNull();
    await listingApi(app, 'POST', `/ops/groups/${group.groupId}/unlock`, master);
    await deliverAll(app);
    expect((await badgeSeen())?.groupId).toBe(group.groupId);
  });
});

describe('Nhóm gỡ huy hiệu của mình nhưng không gỡ được tin sàn', () => {
  it('điều hành viên gỡ huy hiệu: tin hết huy hiệu, vẫn hiển thị, không qua máy', async () => {
    const { group, member, live } = await badgeHolder();
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    const badged = await withBadge(member, live, group.groupId);
    expect((await removeBadge(moderator, group.groupId, live.id)).statusCode).toBe(204);
    expect(await row(live.id)).toMatchObject({
      badgeGroupId: null,
      state: 'live',
      version: badged.version,
    });
    expect(await auditOf(live.id)).toEqual([]);
  });

  it('điều hành viên xoá chính tin sàn chung: 403 FORBIDDEN, tin vẫn hiển thị', async () => {
    const { group, member, live } = await badgeHolder();
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    await withBadge(member, live, group.groupId);
    const res = await listingApi(app, 'DELETE', `/listings/${live.id}`, moderator);
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect((await row(live.id)).state).toBe('live');
  });

  it('điều hành viên nhóm X gỡ huy hiệu nhóm Y: 403 FORBIDDEN', async () => {
    const { group: y, member, live } = await badgeHolder();
    await withBadge(member, live, y.groupId);
    const x = await createActiveGroup(app, { master });
    const moderator = await addMember(app, x.groupId);
    await appointModerator(app, x, moderator);
    const asX = await removeBadge(moderator, x.groupId, live.id);
    const asYWithoutRole = await removeBadge(moderator, y.groupId, live.id);
    expect([asX.statusCode, asYWithoutRole.statusCode]).toEqual([403, 403]);
    expect((await row(live.id)).badgeGroupId).toBe(y.groupId);
  });

  it('master gỡ: ghi nhật ký kiểm toán', async () => {
    const { group, member, live } = await badgeHolder();
    await withBadge(member, live, group.groupId);
    expect((await removeBadge(master, group.groupId, live.id)).statusCode).toBe(204);
    expect(await auditOf(live.id)).toEqual([
      expect.objectContaining({ action: 'listing.badge.remove', actorId: master.id }),
    ]);
  });

  it('người đăng tự bỏ huy hiệu: biến ngay, vẫn đang hiển thị, không qua máy', async () => {
    const { group, member, live } = await badgeHolder();
    const badged = await withBadge(member, live, group.groupId);
    const res = await patch(app, member, badged, { badgeGroupId: null });
    expect(res.json().data).toMatchObject({ state: 'live', badge: null, badgeGroupId: null });
    expect(await prisma.listingBadgeBlock.count({ where: { listingId: live.id } })).toBe(0);
  });
});
