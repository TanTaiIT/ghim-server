import type { Actor } from '../../common/auth/actor.js';
import { quotaDecision } from './quota.calc.js';
import { ageDays, nextStep } from './tier.calc.js';
import type { TrustDashboardDto } from './trust.schema.js';
import { HOUR_MS, quotaSettings, tierSettings, type TrustServiceDeps } from './trust.shared.js';

export interface TrustDashboardService {
  dashboard(actor: Actor): Promise<TrustDashboardDto>;
}

/**
 * Bảng uy tín (design mục 9): một response, không tính lại mức — mức và số tin sạch là của lần tính gần nhất, để khớp
 * với mức `listing` đang dùng. Câu cho tin chờ duyệt do `screening` cấp, nên không câu nào nêu tín hiệu gian lận.
 */
export function createTrustDashboardService(deps: TrustServiceDeps): TrustDashboardService {
  const { repository, listings, identity, holds, config, clock } = deps;

  return {
    async dashboard(actor) {
      const now = clock();
      const [stored, summaries, facts, listingFacts] = await Promise.all([
        repository.findTier(actor.accountId),
        identity.accountSummaries([actor.accountId]),
        listings.quotaFacts(null, {
          accountId: actor.accountId,
          since: new Date(now.getTime() - HOUR_MS),
          groupId: null,
        }),
        listings.dashboardFacts(actor.accountId),
      ]);
      const tier = stored?.tier ?? 'T0';
      const countedClean = stored?.countedClean ?? 0;
      const createdAt = summaries.get(actor.accountId)?.createdAt ?? now;
      const settings = quotaSettings(config, tier);
      const recent = facts.submittedAt.filter((at) => at.getTime() > now.getTime() - HOUR_MS);
      const rate = quotaDecision({
        effect: 'none',
        facts: { live: facts.live, recentSubmissions: recent, outsiderLiveInGroup: null },
        settings,
        now,
      });
      const notices = await holds.explain(listingFacts.pending.map((row) => row.id));
      return {
        tier,
        countedClean,
        configVersion: stored?.configVersion ?? 0,
        next: nextStep(tier, ageDays(createdAt, now), countedClean, tierSettings(config)),
        quota: {
          live: facts.live,
          liveCap: settings.liveCap,
          submissionsLeft: Math.max(0, settings.perHour - recent.length),
          nextSubmissionAt:
            !rate.ok && rate.code === 'SUBMISSION_RATE_LIMITED' ? rate.retryAt.toISOString() : null,
        },
        restricted: listingFacts.restricted.map(({ id, title, restrictions }) => ({
          id,
          title,
          restrictions,
        })),
        pending: listingFacts.pending.map(({ id, title }) => {
          const notice = notices.get(id);
          return {
            id,
            title,
            reason: notice?.reason ?? 'Đang chờ người duyệt',
            estimatedWait: notice?.estimatedWait ?? null,
            lookupCode: notice?.lookupCode ?? null,
          };
        }),
      };
    },
  };
}
