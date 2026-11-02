import { describe, expect, it } from 'vitest';

import type { SearchEntry } from '../src/modules/listing/activity/activity.repository.js';
import {
  buildProfile,
  type InterestFacts,
  type ProfileInput,
  rankPopular,
  rankSuggestions,
  RECENT_VIEW_PENALTY,
  SCORE_WEIGHT,
  type SuggestionCandidate,
  suggestionScore,
} from '../src/modules/listing/calc/suggestion.calc.js';

/*
 * Spec listing/suggestions, phần thuần (change add-home-suggestions): hồ sơ quan tâm theo bảng trọng số của design mục 4,
 * điểm của design mục 5, thứ tự "được quan tâm nhiều" của mục 6.
 */
const BIKES = 'cat-bikes';
const PHONES = 'cat-phones';
const HCM = 79;
const HN = 1;
const NOW = new Date('2026-11-02T09:00:00+07:00');
const DAY = 86_400_000;

const facts = (
  categoryId: string,
  price: bigint | null = null,
  provinceCode = HCM,
): InterestFacts => ({
  categoryId,
  price,
  provinceCode,
});
const search = (over: Partial<SearchEntry> = {}): SearchEntry => ({
  qFolded: null,
  categoryId: null,
  provinceCode: null,
  priceMin: null,
  priceMax: null,
  ...over,
});
const input = (over: Partial<ProfileInput> = {}): ProfileInput => ({
  asked: [],
  saved: [],
  viewed: [],
  searches: [],
  savedSearches: [],
  homeProvinceCode: null,
  ...over,
});
const candidate = (over: Partial<SuggestionCandidate> = {}): SuggestionCandidate => ({
  id: 'x',
  categoryId: null,
  provinceCode: null,
  price: null,
  searchFolded: '',
  rankAt: new Date(NOW.getTime() - 14 * DAY),
  ...over,
});

describe('buildProfile', () => {
  it('không tín hiệu nào → null (như chưa có lịch sử)', () => {
    expect(buildProfile(input())).toBeNull();
    expect(buildProfile(input({ searches: [search({ provinceCode: HCM })] }))).toBeNull();
  });

  it('tỉ trọng theo trọng số nguồn: một tin đã lưu (3) nặng hơn hai lượt xem (1 + 1)', () => {
    const profile = buildProfile(
      input({
        saved: [facts(BIKES)],
        viewed: [
          { ...facts(PHONES), viewCount: 1 },
          { ...facts(PHONES), viewCount: 1 },
        ],
      }),
    );
    expect(profile?.categories.get(BIKES)).toBeCloseTo(0.6);
    expect(profile?.categories.get(PHONES)).toBeCloseTo(0.4);
  });

  it('hỏi mua (4) nặng hơn lưu (3); mở một tin nhiều lần tính tối đa 3 lượt', () => {
    const profile = buildProfile(
      input({ asked: [facts(BIKES)], viewed: [{ ...facts(PHONES), viewCount: 10 }] }),
    );
    expect(profile?.categories.get(BIKES)).toBeCloseTo(4 / 7);
    expect(profile?.categories.get(PHONES)).toBeCloseTo(3 / 7);
  });

  it('tối đa 5 danh mục, tỉ trọng trong 5 danh mục đó cộng lại bằng 1', () => {
    const profile = buildProfile(
      input({ saved: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => facts(id)) }),
    );
    expect(profile?.categories.size).toBe(5);
    const total = [...(profile?.categories.values() ?? [])].reduce((sum, share) => sum + share, 0);
    expect(total).toBeCloseTo(1);
  });

  it('từ khoá: lượt tìm gần đây trước, rồi tìm kiếm đã lưu; bỏ trùng, tối đa 10', () => {
    const recent = Array.from({ length: 9 }, (_, i) => search({ qFolded: `K${i}` }));
    const profile = buildProfile(
      input({
        searches: [...recent, search({ qFolded: 'K0' })],
        savedSearches: [search({ qFolded: 'SAVED' }), search({ qFolded: 'LATE' })],
      }),
    );
    expect(profile?.keywords).toEqual([...recent.map((s) => s.qFolded), 'SAVED']);
  });

  it('khoảng giá mỗi danh mục: trung vị × 0,5 → × 1,6; tìm có hai đầu giá góp điểm giữa', () => {
    const profile = buildProfile(
      input({
        saved: [facts(BIKES, 10_000_000n), facts(BIKES, 30_000_000n)],
        searches: [search({ categoryId: BIKES, priceMin: 15_000_000n, priceMax: 25_000_000n })],
      }),
    );
    expect(profile?.priceBands.get(BIKES)).toEqual({ min: 10_000_000n, max: 32_000_000n });
  });

  it('tin cho tặng (giá 0) không kéo khoảng giá về 0', () => {
    const profile = buildProfile(input({ saved: [facts(BIKES, 0n), facts(BIKES, 8_000_000n)] }));
    expect(profile?.priceBands.get(BIKES)).toEqual({ min: 4_000_000n, max: 12_800_000n });
  });

  it('tỉnh: tỉnh nhà đứng đầu, rồi theo trọng số, tối đa 3', () => {
    const profile = buildProfile(
      input({
        homeProvinceCode: 48,
        asked: [facts(BIKES, null, HN)],
        saved: [facts(BIKES, null, HCM), facts(BIKES, null, 92)],
        viewed: [{ ...facts(BIKES, null, 31), viewCount: 1 }],
      }),
    );
    expect(profile?.provinces).toEqual([48, HN, HCM]);
  });
});

describe('suggestionScore', () => {
  const profile = {
    categories: new Map([[BIKES, 1]]),
    keywords: ['HONDA VISION'],
    priceBands: new Map([[BIKES, { min: 10n, max: 20n }]]),
    provinces: [HCM],
  };

  it('cộng đủ năm thành phần khi khớp hết, tin vừa lên bảng', () => {
    const score = suggestionScore(
      candidate({
        categoryId: BIKES,
        price: 15n,
        provinceCode: HCM,
        searchFolded: 'XE HONDA VISION 2022',
        rankAt: NOW,
      }),
      profile,
      { now: NOW, viewedRecently: false },
    );
    expect(score).toBeCloseTo(1);
  });

  it('khớp từ khoá ở danh mục khác vẫn có điểm', () => {
    const score = suggestionScore(
      candidate({ categoryId: PHONES, searchFolded: 'HONDA VISION' }),
      profile,
      { now: NOW, viewedRecently: false },
    );
    expect(score).toBeCloseTo(SCORE_WEIGHT.keyword);
  });

  it('độ mới giảm dần theo 14 ngày; giá ngoài khoảng không có điểm giá', () => {
    const score = suggestionScore(
      candidate({ categoryId: BIKES, price: 21n, rankAt: new Date(NOW.getTime() - 7 * DAY) }),
      profile,
      { now: NOW, viewedRecently: false },
    );
    expect(score).toBeCloseTo(SCORE_WEIGHT.category + SCORE_WEIGHT.fresh / 2);
  });

  it('đã xem trong 7 ngày bị trừ điểm', () => {
    const fresh = candidate({ categoryId: BIKES });
    const seen = suggestionScore(fresh, profile, { now: NOW, viewedRecently: true });
    const unseen = suggestionScore(fresh, profile, { now: NOW, viewedRecently: false });
    expect(unseen - seen).toBeCloseTo(RECENT_VIEW_PENALTY);
  });
});

describe('rankSuggestions', () => {
  const profile = {
    categories: new Map([
      [BIKES, 0.75],
      [PHONES, 0.25],
    ]),
    keywords: [],
    priceBands: new Map(),
    provinces: [],
  };
  const context = { now: NOW, recentlyViewed: new Set<string>() };

  it('danh mục quan tâm nhiều hơn đứng trước', () => {
    const ranked = rankSuggestions(
      [
        candidate({ id: 'phone', categoryId: PHONES }),
        candidate({ id: 'bike', categoryId: BIKES }),
      ],
      profile,
      context,
    );
    expect(ranked.map((c) => c.id)).toEqual(['bike', 'phone']);
  });

  it('tin chưa xem đứng trước tin đã xem cùng mức khớp', () => {
    const ranked = rankSuggestions(
      [candidate({ id: 'seen', categoryId: BIKES }), candidate({ id: 'new', categoryId: BIKES })],
      profile,
      { now: NOW, recentlyViewed: new Set(['seen']) },
    );
    expect(ranked.map((c) => c.id)).toEqual(['new', 'seen']);
  });

  it('bằng điểm: rank_at mới trước, rồi mã lớn trước', () => {
    const at = new Date(NOW.getTime() - 20 * DAY);
    const older = new Date(NOW.getTime() - 30 * DAY);
    const ranked = rankSuggestions(
      [
        candidate({ id: 'a', categoryId: BIKES, rankAt: at }),
        candidate({ id: 'old', categoryId: BIKES, rankAt: older }),
        candidate({ id: 'b', categoryId: BIKES, rankAt: at }),
      ],
      profile,
      context,
    );
    expect(ranked.map((c) => c.id)).toEqual(['b', 'a', 'old']);
  });
});

describe('rankPopular', () => {
  it('lượt lưu + 2 × lượt hỏi mua; bằng nhau thì tin mới trước', () => {
    const ranked = rankPopular(
      [
        candidate({ id: 'q', rankAt: NOW }),
        candidate({ id: 'p' }),
        candidate({ id: 'asked' }),
        candidate({ id: 'none' }),
        candidate({ id: 'tie', rankAt: NOW }),
      ],
      {
        saves: new Map([
          ['p', 5],
          ['q', 1],
          ['tie', 4],
        ]),
        inquiries: new Map([['asked', 2]]),
      },
    );
    expect(ranked.map((c) => c.id)).toEqual(['p', 'tie', 'asked', 'q', 'none']);
  });
});
