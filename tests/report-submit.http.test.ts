import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import type { TrustTier } from '../src/modules/listing/listing.ports.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  api,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { liveListingOf, listingApi } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import {
  aboutAccount,
  aboutListing,
  decideOps,
  openReportOf,
  report,
  reported,
  tieredTrust,
  unverifiedUser,
} from './report-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/* Spec review/reports qua HTTP (add-reports): gửi báo cáo, ai không gửi được, trần mỗi giờ, gộp, giấu danh tính. */
const MINUTE_MS = 60_000;
let now = TEST_NOW;
const tiers = new Map<string, TrustTier>();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: tieredTrust(tiers),
    screening: interimScreening,
  });
  await app.ready();
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
const codeOf = (res: Res) => (res.json() as { error: { code: string } }).error.code;
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;
type Mine = { reportId: string; status: string; category: string; accountId: string | null };

const liveOf = async (poster: TestUser, categoryId?: string) =>
  liveListingOf(app, poster, categoryId ? { categoryId } : {});

describe('Gửi báo cáo', () => {
  it('báo cáo một tin sàn đang hiển thị loại "lừa đảo": 201, báo cáo đang mở', async () => {
    const live = await liveOf(await newUser(app));
    const res = await report(app, await newUser(app), aboutListing(live.id), 'fraud');
    expect(res.statusCode, res.body).toBe(201);
    expect(dataOf<Mine>(res)).toMatchObject({ status: 'open', category: 'fraud' });
    expect((await openReportOf(aboutListing(live.id)))?.entries).toHaveLength(1);
  });

  it('báo cáo một người loại "sai thông tin": 201, báo cáo về người đó đang mở', async () => {
    const person = await newUser(app);
    const res = await report(app, await newUser(app), aboutAccount(person.id), 'misinformation');
    expect(res.statusCode, res.body).toBe(201);
    expect(dataOf<Mine>(res)).toMatchObject({ status: 'open', accountId: person.id });
    expect(await openReportOf(aboutAccount(person.id))).not.toBeNull();
  });

  it('loại "spam": 400 VALIDATION_ERROR, không báo cáo nào', async () => {
    const live = await liveOf(await newUser(app));
    const res = await report(app, await newUser(app), aboutListing(live.id), 'spam');
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect(await openReportOf(aboutListing(live.id))).toBeNull();
  });

  it('khách chưa đăng nhập: 401 UNAUTHORIZED', async () => {
    const live = await liveOf(await newUser(app));
    const res = await report(app, null, aboutListing(live.id));
    expect(res.statusCode).toBe(401);
    expect(codeOf(res)).toBe('UNAUTHORIZED');
  });

  it('người không phải thành viên báo tin "chỉ thành viên": 404 NOT_FOUND', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const inside = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    const res = await report(app, await newUser(app), aboutListing(inside.id));
    expect(res.statusCode).toBe(404);
    expect(codeOf(res)).toBe('NOT_FOUND');
  });

  it('email chưa xác nhận: 403 EMAIL_NOT_VERIFIED, không báo cáo nào', async () => {
    const live = await liveOf(await newUser(app));
    const res = await report(app, await unverifiedUser(app), aboutListing(live.id));
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('EMAIL_NOT_VERIFIED');
    expect(await openReportOf(aboutListing(live.id))).toBeNull();
  });
});

describe('Tài khoản master không gửi báo cáo', () => {
  it('master gửi bằng tài khoản master: 403; cùng người dùng tài khoản cá nhân: 201', async () => {
    const live = await liveOf(await newUser(app));
    const res = await report(app, await newMaster(app), aboutListing(live.id));
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await openReportOf(aboutListing(live.id))).toBeNull();
    const personal = await report(app, await newUser(app), aboutListing(live.id));
    expect(personal.statusCode).toBe(201);
  });
});

describe('Không tự báo cáo mình', () => {
  it('báo tin của mình hay tài khoản của mình: 400 CANNOT_REPORT_SELF', async () => {
    const poster = await newUser(app);
    const live = await liveOf(poster);
    const own = await report(app, poster, aboutListing(live.id));
    expect(own.statusCode).toBe(400);
    expect(codeOf(own)).toBe('CANNOT_REPORT_SELF');
    const self = await report(app, poster, aboutAccount(poster.id));
    expect(codeOf(self)).toBe('CANNOT_REPORT_SELF');
    expect(await openReportOf(aboutListing(live.id))).toBeNull();
  });
});

describe('Tối đa 10 báo cáo mỗi giờ', () => {
  it('báo cáo thứ 11 trong một giờ: 429 kèm lúc báo tiếp; 61 phút sau lượt sớm nhất: 201', async () => {
    const reporter = await newUser(app);
    const people = await Promise.all(Array.from({ length: 11 }, () => newUser(app)));
    const first10 = people.slice(0, 10);
    await sequentially(first10, async (person) => {
      now = new Date(TEST_NOW.getTime() + first10.indexOf(person) * MINUTE_MS);
      await reported(app, reporter, aboutAccount(person.id), 'harassment');
    });
    now = new Date(TEST_NOW.getTime() + 30 * MINUTE_MS);
    const eleventh = people[10] as TestUser;
    const limited = await report(app, reporter, aboutAccount(eleventh.id), 'harassment');
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      error: {
        code: 'REPORT_RATE_LIMITED',
        details: { retryAt: new Date(TEST_NOW.getTime() + 60 * MINUTE_MS).toISOString() },
      },
    });
    expect(await openReportOf(aboutAccount(eleventh.id))).toBeNull();
    now = new Date(TEST_NOW.getTime() + 61 * MINUTE_MS);
    expect((await report(app, reporter, aboutAccount(eleventh.id), 'harassment')).statusCode).toBe(
      201,
    );
  });
});

describe('Gộp báo cáo về cùng một đối tượng', () => {
  it('người thứ hai báo cùng tin: một báo cáo mở với 2 người báo; người đó báo lại: 200, vẫn 2', async () => {
    const live = await liveOf(await newUser(app));
    const [first, second] = [await newUser(app), await newUser(app)];
    await reported(app, first, aboutListing(live.id), 'misinformation');
    await reported(app, second, aboutListing(live.id), 'other');
    expect((await openReportOf(aboutListing(live.id)))?.entries).toHaveLength(2);
    const again = await report(app, second, aboutListing(live.id), 'fraud');
    expect(again.statusCode).toBe(200);
    expect((await openReportOf(aboutListing(live.id)))?.entries).toHaveLength(2);
    expect(await prisma.report.count({ where: { listingId: live.id } })).toBe(1);
  });

  it('báo sau khi báo cáo cũ đã đóng: mở báo cáo mới với 1 người báo', async () => {
    const category = await seedCategory();
    const staff = await newUser(app);
    await grantStaff(staff.id, [], [category]);
    const live = await liveOf(await newUser(app), category);
    await reported(app, await newUser(app), aboutListing(live.id), 'other');
    const decided = await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(decided.statusCode, decided.body).toBe(200);
    await deliverAll(app);
    await reported(app, await newUser(app), aboutListing(live.id), 'other');
    expect((await openReportOf(aboutListing(live.id)))?.entries).toHaveLength(1);
    expect(await prisma.report.count({ where: { listingId: live.id } })).toBe(2);
  });
});

describe('Người bị báo cáo không biết ai báo', () => {
  it('người đăng mở tin đang bị báo cáo và xem bảng uy tín: không response nào có người báo', async () => {
    const poster = await newUser(app);
    const live = await liveOf(poster);
    const reporter = await newUser(app);
    await reported(app, reporter, aboutListing(live.id));
    const own = await listingApi(app, 'GET', `/listings/${live.id}`, poster);
    const trust = await api(app, 'GET', '/me/trust', poster.token);
    expect(own.statusCode).toBe(200);
    expect(trust.statusCode).toBe(200);
    for (const res of [own, trust]) expect(res.body).not.toContain(reporter.id);
  });
});
