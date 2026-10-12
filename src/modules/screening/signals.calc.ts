import { readFileSync } from 'node:fs';

import type { RiskLevel, TrustTier } from '@prisma/client';

import { fold } from '../../common/text/fold.js';
import { type PhraseHit, phraseWords, tokenize } from './phrase.calc.js';
import type { PriceRange } from './price-stats.calc.js';
import type { RawHit } from './score.calc.js';
import type { RuleCode } from './screening.rules.js';

/*
 * Dấu hiệu chấm điểm (design add-screening mục 6) — mỗi dấu hiệu một hàm thuần trên dữ kiện đã đọc sẵn. Ngưỡng truyền
 * vào từ bảng con số; trọng số và chế độ là việc của `score.calc.ts`.
 */

const DAY_MS = 86_400_000;

// ── GÕ BỪA ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Hãng, mẫu máy, chữ tiếng Anh và viết tắt hay gặp trong tin rao — không phải âm tiết tiếng Việt mà vẫn có nghĩa. Nạp
 * một lần lúc import như danh sách mật khẩu phổ biến; `pnpm run build` chép `data/` sang dist.
 */
const LATIN_WORDS: ReadonlySet<string> = new Set(
  readFileSync(new URL('./data/latin-words.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
);

/**
 * Âm tiết tiếng Việt đã bỏ dấu: âm đầu (có thể trống) + 1–3 nguyên âm + âm cuối (có thể trống). Đủ chặt để "asdf",
 * "xkcd" không qua, đủ rộng để mọi âm tiết thật qua mà không cần từ điển.
 */
const SYLLABLE =
  /^(ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnprstvx])?[aeiouy]{1,3}(ch|ng|nh|[cmnpt])?$/;
const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEYBOARD_RUN = 4;
const REPEATED = /(.)\1{3}/;

const keyboardRun = (word: string): boolean =>
  KEYBOARD_ROWS.some((row) =>
    [row, [...row].toReversed().join('')].some((line) => {
      for (let i = 0; i + KEYBOARD_RUN <= line.length; i += 1) {
        if (word.includes(line.slice(i, i + KEYBOARD_RUN))) return true;
      }
      return false;
    }),
  );

const nonsense = (word: string): boolean =>
  REPEATED.test(word) || keyboardRun(word) || (!SYLLABLE.test(word) && !LATIN_WORDS.has(word));

/**
 * "Phần lớn tiêu đề, mô tả không phải chữ có nghĩa" (TK 14): quá nửa số chữ không phải âm tiết tiếng Việt, không nằm
 * trong danh sách chữ Latin, hoặc là chuỗi phím liền / ký tự lặp. Bỏ qua chữ có số ("15", "128gb") và chữ một ký tự
 * lẻ ("k", "x"); chữ cái tách rời đã được ghép thành một khối nên "a s d f" vẫn bị xét.
 */
export function isGibberish(text: string): boolean {
  const words = tokenize(text)
    .map((token) => token.text.toLowerCase())
    .filter((word) => word.length > 1 && !/\d/.test(word));
  if (words.length === 0) return false;
  return words.filter(nonsense).length / words.length > 0.5;
}

// ── LIÊN HỆ NGOÀI SÀN ────────────────────────────────────────────────────────────────────────────

/** Số Việt Nam bắt đầu 0 hay +84, chữ số có thể cách bằng khoảng trắng, chấm, gạch. */
const PHONE = /(?:\+?84|0)(?:[\s.-]*\d){9,10}(?!\d)/;
const LINK = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|vn|net|org|me|ly|io|info|biz)\b/i;

/** Số điện thoại, Zalo, đường link trong **mô tả** (spec risk-scoring) — số để trên hồ sơ không tính. */
export function hasOffPlatformContact(description: string | null): boolean {
  if (!description) return false;
  if (PHONE.test(description) || LINK.test(description)) return true;
  return tokenize(description).some((token) => token.text.includes('ZALO'));
}

// ── TRÙNG TIN CỦA MÌNH ───────────────────────────────────────────────────────────────────────────

const trigrams = (text: string): Set<string> => {
  const flat = fold(text).toLowerCase();
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= flat.length; i += 1) grams.add(flat.slice(i, i + 3));
  return grams;
};

/** Độ giống Jaccard trên bộ ba ký tự của chữ bỏ dấu (design mục 6). */
export function similarity(a: string, b: string): number {
  const [left, right] = [trigrams(a), trigrams(b)];
  if (left.size === 0 && right.size === 0) return 1;
  const shared = [...left].filter((gram) => right.has(gram)).length;
  return shared / (left.size + right.size - shared);
}

export const OWN_DUPLICATE_SIMILARITY = 0.9;

/** Tin cũ của chính người đăng gần như y hệt — trả mã tin giống nhất để tin mới lên bảng ở vị trí của nó. */
export function ownDuplicateOf(
  text: string,
  recent: readonly { id: string; text: string }[],
): string | null {
  let best: { id: string; score: number } | null = null;
  for (const listing of recent) {
    const score = similarity(text, listing.text);
    if (score >= OWN_DUPLICATE_SIMILARITY && (!best || score > best.score)) {
      best = { id: listing.id, score };
    }
  }
  return best?.id ?? null;
}

// ── GIÁ ──────────────────────────────────────────────────────────────────────────────────────────

/** Giá 0 là cho tặng, không bao giờ "bất thường" (cam kết 29); thiếu mẫu thì không xét, kể cả có giá tham chiếu. */
export function isAbnormalPrice(
  price: bigint | null,
  range: PriceRange | null,
  minSamples: number,
): boolean {
  if (price === null || price === 0n || !range || range.samples < minSamples) return false;
  return price < range.low || price > range.high;
}

/** Cho tặng ở danh mục có giá tham chiếu **từ** ngưỡng giá trị cao (câu 8). */
export function isZeroPriceHighValue(
  price: bigint | null,
  referencePrice: bigint | null,
  threshold: number,
): boolean {
  return price === 0n && referencePrice !== null && referencePrice >= BigInt(threshold);
}

// ── TÀI KHOẢN, NHỊP ──────────────────────────────────────────────────────────────────────────────

export function isNewAccount(createdAt: Date, now: Date, days: number): boolean {
  return now.getTime() - createdAt.getTime() < days * DAY_MS;
}

/** Lượt gửi trong 24 giờ, **tính cả lượt đang gửi**, vượt ngưỡng của mức (T0–T1 hay T2–T3). */
export function isBurst(
  submissionsIncludingThis: number,
  tier: TrustTier,
  limits: { lowTiers: number; highTiers: number },
): boolean {
  const limit = tier === 'T0' || tier === 'T1' ? limits.lowTiers : limits.highTiers;
  return submissionsIncludingThis > limit;
}

// ── SAI DANH MỤC ─────────────────────────────────────────────────────────────────────────────────

const containsWords = (haystack: readonly string[], needle: readonly string[]): boolean => {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((word, offset) => haystack[i + offset] === word)) return true;
  }
  return false;
};

/** Ít nhất ngần này từ khoá của danh mục khác khớp tiêu đề thì mới suy ra (design mục 3). */
export const GUESS_MIN_KEYWORDS = 2;

/**
 * Danh mục suy ra từ tiêu đề: danh mục có ≥ 2 từ khoá khớp trong khi danh mục đã chọn khớp 0; nhiều danh mục thì lấy
 * danh mục khớp nhiều nhất (bằng nhau thì mã nhỏ — để chấm lại ra cùng kết quả). `null` = không suy ra được.
 */
export function guessCategory(
  title: string,
  keywords: ReadonlyMap<string, readonly string[]>,
  chosenCategoryId: string,
): string | null {
  const words = phraseWords(title);
  const matches = (categoryId: string) =>
    (keywords.get(categoryId) ?? []).filter((keyword) => containsWords(words, phraseWords(keyword)))
      .length;
  if (matches(chosenCategoryId) > 0) return null;
  const ranked = [...keywords.keys()]
    .filter((id) => id !== chosenCategoryId)
    .map((id) => ({ id, count: matches(id) }))
    .filter((row) => row.count >= GUESS_MIN_KEYWORDS)
    .toSorted((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return ranked[0]?.id ?? null;
}

// ── GOM DẤU HIỆU CỦA CHỮ ─────────────────────────────────────────────────────────────────────────

export interface CategoryFacts {
  id: string;
  riskLevel: RiskLevel;
  alwaysManual: boolean;
  priceCap: bigint | null;
  referencePrice: bigint | null;
  /** Khoảng giá của lượt đêm gần nhất; `null` = chưa có thống kê. */
  priceRange: PriceRange | null;
}

export interface TextFacts {
  title: string;
  description: string | null;
  price: bigint | null;
  category: CategoryFacts;
  /** Danh mục `guessCategory` suy ra, khác danh mục đã chọn. */
  guessedCategory: CategoryFacts | null;
  phraseHits: readonly PhraseHit[];
  tier: TrustTier;
  accountCreatedAt: Date;
  now: Date;
  submissionsIncludingThis: number;
  recentOwn: readonly { id: string; text: string }[];
  /** Lần máy giữ trong khung "bị giữ nhiều", chỉ đếm `HELD_MANY_CAUSES`. */
  heldCount: number;
  /** `identity.deviceFlagsFor`: dùng chung máy với tài khoản đang khoá mà không thuộc diện luôn giữ (câu 16, 20). */
  sharedDeviceLocked: boolean;
}

export interface SignalLimits {
  newAccountDays: number;
  abnormalPriceMinSamples: number;
  highValueReferencePriceFrom: number;
  burst: { lowTiers: number; highTiers: number };
  heldManyCount: number;
}

export interface TextHits {
  hits: RawHit[];
  /** Danh mục chọn hoặc suy ra bật luôn duyệt tay (TK 14). */
  alwaysManual: boolean;
  /** Tin cũ mà tin mới lên bảng ở vị trí của nó (trùng tin của mình). */
  rankAsListingId: string | null;
}

/**
 * Mọi dấu hiệu và cổng cứng thấy được từ chữ, giá và dữ kiện người đăng — chưa áp chế độ, trọng số. Sai danh mục thì
 * xét thêm luật của danh mục suy ra: rủi ro cao cộng "danh mục rủi ro cao", luôn duyệt tay thì giữ (spec risk-scoring).
 */
export function collectHits(facts: TextFacts, limits: SignalLimits): TextHits {
  const { category, guessedCategory: guessed, price } = facts;
  const text = `${facts.title}\n${facts.description ?? ''}`;
  const rankAsListingId = ownDuplicateOf(text, facts.recentOwn);
  const hits: RawHit[] = facts.phraseHits.map((hit) => ({
    code: hit.level === 'certain' ? 'certain_phrase' : 'ambiguous_phrase',
    trial: hit.mode === 'trial',
    refs: [hit.phraseId],
  }));
  const add = (when: boolean, code: RuleCode, refs?: string[]) => {
    if (when) hits.push(refs ? { code, refs } : { code });
  };
  add(isGibberish(text), 'gibberish');
  add(
    isZeroPriceHighValue(price, category.referencePrice, limits.highValueReferencePriceFrom),
    'zero_price_high_value',
  );
  add(facts.sharedDeviceLocked, 'shared_device_locked');
  add(
    isAbnormalPrice(price, category.priceRange, limits.abnormalPriceMinSamples),
    'abnormal_price',
  );
  add(hasOffPlatformContact(facts.description), 'off_platform_contact');
  if (rankAsListingId) add(true, 'own_duplicate', [rankAsListingId]);
  add(isBurst(facts.submissionsIncludingThis, facts.tier, limits.burst), 'burst');
  add(category.riskLevel === 'high' || guessed?.riskLevel === 'high', 'high_risk_category');
  add(facts.heldCount >= limits.heldManyCount, 'held_many');
  if (guessed) add(true, 'wrong_category', [guessed.id]);
  add(isNewAccount(facts.accountCreatedAt, facts.now, limits.newAccountDays), 'new_account');
  add(price !== null && category.priceCap !== null && price > category.priceCap, 'price_over_cap');
  return {
    hits,
    alwaysManual: category.alwaysManual || guessed?.alwaysManual === true,
    rankAsListingId,
  };
}
