import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createUnit,
  deliverAll,
  newMaster,
  newUser,
  seedTier,
  type TestUser,
} from './group-helpers.js';
import {
  getOwn,
  listingApi,
  liveListingOf,
  patch,
  readyDraft,
  signedInAt,
  submit,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import {
  aboutAccount,
  aboutListing,
  decideOps,
  openTaskOf,
  opsClaim,
  reported,
} from './report-helpers.js';
import {
  amnesty,
  anyArticle,
  codeOf,
  dataOf,
  heldListing,
  staffOf,
  strikesOf,
  struck,
  violation,
} from './strike-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec trust/strikes (ba loại, chỉ từ quyết định vi phạm, điểm tự giảm, tạm khoá đăng tin), review/decisions (vi phạm
 * kèm gậy, xác nhận việc nhóm chuyển lên, báo cáo đúng kèm gậy, nhật ký), listing/deletion và review/task-handling
 * (lịch sử gậy) — qua HTTP với `trust` thật và bên nghe thật. Mọi người đăng dùng chung một mã máy nên staff, master ở
 * đây không đăng tin.
 */
const DAY_MS = 86_400_000;
const PASSWORD = 'ghim-rao-vat-2026!';
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

type Decision = {
  decisionId: string;
  outcome: string;
  listingState: string | null;
  reportVerdict: string | null;
  strikeId: string | null;
};
const decisionRow = (id: string) => prisma.reviewDecision.findUniqueOrThrow({ where: { id } });
const templateId = async () =>
  (await prisma.reviewReasonTemplate.findFirstOrThrow({ where: { active: true } })).id;

async function fixture() {
  const categoryId = await seedCategory();
  const staff = await staffOf(app, [categoryId]);
  const poster = await newUser(app);
  return { categoryId, staff, poster };
}

/** Nhóm có lớp 10A với một điều hành viên và một người đăng; danh mục mặc định để nhóm duyệt tin trong nhóm. */
async function school() {
  const group = await createActiveGroup(app, { master });
  const unitId = await createUnit(app, group, `10A ${randomUUID().slice(0, 4)}`);
  const moderator = await addMember(app, group.groupId, { unitId });
  await appointModerator(app, group, moderator, unitId);
  const poster = await addMember(app, group.groupId, { unitId });
  const categoryId = await seedCategory();
  return { group, unitId, moderator, poster, categoryId };
}
const inGroup = (group: ActiveGroup, categoryId: string) => ({
  placement: 'members_only',
  groupId: group.groupId,
  categoryId,
});
const groupClaim = (user: TestUser, groupId: string, taskId: string) =>
  api(app, 'POST', `/groups/${groupId}/review/tasks/${taskId}/claim`, user.token);
const groupDecide = (user: TestUser, groupId: string, taskId: string, body: object) =>
  api(app, 'POST', `/groups/${groupId}/review/tasks/${taskId}/decision`, user.token, body);
const groupDetach = (user: TestUser, groupId: string, listingId: string, body: object) =>
  api(app, 'POST', `/groups/${groupId}/review/listings/${listingId}/detach`, user.token, body);

describe('Từ chối hoặc gỡ vì vi phạm kèm gậy', () => {
  it('staff từ chối tin máy giữ, gậy thường: tin bị từ chối vì vi phạm; gậy 1 điểm hết ngày 90 ghi tên staff và điều trích', async () => {
    const { categoryId, staff, poster } = await fixture();
    const held = await heldListing(app, poster, { categoryId });
    const article = await anyArticle();
    const res = await decideOps(app, staff, aboutListing(held.id), {
      outcome: 'violation',
      strike: { kind: 'normal', ruleArticleId: article.id },
    });
    expect(res.statusCode, res.body).toBe(200);
    const decision = dataOf<Decision>(res);
    expect(decision).toMatchObject({ outcome: 'reject', listingState: 'rejected' });
    expect(await getOwn(app, poster, held.id)).toMatchObject({
      state: 'rejected',
      fault: 'violation',
    });
    const [strike] = await strikesOf(poster.id);
    expect(strike).toMatchObject({
      id: decision.strikeId,
      kind: 'normal',
      status: 'active',
      points: 1,
      issuedBy: staff.id,
      issuedByRole: 'staff',
      ruleArticleId: article.id,
      ruleText: article.text,
      categoryId,
      fromReport: false,
      listingId: held.id,
      decisionId: decision.decisionId,
      issuedAt: TEST_NOW,
      expiresAt: day(90),
    });
    expect(await decisionRow(decision.decisionId)).toMatchObject({
      outcome: 'reject',
      severity: 'violation',
      issuedStrikeId: strike?.id,
      reasonText: article.text,
    });
  });

  it('thiếu điều trích, hay trích điều không có: 400 VALIDATION_ERROR, tin vẫn chờ duyệt, không gậy', async () => {
    const { categoryId, staff, poster } = await fixture();
    const held = await heldListing(app, poster, { categoryId });
    const missing = await decideOps(app, staff, aboutListing(held.id), { outcome: 'violation' });
    expect(missing.statusCode).toBe(400);
    expect(codeOf(missing)).toBe('VALIDATION_ERROR');
    const unknown = await decideOps(app, staff, aboutListing(held.id), {
      outcome: 'violation',
      strike: { kind: 'normal', ruleArticleId: randomUUID() },
    });
    expect(unknown.statusCode).toBe(400);
    expect(codeOf(unknown)).toBe('VALIDATION_ERROR');
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');
    expect(await strikesOf(poster.id)).toEqual([]);
  });

  it('điều hành viên chọn mức vi phạm với tin trong nhóm: 403 FORBIDDEN, không gậy', async () => {
    const { group, moderator, poster, categoryId } = await school();
    const held = await heldListing(app, poster, inGroup(group, categoryId));
    const task = await openTaskOf(aboutListing(held.id));
    expect((await groupClaim(moderator, group.groupId, task.id)).statusCode).toBe(200);
    const res = await groupDecide(moderator, group.groupId, task.id, await violation('normal'));
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    expect(await strikesOf(poster.id)).toEqual([]);
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');
  });

  it('tin bị gỡ vì vi phạm: sửa → 409 LISTING_UNDER_VIOLATION, xoá → 409 LISTING_DELETE_BLOCKED; tin bị từ chối vì sai sót vẫn xoá được', async () => {
    const { categoryId, staff, poster } = await fixture();
    const live = await liveListingOf(app, poster, { categoryId });
    await reported(app, await newUser(app), aboutListing(live.id), 'fraud');
    const res = await decideOps(app, staff, aboutListing(live.id), {
      ...(await violation('severe')),
      report: { verdict: 'upheld' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<Decision>(res)).toMatchObject({
      outcome: 'remove',
      listingState: 'removed',
      reportVerdict: 'upheld',
    });
    const removed = await getOwn(app, poster, live.id);
    expect(removed.fault).toBe('violation');
    const edited = await patch(app, poster, removed, { title: 'Sửa cho qua' });
    expect(edited.statusCode).toBe(409);
    expect(codeOf(edited)).toBe('LISTING_UNDER_VIOLATION');
    const deleted = await listingApi(app, 'DELETE', `/listings/${live.id}`, poster);
    expect(deleted.statusCode).toBe(409);
    expect(codeOf(deleted)).toBe('LISTING_DELETE_BLOCKED');
    expect((await getOwn(app, poster, live.id)).state).toBe('removed');

    const held = await heldListing(app, poster, { categoryId });
    await decideOps(app, staff, aboutListing(held.id), {
      outcome: 'mistake',
      reasonTemplateId: await templateId(),
    });
    expect((await getOwn(app, poster, held.id)).fault).toBe('mistake');
    expect(
      (await listingApi(app, 'DELETE', `/listings/${held.id}`, poster)).statusCode,
    ).toBeLessThan(300);
  });
});

describe('Xác nhận việc nhóm chuyển lên', () => {
  it('điều hành viên chuyển lên, staff xác nhận kèm gậy nặng: tin bị gỡ vì vi phạm, gậy nặng ghi tên staff; bác thì không gậy', async () => {
    const { group, unitId, moderator, poster, categoryId } = await school();
    const staff = await staffOf(app, [categoryId]);
    const live = await liveListingOf(app, poster, inGroup(group, categoryId));
    await deliverAll(app);
    const escalated = await groupDetach(moderator, group.groupId, live.id, {
      platformViolation: true,
      note: 'Rao bán hàng cấm',
    });
    expect(escalated.statusCode, escalated.body).toBe(200);
    await deliverAll(app);
    expect((await openTaskOf(aboutListing(live.id))).reasons).toEqual(['group_escalation']);
    const confirmed = await decideOps(app, staff, aboutListing(live.id), await violation('severe'));
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect((await getOwn(app, poster, live.id)).fault).toBe('violation');
    expect(await strikesOf(poster.id)).toMatchObject([
      { kind: 'severe', points: 2, issuedBy: staff.id, expiresAt: day(180) },
    ]);

    const other = await addMember(app, group.groupId, { unitId });
    const second = await liveListingOf(app, other, inGroup(group, categoryId));
    await deliverAll(app);
    await groupDetach(moderator, group.groupId, second.id, {
      platformViolation: true,
      note: 'Nghi ngờ',
    });
    await deliverAll(app);
    const dismissed = await decideOps(app, staff, aboutListing(second.id), { outcome: 'dismiss' });
    expect(dismissed.statusCode, dismissed.body).toBe(200);
    expect(await strikesOf(other.id)).toEqual([]);
  });

  it('người chuyển lên cũng là staff danh mục nhận chính việc đó: 403, việc vẫn chờ người khác', async () => {
    const { group, moderator, poster, categoryId } = await school();
    await grantStaff(moderator.id, [], [categoryId]);
    await staffOf(app, [categoryId]);
    const live = await liveListingOf(app, poster, inGroup(group, categoryId));
    await deliverAll(app);
    await groupDetach(moderator, group.groupId, live.id, { platformViolation: true, note: 'x' });
    await deliverAll(app);
    const task = await openTaskOf(aboutListing(live.id));
    const claim = await opsClaim(app, moderator, task.id);
    expect(claim.statusCode).toBe(403);
    expect((await openTaskOf(aboutListing(live.id))).status).toBe('open');
  });
});

describe('Báo cáo đúng kèm gậy', () => {
  it('người đăng tự xoá tin sau khi bị báo cáo; staff xử đúng kèm gậy thường: vẫn nhận gậy, gậy trỏ tới tin', async () => {
    const { categoryId, staff, poster } = await fixture();
    const live = await liveListingOf(app, poster, { categoryId });
    await reported(app, await newUser(app), aboutListing(live.id), 'fraud');
    expect(
      (await listingApi(app, 'DELETE', `/listings/${live.id}`, poster)).statusCode,
    ).toBeLessThan(300);
    await deliverAll(app);
    const res = await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'normal', ruleArticleId: (await anyArticle()).id },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await strikesOf(poster.id)).toMatchObject([{ kind: 'normal', listingId: live.id }]);
  });

  it('báo cáo quấy rối về một người đúng kèm gậy nặng (staff việc an toàn): gậy nặng, không danh mục, từ báo cáo', async () => {
    const safety = await staffOf(app, [], ['user_reports']);
    const person = await newUser(app);
    await reported(app, await newUser(app), aboutAccount(person.id), 'harassment');
    const res = await decideOps(app, safety, aboutAccount(person.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'severe', ruleArticleId: (await anyArticle()).id },
    });
    expect(res.statusCode, res.body).toBe(200);
    const decision = dataOf<Decision>(res);
    expect(await strikesOf(person.id)).toMatchObject([
      {
        id: decision.strikeId,
        kind: 'severe',
        points: 2,
        fromReport: true,
        categoryId: null,
        listingId: null,
        issuedBy: safety.id,
      },
    ]);
    expect(await decisionRow(decision.decisionId)).toMatchObject({
      issuedStrikeId: decision.strikeId,
    });
  });

  it('người bị báo cáo tự xoá tài khoản; trong 90 ngày staff xử đúng kèm gậy nặng: gậy ghi cho tài khoản đã xoá, mang dấu email', async () => {
    const safety = await staffOf(app, [], ['user_reports']);
    const account = await seedAccount({ passwordHash: await hashPassword(PASSWORD) });
    await reported(app, await newUser(app), aboutAccount(account.id), 'harassment');
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: account.email, password: PASSWORD },
    });
    const token = (login.json() as { data: { accessToken: string } }).data.accessToken;
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleted.statusCode, deleted.body).toBe(204);
    await deliverAll(app);
    now = day(30);
    const res = await decideOps(app, await signedInAt(app, safety, now), aboutAccount(account.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'severe', ruleArticleId: (await anyArticle()).id },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await strikesOf(account.id)).toMatchObject([
      { kind: 'severe', emailHashes: [account.emailHash], expiresAt: day(210) },
    ]);
  });

  it('điều hành viên xử báo cáo "sai thông tin" về tin nhóm đúng kèm gậy: 403, không gậy', async () => {
    const { group, moderator, poster, categoryId } = await school();
    const live = await liveListingOf(app, poster, inGroup(group, categoryId));
    await deliverAll(app);
    await reported(
      app,
      await addMember(app, group.groupId),
      aboutListing(live.id),
      'misinformation',
    );
    const task = await openTaskOf(aboutListing(live.id));
    expect((await groupClaim(moderator, group.groupId, task.id)).statusCode).toBe(200);
    const res = await groupDecide(moderator, group.groupId, task.id, {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'normal', ruleArticleId: (await anyArticle()).id },
    });
    expect(res.statusCode).toBe(403);
    expect(await strikesOf(poster.id)).toEqual([]);
  });
});

describe('Nhật ký quyết định vi phạm ghi hậu quả thật', () => {
  it('gỡ tin của người bán T2 kèm gậy thường: nhật ký ghi gậy, điều trích và mức T1 sau quyết định', async () => {
    const { categoryId, staff, poster } = await fixture();
    await seedTier(poster.id, 'T2');
    const live = await liveListingOf(app, poster, { categoryId });
    await reported(app, await newUser(app), aboutListing(live.id), 'fraud');
    const article = await anyArticle();
    const res = await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'violation',
      report: { verdict: 'upheld' },
      strike: { kind: 'normal', ruleArticleId: article.id },
    });
    expect(res.statusCode, res.body).toBe(200);
    const decision = dataOf<Decision>(res);
    expect(await decisionRow(decision.decisionId)).toMatchObject({
      outcome: 'remove',
      severity: 'violation',
      issuedStrikeId: decision.strikeId,
      reasonText: article.text,
      posterTierAfter: 'T1',
    });
  });
});

describe('Gậy chỉ sinh từ quyết định vi phạm của staff hoặc master', () => {
  it('máy giữ, từ chối vì sai sót, nhóm gỡ tin, báo cáo bị bác: không gậy nào, điểm gậy 0', async () => {
    const { categoryId, staff, poster } = await fixture();
    const held = await heldListing(app, poster, { categoryId });
    expect(await strikesOf(poster.id)).toEqual([]);
    await decideOps(app, staff, aboutListing(held.id), {
      outcome: 'mistake',
      reasonTemplateId: await templateId(),
    });

    const live = await liveListingOf(app, poster, { categoryId });
    await reported(app, await newUser(app), aboutListing(live.id), 'fraud');
    const dismissed = await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(dismissed.statusCode, dismissed.body).toBe(200);

    const { group, unitId, moderator, categoryId: groupCategory } = await school();
    const member = await addMember(app, group.groupId, { unitId });
    const inside = await liveListingOf(app, member, inGroup(group, groupCategory));
    await deliverAll(app);
    expect((await groupDetach(moderator, group.groupId, inside.id, {})).statusCode).toBe(200);
    await deliverAll(app);

    expect(await strikesOf(poster.id)).toEqual([]);
    expect(await strikesOf(member.id)).toEqual([]);
    expect((await app.modules.trust.standingOf(poster.id)).points).toBe(0);
  });
});

describe('Điểm gậy và tạm khoá đăng tin', () => {
  it('hai gậy thường ngày 0 và 40: điểm 1, 2, 1, 0 ở ngày 0, 40, 90, 130 — đọc là đúng ngay', async () => {
    const { categoryId, staff, poster } = await fixture();
    await struck(app, { staff, poster, categoryId, kind: 'normal' });
    const pointsAt = async (n: number) => {
      now = day(n);
      const res = await api(app, 'GET', '/me/trust', (await signedInAt(app, poster, now)).token);
      expect(res.statusCode, res.body).toBe(200);
      return dataOf<{ strikePoints: number }>(res).strikePoints;
    };
    expect(await pointsAt(0)).toBe(1);
    now = day(40);
    await struck(app, {
      staff: await signedInAt(app, staff, now),
      poster: await signedInAt(app, poster, now),
      categoryId,
      kind: 'normal',
    });
    expect(await pointsAt(40)).toBe(2);
    expect(await pointsAt(90)).toBe(1);
    expect(await pointsAt(130)).toBe(0);
  });

  it('3 điểm: gửi tin mới → 403 POSTING_LOCKED kèm mốc gửi lại; sửa, đánh dấu đã bán vẫn được; gậy thường hết hạn thì gửi lại được', async () => {
    const { categoryId, staff, poster } = await fixture();
    const live = await liveListingOf(app, poster, { categoryId });
    const another = await liveListingOf(app, poster, { categoryId });
    // Qua trần 3 lượt gửi mỗi giờ: mỗi cụm lượt gửi cách nhau một giờ.
    now = new Date(TEST_NOW.getTime() + 3_600_000);
    await struck(app, { staff, poster, categoryId, kind: 'severe' });
    await struck(app, { staff, poster, categoryId, kind: 'normal' });

    now = new Date(TEST_NOW.getTime() + 2 * 3_600_000);
    const draft = await readyDraft(app, poster, { categoryId });
    const refused = await submit(app, poster, draft);
    expect(refused.statusCode).toBe(403);
    expect(codeOf(refused)).toBe('POSTING_LOCKED');
    expect((refused.json() as { error: { details: { until: string } } }).error.details.until).toBe(
      new Date(day(90).getTime() + 3_600_000).toISOString(),
    );
    expect((await getOwn(app, poster, draft.id)).state).toBe('draft');

    const current = await getOwn(app, poster, live.id);
    const edited = await patch(app, poster, current, { price: 1_500_000 });
    expect(edited.statusCode, edited.body).toBe(200);
    // Sửa giá đưa tin về đang kiểm; đánh dấu đã bán thử trên tin đang hiện còn lại.
    const sold = await listingApi(app, 'POST', `/listings/${another.id}/sold`, poster, {
      version: another.version,
    });
    expect(sold.statusCode, sold.body).toBe(200);

    now = day(91);
    const later = await signedInAt(app, poster, now);
    const accepted = await submit(app, later, await getOwn(app, later, draft.id));
    expect(accepted.statusCode, accepted.body).toBe(200);
  });
});

describe('Lịch sử gậy ở chi tiết việc', () => {
  it('staff nhận việc về tin của người bán: thấy từng gậy với loại, điều trích, ngày hết; gậy ân xá mang dấu đã huỷ, không tính điểm', async () => {
    const { categoryId, staff, poster } = await fixture();
    const first = await struck(app, { staff, poster, categoryId, kind: 'normal' });
    const pardon = await amnesty(app, master, poster.id, {
      strikeIds: [first.strike.id],
      reason: 'Nhầm',
    });
    expect(pardon.statusCode, pardon.body).toBe(200);
    await deliverAll(app);
    const second = await struck(app, { staff, poster, categoryId, kind: 'severe' });

    const held = await heldListing(app, poster, { categoryId });
    const task = await openTaskOf(aboutListing(held.id));
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, staff.token);
    expect(detail.statusCode, detail.body).toBe(200);
    const { seller, strike } = dataOf<{
      seller: {
        strikes: { id: string; kind: string; status: string; inForce: boolean; ruleCode: string }[];
      };
      strike: unknown;
    }>(detail);
    expect(strike).toBeNull();
    expect(seller.strikes).toMatchObject([
      {
        id: second.strike.id,
        kind: 'severe',
        status: 'active',
        inForce: true,
        expiresAt: day(180).toISOString(),
      },
      { id: first.strike.id, kind: 'normal', status: 'cancelled', inForce: false },
    ]);
    expect(seller.strikes.map((row) => row.ruleCode)).toEqual([
      (await anyArticle()).code,
      (await anyArticle()).code,
    ]);
    expect((await app.modules.trust.standingOf(poster.id)).points).toBe(2);
  });
});
