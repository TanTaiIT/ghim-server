import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { interimScreening } from './fakes/listing-ports.fake.js';
import { auditOf, prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { getOwn, signedInAt } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { aboutAccount, decideOps, opsClaim, opsQueueIds, reported } from './report-helpers.js';
import {
  amnesty,
  anyArticle,
  appeal,
  codeOf,
  dataOf,
  decideStrike,
  myStrikes,
  staffOf,
  strikeTaskOf,
  struck,
} from './strike-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec trust/appeals (khiếu nại một lần trong 14 ngày, người xét khác người ra gậy, hạn xét 7 ngày, thắng, thua) và
 * trust/amnesty — qua HTTP với `trust` thật, việc về gậy của `review` thật và bên nghe thật.
 */
const DAY_MS = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
const day = (n: number) => new Date(TEST_NOW.getTime() + n * DAY_MS);

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  await app.modules.trust.ensureRuleArticles();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

type StrikeDto = {
  id: string;
  status: string;
  inForce: boolean;
  appealable: boolean;
  appeal: { status: string } | null;
  expiresAt: string | null;
};
const strikeRow = (id: string) =>
  prisma.strike.findUniqueOrThrow({ where: { id }, include: { appeal: true } });
const points = async (accountId: string) => (await app.modules.trust.standingOf(accountId)).points;

/** Danh mục có hai staff: A ra gậy, B xét khiếu nại. */
async function fixture() {
  const categoryId = await seedCategory();
  const [issuer, reviewer] = await Promise.all([
    staffOf(app, [categoryId]),
    staffOf(app, [categoryId]),
  ]);
  const poster = await newUser(app);
  return { categoryId, issuer, reviewer, poster };
}

describe('Khiếu nại một lần trong 14 ngày', () => {
  it('ngày 10: 201, chờ xét, gậy vẫn tính điểm; lần hai → 409 APPEAL_ALREADY_USED; gậy của người khác → 404', async () => {
    const { categoryId, issuer, poster } = await fixture();
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    now = day(10);
    const later = await signedInAt(app, poster, now);
    const filed = await appeal(app, later, strike.id);
    expect(filed.statusCode, filed.body).toBe(201);
    expect(dataOf<StrikeDto>(filed)).toMatchObject({
      inForce: true,
      appealable: false,
      appeal: { status: 'pending' },
    });
    expect(await points(poster.id)).toBe(1);
    const again = await appeal(app, later, strike.id);
    expect(again.statusCode).toBe(409);
    expect(codeOf(again)).toBe('APPEAL_ALREADY_USED');
    const stranger = await signedInAt(app, await newUser(app), now);
    const notMine = await appeal(app, stranger, strike.id);
    expect(notMine.statusCode).toBe(404);
  });

  it('ngày 15: 409 APPEAL_WINDOW_CLOSED', async () => {
    const { categoryId, issuer, poster } = await fixture();
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    now = day(15);
    const res = await appeal(app, await signedInAt(app, poster, now), strike.id);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('APPEAL_WINDOW_CLOSED');
  });
});

describe('Người xét khác người ra gậy', () => {
  it('danh mục có hai staff: việc vào hàng của staff kia, không của người ra gậy; người ra gậy quyết → 403', async () => {
    const { categoryId, issuer, reviewer, poster } = await fixture();
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const task = await strikeTaskOf(strike.id);
    expect(task).toMatchObject({
      status: 'open',
      reasons: ['appeal'],
      queue: 2,
      categoryId,
      dueAt: day(7),
    });
    expect(await opsQueueIds(app, reviewer)).toContain(task?.id);
    expect(await opsQueueIds(app, issuer)).not.toContain(task?.id);
    const claim = await opsClaim(app, issuer, task?.id ?? '');
    expect(claim.statusCode).toBe(403);
    const decided = await api(app, 'POST', `/ops/review/tasks/${task?.id}/decision`, issuer.token, {
      outcome: 'keep',
      appeal: { verdict: 'won' },
    });
    expect(decided.statusCode).toBe(403);
    expect(codeOf(decided)).toBe('FORBIDDEN');
    expect((await strikeRow(strike.id)).appeal?.status).toBe('pending');
  });

  it('danh mục chỉ có một staff là người ra gậy: khiếu nại vào hàng của master', async () => {
    const categoryId = await seedCategory();
    const issuer = await staffOf(app, [categoryId]);
    const poster = await newUser(app);
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const task = await strikeTaskOf(strike.id);
    const detail = await api(app, 'GET', `/ops/review/tasks/${task?.id}`, master.token);
    expect(detail.statusCode, detail.body).toBe(200);
    expect(dataOf<{ level: string; subjectKind: string; strikeId: string }>(detail)).toMatchObject({
      level: 'master',
      subjectKind: 'strike',
      strikeId: strike.id,
    });
    expect(await opsQueueIds(app, issuer)).not.toContain(task?.id);
  });

  it('gậy từ báo cáo về người: khiếu nại vào hàng của master; gậy do master ra: master tự xét, staff không thấy', async () => {
    const safety = await staffOf(app, [], ['user_reports']);
    const person = await newUser(app);
    await reported(app, await newUser(app), aboutAccount(person.id), 'harassment');
    const fromReport = await decideOps(app, safety, aboutAccount(person.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'normal', ruleArticleId: (await anyArticle()).id },
    });
    const strikeId = dataOf<{ strikeId: string }>(fromReport).strikeId;
    expect((await appeal(app, person, strikeId)).statusCode).toBe(201);
    await deliverAll(app);
    const task = await strikeTaskOf(strikeId);
    expect(task?.categoryId).toBeNull();
    expect(await opsQueueIds(app, safety)).not.toContain(task?.id);
    expect(await opsQueueIds(app, master)).toContain(task?.id);

    const { categoryId, issuer, poster } = await fixture();
    const byMaster = await struck(app, { staff: master, poster, categoryId, kind: 'normal' });
    expect(byMaster.strike).toMatchObject({ issuedByRole: 'master', categoryId: null });
    expect((await appeal(app, poster, byMaster.strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const own = await strikeTaskOf(byMaster.strike.id);
    expect(await opsQueueIds(app, issuer)).not.toContain(own?.id);
    expect(await opsQueueIds(app, master)).toContain(own?.id);
    const decided = await decideStrike(app, master, byMaster.strike.id, {
      outcome: 'keep',
      appeal: { verdict: 'lost' },
    });
    expect(decided.statusCode, decided.body).toBe(200);
  });
});

describe('Khiếu nại thắng, thua', () => {
  it('thắng về tin bị gỡ: gậy đã huỷ còn trong lịch sử, điểm về 0, tin trở lại hiển thị; việc đóng', async () => {
    const { categoryId, issuer, reviewer, poster } = await fixture();
    const { strike, listing } = await struck(app, {
      staff: issuer,
      poster,
      categoryId,
      kind: 'normal',
    });
    expect((await getOwn(app, poster, listing.id)).state).toBe('rejected');
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const detail = await api(
      app,
      'GET',
      `/ops/review/tasks/${(await strikeTaskOf(strike.id))?.id}`,
      reviewer.token,
    );
    expect(
      dataOf<{ strike: { statement: string; accountId: string } }>(detail).strike,
    ).toMatchObject({ accountId: poster.id, statement: 'Tôi không vi phạm điều này' });
    const won = await decideStrike(app, reviewer, strike.id, {
      outcome: 'keep',
      appeal: { verdict: 'won' },
    });
    expect(won.statusCode, won.body).toBe(200);
    expect(dataOf<{ strikeId: string }>(won).strikeId).toBe(strike.id);
    await deliverAll(app);
    expect(await strikeRow(strike.id)).toMatchObject({
      status: 'cancelled',
      cancelCause: 'appeal',
      cancelledBy: reviewer.id,
      appeal: { status: 'won', decidedBy: reviewer.id },
    });
    expect(await points(poster.id)).toBe(0);
    expect(dataOf<StrikeDto[]>(await myStrikes(app, poster))).toMatchObject([
      { id: strike.id, status: 'cancelled', inForce: false },
    ]);
    expect(await getOwn(app, poster, listing.id)).toMatchObject({ state: 'live', fault: null });
    expect((await strikeTaskOf(strike.id))?.status).toBe('decided');
  });

  it('thua: hạn gậy không đổi, tin vẫn bị từ chối, khiếu nại lại → 409 APPEAL_ALREADY_USED', async () => {
    const { categoryId, issuer, reviewer, poster } = await fixture();
    const { strike, listing } = await struck(app, {
      staff: issuer,
      poster,
      categoryId,
      kind: 'normal',
    });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const lost = await decideStrike(app, reviewer, strike.id, {
      outcome: 'keep',
      appeal: { verdict: 'lost' },
    });
    expect(lost.statusCode, lost.body).toBe(200);
    await deliverAll(app);
    expect(await strikeRow(strike.id)).toMatchObject({
      status: 'active',
      expiresAt: day(90),
      appeal: { status: 'lost' },
    });
    expect((await getOwn(app, poster, listing.id)).state).toBe('rejected');
    const again = await appeal(app, poster, strike.id);
    expect(again.statusCode).toBe(409);
    expect(codeOf(again)).toBe('APPEAL_ALREADY_USED');
  });

  it('nút không khớp việc: 400 VALIDATION_ERROR; đổi tin hay kèm báo cáo: 409 OUTCOME_NOT_ALLOWED', async () => {
    const { categoryId, issuer, reviewer, poster } = await fixture();
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const wrongButton = await decideStrike(app, reviewer, strike.id, {
      outcome: 'keep',
      serious: { decision: 'cancel' },
    });
    expect(wrongButton.statusCode).toBe(400);
    expect(codeOf(wrongButton)).toBe('VALIDATION_ERROR');
    const task = await strikeTaskOf(strike.id);
    const notAllowed = await api(
      app,
      'POST',
      `/ops/review/tasks/${task?.id}/decision`,
      reviewer.token,
      { outcome: 'pass', appeal: { verdict: 'won' } },
    );
    expect(notAllowed.statusCode).toBe(409);
    expect(codeOf(notAllowed)).toBe('OUTCOME_NOT_ALLOWED');
    expect((await strikeRow(strike.id)).appeal?.status).toBe('pending');
  });
});

describe('Hạn xét 7 ngày', () => {
  it('gậy thường chờ 7 ngày không ai quyết: tự thắng — gậy huỷ, tin hiện lại, việc đóng vì quá hạn', async () => {
    const { categoryId, issuer, poster } = await fixture();
    const { strike, listing } = await struck(app, {
      staff: issuer,
      poster,
      categoryId,
      kind: 'normal',
    });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    now = new Date(day(7).getTime() + 60_000);
    const result = await app.modules.review.everyMinute();
    // Khiếu nại của các ca trước trong file cũng tới hạn ở lượt này.
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(result.escalated).toBe(0);
    await deliverAll(app);
    expect(await strikeRow(strike.id)).toMatchObject({
      status: 'cancelled',
      cancelCause: 'appeal',
      cancelledBy: null,
      appeal: { status: 'won', decidedBy: null },
    });
    expect(await strikeTaskOf(strike.id)).toMatchObject({
      status: 'cancelled',
      closeCause: 'expired',
    });
    expect((await getOwn(app, await signedInAt(app, poster, now), listing.id)).state).toBe('live');
  });

  it('gậy nặng chờ 7 ngày: chuyển master, gậy vẫn 2 điểm; thêm 10 ngày ở master vẫn không tự thắng', async () => {
    const { categoryId, issuer, poster } = await fixture();
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'severe' });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    now = new Date(day(7).getTime() + 60_000);
    expect(await app.modules.review.everyMinute()).toMatchObject({ escalated: 1, expired: 0 });
    expect(await strikeTaskOf(strike.id)).toMatchObject({ status: 'open', escalatedAt: now });
    expect(await points(poster.id)).toBe(2);
    now = day(17);
    expect(await app.modules.review.everyMinute()).toMatchObject({ escalated: 0, expired: 0 });
    expect(await points(poster.id)).toBe(2);
    expect((await strikeRow(strike.id)).appeal?.status).toBe('pending');
  });
});

describe('Ân xá', () => {
  it('master ân xá hai gậy thường kèm lý do: 200, hai gậy đã huỷ, điểm 0, nhật ký ghi master và lý do cho từng gậy', async () => {
    const { categoryId, issuer, poster } = await fixture();
    const first = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    const second = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    expect(await points(poster.id)).toBe(2);
    const res = await amnesty(app, master, poster.id, {
      strikeIds: [first.strike.id, second.strike.id],
      reason: 'Xét lại thấy chưa tới mức vi phạm',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<StrikeDto[]>(res).map((row) => row.status)).toEqual(['cancelled', 'cancelled']);
    await deliverAll(app);
    expect(await points(poster.id)).toBe(0);
    await Promise.all(
      [first, second].map(async ({ strike }) => {
        expect(await strikeRow(strike.id)).toMatchObject({
          status: 'cancelled',
          cancelCause: 'amnesty',
          cancelledBy: master.id,
        });
        expect(await auditOf(strike.id)).toMatchObject([
          {
            actorId: master.id,
            action: 'trust.strike.amnesty',
            reason: 'Xét lại thấy chưa tới mức vi phạm',
          },
        ]);
      }),
    );
  });

  it('thiếu lý do: 400 VALIDATION_ERROR, gậy còn hiệu lực; staff thử: 403', async () => {
    const { categoryId, issuer, poster } = await fixture();
    const { strike } = await struck(app, { staff: issuer, poster, categoryId, kind: 'normal' });
    const blank = await amnesty(app, master, poster.id, { strikeIds: [strike.id], reason: '' });
    expect(blank.statusCode).toBe(400);
    expect(codeOf(blank)).toBe('VALIDATION_ERROR');
    const byStaff = await amnesty(app, issuer, poster.id, { strikeIds: [strike.id], reason: 'x' });
    expect(byStaff.statusCode).toBe(403);
    expect((await strikeRow(strike.id)).status).toBe('active');
  });

  it('ân xá gậy đi kèm tin bị gỡ và đang có khiếu nại chờ: tin trở lại, khiếu nại đóng, việc rời hàng chờ', async () => {
    const { categoryId, issuer, reviewer, poster } = await fixture();
    const { strike, listing } = await struck(app, {
      staff: issuer,
      poster,
      categoryId,
      kind: 'normal',
    });
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const task = await strikeTaskOf(strike.id);
    expect(await opsQueueIds(app, reviewer)).toContain(task?.id);
    const res = await amnesty(app, master, poster.id, { strikeIds: [strike.id], reason: 'Tha' });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await strikeRow(strike.id)).toMatchObject({
      status: 'cancelled',
      appeal: { status: 'closed' },
    });
    expect(await getOwn(app, poster, listing.id)).toMatchObject({ state: 'live', fault: null });
    expect(await strikeTaskOf(strike.id)).toMatchObject({
      status: 'cancelled',
      closeCause: 'strike_closed',
    });
    expect(await opsQueueIds(app, reviewer)).not.toContain(task?.id);
  });
});
