import type { TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
import { seedCategory } from './listing-helpers.js';
import {
  getOwn,
  listingApi,
  machinePass,
  readyDraft,
  signedInAt,
  submit,
} from './listing-http-helpers.js';
import {
  codesOf,
  DAY_MS,
  deviceOf,
  LATER,
  markChecked,
  MILLION,
  pastHolds,
  priceStats,
  runOf,
  screened,
  tierPort,
} from './screening-helpers.js';
import { buildTestApp } from './test-app.js';

/*
 * Spec screening/machine-decision và screening/risk-scoring qua lượt gửi thật: route gửi → chấm chữ → mở lượt → kết luận
 * → outbox → `listing` áp kết quả. Ma trận và từng dấu hiệu đã có unit test (`decide.calc`, `signals.calc`); ở đây kiểm
 * dữ kiện thật tới đúng phép tính và kết quả về đúng tin.
 */
const MINUTE_MS = 60_000;
const ZALO = 'Máy còn tốt, liên hệ Zalo 0912 345 678';
const GIBBERISH = 'xjkq wpzt hhhhh lkjh qwer';

let now = LATER;
let app: FastifyInstance;
let master: TestUser;
const tiers = new Map<string, TrustTier>();

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, trust: tierPort(tiers) });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
});

beforeEach(() => {
  now = LATER;
});

afterAll(() => app.close());

const userAt = async (tier: TrustTier): Promise<TestUser> => {
  const user = await newUser(app);
  tiers.set(user.id, tier);
  return user;
};

/** Danh mục có thống kê giá đủ mẫu — "giá bất thường" xét được. */
const pricedCategory = async (settings: Parameters<typeof seedCategory>[0] = {}) => {
  const categoryId = await seedCategory(settings);
  await priceStats(categoryId);
  return categoryId;
};

/** Tin gửi xong còn một ảnh chưa có kết quả — đứng ở "đang kiểm". */
const waiting = async () => {
  const user = await userAt('T2');
  const draft = await readyDraft(app, user, {}, 2);
  await markChecked([draft.images[0]?.id ?? ''], user.id);
  await submit(app, user, draft, deviceOf(user));
  await deliverAll(app);
  return { user, draft };
};

describe('Máy chỉ có ba kết quả', () => {
  it('T2 tin sạch: hiện đầy đủ, không qua người', async () => {
    const { listing, run } = await screened(app, await userAt('T2'));
    expect(run).toMatchObject({
      outcome: 'pass_full',
      cause: 'score',
      score: 0,
      band: 'low',
      tier: 'T2',
    });
    expect(listing).toMatchObject({ state: 'live', restrictions: [] });
  });

  it('T2 điểm 75: giữ cho người — tin chờ duyệt, không bị từ chối hay về nháp', async () => {
    const { listing, run } = await screened(app, await userAt('T2'), {
      categoryId: await pricedCategory(),
      title: 'iPhone 15',
      description: `${GIBBERISH} Zalo 0912345678`,
      price: 2 * MILLION,
    });
    expect(codesOf(run)).toEqual(['abnormal_price', 'gibberish', 'off_platform_contact']);
    expect(run).toMatchObject({ outcome: 'hold', cause: 'score', score: 75, band: 'high' });
    expect(listing.state).toBe('pending');
  });

  it('tin chứa cụm từ cấm mức chắc: giữ cho người, không về nháp', async () => {
    const { activePhrase } = await import('./screening-helpers.js');
    await activePhrase(app, master, 'bán súng hơi');
    const { listing, run } = await screened(app, await userAt('T2'), { title: 'Bán súng hơi cũ' });
    expect(run).toMatchObject({ outcome: 'hold', cause: 'gate' });
    expect(codesOf(run)).toEqual(['certain_phrase']);
    expect(listing.state).toBe('pending');
  });
});

describe('Kết quả ghi căn cứ và phiên bản', () => {
  it('T1 giá bất thường + liên hệ ngoài sàn: ghi cả hai luật, điểm 45, dải Vừa, mức T1', async () => {
    const { run } = await screened(app, await userAt('T1'), {
      categoryId: await pricedCategory(),
      description: ZALO,
      price: 45 * MILLION,
    });
    expect(codesOf(run)).toEqual(['abnormal_price', 'off_platform_contact']);
    expect(run).toMatchObject({ score: 45, band: 'medium', tier: 'T1' });
  });

  it('master phát hành bảng con số mới: kết quả cũ giữ phiên bản cũ, lượt kế tiếp mang phiên bản mới', async () => {
    await app.modules.platform.ensureConfigVersion();
    const before = (await screened(app, await userAt('T2'))).run;
    const actor = {
      accountId: master.id,
      role: 'master' as const,
      sessionId: 's',
      emailVerified: true,
    };
    const { version } = await app.modules.platform.changeConfig(actor, {
      baseVersion: before.configVersion,
      changes: { 'screening.newAccountDays': 4 },
    });
    const after = (await screened(app, await userAt('T2'))).run;
    expect(after.configVersion).toBe(version);
    expect((await runOf(before.listingId)).configVersion).toBe(before.configVersion);
    expect(before.configVersion).toBeLessThan(version);
  });
});

describe('Lỗi khi chấm thì giữ cho người', () => {
  it('chấm chữ lỗi (đọc cài đặt danh mục hỏng): tin vẫn được nhận và giữ cho người', async () => {
    const { id: createdBy } = await newUser(app);
    const broken = await prisma.category.create({
      data: { name: `Hỏng ${now.getTime()}`, createdBy },
    });
    const user = await userAt('T2');
    const draft = await readyDraft(app, user, { categoryId: broken.id });
    await markChecked(
      draft.images.map((image) => image.id),
      user.id,
    );
    const res = await submit(app, user, draft, deviceOf(user));
    expect(res.statusCode).toBe(200);
    await deliverAll(app);
    expect(await runOf(draft.id)).toMatchObject({ outcome: 'hold', cause: 'error' });
    expect((await getOwn(app, user, draft.id)).state).toBe('pending');
  });

  it('chữ không trúng gì nhưng kiểm một ảnh báo lỗi: giữ cho người', async () => {
    const user = await userAt('T2');
    const draft = await readyDraft(app, user, {}, 2);
    const [first, second] = draft.images;
    await markChecked([first?.id ?? ''], user.id);
    await prisma.imageCheck.create({
      data: {
        imageId: second?.id ?? '',
        ownerAccountId: user.id,
        status: 'error',
        errorKind: 'permanent',
      },
    });
    await submit(app, user, draft, deviceOf(user));
    await deliverAll(app);
    expect(await runOf(draft.id)).toMatchObject({ outcome: 'hold', cause: 'error' });
  });
});

describe('Đang kiểm quá 5 phút', () => {
  it('còn ảnh chưa có kết quả sau 5 phút: lưới an toàn giữ; kết quả ảnh về muộn không tự đưa tin lên', async () => {
    const { user, draft } = await waiting();
    now = new Date(LATER.getTime() + 6 * MINUTE_MS);
    expect((await app.modules.screening.safetyNet()).timedOut).toBeGreaterThanOrEqual(1);
    await deliverAll(app);
    expect(await runOf(draft.id)).toMatchObject({ outcome: 'hold', cause: 'timeout' });
    expect((await getOwn(app, user, draft.id)).state).toBe('pending');

    await app.modules.screening.checkImage(draft.images[1]?.id ?? '');
    await deliverAll(app);
    expect((await getOwn(app, user, draft.id)).state).toBe('pending');
  });

  it('lượt rà lúc tin mới đang kiểm được 2 phút: tin vẫn đang kiểm', async () => {
    const { user, draft } = await waiting();
    now = new Date(LATER.getTime() + 2 * MINUTE_MS);
    await app.modules.screening.safetyNet();
    await deliverAll(app);
    expect((await getOwn(app, user, draft.id)).state).toBe('checking');
  });

  it('tin đang hiện đầy đủ thiếu kết quả ảnh: hạn chế "máy"; tin đủ kết quả giữ nguyên', async () => {
    const complete = await screened(app, await userAt('T2'));
    const owner = await userAt('T2');
    const draft = await readyDraft(app, owner);
    await submit(app, owner, draft, deviceOf(owner));
    const unchecked = await machinePass(app, owner, { id: draft.id, version: draft.version + 1 });
    expect(unchecked).toMatchObject({ state: 'live', restrictions: [] });

    await app.modules.screening.safetyNet();
    await deliverAll(app);
    expect((await getOwn(app, owner, draft.id)).restrictions).toEqual(['machine']);
    expect(
      await prisma.listing.findUniqueOrThrow({ where: { id: complete.listing.id } }),
    ).toMatchObject({ restrictions: [] });
  });
});

describe('Ma trận dải × mức tin cậy qua lượt gửi thật', () => {
  it('T0 sàn chung điểm 0: hiện hạn chế vì "tài khoản mới", không mang lý do "máy"', async () => {
    const { listing, run } = await screened(app, await userAt('T0'));
    expect(run).toMatchObject({ outcome: 'pass_limited', score: 0 });
    expect(listing.restrictions).toEqual(['new_account']);
  });

  it('T0 "chỉ thành viên" điểm 0: hiện đầy đủ', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    tiers.set(member.id, 'T0');
    const { listing, run } = await screened(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect(run.outcome).toBe('pass_full');
    expect(listing).toMatchObject({ state: 'live', restrictions: [] });
  });

  it('tài khoản T0 2 ngày tuổi ghi số Zalo: 30 điểm, dải Vừa, giữ cho người', async () => {
    const user = await userAt('T0');
    await prisma.account.update({
      where: { id: user.id },
      data: { createdAt: new Date(now.getTime() - 2 * DAY_MS) },
    });
    const { listing, run } = await screened(app, user, { description: ZALO });
    expect(codesOf(run)).toEqual(['new_account', 'off_platform_contact']);
    expect(run).toMatchObject({ outcome: 'hold', score: 30, band: 'medium' });
    expect(listing.state).toBe('pending');
  });

  it('T1 điểm 45: hiện hạn chế kèm lý do "máy"', async () => {
    const { listing, run } = await screened(app, await userAt('T1'), {
      categoryId: await pricedCategory(),
      description: ZALO,
      price: 45 * MILLION,
    });
    expect(run).toMatchObject({ outcome: 'pass_limited', score: 45 });
    expect(listing).toMatchObject({ state: 'live', restrictions: ['machine'] });
  });

  it('T2 điểm 45: hiện đầy đủ, không mang lý do "máy"', async () => {
    const { listing, run } = await screened(app, await userAt('T2'), {
      categoryId: await pricedCategory(),
      description: ZALO,
      price: 45 * MILLION,
    });
    expect(run).toMatchObject({ outcome: 'pass_full', score: 45 });
    expect(listing.restrictions).toEqual([]);
  });

  it('T3 điểm 60 (gõ bừa + cho tặng ở danh mục giá trị cao): giữ cho người', async () => {
    const { run } = await screened(app, await userAt('T3'), {
      categoryId: await seedCategory({ referencePrice: 8_000_000n }),
      title: 'Cho tặng',
      description: GIBBERISH,
      price: 0,
    });
    expect(codesOf(run)).toEqual(['gibberish', 'zero_price_high_value']);
    expect(run).toMatchObject({ outcome: 'hold', score: 60, band: 'high' });
  });

  it('T1 vào danh mục rủi ro cao ghi số Zalo: 40, dải Vừa, hạn chế "máy"; rủi ro vừa không cộng', async () => {
    const { listing, run } = await screened(app, await userAt('T1'), {
      categoryId: await seedCategory({ riskLevel: 'high' }),
      description: ZALO,
    });
    expect(codesOf(run)).toEqual(['high_risk_category', 'off_platform_contact']);
    expect(run).toMatchObject({ outcome: 'pass_limited', score: 40, band: 'medium' });
    expect(listing.restrictions).toEqual(['machine']);
    const medium = await screened(app, await userAt('T2'), {
      categoryId: await seedCategory({ riskLevel: 'medium' }),
    });
    expect(medium.run.score).toBe(0);
  });
});

describe('Dấu hiệu theo dữ kiện của chính người đăng', () => {
  it('đăng lại tin vừa xoá 10 ngày: trùng tin của mình, lên bảng ở vị trí tin cũ; tin xoá 40 ngày thì không', async () => {
    const user = await userAt('T2');
    const fields = {
      title: 'Bàn học gỗ thông',
      description: 'Bàn học gỗ thông, ngang 1m2, còn mới',
    };
    const old = (await screened(app, user, fields)).listing;
    expect((await listingApi(app, 'DELETE', `/listings/${old.id}`, user)).statusCode).toBe(204);

    now = new Date(LATER.getTime() + 10 * DAY_MS);
    const again = await screened(app, user, fields);
    expect(codesOf(again.run)).toEqual(['own_duplicate']);
    expect(again.run.rankAsListingId).toBe(old.id);
    expect(again.listing.firstLiveAt).toBe(old.firstLiveAt);
    // Vị trí xếp hạng kế thừa như mốc lên bảng (prepare-promotions): không đứng trên tin lên bảng sau tin cũ.
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: again.listing.id } })).rankAt,
    ).toEqual(new Date(old.firstLiveAt ?? 0));

    const other = await userAt('T2');
    const gone = (await screened(app, other, fields)).listing;
    await listingApi(app, 'DELETE', `/listings/${gone.id}`, other);
    now = new Date(LATER.getTime() + 50 * DAY_MS);
    const later = await signedInAt(app, other, now);
    expect(codesOf((await screened(app, later, fields)).run)).toEqual([]);
  });

  it('T1: lượt gửi thứ 11 trong 24 giờ trúng "đăng dồn", lượt thứ 10 thì không', async () => {
    const pastSubmissions = async (user: TestUser, count: number) => {
      const listing = (await screened(app, user, { title: 'Nồi cơm điện 1,8 lít' })).listing;
      await prisma.listingSubmission.createMany({
        data: Array.from({ length: count - 1 }, (_, index) => ({
          listingId: listing.id,
          accountId: user.id,
          kind: 'resubmit' as const,
          fromVersion: 100 + index,
          at: new Date(now.getTime() - MINUTE_MS),
        })),
      });
    };
    const busy = await userAt('T1');
    await pastSubmissions(busy, 10);
    expect(codesOf((await screened(app, busy)).run)).toEqual(['burst']);
    const steady = await userAt('T1');
    await pastSubmissions(steady, 9);
    expect(codesOf((await screened(app, steady)).run)).toEqual([]);
  });

  it('bị máy giữ 3 lần trong 7 ngày vì điểm hay cổng: "bị giữ nhiều"; 3 lần vì luôn duyệt tay thì không', async () => {
    const yesterday = new Date(now.getTime() - DAY_MS);
    const held = await userAt('T2');
    await pastHolds(held.id, ['score', 'gate', 'score'], yesterday);
    expect(codesOf((await screened(app, held)).run)).toEqual(['held_many']);
    const manual = await userAt('T2');
    await pastHolds(manual.id, ['always_manual', 'always_manual', 'always_manual'], yesterday);
    expect(codesOf((await screened(app, manual)).run)).toEqual([]);
  });

  it('người nhà đã đăng tin trên máy trước khi tài khoản cùng máy bị khoá: 30 điểm, chấm theo ma trận', async () => {
    const device = `may-chung-${now.getTime()}`;
    const [family, locked] = [await userAt('T2'), await userAt('T2')];
    await screened(app, family, { title: 'Quạt đứng ba cánh' }, { device });
    await screened(app, locked, { title: 'Bếp ga đôi' }, { device });
    const lock = await api(app, 'POST', `/ops/accounts/${locked.id}/lock`, master.token, {
      reason: 'Lừa đảo',
    });
    expect(lock.statusCode).toBe(204);
    await deliverAll(app);
    const { run } = await screened(app, family, {}, { device });
    expect(codesOf(run)).toEqual(['shared_device_locked']);
    expect(run).toMatchObject({ outcome: 'pass_full', cause: 'score', score: 30 });
  });
});

describe('Sai danh mục (từ khoá do master nuôi)', () => {
  it('tin bán điện thoại trong Quần áo: sai danh mục; suy ra danh mục rủi ro cao thì cộng thêm', async () => {
    const phones = await seedCategory({ riskLevel: 'high' });
    const clothes = await seedCategory();
    const keywords = await api(
      app,
      'PUT',
      `/ops/screening/categories/${phones}/keywords`,
      master.token,
      {
        keywords: ['điện thoại', 'iPhone', 'Samsung Galaxy'],
      },
    );
    expect(keywords.statusCode).toBe(200);
    const { run } = await screened(app, await userAt('T2'), {
      categoryId: clothes,
      title: 'Bán điện thoại iPhone 13 cũ',
    });
    expect(codesOf(run)).toEqual(['high_risk_category', 'wrong_category']);
    expect(run).toMatchObject({ score: 35, band: 'medium', outcome: 'pass_full' });
  });

  it('suy ra danh mục bật luôn duyệt tay: giữ cho người như mọi tin của danh mục đó', async () => {
    const pets = await seedCategory({ alwaysManual: true });
    await api(app, 'PUT', `/ops/screening/categories/${pets}/keywords`, master.token, {
      keywords: ['thú cưng', 'chó', 'mèo'],
    });
    const { run } = await screened(app, await userAt('T2'), {
      categoryId: await seedCategory(),
      title: 'Bán chó mèo con',
    });
    expect(codesOf(run)).toEqual(['wrong_category']);
    expect(run).toMatchObject({ outcome: 'hold', cause: 'always_manual' });
  });
});
