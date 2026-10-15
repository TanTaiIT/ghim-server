import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  createActiveGroup,
  deliverAll,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  listingApi,
  liveListingOf,
  machineHold,
  machinePass,
  type OwnListing,
  patch,
  submitted,
} from './listing-http-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec review/queues qua luồng thật (add-review-queues task 3.1, 3.2): sự kiện do `listing` phát, bên nghe thật của
 * `review`, việc trên DB thật — việc sinh khi nào, gộp thế nào, bản sửa và rút về nháp làm gì với việc, và tin có việc
 * mở thì không đổi nơi đăng.
 */
const HOUR_MS = 3_600_000;
let now = TEST_NOW;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const at = (hours: number) => new Date(TEST_NOW.getTime() + hours * HOUR_MS);
const openTaskOf = (listingId: string) =>
  prisma.reviewTask.findFirst({ where: { listingId, status: 'open' } });
const lastTaskOf = (listingId: string) =>
  prisma.reviewTask.findFirst({ where: { listingId }, orderBy: { createdAt: 'desc' } });
const setDue = (listingId: string, dueAt: Date) =>
  prisma.reviewTask.updateMany({ where: { listingId, status: 'open' }, data: { dueAt } });

/** Tin bị máy giữ, việc đã sinh. */
async function heldOf(user: TestUser): Promise<OwnListing> {
  const held = await machineHold(app, user, await submitted(app, user));
  await deliverAll(app);
  return held;
}

/** Tin của T1 máy cho qua hạn chế, việc hàng 3 đã sinh. */
async function limitedOf(user: TestUser): Promise<OwnListing> {
  const limited = await machinePass(app, user, await submitted(app, user), true);
  await deliverAll(app);
  return limited;
}

/** Người đăng sửa tiêu đề — tin về đang kiểm, chờ máy. */
async function editTitle(user: TestUser, listing: OwnListing, title: string): Promise<OwnListing> {
  const res = await patch(app, user, listing, { title });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data as OwnListing;
}

async function afterMachine(
  user: TestUser,
  checking: OwnListing,
  outcome: 'hold' | 'full' | 'limited',
): Promise<OwnListing> {
  const result =
    outcome === 'hold'
      ? await machineHold(app, user, checking)
      : await machinePass(app, user, checking, outcome === 'limited');
  await deliverAll(app);
  return result;
}

describe('Máy giữ hay hạn chế một tin thì sinh việc', () => {
  it('máy giữ tin lúc gửi: một việc hàng 0, hạn 24 giờ, tin chờ duyệt', async () => {
    const user = await newUser(app);
    const held = await heldOf(user);
    expect(held.state).toBe('pending');
    expect(await openTaskOf(held.id)).toMatchObject({
      queue: 0,
      reasons: ['machine_hold'],
      dueAt: at(24),
    });
  });

  it('tin của T1 ở dải Vừa: việc hàng 3, tin hiển thị hạn chế ngay', async () => {
    const user = await newUser(app);
    const limited = await limitedOf(user);
    expect(limited).toMatchObject({ state: 'live' });
    expect(limited.restrictions).toContain('machine');
    expect(await openTaskOf(limited.id)).toMatchObject({
      queue: 3,
      reasons: ['machine_restricted'],
      dueAt: at(72),
    });
  });

  it('cụm từ cấm mới rút tin đang hiện về: việc hàng 0', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await app.modules.listing.recallByMachine(live.id, live.version);
    await deliverAll(app);
    expect(await openTaskOf(live.id)).toMatchObject({ queue: 0, reasons: ['machine_hold'] });
  });

  it('lưới an toàn gặp tin thiếu kết quả ảnh: việc hàng 3', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await prisma.outboxEvent.create({
      data: { type: 'screening.listing.restricted', payload: { listingId: live.id } },
    });
    await deliverAll(app);
    expect(await openTaskOf(live.id)).toMatchObject({ queue: 3, reasons: ['machine_restricted'] });
  });

  it('người đăng bị loại khỏi việc của chính mình', async () => {
    const user = await newUser(app);
    const held = await heldOf(user);
    expect((await openTaskOf(held.id))?.excludedIds).toContain(user.id);
  });
});

describe('Một tin, một việc đang mở', () => {
  it('tin đang hậu kiểm bị máy rút về: một việc, hàng 0, hạn 24 giờ kể từ lúc rút', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await app.modules.review.addReason(live.id, { reason: 'sample_risk' });
    now = at(24);
    await app.modules.listing.recallByMachine(live.id, live.version);
    await deliverAll(app);
    const open = await prisma.reviewTask.findMany({
      where: { listingId: live.id, status: 'open' },
    });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      queue: 0,
      reasons: ['machine_hold', 'sample_risk'],
      dueAt: at(48),
    });
  });

  it('hạn cũ sớm hơn thì giữ hạn cũ: việc hàng 3 còn 2 giờ, máy giữ bản sửa', async () => {
    const user = await newUser(app);
    const limited = await limitedOf(user);
    await setDue(limited.id, at(2));
    await afterMachine(user, await editTitle(user, limited, 'Xe đạp cũ, mới thay lốp'), 'hold');
    expect(await openTaskOf(limited.id)).toMatchObject({
      queue: 0,
      reasons: ['machine_hold', 'machine_restricted'],
      dueAt: at(2),
    });
  });

  it('hai việc sinh cùng lúc về một tin: chỉ một việc mở', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await Promise.all([
      app.modules.review.addReason(live.id, { reason: 'sample_risk' }),
      app.modules.review.addReason(live.id, { reason: 'machine_restricted' }),
    ]);
    const open = await prisma.reviewTask.findMany({
      where: { listingId: live.id, status: 'open' },
    });
    expect(open).toHaveLength(1);
    expect(open[0]?.reasons).toEqual(['machine_restricted', 'sample_risk']);
  });

  it('sinh việc trong transaction đổi tin cùng lúc với một lượt sinh việc ngoài: không chờ nhau, một việc mở', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    const { review, listing } = app.modules;
    // Như quyết định của người: khoá tin, ghi việc trong hook `after` — lượt ngoài phải khoá tin trước (design mục 3).
    await Promise.all([
      listing.confirmLive({
        listingId: live.id,
        version: live.version,
        after: (tx) => review.addReason(live.id, { reason: 'sample_reviewer', tx }),
      }),
      review.addReason(live.id, { reason: 'sample_risk' }),
    ]);
    const open = await prisma.reviewTask.findMany({
      where: { listingId: live.id, status: 'open' },
    });
    expect(open).toHaveLength(1);
    expect(open[0]?.reasons).toEqual(['sample_reviewer', 'sample_risk']);
  });
});

describe('Bản sửa của người đăng', () => {
  it('tin chờ duyệt chỉ vì máy giữ, sửa xong máy cho qua: việc bị huỷ', async () => {
    const user = await newUser(app);
    const held = await heldOf(user);
    await afterMachine(user, await editTitle(user, held, 'Xe đạp cũ, ảnh rõ hơn'), 'full');
    expect(await openTaskOf(held.id)).toBeNull();
    expect(await lastTaskOf(held.id)).toMatchObject({
      status: 'cancelled',
      closeCause: 'machine_passed',
    });
  });

  it('còn 5 giờ hạn, sửa xong máy vẫn giữ: một việc, hạn vẫn 5 giờ', async () => {
    const user = await newUser(app);
    const held = await heldOf(user);
    await setDue(held.id, at(5));
    await afterMachine(user, await editTitle(user, held, 'Xe đạp cũ, thêm ảnh'), 'hold');
    expect(await prisma.reviewTask.count({ where: { listingId: held.id, status: 'open' } })).toBe(
      1,
    );
    expect((await openTaskOf(held.id))?.dueAt).toEqual(at(5));
  });

  it('tin hạn chế do máy, sửa xong máy cho qua đầy đủ: việc hàng 3 bị huỷ', async () => {
    const user = await newUser(app);
    const limited = await limitedOf(user);
    await afterMachine(user, await editTitle(user, limited, 'Xe đạp cũ, giá tốt'), 'full');
    expect(await openTaskOf(limited.id)).toBeNull();
  });

  it('tin đang trong mẫu hậu kiểm được sửa: việc hàng 5 bị huỷ, không tính "bỏ sót"', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await app.modules.review.addReason(live.id, { reason: 'sample_risk' });
    await afterMachine(user, await editTitle(user, live, 'Xe đạp cũ, đi rất êm'), 'full');
    expect(await openTaskOf(live.id)).toBeNull();
    expect((await lastTaskOf(live.id))?.closeCause).toBe('edited');
  });

  it('việc gộp còn lý do khác: máy cho bản sửa qua hạn chế → còn "hạn chế do máy", hàng 3, hạn không đổi', async () => {
    const user = await newUser(app);
    const limited = await limitedOf(user);
    const held = await afterMachine(
      user,
      await editTitle(user, limited, 'Xe đạp cũ, bản sửa 1'),
      'hold',
    );
    // Gộp máy giữ: hạn rút về 24 giờ. Bỏ lý do sau đó không kéo dài lại 72 giờ — "giữ nguyên hạn xử" (spec).
    const merged = await openTaskOf(limited.id);
    expect(merged).toMatchObject({ queue: 0, dueAt: at(24) });
    await afterMachine(user, await editTitle(user, held, 'Xe đạp cũ, bản sửa 2'), 'limited');
    expect(await openTaskOf(limited.id)).toMatchObject({
      queue: 3,
      reasons: ['machine_restricted'],
      dueAt: merged?.dueAt,
    });
  });
});

describe('Rút tin chờ duyệt về nháp', () => {
  it('việc bị huỷ và không còn trong hàng chờ của ai', async () => {
    const user = await newUser(app);
    const held = await heldOf(user);
    const res = await listingApi(app, 'POST', `/listings/${held.id}/withdraw`, user);
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await openTaskOf(held.id)).toBeNull();
    expect((await lastTaskOf(held.id))?.closeCause).toBe('withdrawn');
  });
});

describe('Tin có việc mở thì không đổi nơi đăng (spec listing/editing)', () => {
  it('mở rộng tin đang trong mẫu hậu kiểm: 409 PLACEMENT_LOCKED', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    await app.modules.review.addReason(live.id, { reason: 'sample_risk' });
    const widen = await patch(app, member, live, { placement: 'group_public' });
    expect(widen.statusCode).toBe(409);
    expect(widen.json().error.code).toBe('PLACEMENT_LOCKED');
  });
});

describe('Bù việc lúc khởi động', () => {
  it('tin chờ duyệt có từ trước, chưa có việc: sinh việc hàng 0; chạy lại không sinh thêm', async () => {
    const user = await newUser(app);
    const held = await heldOf(user);
    await prisma.reviewTask.deleteMany({ where: { listingId: held.id } });
    await app.modules.review.backfill();
    await app.modules.review.backfill();
    expect(await prisma.reviewTask.count({ where: { listingId: held.id, status: 'open' } })).toBe(
      1,
    );
  });
});
