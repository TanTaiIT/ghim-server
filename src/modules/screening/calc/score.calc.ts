import type { BannedPhraseLevel, ScreeningBand, ScreeningRuleKind } from '@prisma/client';

import type { RuleMode } from './phrase.calc.js';
import { isGate, isRuleCode, type RuleCode } from '../screening.rules.js';

export interface RuleSetting {
  weight: number;
  mode: RuleMode;
}

export type BandThresholds = {
  mediumFrom: number;
  highFrom: number;
};

/** Một phiên bản luật đã nạp: luật chung, ghi đè theo danh mục, ngưỡng dải theo danh mục (design mục 4). */
export interface RuleBook {
  version: number;
  rules: ReadonlyMap<RuleCode, RuleSetting>;
  overrides: Readonly<Record<string, Partial<Record<RuleCode, Partial<RuleSetting>>>>>;
  bands: Readonly<Record<string, BandThresholds>>;
  defaultBands: BandThresholds;
}

/** Ảnh chụp một phiên bản luật (design mục 4): đủ để chấm lại đúng như lúc đó, không đọc bảng nào khác. */
export type RuleSnapshot = {
  rules: { code: string; kind: ScreeningRuleKind; weight: number; mode: RuleMode }[];
  overrides: { code: string; categoryId: string; weight: number | null; mode: RuleMode | null }[];
  bands: { categoryId: string; mediumFrom: number; highFrom: number }[];
  /** Chỉ cụm đang bật hay chạy thử — cụm tắt không so. */
  phrases: {
    id: string;
    text: string;
    level: BannedPhraseLevel;
    mode: RuleMode;
    exceptions: string[];
  }[];
};

/** Mã luật mà code đang chạy không còn biết (ảnh chụp cũ hơn code) thì bỏ qua. */
export function ruleBookOf(
  version: number,
  snapshot: RuleSnapshot,
  defaultBands: BandThresholds,
): RuleBook {
  const rules = new Map<RuleCode, RuleSetting>();
  for (const row of snapshot.rules) {
    if (isRuleCode(row.code)) rules.set(row.code, { weight: row.weight, mode: row.mode });
  }
  const overrides: Record<string, Partial<Record<RuleCode, Partial<RuleSetting>>>> = {};
  for (const row of snapshot.overrides) {
    if (!isRuleCode(row.code)) continue;
    overrides[row.categoryId] = {
      ...overrides[row.categoryId],
      [row.code]: {
        ...(row.weight === null ? {} : { weight: row.weight }),
        ...(row.mode === null ? {} : { mode: row.mode }),
      },
    };
  }
  const bands = Object.fromEntries(
    snapshot.bands.map((row) => [
      row.categoryId,
      { mediumFrom: row.mediumFrom, highFrom: row.highFrom },
    ]),
  );
  return { version, rules, overrides, bands, defaultBands };
}

/**
 * Một chỗ trúng trước khi áp luật. `trial` = chính cụm từ đang chạy thử; `refs` = cụm, ảnh, tin cũ cho hỗ trợ tra.
 * `type` chứ không `interface`: nằm trong cột jsonb, phải gán được cho kiểu JSON của Prisma.
 */
export type RawHit = {
  code: RuleCode;
  trial?: boolean;
  refs?: readonly string[];
};

/** Dòng của `screening_runs.hits`. */
export type AppliedHit = {
  code: RuleCode;
  weight: number;
  mode: Exclude<RuleMode, 'off'>;
  refs?: string[];
};

/** Luật có trong mã mà chưa có dòng — chỉ ghi, không đổi kết quả, như mọi luật mới (spec rule-management). */
const UNSEEDED: RuleSetting = { weight: 0, mode: 'trial' };

/** Ghi đè của danh mục trước, giá trị chung sau (spec rule-management). */
export function ruleFor(book: RuleBook, code: RuleCode, categoryId: string | null): RuleSetting {
  const base = book.rules.get(code) ?? UNSEEDED;
  const override = categoryId ? book.overrides[categoryId]?.[code] : undefined;
  return { weight: override?.weight ?? base.weight, mode: override?.mode ?? base.mode };
}

/**
 * Áp chế độ của luật: tắt thì bỏ hẳn, chạy thử thì ghi mà không tính (design mục 6). Gộp theo (mã, chế độ) nên nhiều
 * cụm mơ hồ chỉ thành một dòng cộng một lần (câu 6), mà `refs` vẫn giữ mọi cụm đã trúng.
 */
export function applyRules(
  raw: readonly RawHit[],
  book: RuleBook,
  categoryId: string | null,
): AppliedHit[] {
  const applied = new Map<string, AppliedHit>();
  for (const hit of raw) {
    const rule = ruleFor(book, hit.code, categoryId);
    if (rule.mode === 'off') continue;
    const mode = rule.mode === 'trial' || hit.trial ? 'trial' : 'on';
    const key = `${hit.code}:${mode}`;
    const refs = [...(applied.get(key)?.refs ?? []), ...(hit.refs ?? [])];
    applied.set(key, {
      code: hit.code,
      weight: rule.weight,
      mode,
      ...(refs.length > 0 ? { refs: [...new Set(refs)] } : {}),
    });
  }
  return [...applied.values()];
}

/** Điểm = tổng trọng số các dấu hiệu đang bật đã trúng; cổng cứng không có điểm, chạy thử không cộng. */
export function scoreOf(hits: readonly AppliedHit[]): number {
  return hits
    .filter((hit) => hit.mode === 'on' && !isGate(hit.code))
    .reduce((sum, hit) => sum + hit.weight, 0);
}

export function bandOf(score: number, book: RuleBook, categoryId: string | null): ScreeningBand {
  const { mediumFrom, highFrom } =
    (categoryId ? book.bands[categoryId] : undefined) ?? book.defaultBands;
  if (score >= highFrom) return 'high';
  return score >= mediumFrom ? 'medium' : 'low';
}
