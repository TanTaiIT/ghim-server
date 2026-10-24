import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { createFakeMailer, type FakeMailer } from '../src/lib/mailer.js';
import { hashEmail, normalizeEmail } from '../src/modules/identity/calc/email.calc.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { getOwn, liveListingOf, signedInAt } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { aboutAccount, aboutListing, decideOps, opsQueueIds, reported } from './report-helpers.js';
import {
  anyArticle,
  codeOf,
  dataOf,
  decideStrike,
  staffOf,
  strikeTaskOf,
} from './strike-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec trust/serious-strikes (khoá ngay, kênh hỗ trợ, chỉ master quyết, nhận xét, khoá vĩnh viễn, xem lại 2 năm, hạ,
 * huỷ, không tự mở khoá), delta identity/registration (EMAIL_BANNED), account-lock (LOCKED_BY_STRIKE),
 * listing/display-period (trả ngày khi huỷ) — qua HTTP với `trust`, `identity` thật và bên nghe thật.
 */
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const YEAR_MS = 365 * DAY_MS;
const PASSWORD = 'ghim-rao-vat-2026!';
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
let backup: TestUser;
let mailer: FakeMailer;
let jobs: FakeJobs;
let passwordHash: string;
const day = (n: number) => new Date(TEST_NOW.getTime() + n * DAY_MS);

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
  mailer = createFakeMailer();
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => now, screening: interimScreening, mailer, jobs });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  await app.modules.trust.ensureRuleArticles();
  master = await newMaster(app);
  backup = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const account = (id: string) => repositories.identity.findAccountById(id);
const strikeRow = (id: string) =>
  prisma.strike.findUniqueOrThrow({ where: { id }, include: { appeal: true, comments: true } });
const listingRow = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });
const login = (email: string, password = PASSWORD) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
const register = (email: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: PASSWORD, displayName: 'Người thử' },
  });
const codeRequest = (email: string) =>
  app.inject({ method: 'POST', url: '/api/v1/support/serious-appeal/code', payload: { email } });
const supportAppeal = (email: string, code: string, statement = 'Tôi bị oan') =>
  app.inject({
    method: 'POST',
    url: '/api/v1/support/serious-appeal',
    payload: { email, code, statement },
  });
const variantOf = (email: string) => {
  const [local, domain] = email.split('@');
  return `${(local ?? '').toUpperCase()}+2@${domain}`;
};

/** Thư "đi" rồi đọc mã trong tiêu đề — đúng đường người bị khoá đi. */
async function lastCode(): Promise<string> {
  await jobs.runAll();
  const subject = mailer.sent.at(-1)?.subject ?? '';
  const code = /\d{6}/.exec(subject)?.[0];
  if (!code) throw new Error('Thư cuối không có mã 6 chữ số');
  return code;
}

/** Người đăng có mật khẩu thật và dấu băm email thật — khoá, đăng nhập, chặn email đều so trên dấu này. */
async function realUser(): Promise<TestUser> {
  const row = await seedAccount({ passwordHash });
  await repositories.identity.updateAccount(row.id, {
    emailHash: hashEmail(normalizeEmail(row.email), env.IDENTITY_HASH_KEY),
  });
  return { id: row.id, email: row.email, token: await tokenFor(app, row.id) };
}

const seriousBody = async () => ({
  outcome: 'violation',
  report: { verdict: 'upheld' },
  strike: { kind: 'serious', ruleArticleId: (await anyArticle()).id },
});

/** Gậy nghiêm trọng qua báo cáo hàng cấm đúng về một tin; `by` = staff của danh mục hay master. */
async function seriousStrike(input: { by?: TestUser } = {}) {
  const categoryId = await seedCategory();
  const staff = input.by ?? (await staffOf(app, [categoryId]));
  const poster = await realUser();
  const live = await liveListingOf(app, poster, { categoryId });
  // Tin thứ hai không dính quyết định: tạm ẩn vì khoá, đồng hồ vẫn trôi (spec display-period).
  const another = await liveListingOf(app, poster, { categoryId });
  await reported(app, await newUser(app), aboutListing(live.id), 'prohibited');
  const res = await decideOps(app, staff, aboutListing(live.id), await seriousBody());
  if (res.statusCode !== 200)
    throw new Error(`Ra gậy nghiêm trọng hỏng: ${res.statusCode} ${res.body}`);
  const strikeId = dataOf<{ strikeId: string }>(res).strikeId;
  await deliverAll(app);
  return { categoryId, staff, poster, live, another, strikeId };
}

describe('Gậy nghiêm trọng khoá tài khoản ngay', () => {
  it('staff xử báo cáo hàng cấm đúng kèm gậy nghiêm trọng: khoá ngay, thu phiên, tin tạm ẩn; đăng nhập → 403 ACCOUNT_LOCKED kèm điều trích; việc chờ master mở ngay', async () => {
    const { poster, live, strikeId, staff } = await seriousStrike();
    const strike = await strikeRow(strikeId);
    expect(strike).toMatchObject({ kind: 'serious', points: 0, expiresAt: null, status: 'active' });
    expect(await account(poster.id)).toMatchObject({
      status: 'locked',
      lockedReason: strike.ruleText,
    });
    expect(await repositories.identity.listActiveSessions(poster.id)).toHaveLength(0);
    const res = await login(poster.email);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string; message: string } }).error).toMatchObject({
      code: 'ACCOUNT_LOCKED',
      message: expect.stringContaining(strike.ruleText),
    });
    expect((await listingRow(live.id)).hideReasons).toContain('account_locked');
    const task = await strikeTaskOf(strikeId);
    expect(task).toMatchObject({ status: 'open', reasons: ['serious_strike'], queue: 2 });
    expect(await opsQueueIds(app, master)).toContain(task?.id);
    expect(await opsQueueIds(app, staff)).not.toContain(task?.id);
  });
});

describe('Kênh hỗ trợ cho người bị khoá', () => {
  it('xin mã luôn 200; mã sai → 401 không lộ gì; mã đúng ngày 20 → 201 kèm lý do, hạn; lần hai → 409 APPEAL_ALREADY_USED; việc của master vẫn là việc chờ quyết', async () => {
    const { poster, strikeId } = await seriousStrike();
    expect((await codeRequest('khong-co@ghim.test')).statusCode).toBe(200);
    now = day(20);
    expect((await codeRequest(poster.email)).statusCode).toBe(200);
    const code = await lastCode();
    const wrong = await supportAppeal(poster.email, code === '000000' ? '000001' : '000000');
    expect(wrong.statusCode).toBe(401);
    expect(codeOf(wrong)).toBe('UNAUTHORIZED');
    expect(wrong.body).not.toContain('khoá');

    const filed = await supportAppeal(poster.email, code);
    expect(filed.statusCode, filed.body).toBe(201);
    expect(dataOf<{ strikeId: string; appealStatus: string; appealUntil: string }>(filed)).toEqual(
      expect.objectContaining({
        strikeId,
        appealStatus: 'pending',
        appealUntil: day(30).toISOString(),
      }),
    );
    expect((await strikeRow(strikeId)).appeal).toMatchObject({
      channel: 'support',
      status: 'pending',
    });
    await deliverAll(app);
    expect(await strikeTaskOf(strikeId)).toMatchObject({
      status: 'open',
      reasons: ['serious_strike'],
    });

    expect((await codeRequest(poster.email)).statusCode).toBe(200);
    const again = await supportAppeal(poster.email, await lastCode());
    expect(again.statusCode).toBe(409);
    expect(codeOf(again)).toBe('APPEAL_ALREADY_USED');
  });

  it('ngày 31: 409 APPEAL_WINDOW_CLOSED', async () => {
    const { poster } = await seriousStrike();
    now = day(31);
    expect((await codeRequest(poster.email)).statusCode).toBe(200);
    const late = await supportAppeal(poster.email, await lastCode());
    expect(late.statusCode).toBe(409);
    expect(codeOf(late)).toBe('APPEAL_WINDOW_CLOSED');
  });
});

describe('Chỉ master quyết gậy nghiêm trọng', () => {
  it('staff quyết → 403; lựa chọn lạ hay nút khiếu nại → 400 VALIDATION_ERROR; gậy vẫn chờ, tài khoản vẫn khoá', async () => {
    const { poster, strikeId, staff } = await seriousStrike();
    const task = await strikeTaskOf(strikeId);
    const byStaff = await api(app, 'POST', `/ops/review/tasks/${task?.id}/decision`, staff.token, {
      outcome: 'keep',
      serious: { decision: 'cancel' },
    });
    expect(byStaff.statusCode).toBe(403);
    const odd = await decideStrike(app, master, strikeId, {
      outcome: 'keep',
      serious: { decision: 'warn' },
    });
    expect(odd.statusCode).toBe(400);
    expect(codeOf(odd)).toBe('VALIDATION_ERROR');
    const appealButton = await decideStrike(app, master, strikeId, {
      outcome: 'keep',
      appeal: { verdict: 'won' },
    });
    expect(appealButton.statusCode).toBe(400);
    expect(codeOf(appealButton)).toBe('VALIDATION_ERROR');
    expect((await strikeRow(strikeId)).status).toBe('active');
    expect((await account(poster.id))?.status).toBe('locked');
  });

  it('master chính ra gậy: việc ở hàng master dự phòng, không ở hàng master chính; master chính tự quyết → 403', async () => {
    const { strikeId } = await seriousStrike({ by: master });
    const task = await strikeTaskOf(strikeId);
    expect(await opsQueueIds(app, backup)).toContain(task?.id);
    expect(await opsQueueIds(app, master)).not.toContain(task?.id);
    const self = await api(app, 'POST', `/ops/review/tasks/${task?.id}/decision`, master.token, {
      outcome: 'keep',
      serious: { decision: 'cancel' },
    });
    expect(self.statusCode).toBe(403);
    expect(codeOf(self)).toBe('FORBIDDEN');
    expect((await strikeRow(strikeId)).status).toBe('active');
    const byBackup = await decideStrike(app, backup, strikeId, {
      outcome: 'keep',
      serious: { decision: 'downgrade' },
    });
    expect(byBackup.statusCode, byBackup.body).toBe(200);
  });
});

describe('Staff chỉ ghi nhận xét', () => {
  it('staff khác ghi nhận xét → 201, gậy vẫn chờ, tài khoản vẫn khoá, master thấy kèm tên; bỏ trống → 400; không phải staff → 403; người ra gậy → 403', async () => {
    const { poster, strikeId, staff } = await seriousStrike();
    const other = await staffOf(app, [await seedCategory()]);
    const comment = (user: TestUser, body: string) =>
      api(app, 'POST', `/ops/trust/strikes/${strikeId}/comments`, user.token, { body });
    const written = await comment(other, 'Đã từng bị báo hai lần trước');
    expect(written.statusCode, written.body).toBe(201);
    expect((await strikeRow(strikeId)).status).toBe('active');
    expect((await account(poster.id))?.status).toBe('locked');
    expect((await comment(other, '  ')).statusCode).toBe(400);
    expect((await comment(await newUser(app), 'x')).statusCode).toBe(403);
    expect((await comment(staff, 'x')).statusCode).toBe(403);
    const task = await strikeTaskOf(strikeId);
    const detail = await api(app, 'GET', `/ops/review/tasks/${task?.id}`, master.token);
    const otherName = (await account(other.id))?.displayName;
    expect(
      dataOf<{ strike: { comments: { authorId: string; authorName: string; body: string }[] } }>(
        detail,
      ).strike.comments,
    ).toMatchObject([
      { authorId: other.id, authorName: otherName, body: 'Đã từng bị báo hai lần trước' },
    ]);
  });
});

describe('Khoá vĩnh viễn và xem lại mỗi 2 năm', () => {
  it('khoá vĩnh viễn: vẫn khoá, việc rời bảng tồn; sau 2 năm việc xem lại — giữ tiếp thì vẫn khoá thêm 2 năm; gỡ khoá → mở khoá', async () => {
    const { poster, strikeId } = await seriousStrike();
    const permanent = await decideStrike(app, master, strikeId, {
      outcome: 'keep',
      serious: { decision: 'permanent' },
    });
    expect(permanent.statusCode, permanent.body).toBe(200);
    await deliverAll(app);
    expect(await strikeRow(strikeId)).toMatchObject({
      status: 'permanent',
      seriousDecision: 'permanent',
      permanentReviewAt: new Date(TEST_NOW.getTime() + 2 * YEAR_MS),
    });
    expect((await account(poster.id))?.status).toBe('locked');
    expect(await opsQueueIds(app, master)).not.toContain((await strikeTaskOf(strikeId))?.id);

    now = new Date(TEST_NOW.getTime() + 2 * YEAR_MS + DAY_MS);
    expect(await app.modules.trust.permanentReviewsDue()).toBeGreaterThanOrEqual(1);
    await deliverAll(app);
    expect(await strikeTaskOf(strikeId)).toMatchObject({
      status: 'open',
      reasons: ['permanent_review'],
    });
    const reviewer = await signedInAt(app, master, now);
    const kept = await decideStrike(app, reviewer, strikeId, {
      outcome: 'keep',
      permanent: { decision: 'keep' },
    });
    expect(kept.statusCode, kept.body).toBe(200);
    await deliverAll(app);
    expect((await strikeRow(strikeId)).permanentReviewAt).toEqual(
      new Date(now.getTime() + 2 * YEAR_MS),
    );
    expect((await account(poster.id))?.status).toBe('locked');

    const lifted = await api(app, 'POST', `/ops/trust/strikes/${strikeId}/lift`, reviewer.token);
    expect(lifted.statusCode, lifted.body).toBe(200);
    await deliverAll(app);
    expect((await strikeRow(strikeId)).status).toBe('lifted');
    expect((await account(poster.id))?.status).toBe('active');
    // N49, N53, N54 (add-trust-notices): nhận gậy nghiêm trọng, khoá vĩnh viễn, gỡ khoá; giữ tiếp khi xem lại thì không.
    const notices = await prisma.notification.findMany({
      where: { recipientId: poster.id, category: 'trust_strikes' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(notices.map((row) => [row.type, row.body])).toEqual([
      ['trust.strike.issued', 'Tài khoản bị khoá vì một vi phạm nghiêm trọng.'],
      ['trust.strike.decided', 'Tài khoản bị khoá vĩnh viễn.'],
      ['trust.strike.lifted', 'Khoá vĩnh viễn đã được gỡ.'],
    ]);
  });

  it('email của tài khoản khoá vĩnh viễn (đã xoá, hết thời gian giữ) bị chặn đăng ký 403 EMAIL_BANNED tới khi master gỡ khoá', async () => {
    const safety = await staffOf(app, [], ['user_reports']);
    const gone = await realUser();
    await reported(app, await newUser(app), aboutAccount(gone.id), 'prohibited');
    const token = (await login(gone.email)).json().data.accessToken as string;
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleted.statusCode, deleted.body).toBe(204);
    await deliverAll(app);
    const res = await decideOps(app, safety, aboutAccount(gone.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'serious', ruleArticleId: (await anyArticle()).id },
    });
    expect(res.statusCode, res.body).toBe(200);
    const strikeId = dataOf<{ strikeId: string }>(res).strikeId;
    await deliverAll(app);
    const permanent = await decideStrike(app, master, strikeId, {
      outcome: 'keep',
      serious: { decision: 'permanent' },
    });
    expect(permanent.statusCode, permanent.body).toBe(200);
    await deliverAll(app);

    now = day(91);
    const banned = await register(variantOf(gone.email));
    expect(banned.statusCode, banned.body).toBe(403);
    expect(codeOf(banned)).toBe('EMAIL_BANNED');
    expect(
      await repositories.identity.findAccountByEmail(normalizeEmail(variantOf(gone.email))),
    ).toBeNull();

    const lifted = await api(
      app,
      'POST',
      `/ops/trust/strikes/${strikeId}/lift`,
      (await signedInAt(app, master, now)).token,
    );
    expect(lifted.statusCode, lifted.body).toBe(200);
    const free = await register(variantOf(gone.email));
    expect(free.statusCode, free.body).toBe(201);
  });

  it('staff thử gỡ khoá vĩnh viễn → 403; master mở khoá thường → 409 LOCKED_BY_STRIKE', async () => {
    const { poster, strikeId, staff } = await seriousStrike();
    const unlock = await api(app, 'POST', `/ops/accounts/${poster.id}/unlock`, master.token);
    expect(unlock.statusCode).toBe(409);
    expect(codeOf(unlock)).toBe('LOCKED_BY_STRIKE');
    await decideStrike(app, master, strikeId, {
      outcome: 'keep',
      serious: { decision: 'permanent' },
    });
    const byStaff = await api(app, 'POST', `/ops/trust/strikes/${strikeId}/lift`, staff.token);
    expect(byStaff.statusCode).toBe(403);
    expect((await account(poster.id))?.status).toBe('locked');
  });
});

describe('Hạ thành gậy nặng, huỷ gậy', () => {
  it('hạ ở ngày 20: đăng nhập lại được, gậy nặng 2 điểm hết ngày 180 tính từ ngày ra gậy; tin hiện lại, không trả ngày', async () => {
    const { poster, live, another, strikeId } = await seriousStrike();
    const before = (await listingRow(another.id)).expiresAt;
    now = day(20);
    const res = await decideStrike(app, await signedInAt(app, master, now), strikeId, {
      outcome: 'keep',
      serious: { decision: 'downgrade' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await strikeRow(strikeId)).toMatchObject({
      kind: 'severe',
      points: 2,
      status: 'active',
      expiresAt: day(180),
      seriousDecision: 'downgrade',
    });
    expect((await login(poster.email)).statusCode).toBe(200);
    const shown = await getOwn(app, await signedInAt(app, poster, now), live.id);
    expect(shown.hideReasons).not.toContain('account_locked');
    expect((await listingRow(another.id)).expiresAt).toEqual(before);
    expect((await app.modules.trust.standingOf(poster.id)).points).toBe(2);
  });

  it('huỷ sau 8 ngày khoá: mở khoá, gậy đã huỷ còn trong lịch sử, tin hiện lại với đủ ngày còn lại lúc khoá', async () => {
    const { poster, live, another, strikeId } = await seriousStrike();
    const before = (await listingRow(another.id)).expiresAt;
    now = day(8);
    const res = await decideStrike(app, await signedInAt(app, master, now), strikeId, {
      outcome: 'keep',
      serious: { decision: 'cancel' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await strikeRow(strikeId)).toMatchObject({
      status: 'cancelled',
      cancelCause: 'serious_cancel',
      seriousDecision: 'cancel',
    });
    expect((await account(poster.id))?.status).toBe('active');
    const shown = await getOwn(app, await signedInAt(app, poster, now), live.id);
    expect(shown.hideReasons).toEqual([]);
    expect(before).not.toBeNull();
    expect((await listingRow(another.id)).expiresAt).toEqual(
      new Date((before?.getTime() ?? 0) + 8 * DAY_MS),
    );
    expect((await listingRow(another.id)).hideReasons).toEqual([]);
    expect((await app.modules.trust.standingOf(poster.id)).points).toBe(0);
  });
});

describe('Không tự mở khoá khi chờ master', () => {
  it('chờ 10 ngày: vẫn khoá, việc vẫn mở; nhắc master từ sau giờ thứ 72, chưa tới 72 giờ thì chưa nhắc', async () => {
    const { poster, strikeId } = await seriousStrike();
    now = new Date(TEST_NOW.getTime() + 48 * HOUR_MS);
    await app.modules.review.everyMinute();
    await app.modules.review.everyHour();
    expect((await strikeTaskOf(strikeId))?.remindedAt).toBeNull();
    now = new Date(TEST_NOW.getTime() + 73 * HOUR_MS);
    await app.modules.review.everyMinute();
    await app.modules.review.everyHour();
    expect((await strikeTaskOf(strikeId))?.remindedAt).toEqual(now);
    now = day(10);
    await app.modules.review.everyMinute();
    expect((await account(poster.id))?.status).toBe('locked');
    expect(await strikeTaskOf(strikeId)).toMatchObject({ status: 'open', escalatedAt: null });
    expect((await strikeRow(strikeId)).status).toBe('active');
  });
});
