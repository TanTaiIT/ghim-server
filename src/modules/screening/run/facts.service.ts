import type {
  ScreeningBand,
  ScreeningCause,
  ScreeningOutcome,
  ScreeningRun,
  TrustTier,
} from '@prisma/client';

import type { AppliedHit } from '../calc/score.calc.js';
import { bandsOf, hamming } from '../calc/dhash.calc.js';
import type { ScreeningShared } from '../screening.shared.js';

/** Lượt máy gần nhất của một tin — bối cảnh của người duyệt và cột "kết quả máy trước đó" của nhật ký (TK 17). */
export interface RunFacts {
  listingVersion: number;
  outcome: ScreeningOutcome | null;
  cause: ScreeningCause | null;
  score: number | null;
  band: ScreeningBand | null;
  tier: TrustTier | null;
  /** Mã luật đang bật đã trúng — luật chạy thử không đổi kết quả nên không tính cho "máy quá tay". */
  hits: string[];
}

export interface DuplicateMatch {
  /** Ảnh của tin đang xét. */
  imageId: string;
  /** Ảnh gần như giống hệt của tài khoản khác, ngoài danh sách trắng. */
  matchImageId: string;
  accountId: string;
}

export interface ScreeningFactsService {
  /** Cổng `review`: lượt đã kết luận gần nhất của tin; chưa có lượt nào thì `null`. */
  runOf(listingId: string): Promise<RunFacts | null>;
  /**
   * Cổng `review`: ảnh của tin trùng ảnh tài khoản khác — tính lại từ dấu ảnh lúc người duyệt mở việc, vì lượt máy chỉ
   * ghi "có trùng" (design add-review-queues, Risks).
   */
  duplicateMatches(listingId: string): Promise<DuplicateMatch[]>;
}

export function createFactsService(shared: ScreeningShared): ScreeningFactsService {
  const { repository, config } = shared;

  const latestRun = async (listingId: string): Promise<ScreeningRun | null> =>
    (await repository.decidedRuns([listingId]))[0] ?? null;

  return {
    async runOf(listingId) {
      const run = await latestRun(listingId);
      if (!run) return null;
      // Cột do chính lượt kết luận ghi (`score.calc.ts`).
      const hits = run.hits as unknown as AppliedHit[];
      return {
        listingVersion: run.listingVersion,
        outcome: run.outcome,
        cause: run.cause,
        score: run.score,
        band: run.band,
        tier: run.tier,
        hits: [...new Set(hits.filter((hit) => hit.mode === 'on').map((hit) => hit.code))],
      };
    },

    async duplicateMatches(listingId) {
      const run = await latestRun(listingId);
      if (!run || run.imageIds.length === 0) return [];
      const maxDistance = config.get('screening.imageDuplicateMaxDistance');
      const checks = await repository.imageChecks(run.imageIds);
      const perImage = await Promise.all(
        checks.map(async (check): Promise<DuplicateMatch[]> => {
          if (check.status !== 'done' || check.dhash === null) return [];
          const hash = check.dhash;
          const bands = bandsOf(hash);
          const near = (other: bigint | null) =>
            other !== null && hamming(other, hash) <= maxDistance;
          const [candidates, whitelist] = await Promise.all([
            repository.duplicateCandidates({
              bands,
              excludeOwner: run.accountId,
              excludeImageIds: run.imageIds,
            }),
            repository.whitelistCandidates(bands),
          ]);
          if (whitelist.some((entry) => near(entry.dhash))) return [];
          return candidates
            .filter((candidate) => near(candidate.dhash))
            .map((candidate) => ({
              imageId: check.imageId,
              matchImageId: candidate.imageId,
              accountId: candidate.ownerAccountId,
            }));
        }),
      );
      return perImage.flat();
    },
  };
}
