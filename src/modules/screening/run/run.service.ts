import type { ListingSubmissionKind } from '@prisma/client';

import { logger } from '../../../lib/logger.js';
import type { ScreeningSubmission } from '../../listing/listing.ports.js';
import { HELD_MANY_CAUSES } from '../calc/decide.calc.js';
import type { Tx } from '../screening.repository.js';
import {
  bandThresholds,
  DAY_MS,
  type LoadedRules,
  type ScreeningShared,
  signalLimits,
  type TextResult,
  type TextScore,
  submissionCooldown,
} from '../screening.shared.js';
import { type CategoryFacts, collectHits, guessCategory } from '../calc/signals.calc.js';
import type { Conclusion } from './conclusion.js';

/** Thời gian chờ chỉ chặn tin mới — gửi nháp lần đầu và chuyển tin lên sàn (câu 2); sửa, gia hạn vẫn làm được. */
const NEW_LISTING_KINDS: ReadonlySet<ListingSubmissionKind> = new Set(['submit', 'move']);

export interface ScreeningRunService {
  precheck(accountId: string, kind: ListingSubmissionKind): Promise<void>;
  scoreText(input: ScreeningSubmission): Promise<TextScore>;
  openRun(tx: Tx, input: { listingId: string; version: number; score: TextScore }): Promise<void>;
}

/** Quá trần thì ném, việc đang chạy cứ chạy nốt — kết quả của nó không còn ai đọc. */
const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chấm chữ quá ${ms} ms`)), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/**
 * Ba lời gọi đồng bộ của lượt gửi (design mục 1). Chấm chữ chỉ đọc và không bao giờ ném: lỗi hay quá trần thành kết quả
 * `error`, tin vẫn được nhận và giữ cho người (spec machine-decision).
 */
export function createRunService(
  shared: ScreeningShared,
  conclusion: Conclusion,
): ScreeningRunService {
  const { repository, listings, categories, identity, trust, config, clock } = shared;

  const categoryFacts = async (categoryId: string): Promise<CategoryFacts> => {
    const [settings, priceRange] = await Promise.all([
      categories.settingsOf(categoryId),
      repository.priceStatOf(categoryId),
    ]);
    return {
      id: categoryId,
      riskLevel: settings.riskLevel,
      alwaysManual: settings.alwaysManual,
      priceCap: settings.priceCap,
      referencePrice: settings.referencePrice,
      priceRange,
    };
  };

  const score = async (
    input: ScreeningSubmission,
    rules: LoadedRules,
    now: Date,
    configVersion: number,
  ): Promise<TextResult> => {
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const [tier, summaries, device, category, keywords, recentOwn, submissions, heldCount, points] =
      await Promise.all([
        trust.tierOf(input.accountId),
        identity.accountSummaries([input.accountId]),
        identity.deviceFlagsFor(input.accountId, input.deviceHash, now),
        categoryFacts(input.categoryId),
        repository.keywords(),
        listings.ownTexts({
          accountId: input.accountId,
          since: daysAgo(config.get('screening.ownDuplicateDays')),
          excludeId: input.listingId,
        }),
        listings.countSubmissions(input.accountId, daysAgo(1)),
        repository.countHolds(
          input.accountId,
          daysAgo(config.get('screening.heldManyDays')),
          HELD_MANY_CAUSES,
        ),
        trust.strikePointsOf(input.accountId),
      ]);
    const guessedId = guessCategory(input.title, keywords, input.categoryId);
    const text = `${input.title}\n${input.description ?? ''}`;
    const collected = collectHits(
      {
        title: input.title,
        description: input.description,
        price: input.price,
        category,
        guessedCategory: guessedId ? await categoryFacts(guessedId) : null,
        phraseHits: rules.matcher.match(text),
        tier,
        accountCreatedAt: summaries.get(input.accountId)?.createdAt ?? now,
        now,
        submissionsIncludingThis: submissions + 1,
        recentOwn,
        heldCount,
        sharedDeviceLocked: device.sharedWithLocked,
        sharedDeviceStruck: device.sharedWithStruck,
      },
      signalLimits(config),
    );
    return {
      status: 'ok',
      configVersion,
      ruleVersion: rules.version,
      categoryId: input.categoryId,
      placement: input.placement,
      tier,
      hits: collected.hits,
      alwaysManual: collected.alwaysManual,
      struck: points > 0,
      deviceFlags: device.kinds,
      rankAsListingId: collected.rankAsListingId,
      bands: bandThresholds(config),
      imageMaxDistance: config.get('screening.imageDuplicateMaxDistance'),
    };
  };

  return {
    async precheck(accountId, kind) {
      if (!NEW_LISTING_KINDS.has(kind)) return;
      const until = await repository.activeCooldown(accountId, clock());
      if (until) throw submissionCooldown(until);
    },

    async scoreText(input) {
      const startedAt = clock();
      const configVersion = config.version();
      let ruleVersion = 0;
      try {
        const rules = await shared.rules.current();
        ruleVersion = rules.version;
        const result = await withTimeout(
          score(input, rules, startedAt, configVersion),
          config.get('screening.textScoreTimeoutMs'),
        );
        return { submission: input, startedAt, result };
      } catch (error) {
        logger.warn(
          { err: error, listingId: input.listingId },
          'screening: chấm chữ lỗi, giữ cho người',
        );
        return {
          submission: input,
          startedAt,
          result: {
            status: 'error',
            configVersion,
            ruleVersion,
            categoryId: input.categoryId,
            placement: input.placement,
          },
        };
      }
    },

    async openRun(tx, { listingId, version, score: scored }) {
      const run = await repository.openRun(tx, {
        listingId,
        listingVersion: version,
        accountId: scored.submission.accountId,
        trigger: 'submission',
        startedAt: scored.startedAt,
        textResult: scored.result,
        imageIds: scored.submission.imageIds,
        configVersion: scored.result.configVersion,
        ruleVersion: scored.result.ruleVersion,
      });
      // Ảnh lỗi tạm của lượt trước được kiểm lại: lượt này chờ kết quả mới thay vì giữ ngay (T21).
      await repository.retryTransient(tx, run.imageIds);
      await conclusion.conclude(tx, run);
    },
  };
}
