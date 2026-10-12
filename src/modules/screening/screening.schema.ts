import { z } from 'zod';

import { ACCOUNT_FLAG_KINDS } from '../identity/identity.schema.js';
import { RULE_CODES } from './screening.rules.js';

/** Tuple của các enum `screening` — đổi enum thì đổi luôn ở đây (CLAUDE.md luật 5). */
export const RULE_MODES = ['on', 'trial', 'off'] as const;
export const PHRASE_LEVELS = ['certain', 'ambiguous'] as const;
const OUTCOMES = ['pass_full', 'pass_limited', 'hold'] as const;
const CAUSES = ['score', 'gate', 'always_manual', 'device', 'error', 'timeout'] as const;
const BANDS = ['low', 'medium', 'high'] as const;
const TIERS = ['T0', 'T1', 'T2', 'T3'] as const;

/** Trần trọng số một luật: một dấu hiệu tự nó đã đủ đẩy tin lên dải Cao. */
const WEIGHT_MAX = 100;
const PHRASE_MAX = 200;
const EXCEPTIONS_MAX = 50;
const KEYWORD_MAX = 60;
const KEYWORDS_MAX = 200;

const iso = z.iso.datetime();
const weight = z.number().int().min(0).max(WEIGHT_MAX);
const phraseText = z.string().trim().min(1).max(PHRASE_MAX);

// ── LUẬT ─────────────────────────────────────────────────────────────────────────────────────────

export const ruleParamsSchema = z.object({ code: z.string().min(1).max(64) });
export const ruleCategoryParamsSchema = ruleParamsSchema.extend({ categoryId: z.uuid() });
export const categoryParamsSchema = z.object({ categoryId: z.uuid() });

/** Đổi trọng số hay chế độ — ít nhất một trong hai; bỏ trống cả hai là 400 (spec rule-management). */
export const ruleChangeBodySchema = z
  .object({ weight: weight.optional(), mode: z.enum(RULE_MODES).optional() })
  .strict()
  .refine((body) => body.weight !== undefined || body.mode !== undefined, {
    message: 'Cần trọng số hoặc chế độ',
  });

export const bandsBodySchema = z
  .object({
    mediumFrom: z
      .number()
      .int()
      .min(1)
      .max(WEIGHT_MAX * 10),
    highFrom: z
      .number()
      .int()
      .min(1)
      .max(WEIGHT_MAX * 10),
  })
  .strict()
  .refine((body) => body.mediumFrom < body.highFrom, {
    message: 'Ngưỡng dải Vừa phải thấp hơn ngưỡng dải Cao',
    path: ['mediumFrom'],
  });

const ruleSchema = z.object({
  code: z.enum(RULE_CODES),
  label: z.string(),
  kind: z.enum(['signal', 'gate']),
  weight: z.number().int(),
  mode: z.enum(RULE_MODES),
});

export const rulesSchema = z.object({
  version: z.number().int(),
  rules: z.array(ruleSchema),
  overrides: z.array(
    z.object({
      code: z.enum(RULE_CODES),
      categoryId: z.uuid(),
      weight: z.number().int().nullable(),
      mode: z.enum(RULE_MODES).nullable(),
    }),
  ),
  bands: z.array(
    z.object({ categoryId: z.uuid(), mediumFrom: z.number().int(), highFrom: z.number().int() }),
  ),
  defaultBands: z.object({ mediumFrom: z.number().int(), highFrom: z.number().int() }),
});

// ── CỤM TỪ CẤM ───────────────────────────────────────────────────────────────────────────────────

export const phraseParamsSchema = z.object({ id: z.uuid() });

export const createPhraseBodySchema = z
  .object({
    text: phraseText,
    level: z.enum(PHRASE_LEVELS),
    exceptions: z.array(phraseText).max(EXCEPTIONS_MAX).default([]),
  })
  .strict();

export const patchPhraseBodySchema = z
  .object({
    level: z.enum(PHRASE_LEVELS).optional(),
    exceptions: z.array(phraseText).max(EXCEPTIONS_MAX).optional(),
  })
  .strict()
  .refine((body) => body.level !== undefined || body.exceptions !== undefined, {
    message: 'Cần mức hoặc danh sách ngoại lệ',
  });

/** Bật thật trước khi đủ ngày chạy thử thì bắt buộc lý do (câu 5) — service kiểm, vì schema không biết ngày. */
export const activatePhraseBodySchema = z
  .object({ reason: z.string().trim().min(1).max(500).optional() })
  .strict()
  .default({});

export const phraseSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  level: z.enum(PHRASE_LEVELS),
  mode: z.enum(RULE_MODES),
  exceptions: z.array(z.string()),
  trialEndsAt: iso.nullable(),
  activatedAt: iso.nullable(),
  activationReason: z.string().nullable(),
  createdAt: iso,
});

// ── DANH SÁCH TRẮNG, TỪ KHOÁ ─────────────────────────────────────────────────────────────────────

export const whitelistBodySchema = z
  .object({ imageId: z.string().trim().min(1).max(2048) })
  .strict();
export const whitelistParamsSchema = z.object({ id: z.uuid() });
export const whitelistEntrySchema = z.object({
  id: z.uuid(),
  sourceImageId: z.uuid(),
  addedBy: z.uuid(),
  addedAt: iso,
});

export const keywordsBodySchema = z
  .object({ keywords: z.array(z.string().trim().min(1).max(KEYWORD_MAX)).max(KEYWORDS_MAX) })
  .strict();
export const keywordsSchema = z.object({ categoryId: z.uuid(), keywords: z.array(z.string()) });

// ── TRA MÃ ───────────────────────────────────────────────────────────────────────────────────────

export const lookupParamsSchema = z.object({ code: z.string().trim().min(1).max(32) });

/**
 * Lý do cụ thể cho hỗ trợ (spec explanations): luật, cụm, ảnh đã trúng và loại đánh dấu theo thiết bị kèm mã đánh dấu để
 * gỡ qua `identity` — không có dấu thiết bị (luật 21).
 */
export const lookupSchema = z.object({
  lookupCode: z.string(),
  listingId: z.uuid(),
  listingVersion: z.number().int(),
  accountId: z.uuid(),
  trigger: z.enum(['submission', 'recall']),
  decidedAt: iso,
  outcome: z.enum(OUTCOMES),
  cause: z.enum(CAUSES),
  score: z.number().int().nullable(),
  band: z.enum(BANDS).nullable(),
  tier: z.enum(TIERS).nullable(),
  ruleVersion: z.number().int(),
  configVersion: z.number().int(),
  hits: z.array(
    z.object({
      code: z.enum(RULE_CODES),
      label: z.string(),
      weight: z.number().int(),
      mode: z.enum(['on', 'trial']),
      refs: z.array(z.string()),
      phrases: z.array(z.object({ id: z.uuid(), text: z.string() })),
    }),
  ),
  deviceFlags: z.array(
    z.object({
      kind: z.enum(ACCOUNT_FLAG_KINDS),
      label: z.string(),
      /** Mã đánh dấu đang mở của `identity` — hỗ trợ gỡ qua `POST /ops/flags/:lookupCode/clear`. */
      flagLookupCode: z.string().nullable(),
    }),
  ),
});

export type RulesDto = z.infer<typeof rulesSchema>;
export type PhraseDto = z.infer<typeof phraseSchema>;
export type WhitelistEntryDto = z.infer<typeof whitelistEntrySchema>;
export type KeywordsDto = z.infer<typeof keywordsSchema>;
export type LookupDto = z.infer<typeof lookupSchema>;
export type RuleChangeBody = z.infer<typeof ruleChangeBodySchema>;
export type BandsBody = z.infer<typeof bandsBodySchema>;
export type CreatePhraseBody = z.infer<typeof createPhraseBodySchema>;
export type PatchPhraseBody = z.infer<typeof patchPhraseBodySchema>;
