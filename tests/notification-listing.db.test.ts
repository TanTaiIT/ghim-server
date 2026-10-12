import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { formatDateVN } from '../src/common/time/time.js';
import { createInterimTrust, interimScreening } from '../src/modules/listing/listing.ports.js';
import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  appointModerator,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  createCategory,
  groupSettings,
  listingApi,
  liveListingOf,
  machinePass,
  patch,
  submitted,
} from './listing-http-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Dòng N31–N35, N37 của ma trận (design add-listings mục 11) qua luồng thật: sự kiện do `listing` phát, bên nghe
 * thật của `notification`, hộp thư trên DB thật — đúng người nhận, loại, nhóm thông báo, gộp và cờ nhắc.
 */
const MINUTE_MS = 60_000;
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

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const inbox = (user: TestUser, type?: string) =>
  prisma.notification.findMany({
    where: { recipientId: user.id, ...(type ? { type } : {}) },
    orderBy: { createdAt: 'asc' },
  });
const act = async (
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  actor: TestUser,
  body?: object,
) => {
  await listingApi(app, method, url, actor, body);
  await deliverAll(app);
};

async function groupWithMembers(): Promise<{
  group: ActiveGroup;
  poster: TestUser;
  other: TestUser;
}> {
  const group = await createActiveGroup(app, { master });
  return {
    group,
    poster: await addMember(app, group.groupId, { via: 'approved' }),
    other: await addMember(app, group.groupId),
  };
}

describe('N31 — tin mới hiện đầy đủ trên bảng tin nhóm', () => {
  it('thành viên trừ người đăng nhận, có nhắc; tin thứ hai trong 2 giờ gộp lại, không nhắc lần nữa', async () => {
    const { group, poster, other } = await groupWithMembers();
    const fields = { placement: 'members_only', groupId: group.groupId };
    await liveListingOf(app, poster, { ...fields, title: 'Sách giáo khoa lớp 10' });
    await deliverAll(app);
    const [first] = await inbox(other, 'listing.group.new');
    expect(first).toMatchObject({
      category: 'group_new_listings',
      body: '«Sách giáo khoa lớp 10» vừa đăng trong nhóm.',
      alert: true,
      groupId: group.groupId,
      count: 1,
    });
    expect(await inbox(poster, 'listing.group.new')).toEqual([]);
    expect(await inbox(group.owner, 'listing.group.new')).toHaveLength(1);

    now = new Date(TEST_NOW.getTime() + 60 * MINUTE_MS);
    await liveListingOf(app, poster, fields);
    await deliverAll(app);
    expect(await inbox(other, 'listing.group.new')).toEqual([
      expect.objectContaining({ count: 2, body: 'Nhóm có 2 tin mới.', alert: false }),
    ]);
    expect((await inbox(other, 'listing.group.new'))[0]?.alertedAt).toEqual(TEST_NOW);

    now = new Date(TEST_NOW.getTime() + 121 * MINUTE_MS);
    await liveListingOf(app, poster, fields);
    await deliverAll(app);
    expect((await inbox(other, 'listing.group.new'))[0]).toMatchObject({
      count: 3,
      alert: true,
      alertedAt: now,
    });
  });

  it('không báo: lượt qua máy sau sửa, tin hạn chế, tin sàn chung', async () => {
    const { group, poster, other } = await groupWithMembers();
    const live = await liveListingOf(app, poster, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    await deliverAll(app);
    const edited = (await patch(app, poster, live, { title: 'Sửa lại' })).json().data;
    await machinePass(app, poster, edited);
    await machinePass(
      app,
      poster,
      await submitted(app, poster, { placement: 'members_only', groupId: group.groupId }),
      true,
    );
    await liveListingOf(app, poster);
    await deliverAll(app);
    expect((await inbox(other, 'listing.group.new')).map((row) => row.count)).toEqual([1]);
  });

  it('thành viên tắt tiếng nhóm: vẫn vào hộp thư, không nhắc', async () => {
    const { group, poster, other } = await groupWithMembers();
    const muted = await listingApi(app, 'PUT', `/me/group-mutes/${group.groupId}`, other);
    expect(muted.statusCode, muted.body).toBeLessThan(300);
    await liveListingOf(app, poster, { placement: 'members_only', groupId: group.groupId });
    await deliverAll(app);
    expect(await inbox(other, 'listing.group.new')).toEqual([
      expect.objectContaining({ alert: false }),
    ]);
  });
});

describe('N32 — tin của bạn tạm ẩn / không còn bị ẩn', () => {
  it('nhóm khoá rồi mở: người đăng nhận một dòng gộp, không nhắc; câu không nêu lý do khoá', async () => {
    const { group, poster } = await groupWithMembers();
    await liveListingOf(app, poster, { placement: 'members_only', groupId: group.groupId });
    await act('POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Lừa đảo' });
    const [hidden] = await inbox(poster, 'listing.hidden.added');
    expect(hidden).toMatchObject({ category: 'your_listings', alert: false });
    expect(hidden?.body).toContain('tạm khoá');
    expect(hidden?.body).not.toContain('Lừa đảo');
    await act('POST', `/ops/groups/${group.groupId}/unlock`, master);
    const rows = await prisma.notification.findMany({
      where: { recipientId: poster.id, collapseKey: `listings:hidden:${group.groupId}` },
    });
    expect(rows).toEqual([expect.objectContaining({ count: 2 })]);
    expect(rows[0]?.body).toContain('mở khoá');
  });

  it('danh mục tắt: tiêu đề "Tin đăng của bạn"; tài khoản bị khoá: không báo gì', async () => {
    const owner = await newUser(app);
    const categoryId = await createCategory(app, master);
    await liveListingOf(app, owner, { categoryId });
    await act('POST', `/ops/categories/${categoryId}/disable`, master);
    expect(await inbox(owner, 'listing.hidden.added')).toEqual([
      expect.objectContaining({ title: 'Tin đăng của bạn' }),
    ]);
    const locked = await newUser(app);
    await liveListingOf(app, locked);
    await act('POST', `/ops/accounts/${locked.id}/lock`, master, { reason: 'Thử' });
    expect(
      (await inbox(locked)).filter((row) => row.type.startsWith('listing.')).map((row) => row.type),
    ).toEqual([]);
  });
});

describe('N33 — tin rời nhóm hẳn: hạn chuyển lên sàn chung', () => {
  it('nhóm đóng: người đăng nhận, có nhắc, kèm ngày hết hạn chuyển', async () => {
    const { group, poster } = await groupWithMembers();
    await liveListingOf(app, poster, { placement: 'members_only', groupId: group.groupId });
    await act('POST', `/groups/${group.groupId}/close`, group.owner);
    const until = formatDateVN(new Date(TEST_NOW.getTime() + 30 * DAY_MS));
    expect(await inbox(poster, 'listing.detached')).toEqual([
      expect.objectContaining({ category: 'your_listings', alert: true }),
    ]);
    expect((await inbox(poster, 'listing.detached'))[0]?.body).toContain(until);
  });
});

describe('N34 — tin "nhóm công khai" hạ về "chỉ thành viên"', () => {
  it('nhóm sang riêng tư: người đăng nhận, không nhắc', async () => {
    const { group, poster } = await groupWithMembers();
    await liveListingOf(app, poster, { placement: 'group_public', groupId: group.groupId });
    await groupSettings(app, group.owner, group.groupId, { mode: 'private_code' });
    await deliverAll(app);
    expect(await inbox(poster, 'listing.placement.downgraded')).toEqual([
      expect.objectContaining({ category: 'your_listings', alert: false }),
    ]);
  });
});

describe('N35 — huy hiệu bị gỡ khỏi tin của bạn', () => {
  it('mất quyền và nhóm gỡ: hai câu khác nhau, gộp một dòng, không nhắc, nêu tiêu đề tin', async () => {
    const { group, poster } = await groupWithMembers();
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    const live = await liveListingOf(app, poster, { title: 'Máy ảnh cũ' });
    const badged = await patch(app, poster, live, { badgeGroupId: group.groupId });
    await machinePass(app, poster, badged.json().data);
    await act('DELETE', `/groups/${group.groupId}/listing-badges/${live.id}`, moderator);
    const [removed] = await inbox(poster, 'listing.badge.removed');
    expect(removed).toMatchObject({ alert: false, category: 'your_listings' });
    expect(removed?.body).toBe(
      `Quản trị nhóm «${(await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } })).name}» đã gỡ huy hiệu nhóm khỏi tin «Máy ảnh cũ».`,
    );
  });
});

describe('N37 — tin sắp hết hạn', () => {
  it('còn 7 ngày: người đăng nhận, có nhắc, kèm tiêu đề tin và ngày hết hạn', async () => {
    const owner = await newUser(app);
    await liveListingOf(app, owner, { title: 'Xe đạp địa hình' });
    now = new Date(TEST_NOW.getTime() + 23 * DAY_MS);
    await app.modules.listing.remindExpiring();
    await deliverAll(app);
    expect(await inbox(owner, 'listing.expiry.reminder')).toEqual([
      expect.objectContaining({
        title: 'Xe đạp địa hình',
        alert: true,
        category: 'your_listings',
        body: 'Tin hết hạn ngày 09/11/2026. Gia hạn để tin tiếp tục hiện.',
      }),
    ]);
  });
});
