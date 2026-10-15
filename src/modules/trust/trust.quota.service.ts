import type { ListingSubmissionKind, ListingState, Prisma } from '@prisma/client';

import { ConflictError, TooManyRequestsError } from '../../common/errors/app-error.js';
import { formatTimeVN } from '../../common/time/time.js';
import { liveEffect, quotaDecision } from './calc/quota.calc.js';
import type { TrustTier } from './calc/tier.calc.js';
import { HOUR_MS, quotaSettings, type TrustServiceDeps } from './trust.shared.js';

type Tx = Prisma.TransactionClient;

export interface SubmissionQuotaInput {
  accountId: string;
  listingId: string;
  kind: ListingSubmissionKind;
  fromState: ListingState;
  outsiderGroupId: string | null;
}

export interface TrustQuotaService {
  /**
   * Cổng `ListingTrustPort.assertCanSubmit` (design mục 6): chạy trong transaction gửi của `listing`, sau kiểm trường và
   * nơi đăng — ném là cả lượt quay lui, kể cả dòng `listing_submissions`, nên lượt bị từ chối không bị đếm (spec).
   */
  assertCanSubmit(tx: Tx, input: SubmissionQuotaInput): Promise<void>;
}

/** Ba cách giải phóng chỗ — app dựng nút theo mã; "chờ tin được duyệt" không phải một cách (câu 8). */
const HOW_TO_FREE = ['mark_sold', 'delete', 'withdraw_pending'] as const;

export function createTrustQuotaService(
  deps: TrustServiceDeps,
  tierOf: (accountId: string) => Promise<TrustTier>,
): TrustQuotaService {
  const { listings, config, clock } = deps;

  return {
    async assertCanSubmit(tx, input) {
      // Hai lượt gửi song song của một người xếp hàng ở đây rồi mới đếm: không có chuyện cùng thấy 9 rồi cùng thành 11.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`trust-submit:${input.accountId}`}, 0))`;
      const now = clock();
      const tier = await tierOf(input.accountId);
      const settings = quotaSettings(config, tier);
      const facts = await listings.quotaFacts(tx, {
        accountId: input.accountId,
        since: new Date(now.getTime() - HOUR_MS),
        groupId: input.outsiderGroupId,
      });
      const decision = quotaDecision({
        effect: liveEffect(input.kind, input.fromState),
        facts: {
          live: facts.live,
          recentSubmissions: facts.submittedAt,
          outsiderLiveInGroup: input.outsiderGroupId ? facts.liveInGroup : null,
        },
        settings,
        now,
      });
      if (decision.ok) return;
      if (decision.code === 'SUBMISSION_RATE_LIMITED') {
        throw new TooManyRequestsError(
          `Đã đủ ${settings.perHour} lượt gửi trong một giờ — gửi lại từ ${formatTimeVN(decision.retryAt)}`,
          decision.code,
          { retryAt: decision.retryAt.toISOString() },
        );
      }
      if (decision.code === 'OUTSIDER_QUOTA_EXCEEDED') {
        throw new ConflictError(
          `Người ngoài có tối đa ${settings.outsiderPerGroup} tin sống trong một nhóm`,
          decision.code,
        );
      }
      const occupying = await listings.occupying(tx, input.accountId);
      throw new ConflictError(
        `Đã đủ ${settings.liveCap} tin sống của mức ${tier} — đánh dấu đã bán, xoá tin cũ hoặc rút tin chờ duyệt về nháp để có chỗ`,
        decision.code,
        { occupying, howTo: [...HOW_TO_FREE] },
      );
    },
  };
}
