import { describe, expect, it } from 'vitest';

import { priceRange } from '../src/modules/screening/calc/price-stats.calc.js';
import {
  type CategoryFacts,
  collectHits,
  guessCategory,
  hasOffPlatformContact,
  isAbnormalPrice,
  isBurst,
  isGibberish,
  isNewAccount,
  isZeroPriceHighValue,
  ownDuplicateOf,
  type SignalLimits,
  similarity,
  type TextFacts,
} from '../src/modules/screening/calc/signals.calc.js';

/* Spec screening/risk-scoring, phần dấu hiệu thuần (design add-screening mục 6). */
const MILLION = 1_000_000n;
const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-12T03:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const LIMITS: SignalLimits = {
  newAccountDays: 3,
  abnormalPriceMinSamples: 30,
  highValueReferencePriceFrom: 2_000_000,
  burst: { lowTiers: 10, highTiers: 30 },
  heldManyCount: 3,
};
const PHONES: CategoryFacts = {
  id: 'phones',
  riskLevel: 'low',
  alwaysManual: false,
  priceCap: 60n * MILLION,
  referencePrice: 8n * MILLION,
  priceRange: { low: 2_500_000n, high: 40n * MILLION, samples: 200 },
};
const facts = (overrides: Partial<TextFacts> = {}): TextFacts => ({
  title: 'Bán iPhone 13 Pro Max 128GB',
  description: 'Máy đẹp 99%, pin 90%, fullbox, còn bảo hành 3 tháng',
  price: 15n * MILLION,
  category: PHONES,
  guessedCategory: null,
  phraseHits: [],
  tier: 'T1',
  accountCreatedAt: daysAgo(100),
  now: NOW,
  submissionsIncludingThis: 1,
  recentOwn: [],
  heldCount: 0,
  sharedDeviceLocked: false,
  sharedDeviceStruck: false,
  ...overrides,
});
const codes = (input: Partial<TextFacts>) =>
  collectHits(facts(input), LIMITS).hits.map((hit) => hit.code);

describe('Chữ như gõ bừa', () => {
  it('chuỗi gõ bừa: trúng', () => {
    expect(isGibberish('asdfgh qwerty\nzxcvb jkl wpzt')).toBe(true);
    expect(isGibberish('hhhhhh kkkkk xjq')).toBe(true);
  });

  it('câu tiếng Việt có nghĩa, kể cả hãng, mẫu máy, số: không trúng', () => {
    expect(
      isGibberish('Bán iPhone 13 Pro Max 128GB\nMáy đẹp 99%, pin 90%, fullbox, bảo hành 3 tháng'),
    ).toBe(false);
    expect(isGibberish('Nghiêng người khuyên quyển truyện giường nước rượu')).toBe(false);
    expect(isGibberish('Xe Honda Vision 2022 chính chủ, ship COD toàn quốc')).toBe(false);
  });

  it('chữ cái tách rời được ghép rồi mới xét: "a s d f g h" trúng', () => {
    expect(isGibberish('a s d f g h')).toBe(true);
  });

  it('chỉ có số hay chữ một ký tự: không xét', () => {
    expect(isGibberish('15 128 k')).toBe(false);
  });
});

describe('Liên hệ ngoài sàn — chỉ trong mô tả', () => {
  it('"Zalo 0912 345 678": trúng', () => {
    expect(hasOffPlatformContact('Liên hệ Zalo 0912 345 678')).toBe(true);
  });

  it('số +84, chấm, gạch; đường link; chữ "z a l o" tách rời: trúng', () => {
    expect(hasOffPlatformContact('gọi +84 912.345.678')).toBe(true);
    expect(hasOffPlatformContact('gọi 0912-345-678 nhé')).toBe(true);
    expect(hasOffPlatformContact('xem thêm ở shop.vn')).toBe(true);
    expect(hasOffPlatformContact('https://example.com/abc')).toBe(true);
    expect(hasOffPlatformContact('nhắn z a l o mình')).toBe(true);
  });

  it('mô tả không có số, Zalo hay link; số ngắn như dung lượng, giá: không trúng', () => {
    expect(hasOffPlatformContact('Máy đẹp, pin 90%, bộ nhớ 128GB, giá 15.000.000')).toBe(false);
    expect(hasOffPlatformContact(null)).toBe(false);
  });

  it('số trong tiêu đề không tính (spec: số điện thoại, Zalo, link nằm trong mô tả)', () => {
    expect(codes({ title: 'Zalo 0912345678 bán iPhone', description: 'Máy đẹp' })).not.toContain(
      'off_platform_contact',
    );
  });
});

describe('Trùng tin của chính mình', () => {
  const old = 'Bán iPhone 13 Pro Max 128GB\nMáy đẹp 99%, pin 90%, fullbox, còn bảo hành 3 tháng';

  it('tin gần như y hệt (chỉ khác dấu, hoa thường): trúng và trả mã tin cũ', () => {
    expect(similarity(old, old.toUpperCase())).toBe(1);
    expect(ownDuplicateOf(`${old}.`, [{ id: 'old', text: old }])).toBe('old');
  });

  it('tin khác hẳn: không trúng', () => {
    expect(
      ownDuplicateOf('Bán xe Honda Vision 2022 chính chủ', [{ id: 'old', text: old }]),
    ).toBeNull();
  });

  it('nhiều tin cũ giống: lấy tin giống nhất', () => {
    const near = `${old} gấp`;
    expect(
      ownDuplicateOf(old, [
        { id: 'near', text: near },
        { id: 'same', text: old },
      ]),
    ).toBe('same');
  });

  it('collectHits ghi tin cũ cho hỗ trợ và cho vị trí trên bảng tin', () => {
    const result = collectHits(
      facts({ recentOwn: [{ id: 'old', text: `${facts().title}\n${facts().description}` }] }),
      LIMITS,
    );
    expect(result.rankAsListingId).toBe('old');
    expect(result.hits).toContainEqual({ code: 'own_duplicate', refs: ['old'] });
  });
});

describe('Giá', () => {
  it('khoảng [P10 ÷ 2, P90 × 2] trên giá khác 0', () => {
    const prices = [0n, 0n, ...Array.from({ length: 100 }, (_, i) => BigInt(i + 1) * 1_000_000n)];
    expect(priceRange(prices, 10, 2)).toEqual({
      low: 5_000_000n,
      high: 180_000_000n,
      samples: 100,
    });
  });

  it('P10 = 5 triệu, P90 = 20 triệu: 2,4 triệu và 45 triệu trúng, 3 triệu không', () => {
    const range = { low: 2_500_000n, high: 40n * MILLION, samples: 200 };
    expect(isAbnormalPrice(2_400_000n, range, 30)).toBe(true);
    expect(isAbnormalPrice(45n * MILLION, range, 30)).toBe(true);
    expect(isAbnormalPrice(3n * MILLION, range, 30)).toBe(false);
  });

  it('danh mục chỉ 12 mẫu: không xét', () => {
    expect(isAbnormalPrice(1n, { low: 5n * MILLION, high: 40n * MILLION, samples: 12 }, 30)).toBe(
      false,
    );
  });

  it('giá 0 và giá để trống không bao giờ bất thường', () => {
    expect(isAbnormalPrice(0n, PHONES.priceRange, 30)).toBe(false);
    expect(isAbnormalPrice(null, PHONES.priceRange, 30)).toBe(false);
    expect(isAbnormalPrice(1n, null, 30)).toBe(false);
  });

  it('giá 0 ở danh mục tham chiếu 8 triệu trúng; 300 nghìn không; đúng 2 triệu trúng', () => {
    expect(isZeroPriceHighValue(0n, 8n * MILLION, 2_000_000)).toBe(true);
    expect(isZeroPriceHighValue(0n, 300_000n, 2_000_000)).toBe(false);
    expect(isZeroPriceHighValue(0n, 2n * MILLION, 2_000_000)).toBe(true);
    expect(isZeroPriceHighValue(100_000n, 8n * MILLION, 2_000_000)).toBe(false);
  });

  it('giá vượt trần là cổng cứng; đúng bằng trần thì không', () => {
    expect(codes({ price: 65n * MILLION })).toContain('price_over_cap');
    expect(codes({ price: 60n * MILLION })).not.toContain('price_over_cap');
  });
});

describe('Tài khoản mới, đăng dồn, bị giữ nhiều', () => {
  it('2 ngày tuổi trúng, 4 ngày tuổi không', () => {
    expect(isNewAccount(daysAgo(2), NOW, 3)).toBe(true);
    expect(isNewAccount(daysAgo(4), NOW, 3)).toBe(false);
  });

  it('T1: lượt thứ 11 trúng, lượt thứ 10 không; T2: lượt thứ 25 không', () => {
    const limits = LIMITS.burst;
    expect(isBurst(11, 'T1', limits)).toBe(true);
    expect(isBurst(10, 'T1', limits)).toBe(false);
    expect(isBurst(25, 'T2', limits)).toBe(false);
    expect(isBurst(31, 'T3', limits)).toBe(true);
  });

  it('bị giữ 3 lần trúng, 2 lần không', () => {
    expect(codes({ heldCount: 3 })).toContain('held_many');
    expect(codes({ heldCount: 2 })).not.toContain('held_many');
  });
});

describe('Sai danh mục', () => {
  const keywords = new Map<string, readonly string[]>([
    ['clothes', ['áo thun', 'quần jean', 'váy']],
    ['phones', ['điện thoại', 'iphone', 'samsung galaxy']],
    ['watches', ['đồng hồ', 'rolex', 'casio']],
  ]);

  it('bán điện thoại trong Quần áo: suy ra Điện thoại', () => {
    expect(guessCategory('Bán điện thoại iPhone 13 cũ', keywords, 'clothes')).toBe('phones');
  });

  it('tiêu đề khớp từ khoá danh mục đã chọn: không suy ra', () => {
    expect(guessCategory('Áo thun in hình iPhone điện thoại', keywords, 'clothes')).toBeNull();
  });

  it('chỉ một từ khoá của danh mục khác: không đủ để suy ra', () => {
    expect(guessCategory('Ốp lưng iPhone', keywords, 'clothes')).toBeNull();
  });

  it('danh mục suy ra rủi ro cao: trúng cả "sai danh mục" và "danh mục rủi ro cao"', () => {
    const watches: CategoryFacts = { ...PHONES, id: 'watches', riskLevel: 'high' };
    const result = collectHits(facts({ guessedCategory: watches }), LIMITS);
    expect(result.hits).toContainEqual({ code: 'wrong_category', refs: ['watches'] });
    expect(result.hits).toContainEqual({ code: 'high_risk_category' });
    expect(result.alwaysManual).toBe(false);
  });

  it('danh mục suy ra bật luôn duyệt tay: tin bị giữ như mọi tin của danh mục đó', () => {
    const pets: CategoryFacts = { ...PHONES, id: 'pets', alwaysManual: true };
    expect(collectHits(facts({ guessedCategory: pets }), LIMITS).alwaysManual).toBe(true);
  });
});

describe('Gom dấu hiệu của chữ', () => {
  it('tin sạch: không trúng gì', () => {
    expect(collectHits(facts(), LIMITS)).toEqual({
      hits: [],
      alwaysManual: false,
      rankAsListingId: null,
    });
  });

  it('danh mục rủi ro vừa: không trúng "danh mục rủi ro cao"; rủi ro cao: trúng', () => {
    expect(codes({ category: { ...PHONES, riskLevel: 'medium' } })).toEqual([]);
    expect(codes({ category: { ...PHONES, riskLevel: 'high' } })).toEqual(['high_risk_category']);
  });

  it('cụm từ cấm theo mức, chạy thử mang cờ trial', () => {
    const result = collectHits(
      facts({
        phraseHits: [
          { phraseId: 'p1', level: 'certain', mode: 'on' },
          { phraseId: 'p2', level: 'ambiguous', mode: 'trial' },
        ],
      }),
      LIMITS,
    );
    expect(result.hits).toEqual([
      { code: 'certain_phrase', trial: false, refs: ['p1'] },
      { code: 'ambiguous_phrase', trial: true, refs: ['p2'] },
    ]);
  });

  it('dùng chung máy với tài khoản đang khoá: trúng dấu hiệu, không luôn giữ', () => {
    expect(codes({ sharedDeviceLocked: true })).toEqual(['shared_device_locked']);
  });

  it('đã đăng trên máy trước lúc tài khoản cùng máy nhận gậy: trúng dấu hiệu 30 điểm, một lần (add-strikes)', () => {
    expect(codes({ sharedDeviceStruck: true })).toEqual(['shared_device_strike']);
  });

  it('tài khoản 2 ngày tuổi ghi số Zalo trong mô tả: tài khoản mới + liên hệ ngoài sàn', () => {
    expect(
      codes({ accountCreatedAt: daysAgo(2), description: 'Máy đẹp, Zalo 0912 345 678' }).toSorted(),
    ).toEqual(['new_account', 'off_platform_contact']);
  });

  it('iPhone 15 giá 2 triệu, mô tả lộn xộn, ghi số Zalo: giá bất thường + gõ bừa + liên hệ ngoài sàn', () => {
    expect(
      codes({
        title: 'iPhone 15',
        description: 'xjkq wpzt hhhhh lkjh qwer zalo 0912345678',
        price: 2n * MILLION,
      }).toSorted(),
    ).toEqual(['abnormal_price', 'gibberish', 'off_platform_contact']);
  });
});
