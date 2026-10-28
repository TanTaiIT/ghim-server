import { pseudonymizeAudit } from '../../common/audit/audit.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { sequentially } from '../../common/utils/sequential.js';
import type { Jobs } from '../../lib/jobs.js';
import type { GroupService } from '../group/group.service.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { RetentionRow, RetentionRule } from '../listing/listing.ports.js';
import type { ListingService } from '../listing/listing.service.js';
import type { MediaService } from '../media/media.service.js';
import type { MessagingService } from '../messaging/messaging.service.js';
import type { NotificationService } from '../notification/notification.service.js';
import type { ReviewService } from '../review/review.service.js';
import type { PromotionService } from '../promotion/promotion.service.js';
import type { WalletService } from '../wallet/wallet.service.js';
import type { ScreeningService } from '../screening/screening.service.js';
import type { TrustService } from '../trust/trust.service.js';
import { before, DAY_MS, violationPurgeAt, YEAR_MS } from './calc/retention.calc.js';
import type { EvidenceHold } from './evidence-hold.service.js';
import { OPS_JOBS } from './ops.jobs.js';
import type { OpsRepository } from './ops.repository.js';

/** Thứ tự các bước của lượt dọn hằng ngày (design mục 3) — lượt làm tiếp bắt đầu từ bước đã dừng. */
export const RETENTION_STEPS = [
  'drafts',
  'mistake',
  'violation',
  'selfDeleted',
  'sold',
  'expiredRemind',
  'expired',
  'closedGroups',
  'deletedAccounts',
  'devices',
  'conversations',
  'notifications',
  'screeningRuns',
  'strikes',
  'jobRuns',
] as const;
export type RetentionStep = (typeof RETENTION_STEPS)[number];

export interface RetentionResult {
  /** Chạm trần thời gian khi còn việc: lượt làm tiếp đã được xếp từ `next` (TK 26 luật 2). */
  partial: boolean;
  next: RetentionStep | null;
  counts: Record<RetentionStep, number>;
}

export interface RetentionRunOptions {
  from?: RetentionStep | undefined;
  budgetMs?: number;
  pageSize?: number;
}

export interface RetentionDeps {
  repository: OpsRepository;
  listings: Pick<ListingService, 'retentionDue' | 'purge' | 'softDeleteWhere' | 'remindPurge'>;
  media: Pick<MediaService, 'purgeOwners'>;
  groups: Pick<GroupService, 'purgeDue' | 'purgeClosed'>;
  identity: Pick<
    IdentityService,
    'purgeDue' | 'purgeDeletedAccount' | 'purgeDeviceData' | 'pseudonymOf'
  >;
  messaging: Pick<
    MessagingService,
    'retentionDue' | 'purge' | 'groupConversations' | 'deleteConversations'
  >;
  notification: Pick<NotificationService, 'purgeBefore'>;
  /** Ví theo hạn lưu của tài khoản (add-wallet): dọn cùng lượt dọn tài khoản đã xoá, sau kiểm tạm giữ. */
  wallet: Pick<WalletService, 'purgeAccount'>;
  /** Lượt mua gói đi cùng tài khoản như sổ cái (add-promotions). */
  promotion: Pick<PromotionService, 'purgeAccount'>;
  screening: Pick<ScreeningService, 'foldRuns'>;
  trust: Pick<
    TrustService,
    'strikesOfListings' | 'anonymizeDue' | 'anonymizeStrike' | 'dropLiftedEmailHashes'
  >;
  review: Pick<ReviewService, 'reportHolds' | 'pseudonymizeDecisions'>;
  jobs: Jobs;
  config: RuntimeConfig;
  clock: () => Date;
}

export interface RetentionService {
  /** Lượt dọn hằng ngày, hay lượt làm tiếp từ `from`; mọi bước idempotent nên làm tiếp không làm lại phần đã xong. */
  runRetention(options?: RetentionRunOptions): Promise<RetentionResult>;
  /** Lượt mỗi 6 giờ (TK 26): chỉ bước nháp. */
  purgeDrafts(): Promise<number>;
}

/** TK 26 luật 1: một lượt dọn dài không giữ worker mãi; phần còn lại xếp lượt sau. */
const DEFAULT_BUDGET_MS = 10 * 60_000;
/** Một trang ứng viên = một transaction xoá; đủ nhỏ để không giữ khoá lâu. */
const DEFAULT_PAGE = 500;
/** Sổ kết quả lượt việc giữ 90 ngày — hằng hạ tầng, không phải con số TK 28. */
const JOB_RUN_RETENTION_DAYS = 90;

interface Page {
  count: number;
  done: boolean;
}
type Step = () => Promise<Page>;

/** Chạy một bước tới khi hết trang hay chạm trần thời gian — trần kiểm sau mỗi trang, nên trang nào cũng trọn. */
async function drain(
  step: Step,
  deadline: number,
  sum = 0,
): Promise<{ count: number; done: boolean }> {
  const page = await step();
  const count = sum + page.count;
  if (page.done) return { count, done: true };
  if (Date.now() > deadline) return { count, done: false };
  return drain(step, deadline, count);
}

export function createRetentionService(deps: RetentionDeps, hold: EvidenceHold): RetentionService {
  const {
    repository,
    listings,
    media,
    groups,
    identity,
    messaging,
    notification,
    screening,
    trust,
    review,
    jobs,
    config,
    clock,
  } = deps;

  const days = (now: Date, key: Parameters<RuntimeConfig['get']>[0]) =>
    before(now, config.get(key) * DAY_MS);

  /** Xoá hẳn một trang tin: lọc tạm giữ rồi xoá qua `listing` (kiểm lại điều kiện trong khoá). */
  const purgeRows = async (rows: RetentionRow[], rule: RetentionRule): Promise<number> => {
    if (rows.length === 0) return 0;
    const held = await hold.heldListings(rows);
    const ids = rows.filter((row) => !held.has(row.id)).map((row) => row.id);
    return ids.length === 0 ? 0 : (await listings.purge(ids, rule)).length;
  };

  /** Con trỏ theo `id` giữ qua các trang: tin đang tạm giữ ở lại mà trang không lùi. */
  const listingStep = (rule: RetentionRule, pageSize: number): Step => {
    let after: string | null = null;
    return async () => {
      const rows = await listings.retentionDue(rule, after, pageSize);
      after = rows.at(-1)?.id ?? after;
      return { count: await purgeRows(rows, rule), done: rows.length < pageSize };
    };
  };

  /** Mọi tin đã xoá mềm của một chủ (tài khoản, nhóm) — không trần thời gian: một chủ là một đơn vị việc. */
  const purgeOwnerListings = async (
    rule: Extract<RetentionRule, { kind: 'owner' | 'group' }>,
    pageSize: number,
  ): Promise<number> => (await drain(listingStep(rule, pageSize), Number.POSITIVE_INFINITY)).count;

  const violationStep = (pageSize: number): Step => {
    const rule = { kind: 'violation' } as const;
    let after: string | null = null;
    return async () => {
      const now = clock();
      const rows = await listings.retentionDue(rule, after, pageSize);
      after = rows.at(-1)?.id ?? after;
      const facts = await trust.strikesOfListings(rows.map((row) => row.id));
      const rules = {
        graceMs: config.get('retention.violationGraceDays') * DAY_MS,
        seriousMs: config.get('retention.seriousYears') * YEAR_MS,
      };
      // Tin vi phạm không còn gậy nào (dữ liệu cũ, gậy đã bị dọn): như tin sai sót — 90 ngày từ lần sửa cuối.
      const mistakeBefore = days(now, 'retention.mistakeDays');
      const due = rows.filter((row) => {
        const fact = facts.get(row.id);
        if (!fact) return row.updatedAt < mistakeBefore;
        const purgeAt = violationPurgeAt(fact, rules);
        return purgeAt !== null && purgeAt <= now;
      });
      return { count: await purgeRows(due, rule), done: rows.length < pageSize };
    };
  };

  const expiredRemindStep = (): Step => async () => {
    const retentionMs = config.get('retention.expiredDays') * DAY_MS;
    const remindMs = config.get('retention.purgeRemindBeforeDays') * DAY_MS;
    const count = await listings.remindPurge({
      expiredBefore: before(clock(), retentionMs - remindMs),
      retentionMs,
    });
    return { count, done: true };
  };

  const closedGroupsStep = (pageSize: number): Step => {
    let after: string | null = null;
    return async () => {
      const ids = await groups.purgeDue(
        days(clock(), 'retention.closedGroupDays'),
        after,
        pageSize,
      );
      after = ids.at(-1) ?? after;
      // Tin trước, danh sách thành viên sau (rà soát L13); dòng nhóm giữ nên khoá ngoại RESTRICT không bị chạm.
      await sequentially(ids, async (groupId) => {
        await listings.softDeleteWhere({ groupId });
        await purgeOwnerListings({ kind: 'group', groupId }, pageSize);
        // Hội thoại với quản trị đi cùng nhóm, trừ hội thoại đang giữ làm bằng chứng (add-team-conversations mục 7).
        const conversations = await messaging.groupConversations(groupId);
        const held = await hold.heldConversations(conversations);
        await messaging.deleteConversations(
          conversations.filter((row) => !held.has(row.id)).map((row) => row.id),
        );
        await groups.purgeClosed(groupId);
      });
      return { count: ids.length, done: ids.length < pageSize };
    };
  };

  const deletedAccountsStep = (pageSize: number): Step => {
    let after: string | null = null;
    return async () => {
      const ids = await identity.purgeDue(
        days(clock(), 'identity.deletedEmailHoldDays'),
        after,
        pageSize,
      );
      after = ids.at(-1) ?? after;
      const held = await hold.heldAccounts(ids);
      let purged = 0;
      await sequentially(ids, async (accountId) => {
        // Tin ẩn từ lúc xoá tài khoản: xoá mềm ngay, xoá hẳn từng tin theo luật giữ của tin.
        await listings.softDeleteWhere({ ownerId: accountId });
        await purgeOwnerListings({ kind: 'owner', ownerId: accountId }, pageSize);
        // Hồ sơ, ảnh đại diện là bản lưu cho báo cáo về người đó: chờ báo cáo đóng + 30 ngày.
        if (held.has(accountId)) return;
        await media.purgeOwners('profile', [accountId]);
        await deps.wallet.purgeAccount(accountId);
        await deps.promotion.purgeAccount(accountId);
        await identity.purgeDeletedAccount(accountId);
        purged += 1;
      });
      return { count: purged, done: ids.length < pageSize };
    };
  };

  const devicesStep = (): Step => async () => {
    const result = await identity.purgeDeviceData(days(clock(), 'device.dataRetentionDays'));
    return {
      count: result.posts + result.logins + result.flags + result.sessionIps,
      done: true,
    };
  };

  const conversationsStep = (pageSize: number): Step => {
    let after: string | null = null;
    return async () => {
      const input = { idleBefore: days(clock(), 'retention.conversationIdleDays') };
      const rows = await messaging.retentionDue(input, after, pageSize);
      after = rows.at(-1)?.id ?? after;
      const held = await hold.heldConversations(rows);
      const ids = rows.filter((row) => !held.has(row.id)).map((row) => row.id);
      const count = ids.length === 0 ? 0 : await messaging.purge(ids, input);
      return { count, done: rows.length < pageSize };
    };
  };

  const notificationsStep = (): Step => async () => ({
    count: await notification.purgeBefore(days(clock(), 'retention.notificationDays')),
    done: true,
  });

  const screeningStep = (): Step => async () => {
    const result = await screening.foldRuns(days(clock(), 'retention.screeningRunDays'));
    return { count: result.deleted + result.marks, done: true };
  };

  /** Ẩn danh hoá qua ba module trong một transaction (design mục 5); dòng đã ẩn danh tự rơi khỏi ứng viên. */
  const strikesStep = (pageSize: number): Step => {
    let liftedDone = false;
    return async () => {
      const dropped = liftedDone ? 0 : await trust.dropLiftedEmailHashes();
      liftedDone = true;
      const closedBefore = before(clock(), config.get('retention.strikeAnonymizeYears') * YEAR_MS);
      const due = await trust.anonymizeDue(closedBefore, pageSize);
      let anonymized = 0;
      await sequentially(due, async ({ id, accountId }) => {
        const pseudonym = identity.pseudonymOf(accountId);
        const done = await repository.inTransaction(async (tx) => {
          if (!(await trust.anonymizeStrike(tx, { id, accountId, pseudonym }))) return false;
          await review.pseudonymizeDecisions(tx, { strikeId: id, accountId, pseudonym });
          await pseudonymizeAudit(tx, { strikeId: id, accountId, pseudonym });
          return true;
        });
        if (done) anonymized += 1;
      });
      return { count: dropped + anonymized, done: due.length < pageSize };
    };
  };

  const jobRunsStep = (): Step => async () => ({
    count: await repository.deleteRunsBefore(before(clock(), JOB_RUN_RETENTION_DAYS * DAY_MS)),
    done: true,
  });

  const stepsFor = (pageSize: number): Record<RetentionStep, Step> => {
    const now = clock();
    return {
      drafts: listingStep(
        { kind: 'draft', updatedBefore: days(now, 'retention.draftDays') },
        pageSize,
      ),
      mistake: listingStep(
        { kind: 'mistake', updatedBefore: days(now, 'retention.mistakeDays') },
        pageSize,
      ),
      violation: violationStep(pageSize),
      selfDeleted: listingStep(
        { kind: 'self_deleted', deletedBefore: days(now, 'retention.selfDeletedDays') },
        pageSize,
      ),
      sold: listingStep({ kind: 'sold', updatedBefore: days(now, 'retention.soldDays') }, pageSize),
      expiredRemind: expiredRemindStep(),
      expired: listingStep(
        { kind: 'expired', expiredBefore: days(now, 'retention.expiredDays') },
        pageSize,
      ),
      closedGroups: closedGroupsStep(pageSize),
      deletedAccounts: deletedAccountsStep(pageSize),
      devices: devicesStep(),
      conversations: conversationsStep(pageSize),
      notifications: notificationsStep(),
      screeningRuns: screeningStep(),
      strikes: strikesStep(pageSize),
      jobRuns: jobRunsStep(),
    };
  };

  return {
    async runRetention({ from, budgetMs = DEFAULT_BUDGET_MS, pageSize = DEFAULT_PAGE } = {}) {
      const deadline = Date.now() + budgetMs;
      const steps = stepsFor(pageSize);
      const counts = Object.fromEntries(RETENTION_STEPS.map((step) => [step, 0])) as Record<
        RetentionStep,
        number
      >;
      const run = async (index: number): Promise<RetentionResult> => {
        const step = RETENTION_STEPS[index];
        if (!step) return { partial: false, next: null, counts };
        const result = await drain(steps[step], deadline);
        counts[step] = result.count;
        if (!result.done) return { partial: true, next: step, counts };
        const following = RETENTION_STEPS[index + 1];
        if (following && Date.now() > deadline) return { partial: true, next: following, counts };
        return run(index + 1);
      };
      const result = await run(Math.max(from ? RETENTION_STEPS.indexOf(from) : 0, 0));
      if (result.partial && result.next) {
        await jobs.send(OPS_JOBS.retentionContinue, { from: result.next });
      }
      return result;
    },

    async purgeDrafts() {
      const rule: RetentionRule = {
        kind: 'draft',
        updatedBefore: days(clock(), 'retention.draftDays'),
      };
      return (await drain(listingStep(rule, DEFAULT_PAGE), Date.now() + DEFAULT_BUDGET_MS)).count;
    },
  };
}
