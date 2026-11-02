import { DAY_MS } from '../../../common/time/time.js';
import type { SearchEntry } from '../activity/activity.repository.js';

/** Trọng số mỗi nguồn tín hiệu (design add-home-suggestions mục 4): hỏi mua nói nhiều nhất, lướt xem ít nhất. */
export const SIGNAL_WEIGHT = { asked: 4, saved: 3, savedSearch: 2, search: 2, view: 1 } as const;
/** Mở một tin nhiều lần tính tối đa ngần này lượt — soi kỹ một món không thành quan tâm cả danh mục. */
export const VIEW_COUNT_CAP = 3;
const MAX_CATEGORIES = 5;
const MAX_KEYWORDS = 10;
const MAX_PROVINCES = 3;
const BAND_LOW = { num: 1n, den: 2n };
const BAND_HIGH = { num: 16n, den: 10n };

export const SCORE_WEIGHT = {
  category: 0.5,
  keyword: 0.2,
  price: 0.15,
  province: 0.1,
  fresh: 0.05,
} as const;
/** Tin đã xem trong `RECENT_VIEW_DAYS` bị trừ điểm: mục khám phá nên đưa món chưa thấy lên trước. */
export const RECENT_VIEW_PENALTY = 0.2;
export const RECENT_VIEW_DAYS = 7;
const FRESH_DAYS = 14;
/** "Được quan tâm nhiều": một lượt hỏi mua bằng hai lượt lưu. */
export const POPULAR_INQUIRY_WEIGHT = 2;

export interface InterestFacts {
  categoryId: string | null;
  provinceCode: number | null;
  price: bigint | null;
}

export interface ProfileInput {
  asked: readonly InterestFacts[];
  saved: readonly InterestFacts[];
  viewed: readonly (InterestFacts & { viewCount: number })[];
  /** Mới trước — từ khoá lấy theo thứ tự này. */
  searches: readonly SearchEntry[];
  savedSearches: readonly SearchEntry[];
  homeProvinceCode: number | null;
}

export interface InterestProfile {
  /** Tỉ trọng trong các danh mục mạnh nhất, cộng lại bằng 1. */
  categories: Map<string, number>;
  keywords: string[];
  priceBands: Map<string, { min: bigint; max: bigint }>;
  /** Tỉnh nhà của hồ sơ đứng đầu. */
  provinces: number[];
}

export interface SuggestionCandidate {
  id: string;
  categoryId: string | null;
  provinceCode: number | null;
  price: bigint | null;
  searchFolded: string;
  rankAt: Date | null;
}

interface Signal {
  weight: number;
  categoryId: string | null;
  provinceCode: number | null;
  prices: bigint[];
}

const positive = (prices: (bigint | null)[]): bigint[] =>
  prices.filter((price): price is bigint => price !== null && price > 0n);

const fromFacts = (weight: number, facts: InterestFacts): Signal => ({
  weight,
  categoryId: facts.categoryId,
  provinceCode: facts.provinceCode,
  prices: positive([facts.price]),
});

const fromSearch = (weight: number, search: SearchEntry): Signal => ({
  weight,
  categoryId: search.categoryId,
  provinceCode: search.provinceCode,
  prices:
    search.priceMin !== null && search.priceMax !== null
      ? positive([(search.priceMin + search.priceMax) / 2n])
      : positive([search.priceMin ?? search.priceMax]),
});

const tally = <K>(
  signals: readonly Signal[],
  key: (signal: Signal) => K | null,
): Map<K, number> => {
  const totals = new Map<K, number>();
  for (const signal of signals) {
    const k = key(signal);
    if (k !== null) totals.set(k, (totals.get(k) ?? 0) + signal.weight);
  }
  return totals;
};

const strongest = <K>(totals: Map<K, number>, limit: number): K[] =>
  [...totals]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);

const lowerMedian = (values: bigint[]): bigint => {
  const sorted = values.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0n;
};

/** Hồ sơ quan tâm (design mục 4); `null` = không danh mục, không từ khoá — xử như chưa có lịch sử. */
export function buildProfile(input: ProfileInput): InterestProfile | null {
  const signals = [
    ...input.asked.map((facts) => fromFacts(SIGNAL_WEIGHT.asked, facts)),
    ...input.saved.map((facts) => fromFacts(SIGNAL_WEIGHT.saved, facts)),
    ...input.savedSearches.map((search) => fromSearch(SIGNAL_WEIGHT.savedSearch, search)),
    ...input.searches.map((search) => fromSearch(SIGNAL_WEIGHT.search, search)),
    ...input.viewed.map((view) =>
      fromFacts(SIGNAL_WEIGHT.view * Math.min(view.viewCount, VIEW_COUNT_CAP), view),
    ),
  ];
  const byCategory = tally(signals, (signal) => signal.categoryId);
  const categoryIds = strongest(byCategory, MAX_CATEGORIES);
  const total = categoryIds.reduce((sum, id) => sum + (byCategory.get(id) ?? 0), 0);
  const keywords = [
    ...new Set(
      [...input.searches, ...input.savedSearches].flatMap((search) =>
        search.qFolded ? [search.qFolded] : [],
      ),
    ),
  ].slice(0, MAX_KEYWORDS);
  if (categoryIds.length === 0 && keywords.length === 0) return null;

  const priceBands = new Map(
    categoryIds.flatMap((id) => {
      const prices = signals.filter((signal) => signal.categoryId === id).flatMap((s) => s.prices);
      if (prices.length === 0) return [];
      const median = lowerMedian(prices);
      const band = {
        min: (median * BAND_LOW.num) / BAND_LOW.den,
        max: (median * BAND_HIGH.num) / BAND_HIGH.den,
      };
      return [[id, band] as const];
    }),
  );
  const home = input.homeProvinceCode === null ? [] : [input.homeProvinceCode];
  const provinces = [
    ...new Set([
      ...home,
      ...strongest(
        tally(signals, (signal) => signal.provinceCode),
        MAX_PROVINCES,
      ),
    ]),
  ].slice(0, MAX_PROVINCES);

  return {
    categories: new Map(categoryIds.map((id) => [id, (byCategory.get(id) ?? 0) / total])),
    keywords,
    priceBands,
    provinces,
  };
}

export function suggestionScore(
  candidate: SuggestionCandidate,
  profile: InterestProfile,
  context: { now: Date; viewedRecently: boolean },
): number {
  const { categoryId, price, provinceCode, rankAt } = candidate;
  const share = categoryId === null ? 0 : (profile.categories.get(categoryId) ?? 0);
  const keyword = profile.keywords.some((k) => candidate.searchFolded.includes(k)) ? 1 : 0;
  const band = categoryId === null ? undefined : profile.priceBands.get(categoryId);
  const priceFit = band && price !== null && price >= band.min && price <= band.max ? 1 : 0;
  const province = provinceCode !== null && profile.provinces.includes(provinceCode) ? 1 : 0;
  const ageDays = rankAt ? (context.now.getTime() - rankAt.getTime()) / DAY_MS : FRESH_DAYS;
  const fresh = Math.min(1, Math.max(0, 1 - ageDays / FRESH_DAYS));
  return (
    SCORE_WEIGHT.category * share +
    SCORE_WEIGHT.keyword * keyword +
    SCORE_WEIGHT.price * priceFit +
    SCORE_WEIGHT.province * province +
    SCORE_WEIGHT.fresh * fresh -
    (context.viewedRecently ? RECENT_VIEW_PENALTY : 0)
  );
}

/** Thứ tự bảng tin: `rank_at` mới trước, rồi `id` — cũng là cách phá hoà điểm. */
const newestFirst = (a: SuggestionCandidate, b: SuggestionCandidate): number =>
  (b.rankAt?.getTime() ?? 0) - (a.rankAt?.getTime() ?? 0) ||
  (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function rankSuggestions<T extends SuggestionCandidate>(
  candidates: readonly T[],
  profile: InterestProfile,
  context: { now: Date; recentlyViewed: ReadonlySet<string> },
): T[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: suggestionScore(candidate, profile, {
        now: context.now,
        viewedRecently: context.recentlyViewed.has(candidate.id),
      }),
    }))
    .toSorted((a, b) => b.score - a.score || newestFirst(a.candidate, b.candidate))
    .map(({ candidate }) => candidate);
}

/** "Được quan tâm nhiều gần bạn" (design mục 6): lượt lưu + 2 × lượt hỏi mua, bằng nhau thì tin mới trước. */
export function rankPopular<T extends SuggestionCandidate>(
  candidates: readonly T[],
  counts: { saves: ReadonlyMap<string, number>; inquiries: ReadonlyMap<string, number> },
): T[] {
  const score = (id: string): number =>
    (counts.saves.get(id) ?? 0) + POPULAR_INQUIRY_WEIGHT * (counts.inquiries.get(id) ?? 0);
  return candidates.toSorted((a, b) => score(b.id) - score(a.id) || newestFirst(a, b));
}
