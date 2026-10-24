import { randomBytes } from 'node:crypto';

import type { TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import sharp, { type Sharp } from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { sequentially } from '../src/common/utils/sequential.js';
import type { QualityCode } from '../src/modules/screening/screening.rules.js';
import { prisma } from './db-helpers.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import {
  createDraft,
  getOwn,
  type OwnListing,
  patch,
  someRegion,
  submit,
} from './listing-http-helpers.js';
import {
  deviceOf,
  LATER,
  resubmitted,
  runOf,
  screened,
  tierPort,
  uploadBytes,
} from './screening-helpers.js';
import { buildTestApp } from './test-app.js';

/*
 * Delta của add-image-quality-checks — screening/image-checks, hard-gates ("Ba tin ảnh mờ"), explanations — trên kho thật
 * và `sharp` thật: ảnh dựng theo `seed` nên không ảnh nào trùng ảnh của tài khoản khác. Luật bật bằng bàn vận hành, trả
 * về chạy thử sau mỗi ca: các file cùng worker dùng chung DB.
 */
let app: FastifyInstance;
let jobs: FakeJobs;
let master: TestUser;
const tiers = new Map<string, TrustTier>();
let seq = 0;

const QUALITY_RULES: readonly QualityCode[] = [
  'image_too_small',
  'image_blurry',
  'image_too_dark',
  'image_too_bright',
];
const WAIT = 'Tin đang chờ người duyệt, thường trong 24 giờ';

beforeAll(async () => {
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => LATER, trust: tierPort(tiers), jobs });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
});

afterEach(async () => {
  await sequentially(QUALITY_RULES, async (code) => {
    await setRule(code, { mode: 'trial', weight: 0 });
  });
});

afterAll(() => app.close());

const setRule = async (code: QualityCode, body: { mode?: string; weight?: number }) => {
  const res = await api(app, 'PATCH', `/ops/screening/rules/${code}`, master.token, body);
  expect(res.statusCode, res.body).toBe(200);
};
const turnOn = (...codes: QualityCode[]) =>
  sequentially(codes, async (code) => {
    await setRule(code, { mode: 'on' });
  });

// ── ẢNH ──────────────────────────────────────────────────────────────────────────────────────────

type Upload = { bytes: Uint8Array; type: 'image/png' };

const randomOf = (seed: number) => {
  let state = (seed * 2_654_435_761) >>> 0;
  return () => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state >>> 24;
  };
};
const pngFrom = async (image: Sharp): Promise<Upload> => ({
  bytes: new Uint8Array(await image.png().toBuffer()),
  type: 'image/png',
});
/** Nhiễu xám trong [low, high], độ sáng quanh giữa khoảng; `blur` > 0 thì làm mờ (độ nét về gần 0). */
const noisy = (low: number, high: number, width = 512, height = 512, blur = 0): Promise<Upload> => {
  const next = randomOf((seq += 1));
  const data = Buffer.from(
    Array.from({ length: width * height }, () => low + (next() % (high - low + 1))),
  );
  const image = sharp(data, { raw: { width, height, channels: 1 } });
  return pngFrom(blur > 0 ? image.blur(blur) : image);
};
const BLUR_SIGMA = 4;
const sharpMid = () => noisy(60, 200);
const blurry = () => noisy(60, 200, 512, 512, BLUR_SIGMA);
const dark = () => noisy(0, 15, 512, 512, BLUR_SIGMA);
const bright = () => noisy(230, 255);
const undecodable = (): Upload => ({ bytes: new Uint8Array(randomBytes(4096)), type: 'image/png' });

// ── GỬI TIN ──────────────────────────────────────────────────────────────────────────────────────

const userAt = async (tier: TrustTier): Promise<TestUser> => {
  const user = await newUser(app);
  tiers.set(user.id, tier);
  return user;
};

/** Nháp với ảnh thật đã tải, gửi rồi giao sự kiện — việc kiểm ảnh đã xếp, chưa chạy. */
async function sentWith(user: TestUser, uploads: Upload[], category?: string) {
  const draft = await createDraft(app, user);
  // Lần lượt: thứ tự ảnh trong tin là thứ tự câu báo nói "ảnh thứ mấy".
  const imageIds: string[] = [];
  await sequentially(uploads, async ({ bytes, type }) => {
    imageIds.push(await uploadBytes(app, user, draft.id, bytes, type));
  });
  const ready = await patch(app, user, draft, {
    title: `Đồ dùng chất lượng ${(seq += 1)}`,
    price: 500_000,
    categoryId: category ?? (await seedCategory()),
    placement: 'marketplace',
    ...(await someRegion(app)),
    imageIds,
  });
  if (ready.statusCode !== 200) throw new Error(`Lưu nháp hỏng: ${ready.body}`);
  const sent = await submit(app, user, ready.json().data as OwnListing, deviceOf(user));
  if (sent.statusCode !== 200) throw new Error(`Gửi hỏng: ${sent.body}`);
  await deliverAll(app);
  return { listingId: draft.id, imageIds };
}

/** Như `sentWith`, rồi chạy việc kiểm ảnh và giao kết quả — trả tin như người đăng thấy. */
async function submittedWith(
  user: TestUser,
  uploads: Upload[],
  category?: string,
): Promise<OwnListing> {
  const { listingId } = await sentWith(user, uploads, category);
  await jobs.runAll();
  await deliverAll(app);
  return getOwn(app, user, listingId);
}

const hitsOf = async (listingId: string) =>
  ((await runOf(listingId)).hits as { code: string; mode: string }[]).map(
    (hit) => `${hit.code}:${hit.mode}`,
  );

// ── SCREENING/IMAGE-CHECKS ───────────────────────────────────────────────────────────────────────

describe('Ảnh hỏng giữ cho người kèm cách sửa', () => {
  it('ảnh thứ hai không giải mã được: giữ cho người, câu nói ảnh thứ hai không mở được', async () => {
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await sharpMid(), undecodable(), await sharpMid()]);
    expect(await runOf(listing.id)).toMatchObject({ outcome: 'hold', cause: 'image_quality' });
    expect(listing.machineNotice).toMatchObject({
      message: WAIT,
      fixes: [
        {
          code: 'image_unreadable',
          message: 'Ảnh 2 không mở được. Xoá ảnh đó rồi tải ảnh khác.',
        },
      ],
    });
  });

  it('kho không trả lời mọi lượt đọc: giữ vì lỗi của máy, câu chờ chung, không câu nào nói ảnh hỏng', async () => {
    const user = await userAt('T2');
    const { listingId, imageIds } = await sentWith(user, [await sharpMid()]);
    jobs.sent.length = 0;
    const media = app.modules.media;
    const read = media.readImage;
    media.readImage = () => Promise.reject(new Error('Kho không trả lời'));
    try {
      await sequentially([1, 2, 3], async () => {
        await app.modules.screening.checkImage(imageIds[0] ?? '').catch(() => {});
      });
    } finally {
      media.readImage = read;
    }
    await deliverAll(app);
    expect(await runOf(listingId)).toMatchObject({ outcome: 'hold', cause: 'error' });
    expect((await getOwn(app, user, listingId)).machineNotice).toMatchObject({
      message: WAIT,
      fixes: [],
    });
  });
});

describe('Đo chất lượng từng ảnh', () => {
  it('ảnh 512×512 được kiểm: kết quả ghi rộng, cao, độ nét, độ sáng', async () => {
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await sharpMid()]);
    const check = await prisma.imageCheck.findUniqueOrThrow({
      where: { imageId: listing.images[0]?.id ?? '' },
    });
    expect(check).toMatchObject({ status: 'done', width: 512, height: 512 });
    expect(check.sharpness).toBeGreaterThan(50);
    expect(check.brightness).toBeGreaterThan(100);
    expect(check.brightness).toBeLessThan(160);
  });
});

describe('Luật chất lượng ảnh bật thì giữ cho người', () => {
  it('"ảnh quá nhỏ" bật, ngưỡng 480: T3 gửi ảnh 640×360 không trúng gì khác → giữ cho người', async () => {
    await turnOn('image_too_small');
    const user = await userAt('T3');
    const listing = await submittedWith(user, [await noisy(60, 200, 640, 360)]);
    expect(await runOf(listing.id)).toMatchObject({ outcome: 'hold', cause: 'image_quality' });
  });

  it('"ảnh mờ" chạy thử: T2 gửi ảnh mờ → hiện đầy đủ, ghi lượt trúng chạy thử', async () => {
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await blurry()]);
    expect(await runOf(listing.id)).toMatchObject({ outcome: 'pass_full' });
    expect(await hitsOf(listing.id)).toContain('image_blurry:trial');
  });

  it('master tắt "ảnh quá tối" (tắt được, khác cổng cứng): ảnh quá tối không trúng, kết quả không ghi luật này', async () => {
    await setRule('image_too_dark', { mode: 'off' });
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await dark()]);
    expect((await hitsOf(listing.id)).some((hit) => hit.startsWith('image_too_dark'))).toBe(false);
  });

  it('mọi luật chất lượng bật, mọi ảnh đạt ngưỡng: không giữ vì chất lượng ảnh', async () => {
    await turnOn(...QUALITY_RULES);
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await sharpMid(), await sharpMid()]);
    expect(await runOf(listing.id)).toMatchObject({ outcome: 'pass_full' });
  });

  it('"ảnh quá sáng" bật kèm trọng số 50: tin bị giữ nhưng điểm rủi ro vẫn 0', async () => {
    await setRule('image_too_bright', { mode: 'on', weight: 50 });
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await bright()]);
    expect(await runOf(listing.id)).toMatchObject({
      outcome: 'hold',
      cause: 'image_quality',
      score: 0,
    });
  });
});

describe('Ngưỡng chất lượng ảnh trong bảng con số', () => {
  it('ngưỡng hạ từ 480 xuống 320 rồi gửi lại tin có ảnh 640×360 đã kiểm: không trúng "ảnh quá nhỏ"', async () => {
    await turnOn('image_too_small');
    const user = await userAt('T3');
    const listing = await submittedWith(user, [await noisy(60, 200, 640, 360)]);
    expect(await runOf(listing.id)).toMatchObject({ cause: 'image_quality' });

    const lowered = await buildTestApp({
      clock: () => LATER,
      trust: tierPort(tiers),
      config: createStaticRuntimeConfig({ 'screening.imageMinShortSide': 320 }),
    });
    try {
      const again = await resubmitted(lowered, user, listing, { title: 'Đồ dùng đã sửa' });
      expect(again.run).toMatchObject({ outcome: 'pass_full' });
      expect(codesOfRun(again.run.hits)).not.toContain('image_too_small');
    } finally {
      await lowered.close();
    }
  });

  it('ảnh kiểm trước khi có phép đo (số đo trống): không trúng luật chất lượng nào dù mọi luật bật', async () => {
    await turnOn(...QUALITY_RULES);
    const { run } = await screened(app, await userAt('T2'));
    expect(run).toMatchObject({ outcome: 'pass_full' });
    expect(codesOfRun(run.hits).filter((code) => code.startsWith('image_'))).toEqual([]);
  });
});

const codesOfRun = (hits: unknown): string[] => (hits as { code: string }[]).map((hit) => hit.code);

// ── SCREENING/HARD-GATES ─────────────────────────────────────────────────────────────────────────

describe('Chỉ cổng cứng mới tính là dò', () => {
  it('"ảnh mờ" bật, ba tin ảnh mờ trong một ngày: cả ba giữ cho người, không vào thời gian chờ', async () => {
    await turnOn('image_blurry');
    const user = await userAt('T3');
    const listings: OwnListing[] = [];
    await sequentially([1, 2, 3], async () => {
      listings.push(await submittedWith(user, [await blurry()]));
    });
    await sequentially(listings, async (listing) => {
      expect(await runOf(listing.id)).toMatchObject({ outcome: 'hold', cause: 'image_quality' });
    });
    expect(await prisma.screeningCooldown.findUnique({ where: { accountId: user.id } })).toBeNull();
  });
});

// ── SCREENING/EXPLANATIONS ───────────────────────────────────────────────────────────────────────

describe('Câu giải thích lỗi ảnh', () => {
  it('chỉ vì "ảnh quá tối" ở ảnh thứ nhất: câu chờ cùng câu ảnh 1 quá tối', async () => {
    await turnOn('image_too_dark');
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await dark(), await sharpMid()]);
    expect(listing.machineNotice).toMatchObject({
      message: WAIT,
      fixes: [{ code: 'image_too_dark', message: 'Ảnh 1 quá tối. Chụp lại ở nơi đủ sáng.' }],
    });
  });

  it('"ảnh quá nhỏ" trúng ảnh thứ hai: câu nói ảnh 2 quá nhỏ kèm gợi ý thay ảnh', async () => {
    await turnOn('image_too_small');
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await sharpMid(), await noisy(60, 200, 400, 300)]);
    expect(listing.machineNotice?.fixes).toEqual([
      { code: 'image_too_small', message: 'Ảnh 2 quá nhỏ. Thay bằng ảnh chụp rõ hơn.' },
    ]);
  });

  it('ảnh thứ nhất mờ và ảnh thứ ba quá sáng, cả hai luật bật: hai câu, mỗi câu một ảnh', async () => {
    await turnOn('image_blurry', 'image_too_bright');
    const user = await userAt('T2');
    const listing = await submittedWith(user, [await blurry(), await sharpMid(), await bright()]);
    expect(listing.machineNotice?.fixes.toSorted((a, b) => a.code.localeCompare(b.code))).toEqual([
      { code: 'image_blurry', message: 'Ảnh 1 bị mờ. Chụp lại, giữ yên máy và đủ sáng.' },
      {
        code: 'image_too_bright',
        message: 'Ảnh 3 quá sáng, gần như trắng xoá. Chụp lại, tránh đèn chiếu thẳng vào máy.',
      },
    ]);
  });

  it('"ảnh mờ" chạy thử, tin bị giữ vì danh mục luôn duyệt tay: không câu nào về ảnh mờ', async () => {
    const user = await userAt('T2');
    const listing = await submittedWith(
      user,
      [await blurry()],
      await seedCategory({ alwaysManual: true }),
    );
    expect(await runOf(listing.id)).toMatchObject({ outcome: 'hold', cause: 'always_manual' });
    expect(listing.machineNotice).toMatchObject({ message: WAIT, fixes: [] });
  });
});
