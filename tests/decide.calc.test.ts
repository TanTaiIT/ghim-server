import type { ListingPlacement, TrustTier } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { conclude, decide, HELD_MANY_CAUSES } from '../src/modules/screening/calc/decide.calc.js';
import type { RawHit, RuleBook } from '../src/modules/screening/calc/score.calc.js';
import type { RuleCode } from '../src/modules/screening/screening.rules.js';
import { initialBook } from './screening-book.js';

/* Spec screening/machine-decision, hard-gates, risk-scoring (ma trận) — phần thuần (design add-screening mục 5). */
const run = (
  codes: (RuleCode | RawHit)[],
  options: {
    tier?: TrustTier;
    placement?: ListingPlacement;
    failure?: 'error' | 'timeout';
    alwaysManual?: boolean;
    deviceFlagged?: boolean;
    struck?: boolean;
    book?: RuleBook;
    imageIds?: string[];
  } = {},
) =>
  conclude({
    raw: codes.map((code) => (typeof code === 'string' ? { code } : code)),
    book: options.book ?? initialBook(),
    categoryId: 'phones',
    failure: options.failure ?? null,
    alwaysManual: options.alwaysManual ?? false,
    deviceFlagged: options.deviceFlagged ?? false,
    struck: options.struck ?? false,
    tier: options.tier ?? 'T2',
    placement: options.placement ?? 'marketplace',
    imageIds: options.imageIds ?? [],
  });
const outcomeOf = (...args: Parameters<typeof run>) => {
  const { outcome, cause, restrictMachine } = run(...args);
  return { outcome, cause, restrictMachine };
};

// Điểm dựng từ trọng số TK 14: 20 = liên hệ ngoài sàn; 45 = giá bất thường + liên hệ ngoài sàn; 60 = gõ bừa + giá 0
// giá trị cao; 75 = giá bất thường + gõ bừa + liên hệ ngoài sàn.
const SCORE_20: RuleCode[] = ['off_platform_contact'];
const SCORE_45: RuleCode[] = ['abnormal_price', 'off_platform_contact'];
const SCORE_60: RuleCode[] = ['gibberish', 'zero_price_high_value'];
const SCORE_75: RuleCode[] = ['abnormal_price', 'gibberish', 'off_platform_contact'];

const FULL = { outcome: 'pass_full', cause: 'score', restrictMachine: false };
const LIMITED = { outcome: 'pass_limited', cause: 'score', restrictMachine: false };
const LIMITED_MACHINE = { outcome: 'pass_limited', cause: 'score', restrictMachine: true };
const HOLD_SCORE = { outcome: 'hold', cause: 'score', restrictMachine: false };

describe('Máy chỉ có ba kết quả', () => {
  it('T2 không trúng gì: hiện đầy đủ', () => {
    expect(outcomeOf([])).toEqual(FULL);
  });

  it('T2 điểm 75: giữ cho người', () => {
    expect(run(SCORE_75)).toMatchObject({ ...HOLD_SCORE, score: 75, band: 'high' });
  });

  it('kết quả ghi luật đã trúng, điểm, dải: T1 giá bất thường + liên hệ ngoài sàn = 45, Vừa', () => {
    const verdict = run(SCORE_45, { tier: 'T1' });
    expect(verdict).toMatchObject({ score: 45, band: 'medium' });
    expect(verdict.hits.map((hit) => hit.code)).toEqual(SCORE_45);
  });
});

describe('Thứ tự kết luận', () => {
  it('lỗi khi chấm chữ hay kiểm ảnh: giữ, kể cả không trúng gì', () => {
    expect(outcomeOf([], { failure: 'error' })).toEqual({
      outcome: 'hold',
      cause: 'error',
      restrictMachine: false,
    });
  });

  it('quá hạn chờ ảnh: giữ vì quá giờ, vẫn chấm đủ chữ', () => {
    expect(run(SCORE_20, { tier: 'T3', failure: 'timeout' })).toMatchObject({
      outcome: 'hold',
      cause: 'timeout',
      score: 20,
    });
  });

  it('chấm chữ lỗi, không có mức: giữ', () => {
    expect(
      decide({
        failure: 'error',
        hits: [],
        alwaysManual: false,
        deviceFlagged: false,
        struck: false,
        band: 'low',
        tier: null,
        placement: 'members_only',
      }),
    ).toMatchObject({ outcome: 'hold', cause: 'error' });
  });

  it('lỗi đứng trước cổng cứng; cổng cứng đứng trước luôn duyệt tay và đánh dấu thiết bị', () => {
    expect(run(['certain_phrase'], { failure: 'error' }).cause).toBe('error');
    expect(run(['certain_phrase'], { alwaysManual: true, deviceFlagged: true }).cause).toBe('gate');
    expect(run([], { alwaysManual: true, deviceFlagged: true }).cause).toBe('always_manual');
  });

  it('cụm từ cấm mức chắc trong tin "chỉ thành viên" của T2: giữ vì cổng cứng', () => {
    expect(outcomeOf(['certain_phrase'], { placement: 'members_only' })).toEqual({
      outcome: 'hold',
      cause: 'gate',
      restrictMachine: false,
    });
  });

  it('T3 dùng ảnh của người khác, giá vượt trần: giữ vì cổng cứng', () => {
    expect(run(['duplicate_image'], { tier: 'T3' }).cause).toBe('gate');
    expect(run(['price_over_cap'], { tier: 'T3' }).cause).toBe('gate');
  });

  it('cổng "ảnh trùng" chạy thử: T2 hiện đầy đủ, lượt trúng ghi ở chế độ chạy thử', () => {
    const verdict = run(['duplicate_image'], {
      book: initialBook({ duplicate_image: { mode: 'trial' } }),
    });
    expect(verdict).toMatchObject(FULL);
    expect(verdict.hits).toEqual([{ code: 'duplicate_image', weight: 0, mode: 'trial' }]);
  });

  it('cụm mức chắc đang chạy thử: không giữ', () => {
    expect(run([{ code: 'certain_phrase', trial: true, refs: ['p1'] }])).toMatchObject(FULL);
  });

  it('danh mục luôn duyệt tay, T3: giữ; vẫn chấm đủ — số Zalo ghi "liên hệ ngoài sàn" và điểm 20', () => {
    const verdict = run(SCORE_20, { tier: 'T3', alwaysManual: true });
    expect(verdict).toMatchObject({ outcome: 'hold', cause: 'always_manual', score: 20 });
    expect(verdict.hits.map((hit) => hit.code)).toEqual(['off_platform_contact']);
  });

  it('đánh dấu theo thiết bị, kể cả "chỉ thành viên": giữ', () => {
    expect(run([], { deviceFlagged: true, placement: 'members_only' })).toMatchObject({
      outcome: 'hold',
      cause: 'device',
    });
  });
});

describe('Ma trận T0', () => {
  it('sàn chung điểm 0: hạn chế, không mang lý do "máy"', () => {
    expect(outcomeOf([], { tier: 'T0' })).toEqual(LIMITED);
  });

  it('nhóm công khai điểm 20: hạn chế', () => {
    expect(outcomeOf(SCORE_20, { tier: 'T0', placement: 'group_public' })).toEqual(LIMITED);
  });

  it('"chỉ thành viên" điểm 0: hiện đầy đủ', () => {
    expect(outcomeOf([], { tier: 'T0', placement: 'members_only' })).toEqual(FULL);
  });

  it('tài khoản 2 ngày tuổi ghi số Zalo: 30, dải Vừa, giữ', () => {
    expect(run(['new_account', 'off_platform_contact'], { tier: 'T0' })).toMatchObject({
      ...HOLD_SCORE,
      score: 30,
      band: 'medium',
    });
  });
});

describe('Ma trận T1', () => {
  it('điểm 20: hiện đầy đủ', () => {
    expect(outcomeOf(SCORE_20, { tier: 'T1' })).toEqual(FULL);
  });

  it('điểm 45: hạn chế kèm lý do "máy"', () => {
    expect(outcomeOf(SCORE_45, { tier: 'T1' })).toEqual(LIMITED_MACHINE);
  });

  it('iPhone 15 giá 2 triệu, gõ bừa, số Zalo: 75, dải Cao, giữ', () => {
    expect(run(SCORE_75, { tier: 'T1' })).toMatchObject({ ...HOLD_SCORE, score: 75, band: 'high' });
  });

  it('Đồng hồ rủi ro cao + số Zalo: 40, dải Vừa, hạn chế kèm "máy"', () => {
    expect(run(['high_risk_category', 'off_platform_contact'], { tier: 'T1' })).toMatchObject({
      ...LIMITED_MACHINE,
      score: 40,
      band: 'medium',
    });
  });
});

describe('Ma trận T2, T3', () => {
  it('T2 điểm 45: hiện đầy đủ, không mang lý do "máy"', () => {
    expect(outcomeOf(SCORE_45)).toEqual(FULL);
  });

  it('T3 điểm 60: giữ', () => {
    expect(outcomeOf(SCORE_60, { tier: 'T3' })).toEqual(HOLD_SCORE);
  });

  it('T2 vào danh mục rủi ro cao: 20, Thấp, hiện đầy đủ', () => {
    expect(run(['high_risk_category'])).toMatchObject({ ...FULL, score: 20, band: 'low' });
  });

  it('T2 suy ra danh mục rủi ro cao: sai danh mục 15 + rủi ro cao 20 = 35, Vừa', () => {
    expect(run(['wrong_category', 'high_risk_category'])).toMatchObject({
      ...FULL,
      score: 35,
      band: 'medium',
    });
  });
});

describe('Hàng "có gậy" của ma trận (add-strikes)', () => {
  it('T1 có gậy, dải Thấp: qua hạn chế mà không đặt lý do "máy" — `listing` đặt lý do "gậy"', () => {
    expect(outcomeOf(SCORE_20, { tier: 'T1', struck: true })).toEqual(LIMITED);
  });

  it('T1 có gậy, dải Vừa: giữ cho người — cùng tin của T1 không gậy thì qua hạn chế', () => {
    expect(outcomeOf(SCORE_45, { tier: 'T1', struck: true })).toEqual(HOLD_SCORE);
    expect(outcomeOf(SCORE_45, { tier: 'T1' })).toEqual(LIMITED_MACHINE);
  });

  it('T0 có gậy vào nhóm chỉ thành viên, dải Thấp: qua hạn chế, không đầy đủ', () => {
    expect(outcomeOf([], { tier: 'T0', struck: true, placement: 'members_only' })).toEqual(LIMITED);
  });

  it('luôn giữ cho người vẫn giữ: dấu thiết bị', () => {
    expect(outcomeOf([], { tier: 'T1', struck: true, deviceFlagged: true }).outcome).toBe('hold');
  });
});

describe('decide trực tiếp', () => {
  it('cổng cứng chạy thử truyền vào không giữ', () => {
    expect(
      decide({
        failure: null,
        hits: [{ code: 'price_over_cap', weight: 0, mode: 'trial' }],
        alwaysManual: false,
        deviceFlagged: false,
        struck: false,
        band: 'low',
        tier: 'T2',
        placement: 'marketplace',
      }),
    ).toEqual(FULL);
  });

  it('chỉ giữ vì điểm hay cổng cứng mới đếm vào "bị giữ nhiều"', () => {
    expect(HELD_MANY_CAUSES).toEqual(['score', 'gate']);
  });
});
