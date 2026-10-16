import type { ImageCheck, ScreeningRun } from '@prisma/client';

import { generateLookupCode } from '../../../common/crypto/lookup-code.js';
import { logger } from '../../../lib/logger.js';
import { sequentially } from '../../../common/utils/sequential.js';
import type { LiveListingFacts } from '../../listing/listing.ports.js';
import { bandsOf, hamming } from '../calc/dhash.calc.js';
import { conclude as concludeCalc, type Failure } from '../calc/decide.calc.js';
import { explain } from '../calc/explanation.calc.js';
import { type AppliedHit, type RawHit, ruleBookOf } from '../calc/score.calc.js';
import type { Tx } from '../screening.repository.js';
import { SCREENING_EVENTS, screeningEvent } from '../screening.outbox.js';
import {
  bandThresholds,
  DAY_MS,
  HOUR_MS,
  LOOKUP_PREFIX,
  type ScreeningShared,
  textResultOf,
} from '../screening.shared.js';

export const newLookupCode = (): string => `${LOOKUP_PREFIX}${generateLookupCode()}`;

/**
 * Kết luận của một lượt (design mục 5 bước 4–5) — mọi đường kết luận đi qua đây: lúc mở lượt, lúc ảnh cuối về, lúc lưới
 * an toàn hết chờ, lúc bật cụm rút tin về.
 */
export function createConclusion(shared: ScreeningShared) {
  const { repository, config, clock } = shared;

  /**
   * Ảnh trùng ảnh của tài khoản khác đã kiểm xong trước nó, trừ ảnh khớp danh sách trắng (spec image-checks — người
   * đăng trước thắng).
   */
  const duplicateOf = async (
    tx: Tx,
    check: ImageCheck,
    run: ScreeningRun,
    maxDistance: number,
  ): Promise<boolean> => {
    if (check.dhash === null || check.checkedAt === null) return false;
    const hash = check.dhash;
    const bands = bandsOf(hash);
    const candidates = await repository.duplicateCandidates(
      {
        bands,
        excludeOwner: run.accountId,
        excludeImageIds: run.imageIds,
        before: { checkedAt: check.checkedAt, imageId: check.imageId },
      },
      tx,
    );
    const near = (other: bigint | null) => other !== null && hamming(other, hash) <= maxDistance;
    if (!candidates.some((candidate) => near(candidate.dhash))) return false;
    const whitelist = await repository.whitelistCandidates(bands, tx);
    return !whitelist.some((entry) => near(entry.dhash));
  };

  /** Kết quả ảnh của lượt: còn ảnh chưa kiểm xong → `null`; có ảnh lỗi → `failed`; còn lại → ảnh trùng. */
  const imagesOf = async (
    tx: Tx,
    run: ScreeningRun,
    maxDistance: number,
  ): Promise<{ failed: boolean; duplicates: string[] } | null> => {
    const checks = await repository.imageChecks(run.imageIds, tx);
    const settled = checks.filter((check) => check.status !== 'pending');
    if (settled.length < run.imageIds.length) return null;
    if (settled.some((check) => check.status === 'error')) return { failed: true, duplicates: [] };
    // Lần lượt trên kết nối của transaction: song song thì mỗi ảnh xin thêm một kết nối của pool (T24).
    const flags: boolean[] = [];
    await sequentially(settled, async (check) => {
      flags.push(await duplicateOf(tx, check, run, maxDistance));
    });
    return {
      failed: false,
      duplicates: settled.filter((_, index) => flags[index]).map((check) => check.imageId),
    };
  };

  /**
   * Dò cổng cứng (design mục 5 bước 5): dưới khoá theo người, đếm lượt gửi giữ vì cổng cứng trong 24 giờ — kể cả lượt
   * vừa ghi, cùng transaction. Tới ngưỡng thì vào thời gian chờ.
   */
  const probe = async (tx: Tx, accountId: string, now: Date): Promise<void> => {
    await repository.lockAccount(tx, accountId);
    const count = await repository.countGateRuns(tx, accountId, new Date(now.getTime() - DAY_MS));
    if (count < config.get('screening.hardGateProbesPer24h')) return;
    const until = new Date(now.getTime() + config.get('screening.hardGateCooldownHours') * HOUR_MS);
    await repository.startCooldown(tx, { accountId, until, at: now }, [
      screeningEvent(SCREENING_EVENTS.cooldownStarted, { accountId, until: until.toISOString() }),
    ]);
  };

  /**
   * Kết luận khi đủ chữ và mọi ảnh, hay khi lưới an toàn hết chờ (`timedOut`) — còn thiếu thì để chờ. Ghi có điều kiện,
   * nên `false` cả khi chưa đủ lẫn khi lượt khác vừa kết luận trước.
   */
  /** Dữ kiện để kết luận, đọc qua `tx`; `null` = còn ảnh chưa có kết quả, chờ tiếp. */
  const assess = async (
    tx: Tx,
    run: ScreeningRun,
    text: ReturnType<typeof textResultOf>,
    timedOut: boolean,
  ) => {
    const raw: RawHit[] = text.status === 'ok' ? [...text.hits] : [];
    let failure: Failure | null = text.status === 'error' ? 'error' : null;
    if (text.status === 'ok') {
      const images = await imagesOf(tx, run, text.imageMaxDistance);
      if (!images) {
        if (!timedOut) return null;
        failure = 'timeout';
      } else if (images.failed) {
        failure = 'error';
      } else if (images.duplicates.length > 0) {
        raw.push({ code: 'duplicate_image', refs: images.duplicates });
      }
    }
    return { raw, failure, rules: await shared.rules.at(run.ruleVersion, tx) };
  };

  const conclude = async (tx: Tx, run: ScreeningRun, timedOut = false): Promise<boolean> => {
    const text = textResultOf(run);
    if (text.status === 'recall') return false;
    // Phần đọc trong savepoint: lỗi lúc đọc thành "giữ cho người, lỗi" (bộ luật phiên bản 0, có sẵn trong bộ nhớ) thay
    // vì làm hỏng cả lượt gửi — tin vẫn được nhận (spec machine-decision, T24).
    const read = await repository.guarded(tx, () => assess(tx, run, text, timedOut));
    let facts: NonNullable<Awaited<ReturnType<typeof assess>>>;
    if (read.ok) {
      if (read.value === null) return false;
      facts = read.value;
    } else {
      logger.warn(
        { err: read.error, runId: run.id },
        'screening: đọc dữ kiện kết luận lỗi, giữ cho người',
      );
      facts = { raw: [], failure: 'error', rules: await shared.rules.at(0) };
    }
    const { raw, failure, rules } = facts;
    const ok = text.status === 'ok' ? text : null;
    const verdict = concludeCalc({
      raw,
      book: ruleBookOf(rules.version, rules.snapshot, ok?.bands ?? bandThresholds(config)),
      categoryId: text.categoryId,
      failure,
      alwaysManual: ok?.alwaysManual ?? false,
      deviceFlagged: (ok?.deviceFlags.length ?? 0) > 0,
      tier: ok?.tier ?? null,
      placement: text.placement,
    });
    const now = clock();
    const rankAsListingId = ok?.rankAsListingId ?? null;
    const decided = await repository.decideRun(
      tx,
      run.id,
      {
        decidedAt: now,
        outcome: verdict.outcome,
        cause: verdict.cause,
        score: verdict.score,
        band: verdict.band,
        tier: ok?.tier ?? null,
        hits: verdict.hits,
        explanation: verdict.explanation,
        lookupCode: verdict.explanation?.kind === 'fraud' ? newLookupCode() : null,
        rankAsListingId,
      },
      [
        screeningEvent(SCREENING_EVENTS.resultRecorded, {
          listingId: run.listingId,
          listingVersion: run.listingVersion,
          outcome: verdict.outcome === 'hold' ? 'hold' : 'pass',
          restrictMachine: verdict.restrictMachine,
          rankAsListingId,
        }),
      ],
    );
    if (decided && verdict.cause === 'gate' && run.trigger === 'submission') {
      await probe(tx, run.accountId, now);
    }
    return decided;
  };

  /**
   * Bật thật cụm mức chắc: rút tin đang hiện về chờ duyệt (design mục 7) — một lượt `recall` có sẵn kết luận, câu chung
   * ba phần kèm mã tra cứu. Đã rút đúng phiên bản này rồi (cụm khác bật trước) thì `false`. Không phải lượt gửi nên không
   * tính vào dò cổng cứng.
   */
  const recall = (listing: LiveListingFacts, phraseId: string, ruleVersion: number) =>
    repository.inTransaction(async (tx) => {
      const now = clock();
      const hits: AppliedHit[] = [
        { code: 'certain_phrase', weight: 0, mode: 'on', refs: [phraseId] },
      ];
      const configVersion = config.version();
      return repository.createDecidedRun(
        tx,
        {
          listingId: listing.id,
          listingVersion: listing.version,
          accountId: listing.ownerId,
          trigger: 'recall',
          startedAt: now,
          textResult: { status: 'recall', configVersion, ruleVersion },
          imageIds: listing.imageIds,
          configVersion,
          ruleVersion,
          decidedAt: now,
          outcome: 'hold',
          cause: 'gate',
          score: 0,
          band: 'low',
          tier: null,
          hits,
          explanation: explain({ outcome: 'hold', cause: 'gate', hits, recall: true }),
          lookupCode: newLookupCode(),
          rankAsListingId: null,
        },
        [
          screeningEvent(SCREENING_EVENTS.listingRecalled, {
            listingId: listing.id,
            listingVersion: listing.version,
          }),
        ],
      );
    });

  return { conclude, recall };
}

export type Conclusion = ReturnType<typeof createConclusion>;
