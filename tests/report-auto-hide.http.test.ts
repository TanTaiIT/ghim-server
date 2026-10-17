import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TrustTier } from '../src/modules/listing/listing.ports.js';
import { sequentially } from '../src/common/utils/sequential.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import {
  addMember,
  api,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  getOwn,
  listingApi,
  liveListingOf,
  machinePass,
  type OwnListing,
  patch,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import {
  aboutListing,
  decideOps,
  openReportOf,
  openTaskOf,
  reported,
  setScore,
  tieredTrust,
} from './report-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/* Spec review/report-auto-hide qua HTTP và bên nghe thật (add-reports): ngưỡng, cờ "nhiều người báo", hiện lại. */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
let now = TEST_NOW;
const tiers = new Map<string, TrustTier>();
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: tieredTrust(tiers),
    screening: interimScreening,
  });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const at = (ms: number) => new Date(TEST_NOW.getTime() + ms);

/** Mỗi người báo từ máy của mình (`may-<i>`) — `devices` đè máy theo thứ tự; `hours` là lúc từng lượt báo. */
async function reportedBy(
  listingId: string,
  reporters: TestUser[],
  options: { devices?: string[]; hours?: number[] } = {},
) {
  await sequentially(reporters, async (reporter) => {
    const index = reporters.indexOf(reporter);
    now = at((options.hours?.[index] ?? index) * HOUR_MS);
    await reported(
      app,
      reporter,
      aboutListing(listingId),
      'fraud',
      options.devices?.[index] ?? `may-${reporter.id}`,
    );
  });
  await deliverAll(app);
}

const people = (count: number) => Promise.all(Array.from({ length: count }, () => newUser(app)));

const strangerSees = async (listingId: string): Promise<number> =>
  (await listingApi(app, 'GET', `/listings/${listingId}`, await newUser(app))).statusCode;

async function hiddenListing(): Promise<{ poster: TestUser; live: OwnListing; staff: TestUser }> {
  const category = await seedCategory();
  const staff = await newUser(app);
  await grantStaff(staff.id, [], [category]);
  const poster = await newUser(app);
  const live = await liveListingOf(app, poster, { categoryId: category });
  await reportedBy(live.id, await people(3));
  return { poster, live, staff };
}

describe('Ngưỡng tạm ẩn khi nhiều người báo', () => {
  it('3 người T1, điểm bình thường, 3 máy, trong 10 giờ: tin tạm ẩn lý do "nhiều người báo cáo"', async () => {
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster);
    await reportedBy(live.id, await people(3), { hours: [0, 5, 10] });
    expect((await getOwn(app, poster, live.id)).hideReasons).toContain('reported');
    expect(await strangerSees(live.id)).toBe(404);
  });

  it('mới có 2 người: tin vẫn hiện, báo cáo trong hàng chờ', async () => {
    const live = await liveListingOf(app, await newUser(app));
    await reportedBy(live.id, await people(2));
    expect(await strangerSees(live.id)).toBe(200);
    expect((await openTaskOf(aboutListing(live.id))).reasons).toContain('report_severe');
  });

  it('3 người, 2 người báo từ cùng một máy: tin vẫn hiện', async () => {
    const live = await liveListingOf(app, await newUser(app));
    await reportedBy(live.id, await people(3), {
      devices: ['may-chung', 'may-chung', 'may-rieng'],
    });
    expect(await strangerSees(live.id)).toBe(200);
  });

  it('3 người từ 3 máy, một người ở T0: tin vẫn hiện, lượt của người T0 vẫn nằm trong báo cáo', async () => {
    const live = await liveListingOf(app, await newUser(app));
    const reporters = await people(3);
    tiers.set((reporters[0] as TestUser).id, 'T0');
    await reportedBy(live.id, reporters);
    expect(await strangerSees(live.id)).toBe(200);
    expect((await openReportOf(aboutListing(live.id)))?.entries).toHaveLength(3);
  });

  it('3 người T1 từ 3 máy, một người có điểm báo cáo −4: tin vẫn hiện', async () => {
    const live = await liveListingOf(app, await newUser(app));
    const reporters = await people(3);
    await setScore((reporters[1] as TestUser).id, -4);
    await reportedBy(live.id, reporters);
    expect(await strangerSees(live.id)).toBe(200);
  });

  it('lượt báo lúc 0, 10 và 26 giờ: tin vẫn hiện — không khoảng 24 giờ nào đủ 3 lượt', async () => {
    const live = await liveListingOf(app, await newUser(app));
    await reportedBy(live.id, await people(3), { hours: [0, 10, 26] });
    expect(await strangerSees(live.id)).toBe(200);
  });

  it('tin trong nhóm: không tự ẩn, báo cáo nằm trong hàng chờ', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const inside = await liveListingOf(app, member, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    await reportedBy(inside.id, await people(3));
    expect((await getOwn(app, member, inside.id)).hideReasons).not.toContain('reported');
    expect(await openTaskOf(aboutListing(inside.id))).toBeTruthy();
  });
});

describe('Tin tạm ẩn vì báo cáo chờ người xử', () => {
  it('người đăng thấy tin tạm ẩn chờ người duyệt, không có ai báo; người khác 404', async () => {
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster);
    const reporters = await people(3);
    await reportedBy(live.id, reporters);
    const own = await listingApi(app, 'GET', `/listings/${live.id}`, poster);
    expect((own.json() as { data: { hideReasons: string[] } }).data.hideReasons).toEqual([
      'reported',
    ]);
    for (const reporter of reporters) expect(own.body).not.toContain(reporter.id);
    expect(await strangerSees(live.id)).toBe(404);
  });

  it('bị ẩn lúc còn 20 ngày, 5 ngày trôi qua chưa ai quyết: vẫn ẩn, vẫn còn đúng số ngày lúc ẩn', async () => {
    const { poster, live } = await hiddenListing();
    const hidden = await getOwn(app, poster, live.id);
    now = at(5 * DAY_MS);
    const later = await getOwn(app, poster, live.id);
    expect(later.hideReasons).toContain('reported');
    expect(later.remainingMs).toBe(hidden.remainingMs);
    expect(later.remainingMs).not.toBeNull();
  });

  it('người đăng sửa tin đang tạm ẩn và máy cho qua: vẫn tạm ẩn tới khi người xử quyết', async () => {
    const { poster, live } = await hiddenListing();
    const current = await getOwn(app, poster, live.id);
    const edited = await patch(app, poster, current, { title: 'Tiêu đề mới sau khi bị báo' });
    expect(edited.statusCode, edited.body).toBe(200);
    await machinePass(app, poster, (edited.json() as { data: OwnListing }).data);
    await deliverAll(app);
    expect((await getOwn(app, poster, live.id)).hideReasons).toContain('reported');
  });

  it('báo cáo quá 72 giờ: chuyển master, tin vẫn tạm ẩn', async () => {
    const { poster, live } = await hiddenListing();
    now = at(73 * HOUR_MS);
    await app.modules.review.everyMinute();
    await deliverAll(app);
    expect((await openTaskOf(aboutListing(live.id))).escalatedAt).not.toBeNull();
    expect((await getOwn(app, poster, live.id)).hideReasons).toContain('reported');
  });
});

describe('Bác báo cáo thì tin hiện lại như cũ', () => {
  it('ẩn 3 ngày rồi người xử bác: tin hiện lại đầy đủ, không mất ngày nào', async () => {
    const { poster, live, staff } = await hiddenListing();
    const hidden = await getOwn(app, poster, live.id);
    now = at(3 * DAY_MS);
    const res = await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    const back = await getOwn(app, poster, live.id);
    expect(back).toMatchObject({ state: 'live', hideReasons: [], restrictions: [] });
    expect(new Date(back.expiresAt ?? 0).getTime() - now.getTime()).toBe(hidden.remainingMs);
    expect(await strangerSees(live.id)).toBe(200);
  });
});

describe('Mỗi tin chỉ tự ẩn một lần giữa hai quyết định của người', () => {
  it('đã tự ẩn rồi được bác, sau đó 3 người đủ điều kiện báo lại: tin vẫn hiện, báo cáo mới có 3 người', async () => {
    const { live, staff } = await hiddenListing();
    const res = await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    await reportedBy(live.id, await people(3));
    expect(await strangerSees(live.id)).toBe(200);
    expect((await openReportOf(aboutListing(live.id)))?.entries).toHaveLength(3);
    const detail = await api(
      app,
      'GET',
      `/ops/review/tasks/${(await openTaskOf(aboutListing(live.id))).id}`,
      master.token,
    );
    expect(detail.statusCode).toBe(200);
  });
});
