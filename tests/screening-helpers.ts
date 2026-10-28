import { randomUUID } from 'node:crypto';

import type { ScreeningRun, ScreeningTrigger, TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';

import type { ListingTrustPort } from '../src/modules/listing/listing.ports.js';
import { bandsOf, toStored } from '../src/modules/screening/calc/dhash.calc.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, type TestUser } from './group-helpers.js';
import { getOwn, listingApi, type OwnListing, readyDraft, submit } from './listing-http-helpers.js';
import { requestUpload } from './media-helpers.js';
import { uploadWith } from './storage-helpers.js';
import { TEST_NOW } from './test-app.js';

/*
 * Dữ liệu nền cho test máy duyệt qua lượt gửi thật. Ảnh đánh dấu "đã kiểm" thẳng trong DB để lượt kết luận ngay —
 * đường kiểm ảnh thật (kho + `sharp`) có `screening-images.http.test.ts`.
 */
export const DAY_MS = 86_400_000;
export const MILLION = 1_000_000;
/** Đồng hồ app 10 ngày sau lúc tạo tài khoản test: không ai còn là "tài khoản mới", trừ ca tự đặt tuổi. */
export const LATER = new Date(TEST_NOW.getTime() + 10 * DAY_MS);

/** Mức tin cậy theo người, không chặn lượt gửi nào — ca test đặt mức của từng tài khoản. */
export function tierPort(
  tiers: Map<string, TrustTier>,
  fallback: TrustTier = 'T2',
): ListingTrustPort {
  return {
    tierOf: (accountId) => Promise.resolve(tiers.get(accountId) ?? fallback),
    assertCanSubmit: () => Promise.resolve(),
    strikePointsIn: () => Promise.resolve(0),
    strikePointsOf: () => Promise.resolve(0),
    struckAccounts: () => Promise.resolve(new Set<string>()),
  };
}

/** Mỗi người một máy: cùng một máy cho mọi người thì tài khoản thứ tư dính "nhiều tài khoản trên một máy". */
export const deviceOf = (user: TestUser): string => `may-cua-${user.id}`;

let hashSeq = 0n;
/** Mã băm rải bit theo tỉ lệ vàng — hai mã bất kỳ của test lệch xa hơn 4 bit, không trùng ai. */
export function uniqueHash(): bigint {
  hashSeq += 1n;
  return BigInt.asUintN(64, hashSeq * 0x9e3779b97f4a7c15n);
}

const bandColumns = (hash: bigint) => {
  const [band0 = 0, band1 = 0, band2 = 0, band3 = 0, band4 = 0] = bandsOf(hash);
  return { band0, band1, band2, band3, band4 };
};

let checkedSeq = 0;

/**
 * Ảnh đã kiểm xong với mã cho trước — lượt gửi kết luận ngay, không cần kho hay việc nền. Mỗi ảnh kiểm xong muộn hơn
 * ảnh đánh dấu trước nó 1 ms: "ảnh trùng" chỉ so với ảnh kiểm xong trước (duplicate-image-first-wins), nên thứ tự
 * gọi là thứ tự đăng.
 */
export async function markChecked(
  imageIds: string[],
  ownerAccountId: string,
  hashOf: (index: number) => bigint = () => uniqueHash(),
): Promise<void> {
  await prisma.imageCheck.createMany({
    data: imageIds.map((imageId, index) => {
      const hash = hashOf(index);
      return {
        imageId,
        ownerAccountId,
        status: 'done' as const,
        dhash: toStored(hash),
        ...bandColumns(hash),
        checkedAt: new Date(TEST_NOW.getTime() + (checkedSeq += 1)),
      };
    }),
  });
}

export const runOf = (listingId: string, trigger: ScreeningTrigger = 'submission') =>
  prisma.screeningRun.findFirstOrThrow({
    where: { listingId, trigger },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
  });

/** Mã luật đang bật đã trúng, xếp theo chữ cái. */
export const codesOf = (run: Pick<ScreeningRun, 'hits'>): string[] =>
  (run.hits as { code: string; mode: string }[])
    .filter((hit) => hit.mode === 'on')
    .map((hit) => hit.code)
    .toSorted();

export interface Screened {
  listing: OwnListing;
  run: ScreeningRun;
}

/** Gửi nháp đủ trường mà ảnh đã kiểm, giao hết sự kiện — trả tin như người đăng thấy cùng lượt máy đã ghi. */
export async function screened(
  app: FastifyInstance,
  user: TestUser,
  fields: Record<string, unknown> = {},
  options: { hashOf?: (index: number) => bigint; device?: string } = {},
): Promise<Screened> {
  const draft = await readyDraft(app, user, fields);
  await markChecked(
    draft.images.map((image) => image.id),
    user.id,
    options.hashOf,
  );
  const res = await submit(app, user, draft, options.device ?? deviceOf(user));
  if (res.statusCode !== 200) throw new Error(`Gửi hỏng: ${res.statusCode} ${res.body}`);
  await deliverAll(app);
  return { listing: await getOwn(app, user, draft.id), run: await runOf(draft.id) };
}

/** Sửa rồi gửi lại tin đang có: ảnh giữ nguyên nên đã có kết quả — lượt kết luận ngay. */
export async function resubmitted(
  app: FastifyInstance,
  user: TestUser,
  listing: { id: string; version: number },
  fields: Record<string, unknown>,
): Promise<Screened> {
  const res = await listingApi(
    app,
    'PATCH',
    `/listings/${listing.id}`,
    user,
    { version: listing.version, ...fields },
    deviceOf(user),
  );
  if (res.statusCode !== 200) throw new Error(`Sửa hỏng: ${res.statusCode} ${res.body}`);
  await deliverAll(app);
  return { listing: await getOwn(app, user, listing.id), run: await runOf(listing.id) };
}

// ── ẢNH THẬT ─────────────────────────────────────────────────────────────────────────────────────

/** PNG 64×64 từ lưới 8×8 ô xám theo `seed`: hai seed khác nhau ra hai dHash xa nhau. */
export async function pngOf(seed: number): Promise<Uint8Array> {
  let state = (seed * 2_654_435_761) >>> 0;
  const cells = Buffer.from(
    Array.from({ length: 64 }, () => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      return state >>> 24;
    }),
  );
  return new Uint8Array(
    await sharp(cells, { raw: { width: 8, height: 8, channels: 1 } })
      .resize(64, 64, { kernel: 'nearest' })
      .png()
      .toBuffer(),
  );
}

/** Bản chép lại của một ảnh: phóng to rồi nén JPEG — dHash lệch vài bit hay không lệch. */
export async function recompressed(png: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await sharp(png).resize(96, 96).jpeg({ quality: 70 }).toBuffer());
}

/** Tải bytes thật lên kho như app, cho một tin — trả mã ảnh. */
export async function uploadBytes(
  app: FastifyInstance,
  user: TestUser,
  listingId: string,
  bytes: Uint8Array,
  contentType: 'image/png' | 'image/jpeg',
): Promise<string> {
  const granted = await requestUpload(app, user, {
    ownerKind: 'listing',
    ownerId: listingId,
    contentType,
    byteSize: bytes.length,
  });
  if (granted.statusCode !== 201) {
    throw new Error(`Xin tải hỏng: ${granted.statusCode} ${granted.body}`);
  }
  const { imageId, upload } = granted.json().data as {
    imageId: string;
    upload: { url: string; headers: Record<string, string> };
  };
  const put = await uploadWith(upload, bytes);
  if (put.status !== 200) throw new Error(`Tải lên kho hỏng: ${put.status}`);
  return imageId;
}

// ── DỮ KIỆN NỀN ──────────────────────────────────────────────────────────────────────────────────

/** Cụm từ cấm thêm và bật thật qua bàn vận hành như master làm (bật sớm kèm lý do) — trả mã cụm. */
export async function activePhrase(
  app: FastifyInstance,
  master: TestUser,
  text: string,
  level: 'certain' | 'ambiguous' = 'certain',
  exceptions: string[] = [],
): Promise<string> {
  const created = await api(app, 'POST', '/ops/screening/phrases', master.token, {
    text,
    level,
    exceptions,
  });
  if (created.statusCode !== 201) throw new Error(`Thêm cụm hỏng: ${created.body}`);
  const id = created.json().data.id as string;
  const activated = await api(app, 'POST', `/ops/screening/phrases/${id}/activate`, master.token, {
    reason: 'Bật cho test',
  });
  if (activated.statusCode !== 200) throw new Error(`Bật cụm hỏng: ${activated.body}`);
  return id;
}

/** Khoảng giá thường thấy của lượt đêm, ghi sẵn — "phần lớn giá từ 5 tới 20 triệu" = [2,5 triệu; 40 triệu]. */
export async function priceStats(
  categoryId: string,
  range: { low: number; high: number; samples: number } = {
    low: 2_500_000,
    high: 40_000_000,
    samples: 200,
  },
): Promise<void> {
  await prisma.categoryPriceStat.create({
    data: {
      categoryId,
      low: BigInt(range.low),
      high: BigInt(range.high),
      samples: range.samples,
      computedAt: TEST_NOW,
    },
  });
}

/** Lần máy giữ đã có của một người — dựng thẳng, không qua lượt gửi (tin không cần tồn tại). */
export async function pastHolds(
  accountId: string,
  causes: ('score' | 'gate' | 'always_manual' | 'device' | 'error')[],
  at: Date,
): Promise<void> {
  await prisma.screeningRun.createMany({
    data: causes.map((cause) => ({
      listingId: randomUUID(),
      listingVersion: 1,
      accountId,
      trigger: 'submission' as const,
      startedAt: at,
      textResult: {},
      imageIds: [],
      decidedAt: at,
      outcome: 'hold' as const,
      cause,
      score: 0,
      band: 'low' as const,
      configVersion: 0,
      ruleVersion: 0,
    })),
  });
}
