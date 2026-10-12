import { createHash } from 'node:crypto';

import { startOfDayVN } from '../../common/time/time.js';

export type TrustTier = 'T0' | 'T1' | 'T2' | 'T3';

export const TRUST_TIERS: readonly TrustTier[] = ['T0', 'T1', 'T2', 'T3'];

const DAY_MS = 86_400_000;
const WINDOW_MS = 7 * DAY_MS;

/** Điều kiện của từng mức trên T0 (TK 20, bảng con số phần 28) — phiên bản đang hiệu lực truyền vào, không đọc ở đây. */
export interface TierSettings {
  minDays: Record<Exclude<TrustTier, 'T0'>, number>;
  minClean: Record<Exclude<TrustTier, 'T0'>, number>;
  maxCleanPer7Days: number;
}

export interface TierResult {
  tier: TrustTier;
  /** Số tin sạch đã được tính vào mức tới `now` — tin dời chưa tới lượt thì chưa tính. */
  countedClean: number;
  /** Còn thiếu gì để lên mức kế tiếp; `null` ở T3. */
  next: { tier: TrustTier; missingDays: number; missingClean: number } | null;
}

/**
 * Tuổi tài khoản theo ngày lịch giờ Việt Nam, kể cả ngày tạo: tạo ngày 1 thì ngày 1 là 1 ngày tuổi (chốt lúc code
 * 12/10/2026). Chỉ cách đếm này thoả cùng lúc "ngày 30 có 5 tin sạch → T2" và "3 ngày tuổi còn thiếu 4 ngày để lên
 * T1" của spec, và khớp lượt tính lại hằng ngày: mốc tuổi rơi đúng vào một ngày, không vào một giờ trong ngày.
 */
export function ageDays(createdAt: Date, now: Date): number {
  return Math.round((startOfDayVN(now).getTime() - startOfDayVN(createdAt).getTime()) / DAY_MS) + 1;
}

/**
 * Lúc mỗi tin sạch được TÍNH vào mức (design add-trust-tiers mục 4, câu 1 — dời, không bỏ): trong mọi khoảng 7 ngày
 * (mở đầu, đóng cuối) có tối đa `max` tin được tính; tin vượt chờ tới khi khoảng có chỗ. Chỉ phụ thuộc đầu vào, không
 * lưu "đã tính", nên tính lại bao nhiêu lần cũng ra cùng kết quả.
 */
export function countingTimes(cleanAt: readonly Date[], max: number): Date[] {
  const sorted = cleanAt.map((at) => at.getTime()).toSorted((a, b) => a - b);
  const counted: number[] = [];
  for (const at of sorted) {
    let time = Math.max(at, counted.at(-1) ?? at);
    const blocker = counted.length >= max ? counted[counted.length - max] : undefined;
    if (blocker !== undefined && time < blocker + WINDOW_MS) time = blocker + WINDOW_MS;
    counted.push(time);
  }
  return counted.map((time) => new Date(time));
}

/** Mức cao nhất đủ cả tuổi lẫn tin sạch được tính (TK 20). Điều kiện gậy thêm vào đây ở `add-strikes`. */
export function computeTier(input: {
  accountCreatedAt: Date;
  cleanAt: readonly Date[];
  now: Date;
  settings: TierSettings;
}): TierResult {
  const { accountCreatedAt, cleanAt, now, settings } = input;
  const age = ageDays(accountCreatedAt, now);
  const countedClean = countingTimes(cleanAt, settings.maxCleanPer7Days).filter(
    (time) => time.getTime() <= now.getTime(),
  ).length;
  const reaches = (tier: Exclude<TrustTier, 'T0'>) =>
    age >= settings.minDays[tier] && countedClean >= settings.minClean[tier];
  const tier = (['T3', 'T2', 'T1'] as const).find(reaches) ?? 'T0';
  return { tier, countedClean, next: nextStep(tier, age, countedClean, settings) };
}

/** Còn thiếu gì để lên mức kế tiếp từ `tier` — bảng uy tín dùng trên mức đã lưu, không tính lại mức (design T5). */
export function nextStep(
  tier: TrustTier,
  age: number,
  countedClean: number,
  settings: TierSettings,
): TierResult['next'] {
  const nextTier = TRUST_TIERS[TRUST_TIERS.indexOf(tier) + 1] as
    Exclude<TrustTier, 'T0'> | undefined;
  if (!nextTier) return null;
  return {
    tier: nextTier,
    missingDays: Math.max(0, settings.minDays[nextTier] - age),
    missingClean: Math.max(0, settings.minClean[nextTier] - countedClean),
  };
}

/**
 * Dấu của dữ kiện đã chuẩn hoá + phiên bản bảng con số (luật 18): tính lại ra cùng dấu và cùng mức thì không ghi gì.
 * Thứ tự đầu vào không đổi dấu — dữ kiện đọc từ DB không có thứ tự cố định.
 */
export function factsHash(input: {
  accountCreatedAt: Date;
  clean: readonly { listingId: string; cleanAt: Date }[];
  configVersion: number;
}): string {
  const clean = input.clean
    .map(({ listingId, cleanAt }) => `${listingId}@${cleanAt.toISOString()}`)
    .toSorted();
  return createHash('sha256')
    .update(JSON.stringify([input.accountCreatedAt.toISOString(), input.configVersion, clean]))
    .digest('hex');
}
