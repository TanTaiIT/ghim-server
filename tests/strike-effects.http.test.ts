import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { createFakeMailer, type FakeMailer } from '../src/lib/mailer.js';
import { hashEmail, normalizeEmail } from '../src/modules/identity/calc/email.calc.js';
import { hashPassword } from '../src/modules/identity/calc/password.calc.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  getOwn,
  liveListingOf,
  machinePass,
  readyDraft,
  signedInAt,
  submit,
  submitted,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { aboutAccount, aboutListing, decideOps, reported } from './report-helpers.js';
import {
  amnesty,
  anyArticle,
  appeal,
  codeOf,
  dataOf,
  decideStrike,
  heldListing,
  staffOf,
  strikesOf,
  struck,
} from './strike-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Hệ quả của gậy ở các module nghe `trust` (add-strikes): listing/visibility (lý do "gậy", 2 điểm hạn chế mọi tin),
 * trust/trust-tiers (trần T1, tính lại), trust/seller-dashboard, identity/registration + email-change (gậy theo email),
 * identity/account-deletion, identity/device-registry (dấu máy), platform/staff-permissions (treo quyền), group/group-roles
 * (mất vai, thiếu chủ). Máy duyệt giả: hàng "có gậy" và dấu hiệu máy có test thuần ở `decide.calc`, `signals.calc`.
 */
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const PASSWORD = 'ghim-rao-vat-2026!';
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
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
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const trust = () => app.modules.trust;
/** Qua trần 3 lượt gửi mỗi giờ của một người: mỗi lượt gửi thêm cách nhau một giờ. */
const tick = () => {
  now = new Date(now.getTime() + HOUR_MS);
};
/** Gậy tới hạn: job mỗi giờ của `trust` rồi giao sự kiện cho bên nghe. */
async function expireAt(n: number) {
  now = day(n);
  await trust().expireStrikes();
  await deliverAll(app);
}
/** Lý do hạn chế trừ "tài khoản mới" — người đăng ở đây đều T0, lý do đó luôn có và không thuộc ca này. */
const restrictionsOf = async (user: TestUser, id: string) =>
  (await getOwn(app, user, id)).restrictions.filter((reason) => reason !== 'new_account');

async function fixture() {
  const categoryId = await seedCategory();
  const staff = await staffOf(app, [categoryId]);
  const poster = await newUser(app);
  return { categoryId, staff, poster };
}

/** Người có mật khẩu thật và dấu băm email thật — đăng nhập, xoá tài khoản, gậy theo email đều so trên dấu này. */
async function realUser(): Promise<TestUser> {
  const row = await seedAccount({ passwordHash });
  await repositories.identity.updateAccount(row.id, {
    emailHash: hashEmail(normalizeEmail(row.email), env.IDENTITY_HASH_KEY),
  });
  return { id: row.id, email: row.email, token: await tokenFor(app, row.id) };
}
const login = (email: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASSWORD } });
const deleteMe = async (user: TestUser) =>
  app.inject({
    method: 'DELETE',
    url: '/api/v1/me',
    headers: {
      authorization: `Bearer ${(await login(user.email)).json().data.accessToken as string}`,
    },
  });
const register = (email: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: PASSWORD, displayName: 'Người thử' },
  });
const variantOf = (email: string) => {
  const [local, domain] = email.split('@');
  return `${(local ?? '').toUpperCase()}+moi@${domain}`;
};
async function lastCode(): Promise<string> {
  await jobs.runAll();
  const code = /\d{6}/.exec(mailer.sent.at(-1)?.subject ?? '')?.[0];
  if (!code) throw new Error('Thư cuối không có mã 6 chữ số');
  return code;
}

describe('Lý do hạn chế "gậy" trên tin (spec listing/visibility)', () => {
  it('gậy đầu tiên: tin cũ vẫn đầy đủ, tin mới (máy cho qua hay người cho đạt) hạn chế với lý do "gậy"; điểm về 0 thì gỡ', async () => {
    const { categoryId, staff, poster } = await fixture();
    const old = await liveListingOf(app, poster, { categoryId });
    tick();
    const { strike } = await struck(app, { staff, poster, categoryId, kind: 'normal' });
    expect(await restrictionsOf(poster, old.id)).toEqual([]);
    tick();
    const fresh = await machinePass(app, poster, await submitted(app, poster, { categoryId }));
    expect(await restrictionsOf(poster, fresh.id)).toEqual(['strike']);
    tick();
    const held = await heldListing(app, poster, { categoryId });
    const passed = await decideOps(app, staff, aboutListing(held.id), {
      outcome: 'pass',
      machineJudgment: 'machine_overreach',
    });
    expect(passed.statusCode, passed.body).toBe(200);
    expect(await restrictionsOf(poster, held.id)).toEqual(['strike']);

    await expireAt(91);
    expect((await trust().standingOf(poster.id)).points).toBe(0);
    const later = await signedInAt(app, poster, now);
    expect(await restrictionsOf(later, fresh.id)).toEqual([]);
    expect(await restrictionsOf(later, held.id)).toEqual([]);
    expect((await prisma.strike.findUniqueOrThrow({ where: { id: strike.id } })).status).toBe(
      'expired',
    );
  });

  it('tin mang cả "gậy" lẫn "máy": điểm về 0 thì vẫn hạn chế vì "máy"; gậy bị huỷ vì khiếu nại thắng thì gỡ "gậy" ngay', async () => {
    const { categoryId, staff, poster } = await fixture();
    const { strike } = await struck(app, { staff, poster, categoryId, kind: 'normal' });
    tick();
    const limited = await machinePass(
      app,
      poster,
      await submitted(app, poster, { categoryId }),
      true,
    );
    expect(await restrictionsOf(poster, limited.id)).toEqual(['machine', 'strike']);
    expect((await appeal(app, poster, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const other = await staffOf(app, [categoryId]);
    const won = await decideStrike(app, other, strike.id, {
      outcome: 'keep',
      appeal: { verdict: 'won' },
    });
    expect(won.statusCode, won.body).toBe(200);
    await deliverAll(app);
    expect(await restrictionsOf(poster, limited.id)).toEqual(['machine']);
  });

  it('điểm chạm 2: mọi tin đang hiển thị hạn chế; về dưới 2 thì trở lại; tin đăng lúc đang 2 điểm giữ "gậy" tới khi về 0; một gậy nặng hạn chế ngay', async () => {
    const { categoryId, staff, poster } = await fixture();
    const first = await liveListingOf(app, poster, { categoryId });
    tick();
    await struck(app, { staff, poster, categoryId, kind: 'normal' });
    expect(await restrictionsOf(poster, first.id)).toEqual([]);
    now = day(40);
    const at40 = await signedInAt(app, poster, now);
    const staffAt40 = await signedInAt(app, staff, now);
    await struck(app, { staff: staffAt40, poster: at40, categoryId, kind: 'normal' });
    expect(await restrictionsOf(at40, first.id)).toEqual(['strike_wave']);
    tick();
    const during = await machinePass(app, at40, await submitted(app, at40, { categoryId }));
    expect(await restrictionsOf(at40, during.id)).toEqual(['strike']);

    await expireAt(91);
    const at90 = await signedInAt(app, poster, now);
    expect((await trust().standingOf(poster.id)).points).toBe(1);
    expect(await restrictionsOf(at90, first.id)).toEqual([]);
    expect(await restrictionsOf(at90, during.id)).toEqual(['strike']);
    await expireAt(131);
    expect(await restrictionsOf(await signedInAt(app, poster, now), during.id)).toEqual([]);

    const seller = await newUser(app);
    now = TEST_NOW;
    const live = await liveListingOf(app, seller, { categoryId });
    tick();
    await struck(app, { staff, poster: seller, categoryId, kind: 'severe' });
    expect(await restrictionsOf(seller, live.id)).toEqual(['strike_wave']);
  });
});

/** Đủ điều kiện T2 ở ngày 31: tài khoản tạo ngày 1, 5 tin sạch rải ba tin một tuần. */
async function eligibleT2(user: TestUser) {
  await Promise.all(
    [2, 3, 4, 9, 10].map((n) =>
      repositories.trust.addClean({
        listingId: randomUUID(),
        accountId: user.id,
        via: 'shown',
        at: day(n),
      }),
    ),
  );
  now = day(31);
  await trust().recompute(user.id);
  expect(await trust().tierOf(user.id)).toBe('T2');
}

describe('Mức tin cậy (spec trust/trust-tiers)', () => {
  it('người T2 nhận gậy thường: về T1 ngay; ân xá: tính lại T2 ngay', async () => {
    const { categoryId, staff, poster } = await fixture();
    await eligibleT2(poster);
    const { strike } = await struck(app, {
      staff: await signedInAt(app, staff, now),
      poster: await signedInAt(app, poster, now),
      categoryId,
      kind: 'normal',
    });
    expect(await trust().tierOf(poster.id)).toBe('T1');
    expect(
      (
        await amnesty(app, await signedInAt(app, master, now), poster.id, {
          strikeIds: [strike.id],
          reason: 'x',
        })
      ).statusCode,
    ).toBe(200);
    await deliverAll(app);
    expect(await trust().tierOf(poster.id)).toBe('T2');
  });

  it('gậy cuối cùng hết hạn: tính lại về T2 trong ngày hết hạn; người T0 có gậy vẫn T0', async () => {
    const { categoryId, staff, poster } = await fixture();
    await eligibleT2(poster);
    await struck(app, {
      staff: await signedInAt(app, staff, now),
      poster: await signedInAt(app, poster, now),
      categoryId,
      kind: 'normal',
    });
    expect(await trust().tierOf(poster.id)).toBe('T1');
    await expireAt(121);
    expect(await trust().tierOf(poster.id)).toBe('T2');

    const newcomer = await newUser(app);
    now = TEST_NOW;
    await struck(app, { staff, poster: newcomer, categoryId, kind: 'normal' });
    expect(await trust().tierOf(newcomer.id)).toBe('T0');
  });
});

describe('Bảng uy tín (spec trust/seller-dashboard)', () => {
  it('chưa gậy: danh sách rỗng, 0 điểm; gậy nặng + gậy thường đọc ngày 10: hai gậy kèm điều trích, ngày hết, số ngày còn, 3 điểm, khoá tới ngày gậy thường hết', async () => {
    const { categoryId, staff, poster } = await fixture();
    type Dashboard = {
      strikes: { kind: string; ruleText: string; expiresAt: string; remainingDays: number }[];
      strikePoints: number;
      postingLockedUntil: string | null;
    };
    const dashboard = async (user: TestUser) =>
      dataOf<Dashboard>(await api(app, 'GET', '/me/trust', user.token));
    expect(await dashboard(poster)).toMatchObject({
      strikes: [],
      strikePoints: 0,
      postingLockedUntil: null,
    });
    await struck(app, { staff, poster, categoryId, kind: 'severe' });
    tick();
    await struck(app, { staff, poster, categoryId, kind: 'normal' });
    now = day(10);
    const article = await anyArticle();
    expect(await dashboard(await signedInAt(app, poster, now))).toMatchObject({
      strikes: [
        {
          kind: 'normal',
          ruleText: article.text,
          expiresAt: new Date(day(90).getTime() + HOUR_MS).toISOString(),
          remainingDays: 81,
        },
        { kind: 'severe', expiresAt: day(180).toISOString(), remainingDays: 170 },
      ],
      strikePoints: 3,
      postingLockedUntil: new Date(day(90).getTime() + HOUR_MS).toISOString(),
    });
  });
});

describe('Gậy đi theo email (spec identity/registration, email-change)', () => {
  it('tài khoản xoá rồi bị gậy nặng trong 90 ngày ẩn: đăng ký lại bằng biến thể email sau khi hết giữ → kế thừa gậy đúng hạn', async () => {
    const safety = await staffOf(app, [], ['user_reports']);
    const gone = await realUser();
    await reported(app, await newUser(app), aboutAccount(gone.id), 'harassment');
    expect((await deleteMe(gone)).statusCode).toBe(204);
    await deliverAll(app);
    now = day(30);
    const res = await decideOps(app, await signedInAt(app, safety, now), aboutAccount(gone.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'severe', ruleArticleId: (await anyArticle()).id },
    });
    expect(res.statusCode, res.body).toBe(200);
    now = day(91);
    const registered = await register(variantOf(gone.email));
    expect(registered.statusCode, registered.body).toBe(201);
    await deliverAll(app);
    const fresh = await repositories.identity.findAccountByEmail(
      normalizeEmail(variantOf(gone.email)),
    );
    expect(fresh).not.toBeNull();
    expect(fresh?.id).not.toBe(gone.id);
    expect(await strikesOf(fresh?.id ?? '')).toMatchObject([
      {
        kind: 'severe',
        points: 2,
        status: 'active',
        expiresAt: day(210),
        inheritedFromId: expect.any(String),
      },
    ]);
  });

  it('gậy đã hết hạn trước khi đăng ký lại: tài khoản mới không có gậy', async () => {
    const safety = await staffOf(app, [], ['user_reports']);
    const gone = await realUser();
    await reported(app, await newUser(app), aboutAccount(gone.id), 'harassment');
    expect((await deleteMe(gone)).statusCode).toBe(204);
    await deliverAll(app);
    now = day(1);
    await decideOps(app, await signedInAt(app, safety, now), aboutAccount(gone.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'normal', ruleArticleId: (await anyArticle()).id },
    });
    now = day(92);
    expect((await register(variantOf(gone.email))).statusCode).toBe(201);
    await deliverAll(app);
    const fresh = await repositories.identity.findAccountByEmail(
      normalizeEmail(variantOf(gone.email)),
    );
    expect(await strikesOf(fresh?.id ?? '')).toEqual([]);
  });

  it('người có gậy đổi email: vẫn mang gậy; lập tài khoản bằng email cũ kế thừa gậy đúng hạn', async () => {
    const { categoryId, staff } = await fixture();
    const poster = await realUser();
    const { strike } = await struck(app, { staff, poster, categoryId, kind: 'normal' });
    const oldEmail = poster.email;
    const newEmail = `doi-${randomUUID().slice(0, 8)}@ghim.test`;
    const asked = await api(app, 'POST', '/me/email-change', poster.token, {
      email: newEmail,
      currentPassword: PASSWORD,
    });
    expect(asked.statusCode, asked.body).toBe(200);
    const confirmed = await api(app, 'POST', '/me/email-change/confirm', poster.token, {
      code: await lastCode(),
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    await deliverAll(app);
    const kept = await prisma.strike.findUniqueOrThrow({ where: { id: strike.id } });
    expect(kept).toMatchObject({ status: 'active', points: 1, expiresAt: day(90) });
    expect(kept.emailHashes).toHaveLength(2);
    expect((await trust().standingOf(poster.id)).points).toBe(1);

    expect((await register(oldEmail)).statusCode).toBe(201);
    await deliverAll(app);
    const fresh = await repositories.identity.findAccountByEmail(normalizeEmail(oldEmail));
    expect(await strikesOf(fresh?.id ?? '')).toMatchObject([
      { kind: 'normal', expiresAt: day(90), inheritedFromId: strike.id },
    ]);
  });
});

describe('Tự xoá tài khoản (spec identity/account-deletion)', () => {
  it('gậy nặng: 409 ACCOUNT_DELETE_BLOCKED "đang có gậy nặng"; chỉ gậy thường: xoá được; gậy nặng đã hết hạn: xoá được', async () => {
    const { categoryId, staff } = await fixture();
    const severe = await realUser();
    await struck(app, { staff, poster: severe, categoryId, kind: 'severe' });
    const blocked = await deleteMe(severe);
    expect(blocked.statusCode).toBe(409);
    expect(codeOf(blocked)).toBe('ACCOUNT_DELETE_BLOCKED');
    expect(blocked.body).toContain('gậy nặng');

    const normal = await realUser();
    await struck(app, { staff, poster: normal, categoryId, kind: 'normal' });
    expect((await deleteMe(normal)).statusCode).toBe(204);

    await expireAt(181);
    expect((await deleteMe(severe)).statusCode).toBe(204);
  });
});

const flagsOf = async (accountId: string) =>
  (await repositories.identity.findOpenFlags(accountId)).map((flag) => ({
    kind: flag.kind,
    relatedAccountId: flag.relatedAccountId,
    relatedStrikeId: flag.relatedStrikeId,
  }));
/** Gửi một tin từ máy `device` — bên nghe của `identity` ghi lượt đăng. */
async function postFrom(user: TestUser, categoryId: string, device: string) {
  const res = await submit(app, user, await readyDraft(app, user, { categoryId }), device);
  expect(res.statusCode, res.body).toBe(200);
  await deliverAll(app);
}

describe('Dấu thiết bị (spec identity/device-registry)', () => {
  it('B đăng tin lần đầu trên máy sau khi A nhận gậy: đánh dấu kèm gậy; người nhà đã đăng từ trước thì không; gậy hết hạn thì đóng', async () => {
    const { categoryId, staff } = await fixture();
    const device = `may-${randomUUID().slice(0, 8)}`;
    const a = await newUser(app);
    const home = await newUser(app);
    await postFrom(a, categoryId, device);
    await postFrom(home, categoryId, device);
    tick();
    const { strike } = await struck(app, { staff, poster: a, categoryId, kind: 'normal' });
    tick();
    const b = await newUser(app);
    await postFrom(b, categoryId, device);
    expect(await flagsOf(b.id)).toEqual([
      { kind: 'device_of_struck_account', relatedAccountId: a.id, relatedStrikeId: strike.id },
    ]);
    tick();
    await postFrom(home, categoryId, device);
    expect(await flagsOf(home.id)).toEqual([]);

    await expireAt(91);
    expect(await flagsOf(b.id)).toEqual([]);
    expect(
      (await prisma.accountFlag.findFirst({ where: { accountId: b.id } }))?.clearedReason,
    ).toContain('hết hiệu lực');
  });
});

describe('Quyền staff (spec platform/staff-permissions)', () => {
  it('staff nhận gậy thường: treo ngay (403 STAFF_PERMISSION_SUSPENDED), vẫn gửi tin như người dùng; gậy hết hạn không tự trả; master trả lại', async () => {
    const own = await seedCategory();
    const other = await seedCategory();
    const suspended = await staffOf(app, [own]);
    const issuer = await staffOf(app, [other]);
    const queue = (user: TestUser) => api(app, 'GET', '/ops/review/tasks', user.token);
    expect((await queue(suspended)).statusCode).toBe(200);
    await struck(app, { staff: issuer, poster: suspended, categoryId: other, kind: 'normal' });
    const refused = await queue(suspended);
    expect(refused.statusCode).toBe(403);
    expect(codeOf(refused)).toBe('STAFF_PERMISSION_SUSPENDED');
    tick();
    expect((await submitted(app, suspended, { categoryId: other })).state).toBe('checking');

    await expireAt(91);
    const later = await signedInAt(app, suspended, now);
    expect(codeOf(await queue(later))).toBe('STAFF_PERMISSION_SUSPENDED');
    const restored = await api(
      app,
      'POST',
      `/ops/staff/${suspended.id}/restore`,
      (await signedInAt(app, master, now)).token,
    );
    expect(restored.statusCode, restored.body).toBe(200);
    expect((await queue(later)).statusCode).toBe(200);
  });

  it('gậy bị huỷ (ân xá) mà không còn gậy nào: quyền tự trở lại', async () => {
    const own = await seedCategory();
    const other = await seedCategory();
    const suspended = await staffOf(app, [own]);
    const issuer = await staffOf(app, [other]);
    const { strike } = await struck(app, {
      staff: issuer,
      poster: suspended,
      categoryId: other,
      kind: 'normal',
    });
    expect((await api(app, 'GET', '/ops/review/tasks', suspended.token)).statusCode).toBe(403);
    await amnesty(app, master, suspended.id, { strikeIds: [strike.id], reason: 'Nhầm' });
    await deliverAll(app);
    expect((await api(app, 'GET', '/ops/review/tasks', suspended.token)).statusCode).toBe(200);
  });
});

const pendingRequest = async (groupId: string) => {
  const applicant = await signedInAt(app, await newUser(app), now);
  const applied = await api(app, 'POST', `/groups/${groupId}/join`, applicant.token, {});
  expect(applied.statusCode, applied.body).toBe(201);
  return (applied.json() as { data: { request: { id: string } } }).data.request.id;
};
const decideRequest = (user: TestUser, requestId: string) =>
  api(app, 'POST', `/group-join-requests/${requestId}/decision`, user.token, { approve: true });
const requestStatus = async (id: string) =>
  (await prisma.groupJoinRequest.findUniqueOrThrow({ where: { id } })).status;

const groupState = async (groupId: string) =>
  (await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).state;
describe('Vai trong nhóm (spec group/group-roles)', () => {
  it('điều hành viên nhận gậy nặng: duyệt đơn → 403 GROUP_ROLE_SUSPENDED, đơn vẫn chờ; gậy thường thì duyệt được; gậy nặng hết hạn / bị huỷ thì làm lại được', async () => {
    const { categoryId, staff } = await fixture();
    const group = await createActiveGroup(app, { mode: 'public_review', master });
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    const { strike } = await struck(app, { staff, poster: moderator, categoryId, kind: 'severe' });
    const first = await pendingRequest(group.groupId);
    const refused = await decideRequest(moderator, first);
    expect(refused.statusCode).toBe(403);
    expect(codeOf(refused)).toBe('GROUP_ROLE_SUSPENDED');
    expect(await requestStatus(first)).toBe('pending');

    expect((await appeal(app, moderator, strike.id)).statusCode).toBe(201);
    await deliverAll(app);
    const reviewer = await staffOf(app, [categoryId]);
    await decideStrike(app, reviewer, strike.id, { outcome: 'keep', appeal: { verdict: 'won' } });
    await deliverAll(app);
    const afterWin = await decideRequest(moderator, first);
    expect(afterWin.statusCode, afterWin.body).toBe(200);
    expect(await requestStatus(first)).toBe('approved');

    tick();
    await struck(app, { staff, poster: moderator, categoryId, kind: 'normal' });
    const second = await pendingRequest(group.groupId);
    expect((await decideRequest(moderator, second)).statusCode).toBe(200);

    tick();
    await struck(app, { staff, poster: moderator, categoryId, kind: 'severe' });
    const third = await pendingRequest(group.groupId);
    expect(codeOf(await decideRequest(moderator, third))).toBe('GROUP_ROLE_SUSPENDED');
    await expireAt(181);
    const later = await signedInAt(app, moderator, now);
    // Đơn cũ đã quá hạn chờ sau 181 ngày; đơn mới chứng minh vai đã trở lại.
    const fourth = await pendingRequest(group.groupId);
    const back = await decideRequest(later, fourth);
    expect(back.statusCode, back.body).toBe(200);
  });

  it('chủ nhóm nhận gậy nặng: nhóm thiếu chủ, đổi cài đặt → 403 GROUP_ROLE_SUSPENDED; gậy thường thì nhóm vẫn hoạt động', async () => {
    const { categoryId, staff } = await fixture();
    const settings = (group: { groupId: string; owner: TestUser }) =>
      api(app, 'PATCH', `/groups/${group.groupId}/settings`, group.owner.token, {
        description: 'Đổi thử',
      });

    const mild = await createActiveGroup(app, { master });
    await struck(app, { staff, poster: mild.owner, categoryId, kind: 'normal' });
    expect(await groupState(mild.groupId)).toBe('active');
    expect((await settings(mild)).statusCode).toBe(200);

    // Còn điều hành viên dùng được thì thiếu chủ kèm đề cử; không thì nhóm tạm khoá — như khi chủ bị khoá.
    const harsh = await createActiveGroup(app, { master });
    await appointModerator(app, harsh, await addMember(app, harsh.groupId));
    await struck(app, { staff, poster: harsh.owner, categoryId, kind: 'severe' });
    expect(await groupState(harsh.groupId)).toBe('ownerless');
    const refused = await settings(harsh);
    expect(refused.statusCode).toBe(403);
    expect(codeOf(refused)).toBe('GROUP_ROLE_SUSPENDED');
  });
});
