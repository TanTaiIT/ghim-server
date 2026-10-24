import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { createPlatformPrivilegeSource } from '../src/modules/platform/platform.service.js';
import { TRUST_JOBS } from '../src/modules/trust/trust.jobs.js';
import { createTrustService, type TrustService } from '../src/modules/trust/trust.service.js';
import { genericHolds, noBuyerInterest } from './fakes/trust-ports.fake.js';
import { prisma } from './db-helpers.js';
import type { FakeJobs } from './fakes/jobs.fake.js';
import { deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import {
  getOwn,
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
 * Spec trust/trust-tiers qua luồng thật: tin lên bảng qua HTTP, lượt hằng ngày và bên nghe thật, đồng hồ app đẩy theo
 * ngày. Ngày 1 = `TEST_NOW` (09:00 giờ Việt Nam), cũng là lúc tạo tài khoản. Dữ kiện tin sạch ở các ca về ngưỡng mức ghi
 * thẳng qua repository (dữ liệu nền) — luồng thành tin sạch có ca riêng.
 */
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const day = (n: number, hours = 0) =>
  new Date(TEST_NOW.getTime() + (n - 1) * DAY_MS + hours * HOUR_MS);
/** 00:30 của ngày `n` — giờ chạy lượt hằng ngày (`TEST_NOW` là 09:00). */
const dailyTime = (n: number) => day(n, -8.5);

let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const trust = () => app.modules.trust;
const tierRow = (accountId: string) => prisma.trustTierResult.findUnique({ where: { accountId } });
const cleanRows = (listingId: string) =>
  prisma.trustCleanListing.findMany({ where: { listingId } });
/** Lượt hằng ngày ở 00:30 ngày `n`, rồi giao sự kiện (mức đổi → `listing` gỡ "tài khoản mới"). */
async function dailyOn(n: number) {
  now = dailyTime(n);
  const result = await trust().recomputeDaily();
  await deliverAll(app);
  return result;
}
/** Làm một việc qua API ở thời điểm đang mô phỏng rồi giao sự kiện cho bên nghe thật. */
async function act(method: 'POST' | 'DELETE', url: string, actor: TestUser, body?: object) {
  const res = await listingApi(app, method, url, await signedInAt(app, actor, now), body);
  await deliverAll(app);
  return res;
}
/** Dữ kiện tin sạch ghi thẳng (mốc 00:30 như lượt hằng ngày ghi) — cho ca về ngưỡng mức. */
const seedClean = (accountId: string, days: number[]) =>
  Promise.all(
    days.map((n) =>
      repositories.trust.addClean({
        listingId: randomUUID(),
        accountId,
        via: 'shown',
        at: dailyTime(n),
      }),
    ),
  );
/** Ba tin sạch mỗi tuần từ ngày `from` — không tin nào phải dời. */
const spreadDays = (count: number, from = 2) =>
  Array.from({ length: count }, (_, i) => from + Math.floor(i / 3) * 7 + (i % 3));
const recomputeOn = async (accountId: string, n: number) => {
  now = day(n);
  return trust().recompute(accountId);
};
/** `trust` thứ hai trên cùng DB với cổng / bảng con số đè được — "có người hỏi mua", bảng con số mới. */
function trustWith(input: {
  buyers?: boolean;
  config?: Parameters<typeof createStaticRuntimeConfig>[0];
  version?: number;
}): TrustService {
  return createTrustService({
    repository: repositories.trust,
    strikes: repositories.strike,
    privileges: createPlatformPrivilegeSource(repositories.platform),
    listings: app.modules.listing,
    identity: app.modules.identity,
    buyerInterest: input.buyers ? { hasInquiry: () => Promise.resolve(true) } : noBuyerInterest,
    holds: genericHolds,
    config: createStaticRuntimeConfig(input.config ?? {}, input.version ?? 0),
    clock: () => now,
  });
}
const soldEvent = (listing: { id: string; ownerId: string }) => ({
  listingId: listing.id,
  ownerId: listing.ownerId,
  from: 'live' as const,
  to: 'sold' as const,
  fault: null,
});

describe('Tài khoản mới ở mức T0', () => {
  it('vừa xác nhận (email hay Google — đều là tài khoản chưa có kết quả tính): T0', async () => {
    const user = await newUser(app);
    expect(await trust().tierOf(user.id)).toBe('T0');
    const board = await listingApi(app, 'GET', '/me/trust', user);
    expect(board.json().data).toMatchObject({ tier: 'T0', countedClean: 0 });
  });
});

describe('Lên mức theo tuổi tài khoản và tin sạch', () => {
  it('tin đầu tiên (hiển thị hạn chế) đủ 7 ngày trong ngày 8: lượt hằng ngày kế tiếp đưa lên T1, tin hết "tài khoản mới"', async () => {
    const minh = await newUser(app);
    const live = await liveListingOf(app, minh);
    expect(live.restrictions).toEqual(['new_account']);
    expect((await dailyOn(8)).newClean).toBe(0);
    expect(await trust().tierOf(minh.id)).toBe('T0');
    await dailyOn(9);
    expect(await cleanRows(live.id)).toEqual([expect.objectContaining({ via: 'shown' })]);
    expect(await tierRow(minh.id)).toMatchObject({ tier: 'T1', countedClean: 1 });
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: live.id } })).restrictions,
    ).toEqual([]);
    // N56 (add-trust-notices): lên mức vào hộp thư, không nhắc.
    await deliverAll(app);
    expect(
      await prisma.notification.findMany({
        where: { recipientId: minh.id, category: 'trust_strikes' },
      }),
    ).toMatchObject([
      { type: 'trust.tier.raised', alert: false, body: 'Tài khoản đã lên mức T1.' },
    ]);
  });

  it('20 ngày tuổi chưa có tin sạch: T0; 5 ngày tuổi có 2 tin sạch: T0', async () => {
    const [old, young] = [await newUser(app), await newUser(app)];
    expect(await recomputeOn(old.id, 20)).toBe('T0');
    await seedClean(young.id, [3, 4]);
    expect(await recomputeOn(young.id, 5)).toBe('T0');
  });

  it('ngày 30 có 5 tin sạch: T2; 100 ngày tuổi 19 tin: T2; 90 ngày tuổi 20 tin: T3', async () => {
    const [t2, almost, t3] = [await newUser(app), await newUser(app), await newUser(app)];
    await seedClean(t2.id, spreadDays(5));
    await seedClean(almost.id, spreadDays(19));
    await seedClean(t3.id, spreadDays(20));
    expect(await recomputeOn(t2.id, 30)).toBe('T2');
    expect(await recomputeOn(almost.id, 100)).toBe('T2');
    expect(await recomputeOn(t3.id, 90)).toBe('T3');
  });

  it('xác nhận email muộn: tạo ngày 1, tin sạch ngày 12 → ngày 12 đủ tuổi cho T1', async () => {
    const user = await newUser(app);
    await seedClean(user.id, [12]);
    expect(await recomputeOn(user.id, 12)).toBe('T1');
  });

  it('tuổi chạm mốc: tin sạch nhờ đã bán khi mới 4 ngày tuổi, lượt hằng ngày ngày 7 đưa lên T1', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    now = day(4);
    await act('POST', `/listings/${live.id}/sold`, user);
    await trustWith({ buyers: true }).onListingStateChanged(soldEvent(live));
    expect(await tierRow(user.id)).toMatchObject({ tier: 'T0', countedClean: 1 });
    await dailyOn(7);
    expect(await trust().tierOf(user.id)).toBe('T1');
  });
});

describe('Tin sạch nhờ đủ ngày hiển thị', () => {
  it('hiển thị 6 ngày rồi đánh dấu đã bán, không ai hỏi mua: không là tin sạch', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    now = day(7);
    await act('POST', `/listings/${live.id}/sold`, user);
    await dailyOn(9);
    expect(await cleanRows(live.id)).toEqual([]);
  });

  it('nằm chờ duyệt 8 ngày, chưa từng hiển thị: không là tin sạch', async () => {
    const user = await newUser(app);
    const pending = await machineHold(app, user, await submitted(app, user));
    await dailyOn(10);
    expect(await cleanRows(pending.id)).toEqual([]);
  });

  it('đã sạch, hết hạn, được gia hạn và hiển thị thêm 7 ngày: vẫn chỉ một tin sạch', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await dailyOn(9);
    now = day(31, 1);
    await app.modules.listing.expireDue();
    now = day(32);
    const later = await signedInAt(app, user, now);
    const expired = await getOwn(app, later, live.id);
    const renewed = await listingApi(app, 'POST', `/listings/${live.id}/renew`, later, {
      version: expired.version,
    });
    await machinePass(app, later, renewed.json().data);
    await dailyOn(41);
    expect(await cleanRows(live.id)).toHaveLength(1);
    expect((await tierRow(user.id))?.countedClean).toBe(1);
  });

  it('hiện 4 ngày, tạm ẩn 3 ngày vì khoá tài khoản, hiện lại: thành sạch khi hiện lại đủ 3 ngày, không lúc mở khoá', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    now = day(5);
    await act('POST', `/ops/accounts/${user.id}/lock`, master, { reason: 'Thử' });
    now = day(8);
    await act('POST', `/ops/accounts/${user.id}/unlock`, master);
    await dailyOn(9);
    await dailyOn(11);
    expect(await cleanRows(live.id)).toEqual([]);
    await dailyOn(12);
    expect(await cleanRows(live.id)).toHaveLength(1);
  });
});

describe('Tin đã bán thành tin sạch (cổng "có người hỏi mua" đè — add-messaging)', () => {
  it('bán sau 3 ngày, có người hỏi mua: tin sạch qua lối "đã bán", tính lại ngay', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    now = day(4);
    await act('POST', `/listings/${live.id}/sold`, user);
    await trustWith({ buyers: true }).onListingStateChanged(soldEvent(live));
    expect(await cleanRows(live.id)).toEqual([expect.objectContaining({ via: 'sold' })]);
    expect((await tierRow(user.id))?.countedClean).toBe(1);
  });

  it('bán sau 1 ngày có người hỏi mua: không; bán sau 5 ngày không ai hỏi (bên nghe thật): không', async () => {
    const user = await newUser(app);
    const early = await liveListingOf(app, user);
    const lonely = await liveListingOf(app, user);
    now = day(2);
    await act('POST', `/listings/${early.id}/sold`, user);
    await trustWith({ buyers: true }).onListingStateChanged(soldEvent(early));
    now = day(6);
    await act('POST', `/listings/${lonely.id}/sold`, user);
    expect([await cleanRows(early.id), await cleanRows(lonely.id)]).toEqual([[], []]);
  });

  it('đã sạch nhờ hiển thị 10 ngày rồi mới bán có người hỏi: vẫn chỉ một tin sạch', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await dailyOn(11);
    now = day(12);
    await act('POST', `/listings/${live.id}/sold`, user);
    await trustWith({ buyers: true }).onListingStateChanged(soldEvent(live));
    expect(await cleanRows(live.id)).toEqual([expect.objectContaining({ via: 'shown' })]);
  });
});

/** Tin của một người mới, sạch nhờ hiển thị đủ ngày (lượt hằng ngày ngày 11) — người đó lên T1. */
async function cleanListing() {
  const user = await newUser(app);
  const live = await liveListingOf(app, user);
  await dailyOn(11);
  expect(await trust().tierOf(user.id)).toBe('T1');
  return { user, listing: await getOwn(app, await signedInAt(app, user, now), live.id) };
}
const remove = (listing: { id: string; version: number }, fault: 'mistake' | 'violation') =>
  app.modules.listing.review({
    listingId: listing.id,
    version: listing.version,
    arrow: 'remove',
    fault,
  });

describe('Mất và giữ tư cách tin sạch', () => {
  it('tin sạch duy nhất bị gỡ vì vi phạm: thôi được tính, mức tính lại về T0', async () => {
    const { user, listing } = await cleanListing();
    await remove(listing, 'violation');
    await deliverAll(app);
    expect(await tierRow(user.id)).toMatchObject({ tier: 'T0', countedClean: 0 });
  });

  it('tin sạch bị gỡ vì sai sót: vẫn được tính', async () => {
    const { user, listing } = await cleanListing();
    await remove(listing, 'mistake');
    await deliverAll(app);
    expect(await tierRow(user.id)).toMatchObject({ tier: 'T1', countedClean: 1 });
  });

  it('báo cáo được xác nhận đúng: thôi tính; báo cáo bị huỷ: tính lại (cổng của add-reports)', async () => {
    const { user, listing } = await cleanListing();
    await trust().voidByReport(listing.id, user.id);
    expect((await tierRow(user.id))?.tier).toBe('T0');
    await trust().restoreAfterReport(listing.id, user.id);
    expect((await tierRow(user.id))?.tier).toBe('T1');
  });

  it('gỡ vì vi phạm ngày 15, khiếu nại thắng ngày 18: lại được tính với mốc cũ', async () => {
    const { user, listing } = await cleanListing();
    const cleanAt = (await cleanRows(listing.id))[0]?.cleanAt;
    now = day(15);
    const removed = await remove(listing, 'violation');
    await deliverAll(app);
    now = day(18);
    await app.modules.listing.review({
      listingId: removed.id,
      version: removed.version,
      arrow: 'appealWin',
    });
    await deliverAll(app);
    expect(await cleanRows(listing.id)).toEqual([
      expect.objectContaining({ cleanAt, voidedAt: null }),
    ]);
    expect((await tierRow(user.id))?.tier).toBe('T1');
  });

  it('người dùng ở T1 nhờ đúng một tin sạch xoá tin đó: vẫn T1', async () => {
    const { user, listing } = await cleanListing();
    await act('DELETE', `/listings/${listing.id}`, user);
    expect(await trust().recompute(user.id)).toBe('T1');
  });

  it('tin chưa sạch bị gỡ vì sai sót 10 ngày: chưa sạch; sửa, được cho qua, hiện thêm 7 ngày: thành sạch', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    now = day(4);
    const removed = await remove(live, 'mistake');
    await deliverAll(app);
    await dailyOn(14);
    expect(await cleanRows(live.id)).toEqual([]);
    now = day(14);
    const later = await signedInAt(app, user, now);
    const edited = await patch(app, later, removed, { title: 'Sửa cho đúng' });
    await machinePass(app, later, edited.json().data);
    await dailyOn(21);
    expect(await cleanRows(live.id)).toHaveLength(1);
  });
});

describe('Tối đa 3 tin sạch trong 7 ngày, tin vượt được dời', () => {
  it('năm tin cùng thành sạch một ngày: ba tin được tính; tính lại hai lần ra cùng kết quả, không ghi gì thêm', async () => {
    const user = await newUser(app);
    await seedClean(user.id, [10, 10, 10, 10, 10]);
    await recomputeOn(user.id, 10);
    const first = await tierRow(user.id);
    await recomputeOn(user.id, 10);
    expect(await tierRow(user.id)).toEqual(first);
    expect(first?.countedClean).toBe(3);
    expect(await prisma.trustTierChange.count({ where: { accountId: user.id } })).toBe(1);
  });

  it('ba tin ngày 10, 11, 12 và tin thứ tư ngày 18: tin thứ tư được tính', async () => {
    const user = await newUser(app);
    await seedClean(user.id, [10, 11, 12, 18]);
    await recomputeOn(user.id, 18);
    expect((await tierRow(user.id))?.countedClean).toBe(4);
  });

  it('bốn tin cùng ngày 10: tin thứ tư được tính từ lượt hằng ngày ngày 17', async () => {
    const user = await newUser(app);
    await seedClean(user.id, [10, 10, 10, 10]);
    await dailyOn(16);
    expect((await tierRow(user.id))?.countedClean).toBe(3);
    await dailyOn(17);
    expect((await tierRow(user.id))?.countedClean).toBe(4);
  });
});

describe('Tính lại từ dữ kiện, theo phiên bản bảng con số', () => {
  it('máy giữ ba tin của người đang ở T2 trong 7 ngày: vẫn T2', async () => {
    const user = await newUser(app);
    await seedClean(user.id, spreadDays(5));
    expect(await recomputeOn(user.id, 30)).toBe('T2');
    now = day(30);
    await Promise.all(
      [1, 2, 3].map(async () => {
        const later = await signedInAt(app, user, now);
        return machineHold(app, later, await submitted(app, later));
      }),
    );
    await dailyOn(37);
    expect(await trust().tierOf(user.id)).toBe('T2');
  });

  it('bảng con số nâng tuổi T1 lên 14 ngày, không có chuyện gì mới: lượt hằng ngày kế tiếp đưa về T0, ghi phiên bản mới', async () => {
    const user = await newUser(app);
    await seedClean(user.id, [9]);
    expect(await recomputeOn(user.id, 10)).toBe('T1');
    now = dailyTime(11);
    await trustWith({ config: { 'trust.t1MinDays': 14 }, version: 2 }).recomputeDaily();
    expect(await tierRow(user.id)).toMatchObject({ tier: 'T0', configVersion: 2 });
    expect(
      await prisma.trustTierChange.findFirst({
        where: { accountId: user.id, toTier: 'T0' },
      }),
    ).toMatchObject({ fromTier: 'T1', configVersion: 2 });
  });

  it('mức đổi phát trust.tier.changed kèm phiên bản bảng con số đã dùng', async () => {
    const user = await newUser(app);
    await seedClean(user.id, [8]);
    await recomputeOn(user.id, 9);
    const events = await prisma.outboxEvent.findMany({ where: { type: 'trust.tier.changed' } });
    expect(events.map((event) => event.payload)).toContainEqual({
      accountId: user.id,
      from: 'T0',
      to: 'T1',
      configVersion: 0,
    });
  });
});

describe('Tài khoản bị xoá', () => {
  it('bên nghe identity.account.deleted bỏ kết quả mức; dữ kiện tin sạch ở lại cho hạn lưu', async () => {
    const user = await newUser(app);
    await seedClean(user.id, [8]);
    await recomputeOn(user.id, 9);
    now = TEST_NOW;
    expect((await act('DELETE', '/me', user)).statusCode).toBe(204);
    expect(await tierRow(user.id)).toBeNull();
    expect(await prisma.trustCleanListing.count({ where: { accountId: user.id } })).toBe(1);
  });
});

describe('Bên nghe chịu được nhận trùng; việc theo lịch', () => {
  it('sự kiện gỡ vì vi phạm tới hai lần: kết quả như một lần, không ghi thêm lần đổi mức', async () => {
    const { user, listing } = await cleanListing();
    await remove(listing, 'violation');
    await deliverAll(app);
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        type: 'listing.state.changed',
        payload: { path: ['listingId'], equals: listing.id },
      },
      orderBy: { createdAt: 'desc' },
    });
    const changes = await prisma.trustTierChange.count({ where: { accountId: user.id } });
    await prisma.outboxEvent.create({ data: { type: event.type, payload: event.payload ?? {} } });
    await deliverAll(app);
    expect(await prisma.trustTierChange.count({ where: { accountId: user.id } })).toBe(changes);
    expect((await tierRow(user.id))?.tier).toBe('T0');
  });

  it('trust.recompute-daily xếp lịch 00:30 giờ Việt Nam; chạy qua bộ việc nền ra cùng kết quả', async () => {
    const jobs = app.jobs as FakeJobs;
    expect(jobs.schedules).toContainEqual({ name: TRUST_JOBS.recomputeDaily, cron: '30 0 * * *' });
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    now = dailyTime(9);
    await jobs.send(TRUST_JOBS.recomputeDaily, {});
    await jobs.runAll();
    expect(await cleanRows(live.id)).toHaveLength(1);
    expect(await trust().tierOf(user.id)).toBe('T1');
  });
});

describe('Theo trạng thái hiện tại và tính lần lượt (fix-audit-screening-trust)', () => {
  it('gỡ vì vi phạm → khiếu nại thắng → lượt gỡ được xử lại: tin vẫn sạch, mức không đổi', async () => {
    const { user, listing } = await cleanListing();
    now = day(15);
    const removed = await remove(listing, 'violation');
    await deliverAll(app);
    now = day(18);
    await app.modules.listing.review({
      listingId: removed.id,
      version: removed.version,
      arrow: 'appealWin',
    });
    await deliverAll(app);
    const events = await prisma.outboxEvent.findMany({
      where: {
        type: 'listing.state.changed',
        payload: { path: ['listingId'], equals: listing.id },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const removal = events.find((event) => (event.payload as { to?: string }).to === 'removed');
    if (!removal) throw new Error('Không có sự kiện gỡ');

    await prisma.outboxEvent.create({
      data: { type: removal.type, payload: removal.payload ?? {} },
    });
    await deliverAll(app);
    expect(await cleanRows(listing.id)).toEqual([expect.objectContaining({ voidedAt: null })]);
    expect((await tierRow(user.id))?.tier).toBe('T1');
  });

  it('lượt tính dừng giữa chừng trong lúc tin sạch duy nhất bị gỡ vì vi phạm: mức cuối là T0 (T23)', async () => {
    const { user, listing } = await cleanListing();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let gated = true;
    const slow = createTrustService({
      repository: {
        ...repositories.trust,
        async findTier(accountId, tx) {
          const row = await repositories.trust.findTier(accountId, tx);
          if (gated) {
            gated = false;
            await gate;
          }
          return row;
        },
      },
      strikes: repositories.strike,
      privileges: createPlatformPrivilegeSource(repositories.platform),
      listings: app.modules.listing,
      identity: app.modules.identity,
      buyerInterest: noBuyerInterest,
      holds: genericHolds,
      config: createStaticRuntimeConfig({}, 0),
      clock: () => now,
    });
    const stale = slow.recompute(user.id);
    await remove(listing, 'violation');
    const removal = deliverAll(app);
    // Lượt gỡ đã ghi dữ kiện (vô hiệu tin sạch) và đang chờ khoá của lượt tính đang dừng.
    const voided = async (): Promise<void> => {
      const [row] = await cleanRows(listing.id);
      if (row?.voidedAt) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
      await voided();
    };
    await voided();
    release?.();
    await Promise.all([stale, removal]);
    expect((await tierRow(user.id))?.tier).toBe('T0');
  });
});
