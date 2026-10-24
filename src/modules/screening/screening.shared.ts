import type { ListingPlacement, ScreeningRun, TrustTier } from '@prisma/client';

import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { TooManyRequestsError } from '../../common/errors/app-error.js';
import type { Jobs } from '../../lib/jobs.js';
import type { CategoryService } from '../category/category.service.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { ListingFactsService, ScreeningSubmission } from '../listing/listing.ports.js';
import type { MediaService } from '../media/media.service.js';
import { buildPhraseMatcher, type PhraseMatcher } from './calc/phrase.calc.js';
import type { QualityLimits } from './calc/quality.calc.js';
import type { BandThresholds, RawHit, RuleSnapshot } from './calc/score.calc.js';
import { cooldownSentence } from './screening.outbox.js';
import { INITIAL_RULES } from './screening.rules.js';
import type { ScreeningRepository, Tx } from './screening.repository.js';
import type { SignalLimits } from './calc/signals.calc.js';

// ── CỔNG ─────────────────────────────────────────────────────────────────────────────────────────

/** Dữ kiện tin qua cổng của `listing` (design mục 12) — `screening` không đọc bảng `listings`. */
export type ScreeningListingPort = Pick<
  ListingFactsService,
  'ownTexts' | 'countSubmissions' | 'priceSamples' | 'liveListings'
>;
export type ScreeningCategoryPort = Pick<
  CategoryService,
  'settingsOf' | 'listAdmin' | 'existingIds'
>;
export type ScreeningIdentityPort = Pick<
  IdentityService,
  'accountSummaries' | 'deviceFlagsFor' | 'openFlagsOf'
>;
export type ScreeningMediaPort = Pick<MediaService, 'readImage'>;
export interface ScreeningTrustPort {
  tierOf(accountId: string): Promise<TrustTier>;
  /** Điểm gậy đang hiệu lực — hàng "có gậy" của ma trận (add-strikes). */
  strikePointsOf(accountId: string): Promise<number>;
}

/** Số đo một ảnh: dHash để so trùng, cỡ sau khi xoay theo EXIF, độ nét và độ sáng để so ngưỡng chất lượng. */
export interface ImageMeasure {
  dhash: bigint;
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
}

/**
 * Đo ảnh sau cổng (design mục 3, add-image-quality-checks mục 1): `sharp` ở app thật — đổi sang pHash hay đổi phép đo
 * về sau không sửa luật. Ném khi tệp không giải mã được.
 */
export interface ImageInspector {
  inspect(bytes: Uint8Array): Promise<ImageMeasure>;
}

export interface ScreeningServiceDeps {
  repository: ScreeningRepository;
  listings: ScreeningListingPort;
  categories: ScreeningCategoryPort;
  identity: ScreeningIdentityPort;
  media: ScreeningMediaPort;
  trust: ScreeningTrustPort;
  inspector: ImageInspector;
  jobs: Jobs;
  config: RuntimeConfig;
  clock: () => Date;
}

// ── KẾT QUẢ CHỮ ──────────────────────────────────────────────────────────────────────────────────

/**
 * `screening_runs.text_result`: kết quả chấm chữ cùng mọi con số của phiên bản bảng đã đọc lúc chấm — kết luận lúc ảnh
 * về vẫn theo đúng các số này (design mục 5). `recall` = lượt rút về khi bật cụm, kết luận ngay lúc tạo.
 */
export type TextResult =
  | {
      status: 'ok';
      configVersion: number;
      ruleVersion: number;
      categoryId: string;
      placement: ListingPlacement;
      tier: TrustTier;
      hits: RawHit[];
      alwaysManual: boolean;
      /** Người bán đang có gậy lúc chấm — hàng "có gậy" của ma trận (add-strikes). */
      struck: boolean;
      /** Đánh dấu luôn giữ theo thiết bị — chỉ loại, không dấu thiết bị (luật 21). */
      deviceFlags: string[];
      rankAsListingId: string | null;
      bands: BandThresholds;
      imageMaxDistance: number;
      /** Trống ở lượt mở trước add-image-quality-checks: lượt đó không xét chất lượng ảnh. */
      imageQuality?: QualityLimits;
    }
  | {
      status: 'error';
      configVersion: number;
      ruleVersion: number;
      categoryId: string;
      placement: ListingPlacement;
    }
  | { status: 'recall'; configVersion: number; ruleVersion: number };

/** Kết quả chấm `listing` chuyển từ `scoreText` sang `openRun` của cùng lượt gửi. */
export interface TextScore {
  submission: ScreeningSubmission;
  startedAt: Date;
  result: TextResult;
}

// Cột do chính `screening` ghi lúc mở lượt, không nhận từ client.
export const textResultOf = (run: Pick<ScreeningRun, 'textResult'>): TextResult =>
  run.textResult as TextResult;

// ── BỘ LUẬT ──────────────────────────────────────────────────────────────────────────────────────

export interface LoadedRules {
  version: number;
  snapshot: RuleSnapshot;
  matcher: PhraseMatcher;
}

/** Phiên bản 0: chưa khởi tạo (test không chạy bước khởi động) — luật đúng TK 14, không cụm, không ghi đè. */
const UNSEEDED: RuleSnapshot = {
  rules: INITIAL_RULES.map((rule) => ({ ...rule, mode: rule.mode ?? 'on' })),
  overrides: [],
  bands: [],
  phrases: [],
};

/** Đủ cho phiên bản hiện hành và vài phiên bản cũ của lượt đang chờ ảnh lúc master vừa đổi luật. */
const RULE_CACHE_SIZE = 8;

/**
 * Bộ luật trong bộ nhớ theo phiên bản (design mục 7): mỗi lượt chấm đọc số phiên bản hiện hành (khoá chính), dựng lại bộ
 * so cụm chỉ khi số đổi — đổi luật có hiệu lực ngay ở lượt kế tiếp, kể cả từ tiến trình khác.
 */
export function createRuleSource(repository: ScreeningRepository) {
  const loaded = new Map<number, LoadedRules>();

  const remember = (version: number, snapshot: RuleSnapshot): LoadedRules => {
    const rules = { version, snapshot, matcher: buildPhraseMatcher(snapshot.phrases) };
    loaded.set(version, rules);
    const oldest = loaded.keys().next().value;
    if (loaded.size > RULE_CACHE_SIZE && oldest !== undefined) loaded.delete(oldest);
    return rules;
  };

  /** Đúng phiên bản lượt đã đọc lúc chấm chữ — kết luận lúc ảnh về không đổi luật giữa chừng (design mục 5). */
  const at = async (version: number, tx?: Tx): Promise<LoadedRules> => {
    const cached = loaded.get(version);
    if (cached) return cached;
    if (version === 0) return remember(0, UNSEEDED);
    const row = await repository.ruleVersion(version, tx);
    if (!row) throw new Error(`Không có phiên bản luật ${version}`);
    return remember(version, row.snapshot);
  };

  return {
    at,
    current: async (): Promise<LoadedRules> => at((await repository.ruleVersionNumber()) ?? 0),
  };
}

export type RuleSource = ReturnType<typeof createRuleSource>;

// ── CON SỐ ───────────────────────────────────────────────────────────────────────────────────────

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

export const bandThresholds = (config: RuntimeConfig): BandThresholds => ({
  mediumFrom: config.get('screening.mediumBandFrom'),
  highFrom: config.get('screening.highBandFrom'),
});

export const qualityLimits = (config: RuntimeConfig): QualityLimits => ({
  minShortSide: config.get('screening.imageMinShortSide'),
  minSharpness: config.get('screening.imageMinSharpness'),
  minBrightness: config.get('screening.imageMinBrightness'),
  maxBrightness: config.get('screening.imageMaxBrightness'),
});

export const signalLimits = (config: RuntimeConfig): SignalLimits => ({
  newAccountDays: config.get('screening.newAccountDays'),
  abnormalPriceMinSamples: config.get('screening.abnormalPriceMinSamples'),
  highValueReferencePriceFrom: config.get('screening.highValueReferencePriceFrom'),
  burst: {
    lowTiers: config.get('screening.burstSubmitsPerDayWarn'),
    highTiers: config.get('screening.burstSubmitsPerDayHold'),
  },
  heldManyCount: config.get('screening.heldManyCount'),
});

// ── LỖI ──────────────────────────────────────────────────────────────────────────────────────────

export const submissionCooldown = (until: Date): TooManyRequestsError =>
  new TooManyRequestsError(cooldownSentence(until), 'SUBMISSION_COOLDOWN', {
    retryAt: until.toISOString(),
  });

/** Mã tra cứu của máy duyệt: cùng bộ chữ với mã đánh dấu của `identity`, tiền tố riêng để hỗ trợ biết tra ở đâu. */
export const LOOKUP_PREFIX = 'S';

export function createScreeningShared(deps: ScreeningServiceDeps) {
  return { ...deps, rules: createRuleSource(deps.repository) };
}

export type ScreeningShared = ReturnType<typeof createScreeningShared>;
