import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { outboxEvents, prisma } from './db-helpers.js';
import { addMember, createActiveGroup, newUser } from './group-helpers.js';
import {
  getOwn,
  liveListingOf,
  machineHold,
  machinePass,
  patch,
  submitted,
} from './listing-http-helpers.js';
import { buildTestApp } from './test-app.js';

/*
 * Cổng `listing` mà `review` dùng (add-review-queues task 2.1, design mục 6, 8): mũi tên của người duyệt có hook cùng
 * transaction, đạt / khôi phục gỡ lý do "máy", lý do mẫu người đăng thấy, đạt việc hàng 3 / 5 (`confirmLive`), gỡ khỏi
 * nhóm có điều kiện phiên bản, và các cổng đọc.
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({ trust: createInterimTrust('T1'), screening: interimScreening });
  await app.ready();
});

afterAll(() => app.close());

const listing = () => app.modules.listing;
const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });

describe('Mũi tên của người duyệt', () => {
  it('đạt tin máy giữ: lên bảng, gỡ lý do "máy" có từ trước (chốt 15/10/2026)', async () => {
    const user = await newUser(app);
    const held = await machineHold(app, user, await submitted(app, user));
    await listing().restrictByMachine(held.id);
    const approved = await listing().review({
      listingId: held.id,
      version: held.version,
      arrow: 'approve',
    });
    expect(approved.state).toBe('live');
    expect(approved.restrictions).not.toContain('machine');
  });

  it('từ chối kèm lý do mẫu: người đăng thấy lý do; sửa gửi lại thì lý do và lỗi được xoá', async () => {
    const user = await newUser(app);
    const held = await machineHold(app, user, await submitted(app, user));
    await listing().review({
      listingId: held.id,
      version: held.version,
      arrow: 'reject',
      fault: 'mistake',
      faultReason: 'Ảnh chưa rõ sản phẩm',
    });
    const rejected = await getOwn(app, user, held.id);
    expect(rejected).toMatchObject({
      state: 'rejected',
      fault: 'mistake',
      faultReason: 'Ảnh chưa rõ sản phẩm',
    });
    const edited = await patch(app, user, rejected, { title: 'Xe đạp cũ, ảnh rõ hơn' });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json().data).toMatchObject({ state: 'checking', fault: null, faultReason: null });
  });

  it('gỡ rồi khôi phục: lỗi và lý do được xoá, lý do "máy" được gỡ', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await listing().restrictByMachine(live.id);
    const removed = await listing().review({
      listingId: live.id,
      version: live.version,
      arrow: 'remove',
      fault: 'mistake',
      faultReason: 'Sai danh mục',
    });
    expect(removed).toMatchObject({ state: 'removed', faultReason: 'Sai danh mục' });
    const restored = await listing().review({
      listingId: live.id,
      version: removed.version,
      arrow: 'restore',
    });
    expect(restored).toMatchObject({ state: 'live', fault: null, faultReason: null });
    expect(restored.restrictions).not.toContain('machine');
  });

  it('hook `after` chạy trong cùng transaction: hook ném thì tin không đổi', async () => {
    const user = await newUser(app);
    const held = await machineHold(app, user, await submitted(app, user));
    await expect(
      listing().review({
        listingId: held.id,
        version: held.version,
        arrow: 'approve',
        after: () => Promise.reject(new Error('ghi nhật ký hỏng')),
      }),
    ).rejects.toThrow('ghi nhật ký hỏng');
    expect((await row(held.id)).state).toBe('pending');
  });

  it('phiên bản đã đổi → 409 CONFLICT, tin không đổi', async () => {
    const user = await newUser(app);
    const held = await machineHold(app, user, await submitted(app, user));
    await expect(
      listing().review({ listingId: held.id, version: held.version - 1, arrow: 'approve' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await row(held.id)).state).toBe('pending');
  });
});

describe('Đạt việc hàng 3, 5 — confirmLive', () => {
  it('tin hạn chế do máy: gỡ lý do "máy", trạng thái và phiên bản giữ nguyên', async () => {
    const user = await newUser(app);
    const limited = await machinePass(app, user, await submitted(app, user), true);
    expect(limited.restrictions).toContain('machine');
    const confirmed = await listing().confirmLive({
      listingId: limited.id,
      version: limited.version,
    });
    expect(confirmed).toMatchObject({ state: 'live', version: limited.version });
    expect(confirmed.restrictions).not.toContain('machine');
  });

  it('tin không đang hiện → 409 INVALID_TRANSITION', async () => {
    const user = await newUser(app);
    const held = await machineHold(app, user, await submitted(app, user));
    await expect(
      listing().confirmLive({ listingId: held.id, version: held.version }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('Gỡ khỏi nhóm — detachByGroup', () => {
  it('tin rời nhóm với lý do "nhóm gỡ", trạng thái không đổi, phát sự kiện tách nhóm', async () => {
    const group = await createActiveGroup(app);
    const poster = await addMember(app, group.groupId);
    const inside = await liveListingOf(app, poster, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    const detached = await listing().detachByGroup({
      listingId: inside.id,
      version: inside.version,
      groupId: group.groupId,
    });
    expect(detached).toMatchObject({ state: 'live', hideReasons: ['detached_by_group'] });
    const events = (await outboxEvents()).filter(
      (event) =>
        event.type === 'listing.listing.detached' &&
        (event.payload as { listingIds: string[] }).listingIds.includes(inside.id),
    );
    expect(events).toHaveLength(1);
  });

  it('tin của nhóm khác, hay đã rời nhóm → 409 INVALID_TRANSITION; phiên bản cũ → 409 CONFLICT', async () => {
    const group = await createActiveGroup(app);
    const other = await createActiveGroup(app);
    const poster = await addMember(app, group.groupId);
    const inside = await liveListingOf(app, poster, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    const input = { listingId: inside.id, version: inside.version };
    await expect(
      listing().detachByGroup({ ...input, groupId: other.groupId }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(
      listing().detachByGroup({ ...input, version: inside.version - 1, groupId: group.groupId }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await listing().detachByGroup({ ...input, groupId: group.groupId });
    await expect(
      listing().detachByGroup({ ...input, groupId: group.groupId }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('Cổng đọc cho review', () => {
  it('reviewSubject, forReviewer: dữ kiện và nội dung tin; tin đã xoá chỉ còn bản lưu cho báo cáo', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    expect(await listing().reviewSubject(live.id)).toMatchObject({
      id: live.id,
      ownerId: user.id,
      state: 'live',
      version: live.version,
      placement: 'marketplace',
      detached: false,
    });
    expect(await listing().forReviewer(live.id)).toMatchObject({ id: live.id, title: live.title });
    await prisma.listing.update({ where: { id: live.id }, data: { deletedAt: new Date() } });
    expect(await listing().reviewSubject(live.id)).toBeNull();
    // Báo cáo về tin đã xoá vẫn xử trên bản lưu (add-reports).
    expect(await listing().reviewSubject(live.id, { includeDeleted: true })).toMatchObject({
      id: live.id,
      deleted: true,
    });
    expect(await listing().forReviewer(live.id)).toMatchObject({ id: live.id, title: live.title });
  });

  it('pendingInGroup: chỉ tin chờ duyệt của đúng người trong đúng nhóm', async () => {
    const group = await createActiveGroup(app);
    const poster = await addMember(app, group.groupId);
    const held = await machineHold(
      app,
      poster,
      await submitted(app, poster, { placement: 'members_only', groupId: group.groupId }),
    );
    const elsewhere = await machineHold(app, poster, await submitted(app, poster));
    expect(await listing().pendingInGroup(poster.id, group.groupId)).toEqual([held.id]);
    expect(await listing().pendingInGroup(poster.id, group.groupId)).not.toContain(elsewhere.id);
  });
});
