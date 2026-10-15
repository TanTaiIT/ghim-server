import type { TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { getOwn, listingApi } from './listing-http-helpers.js';
import { tokenFor } from './ops-helpers.js';
import {
  activePhrase,
  DAY_MS,
  LATER,
  MILLION,
  priceStats,
  resubmitted,
  screened,
  tierPort,
  uniqueHash,
} from './screening-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/*
 * Spec screening/explanations và delta trust/seller-dashboard qua route người đăng thấy (`GET /listings/:id`,
 * `GET /me/trust`) và route tra mã của hỗ trợ. Phép chọn câu đã có unit test (`explanation.calc`).
 */
const HOUR_MS = 3_600_000;
const PLAIN = 'Tin đang chờ người duyệt, thường trong 24 giờ';
const FRAUD = 'Tin cần kiểm tra an toàn thêm';
const ZALO = 'Liên hệ Zalo 0912 345 678';
/** Không câu nào cho người đăng được nhắc tới tín hiệu gian lận, cụm, ảnh hay thiết bị (TK 13). */
const LEAKS = /burst|đăng dồn|lượt gửi|phrase|cụm|ảnh|image|thiết bị|device|máy|thuốc súng/i;

let now = LATER;
let app: FastifyInstance;
let master: TestUser;
let support: TestUser;
let capped: string;
const tiers = new Map<string, TrustTier>();
let seq = 0;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, trust: tierPort(tiers) });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
  support = await newUser(app);
  await grantStaff(support.id, ['support']);
  capped = await seedCategory({ priceCap: 60_000_000n });
  await activePhrase(app, master, 'bán thuốc súng');
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

type Notice = {
  kind: string;
  message: string;
  estimatedWait: string | null;
  lookupCode: string | null;
  fixes: { code: string; message: string }[];
};

/** Câu người đăng thấy trên tin của chính mình. */
const noticeOf = async (user: TestUser, listingId: string): Promise<Notice | null> =>
  (await listingApi(app, 'GET', `/listings/${listingId}`, user)).json().data
    .machineNotice as Notice | null;

const heldNotice = async (tier: TrustTier, fields: Record<string, unknown>, options = {}) => {
  const user = await userAt(tier);
  const { listing } = await screened(app, user, fields, options);
  return { user, listing, notice: await noticeOf(user, listing.id) };
};

const crowdedDevice = async (): Promise<string> => {
  const device = `may-chung-${(seq += 1)}`;
  await sequentially(['Áo khoác', 'Giày chạy', 'Mũ bảo hiểm'], async (title) => {
    await screened(app, await userAt('T2'), { title }, { device });
  });
  return device;
};

describe('Tin bị giữ không vì gian lận: câu chờ, lỗi tự sửa được thì nói cách sửa', () => {
  it('dải Cao từ giá bất thường, gõ bừa, liên hệ ngoài sàn: câu chờ, hai lỗi tự sửa được kèm cách sửa', async () => {
    const categoryId = await seedCategory();
    await priceStats(categoryId);
    const { notice } = await heldNotice('T2', {
      categoryId,
      title: 'iPhone 15',
      description: `xjkq wpzt hhhhh lkjh qwer ${ZALO}`,
      price: 2 * MILLION,
    });
    expect(notice).toMatchObject({ kind: 'plain', message: PLAIN, lookupCode: null });
    expect(notice?.fixes.map((fix) => fix.code)).toEqual([
      'abnormal_price',
      'off_platform_contact',
    ]);
    expect(notice?.fixes[0]?.message).toContain('Kiểm tra lại đơn vị (đồng) và số 0');
  });

  it('chỉ vì danh mục luôn duyệt tay: câu chờ; T0 tài khoản mới ghi Zalo: nhắc thêm số vào hồ sơ', async () => {
    const manual = await heldNotice('T2', {
      categoryId: await seedCategory({ alwaysManual: true }),
    });
    expect(manual.notice).toMatchObject({ kind: 'plain', message: PLAIN, fixes: [] });

    const user = await userAt('T0');
    await prisma.account.update({
      where: { id: user.id },
      data: { createdAt: new Date(now.getTime() - DAY_MS) },
    });
    const { listing } = await screened(app, user, { description: ZALO });
    expect((await noticeOf(user, listing.id))?.fixes).toEqual([
      { code: 'off_platform_contact', message: expect.stringContaining('hồ sơ') },
    ]);
  });

  it('giá vượt trần và sai danh mục: câu cách sửa riêng; gõ bừa + tài khoản mới + cho tặng giá trị cao: chỉ câu chờ', async () => {
    const over = await heldNotice('T2', { categoryId: capped, price: 65 * MILLION });
    expect(over.notice?.fixes[0]?.message).toContain('mức tối đa');

    const user = await userAt('T2');
    await prisma.account.update({ where: { id: user.id }, data: { createdAt: now } });
    const { listing } = await screened(app, user, {
      categoryId: await seedCategory({ referencePrice: 8_000_000n }),
      title: 'Cho tặng',
      description: 'xjkq wpzt hhhhh lkjh qwer',
      price: 0,
    });
    expect(await noticeOf(user, listing.id)).toEqual({
      kind: 'plain',
      message: PLAIN,
      estimatedWait: 'Thường trong 24 giờ',
      lookupCode: null,
      fixes: [],
    });
  });
});

describe('Dấu hiệu gian lận: câu chung ba phần, không nêu tín hiệu', () => {
  it('chỉ cụm từ cấm mức chắc: câu chung, thời gian chờ, mã tra cứu — không cụm, không luật', async () => {
    const { notice } = await heldNotice('T2', { title: 'Bán thuốc súng' });
    expect(notice).toMatchObject({
      kind: 'fraud',
      message: FRAUD,
      estimatedWait: 'Thường trong 24 giờ',
      fixes: [],
    });
    expect(notice?.lookupCode).toMatch(/^S[0-9A-Z]{8}$/);
    expect(JSON.stringify(notice)).not.toMatch(LEAKS);
  });

  it('đăng dồn, ảnh trùng, tài khoản thứ tư trên máy, dùng máy của tài khoản bị khoá: không nhắc tín hiệu nào', async () => {
    const busy = await userAt('T0');
    await prisma.account.update({ where: { id: busy.id }, data: { createdAt: now } });
    const first = (await screened(app, busy, { title: 'Nồi chiên' })).listing;
    await prisma.listingSubmission.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        listingId: first.id,
        accountId: busy.id,
        kind: 'resubmit' as const,
        fromVersion: 100 + index,
        at: now,
      })),
    });
    const burst = (await screened(app, busy, { title: 'Máy xay sinh tố' })).listing;

    const hash = uniqueHash();
    await screened(app, await userAt('T2'), {}, { hashOf: () => hash });
    const copied = await heldNotice('T2', {}, { hashOf: () => hash });

    const crowded = await heldNotice('T2', { title: 'Ba lô' }, { device: await crowdedDevice() });

    const notices = [await noticeOf(busy, burst.id), copied.notice, crowded.notice];
    for (const notice of notices) {
      expect(notice).toMatchObject({ kind: 'fraud', message: FRAUD });
      expect(JSON.stringify(notice)).not.toMatch(LEAKS);
    }
  });

  it('hai tín hiệu khác nhau: cùng một câu, chỉ khác mã tra cứu', async () => {
    const phrase = (await heldNotice('T2', { title: 'Bán thuốc súng hoa cải' })).notice;
    const device = (await heldNotice('T2', { title: 'Đèn pin' }, { device: await crowdedDevice() }))
      .notice;
    expect({ ...phrase, lookupCode: null }).toEqual({ ...device, lookupCode: null });
    expect(phrase?.lookupCode).not.toBe(device?.lookupCode);
  });

  it('cụm từ cấm + giá bất thường: câu về giá cùng câu chung, không nêu cụm; mỗi lần giữ một mã riêng', async () => {
    const categoryId = await seedCategory();
    await priceStats(categoryId);
    const held = await heldNotice('T2', {
      categoryId,
      title: 'Bán thuốc súng',
      price: 90 * MILLION,
    });
    expect(held.notice).toMatchObject({ kind: 'fraud', message: FRAUD });
    expect(held.notice?.fixes.map((fix) => fix.code)).toEqual(['abnormal_price']);

    const again = await resubmitted(app, held.user, held.listing, { price: 89 * MILLION });
    const second = await noticeOf(held.user, again.listing.id);
    expect(second?.lookupCode).toMatch(/^S/);
    expect(second?.lookupCode).not.toBe(held.notice?.lookupCode);
  });
});

describe('Hiện hạn chế', () => {
  it('T1 dải Vừa có lỗi tự sửa được: câu nêu lỗi đó; T0 nơi công khai không lỗi tự sửa được: không câu nào', async () => {
    const categoryId = await seedCategory();
    await priceStats(categoryId);
    const limited = await heldNotice('T1', { categoryId, description: ZALO, price: 45 * MILLION });
    expect(limited.listing.state).toBe('live');
    expect(limited.notice).toMatchObject({
      kind: 'limited',
      lookupCode: null,
      estimatedWait: null,
    });
    expect(limited.notice?.fixes.map((fix) => fix.code)).toEqual([
      'abnormal_price',
      'off_platform_contact',
    ]);
    expect((await heldNotice('T0', {})).notice).toBeNull();
  });
});

describe('Hỗ trợ nhập mã tra cứu thì thấy lý do cụ thể', () => {
  it('staff có việc hỗ trợ tra mã của tin bị giữ vì "nhiều tài khoản trên một máy": 200, lý do, mã đánh dấu, không dấu thiết bị; gỡ đánh dấu thì lượt sau chấm như thường', async () => {
    const device = await crowdedDevice();
    const held = await heldNotice('T2', { title: 'Đồng hồ treo tường' }, { device });
    const res = await api(
      app,
      'GET',
      `/ops/screening/lookups/${held.notice?.lookupCode ?? ''}`,
      support.token,
    );
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({ outcome: 'hold', cause: 'device', listingId: held.listing.id });
    expect(data.deviceFlags).toEqual([
      {
        kind: 'many_accounts_on_device',
        label: 'Nhiều tài khoản trên một máy',
        flagLookupCode: expect.any(String),
      },
    ]);
    expect(res.body).not.toContain(device);
    const hashes = await prisma.devicePost.findMany({ select: { deviceHash: true } });
    for (const { deviceHash } of hashes) expect(res.body).not.toContain(deviceHash);

    now = new Date(LATER.getTime() + HOUR_MS);
    const cleared = await api(
      app,
      'POST',
      `/ops/flags/${data.deviceFlags[0].flagLookupCode as string}/clear`,
      support.token,
      { reason: 'Máy mua lại' },
    );
    expect(cleared.statusCode).toBe(204);
    await deliverAll(app);
    const next = await screened(app, held.user, { title: 'Quạt bàn' }, { device });
    expect(next.run).toMatchObject({ outcome: 'pass_full', cause: 'score' });
  });

  it('tra mã của tin giữ vì cụm: nêu luật và cụm đã trúng', async () => {
    const held = await heldNotice('T2', { title: 'Bán thuốc súng cũ' });
    const res = await api(
      app,
      'GET',
      `/ops/screening/lookups/${(held.notice?.lookupCode ?? '').toLowerCase()}`,
      support.token,
    );
    expect(res.json().data.hits).toEqual([
      expect.objectContaining({
        code: 'certain_phrase',
        label: 'Cụm từ cấm mức chắc',
        phrases: [expect.objectContaining({ text: 'bán thuốc súng' })],
      }),
    ]);
  });

  it('staff chỉ được giao danh mục: 403; người đăng tự tra mã của mình: 403; mã không tồn tại: 404', async () => {
    const held = await heldNotice('T2', { title: 'Bán thuốc súng hơi' });
    const code = held.notice?.lookupCode ?? '';
    const categoryStaff = await newUser(app);
    await grantStaff(categoryStaff.id, [], [capped]);
    const byCategory = await api(app, 'GET', `/ops/screening/lookups/${code}`, categoryStaff.token);
    expect([byCategory.statusCode, byCategory.json().error.code]).toEqual([403, 'FORBIDDEN']);
    expect(byCategory.body).not.toMatch(/thuốc súng|certain_phrase/);
    const byOwner = await api(app, 'GET', `/ops/screening/lookups/${code}`, held.user.token);
    expect(byOwner.statusCode).toBe(403);
    const missing = await api(app, 'GET', '/ops/screening/lookups/SZZZZZZZZ', support.token);
    expect([missing.statusCode, missing.json().error.code]).toEqual([404, 'NOT_FOUND']);
  });
});

describe('Bảng uy tín', () => {
  it('tin chờ duyệt vì dấu hiệu gian lận: câu chung kèm mã; thời gian chờ hiện mốc gửi lại, không nêu cổng, hết thì thôi', async () => {
    const user = await userAt('T2');
    const held = (await screened(app, user, { title: 'Bán thuốc súng săn' })).listing;
    const board = async () => (await api(app, 'GET', '/me/trust', user.token)).json().data;
    const first = await board();
    expect(first.pending).toEqual([
      expect.objectContaining({
        id: held.id,
        reason: FRAUD,
        lookupCode: expect.stringMatching(/^S/),
      }),
    ]);
    expect(first.cooldownUntil).toBeNull();

    await sequentially([1, 2], async (index) => {
      await screened(app, user, {
        categoryId: capped,
        price: 65 * MILLION,
        title: `Tủ đông ${index}`,
      });
    });
    const cooling = await board();
    expect(cooling.cooldownUntil).toBe(new Date(now.getTime() + 24 * HOUR_MS).toISOString());
    expect(JSON.stringify(cooling)).not.toMatch(/trần|cổng|price_over_cap|certain_phrase/);

    now = new Date(LATER.getTime() + 25 * HOUR_MS);
    const later = await api(app, 'GET', '/me/trust', await tokenFor(app, user.id, {}, now));
    expect(later.json().data.cooldownUntil).toBeNull();
    expect(await getOwn(app, user, held.id)).toMatchObject({ state: 'pending' });
  });
});
