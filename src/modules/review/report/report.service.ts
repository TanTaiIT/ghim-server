import {
  Prisma,
  type ReportCategory,
  type ReportEntry,
  type ReportSubjectKind,
  type ReportVerdict,
} from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '../../../common/errors/app-error.js';
import { type PaginationQuery, toPage, toSkipTake } from '../../../common/schemas/pagination.js';
import { formatDateVN, formatTimeVN } from '../../../common/time/time.js';
import {
  countsForHide,
  normalScore,
  rateLimitedUntil,
  reachesHideThreshold,
  reportReason,
  SEVERE_CATEGORIES,
} from '../calc/report.calc.js';
import type { ReviewQueueService } from '../queue/queue.service.js';
import { REVIEW_EVENTS, reviewEvent } from '../review.outbox.js';
import type { ReviewShared } from '../review.shared.js';
import type { Report, ReportSubject, ReportWithEntries } from './report.repository.js';
import type { MyReportDto, RelatedReportDto, ReportBody } from './report.schema.js';

const HOUR_MS = 3_600_000;
/** Câu người bị khoá đọc khi đăng nhập — không nêu ai báo hay báo gì (TK 23). */
const LOCK_REASON = 'Vi phạm quy định đã được xác nhận qua báo cáo';
/** Hai lượt chen nhau cùng mở việc cho một tin: lượt thua chạm unique, chạy lại cả lượt gửi. */
const MAX_ATTEMPTS = 3;

interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReviewReportService {
  /** `created = false`: người này đã báo đối tượng đó trong báo cáo đang mở — không đổi gì (chốt 16/10/2026). */
  submitReport(
    actor: Actor,
    body: ReportBody,
    deviceId: string | null,
    /** Báo cáo từ hội thoại (add-messaging): `messaging` đã kiểm tư cách; lượt báo mang mã hội thoại làm bằng chứng. */
    evidence?: { conversationId: string },
  ): Promise<{ created: boolean; report: MyReportDto }>;
  myReports(actor: Actor, query: PaginationQuery): Promise<Page<MyReportDto>>;
  /** Cổng `OpenWork.reportHidden` cho `listing`: tin có báo cáo mở đã tự ẩn. */
  reportHidden(listingId: string): Promise<boolean>;
  /**
   * Bên nghe `review.report.decided`: báo cáo đúng thì tin mất tư cách tin sạch, người đăng bị cấm khỏi nhóm / bị khoá
   * nếu người quyết đã chọn — quyền đã kiểm lúc quyết, các bên nhận bỏ qua khi đã áp nên chạy lại vô hại.
   */
  onReportDecided(input: {
    verdict: ReportVerdict;
    subjectKind: ReportSubjectKind;
    listingId: string | null;
    accountId: string;
    banGroupId: string | null;
    lockAccount: boolean;
    by: string;
    byMaster: boolean;
  }): Promise<void>;
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const toMine = (report: Report, entry: ReportEntry): MyReportDto => ({
  reportId: report.id,
  subjectKind: report.subjectKind,
  listingId: report.listingId,
  accountId: report.subjectKind === 'account' ? report.accountId : null,
  category: entry.category,
  status: report.status,
  reportedAt: entry.createdAt.toISOString(),
  decidedAt: report.decidedAt?.toISOString() ?? null,
});

export const toRelated = (report: ReportWithEntries): RelatedReportDto => ({
  reportId: report.id,
  subjectKind: report.subjectKind,
  listingId: report.listingId,
  status: report.status,
  severe: report.severe,
  autoHidden: report.autoHiddenAt !== null,
  reporterCount: report.entries.length,
  entries: report.entries
    .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((entry) => ({
      category: entry.category,
      reportedAt: entry.createdAt.toISOString(),
      conversationId: entry.conversationId,
    })),
  createdAt: report.createdAt.toISOString(),
  decidedAt: report.decidedAt?.toISOString() ?? null,
});

/**
 * Gửi báo cáo (TK 23, design add-reports mục 2, 6): kiểm theo thứ tự cố định, rồi trong một transaction — việc trước,
 * báo cáo sau (cùng thứ tự khoá với lượt quyết) — thêm lượt báo, gộp vào báo cáo đang mở, xét ngưỡng tạm ẩn.
 */
export function createReportService(
  shared: ReviewShared,
  queue: ReviewQueueService,
): ReviewReportService {
  const { reports, repository, listings, identity, trust, groups, config, clock, reportRules } =
    shared;

  /** Đối tượng người này thấy được — không thấy thì 404 như không có. */
  const resolve = async (actor: Actor, body: ReportBody) => {
    if (body.subject.kind === 'listing') {
      const target = await listings.reportTarget(actor, body.subject.listingId);
      if (!target) throw new NotFoundError('Không có tin này');
      return {
        subject: { kind: 'listing', listingId: target.id } satisfies ReportSubject,
        ownerId: target.ownerId,
        // Chỉ tin sàn chung đang hiện mới tự ẩn khi nhiều người báo (TK 23).
        hideable: target.placement === 'marketplace' && target.visible,
      };
    }
    const { accountId } = body.subject;
    const summary = (await identity.accountSummaries([accountId])).get(accountId);
    if (!summary || summary.status === 'deleted')
      throw new NotFoundError('Không có người dùng này');
    return {
      subject: { kind: 'account', accountId } satisfies ReportSubject,
      ownerId: accountId,
      hideable: false,
    };
  };

  const assertCanReport = async (actor: Actor) => {
    if (actor.role === 'master') {
      throw new ForbiddenError('Tài khoản master không gửi báo cáo — dùng tài khoản cá nhân');
    }
    if (!actor.emailVerified) {
      throw new ForbiddenError('Xác nhận email trước khi báo cáo', 'EMAIL_NOT_VERIFIED');
    }
    const score = await reports.scoreOf(actor.accountId);
    const until = score?.suspendedUntil;
    if (until && until > clock()) {
      throw new AppError(
        403,
        'REPORTING_SUSPENDED',
        `Bạn tạm mất quyền báo cáo tới ${formatDateVN(until)} vì nhiều báo cáo không đúng`,
        { reportAgainAt: until.toISOString() },
      );
    }
    return score?.score ?? 0;
  };

  const rateLimited = (until: Date): TooManyRequestsError =>
    new TooManyRequestsError(
      `Mỗi giờ báo cáo tối đa ${config.get('report.perHour')} lần — báo tiếp được lúc ${formatTimeVN(until)}`,
      'REPORT_RATE_LIMITED',
      { retryAt: until.toISOString() },
    );

  const submitOnce = async (
    actor: Actor,
    input: {
      subject: ReportSubject;
      /** Người bị báo; với báo cáo về tin là người đăng. */
      ownerId: string;
      category: ReportCategory;
      deviceHash: string | null;
      counts: boolean;
      normal: boolean;
      hideable: boolean;
      conversationId: string | null;
    },
    attempt = 1,
  ): Promise<{ created: boolean; report: Report; entry: ReportEntry }> => {
    const now = clock();
    const rules = reportRules();
    const { subject, category } = input;
    const reason = reportReason(category);
    try {
      return await reports.withSubmitLock({ reporterId: actor.accountId, subject }, async (tx) => {
        const open = await reports.findOpenIn(tx, subject);
        const mine = open?.entries.find((entry) => entry.reporterId === actor.accountId);
        if (open && mine) return { created: false, report: open, entry: mine };
        const since = new Date(now.getTime() - HOUR_MS);
        const until = rateLimitedUntil(
          await reports.entryTimesSince(tx, actor.accountId, since),
          now,
          config.get('report.perHour'),
        );
        if (until) throw rateLimited(until);
        // Người báo và máy của họ không xử báo cáo này (chốt 16/10/2026).
        const work = { reason, alsoExclude: [actor.accountId], tx };
        await (subject.kind === 'listing'
          ? queue.addReason(subject.listingId, work)
          : queue.addAccountReason(subject.accountId, work));
        const locked = await reports.lockOpenIn(tx, subject);
        const severe = SEVERE_CATEGORIES.has(category);
        const report = locked
          ? await reports.updateReport(tx, locked.id, {
              severe: locked.severe || severe,
              lowPriority: locked.lowPriority && !input.normal,
            })
          : await reports.createReport(tx, {
              subjectKind: subject.kind,
              listingId: subject.kind === 'listing' ? subject.listingId : null,
              accountId: input.ownerId,
              severe,
              lowPriority: !input.normal,
              createdAt: now,
            });
        const entry = await reports.addEntry(tx, {
          reportId: report.id,
          reporterId: actor.accountId,
          category,
          deviceHash: input.deviceHash,
          countsForHide: input.counts,
          conversationId: input.conversationId,
          createdAt: now,
        });
        if (subject.kind === 'listing' && input.hideable && !report.autoHiddenAt) {
          const entries = [...(locked?.entries ?? []), entry];
          if (
            reachesHideThreshold(entries, now, rules) &&
            !(await reports.autoHideSpent(tx, subject.listingId))
          ) {
            await reports.updateReport(tx, report.id, { autoHiddenAt: now });
            await repository.emitIn(tx, [
              reviewEvent(REVIEW_EVENTS.reportHideChanged, { listingId: subject.listingId }),
            ]);
          }
        }
        return { created: true, report, entry };
      });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_ATTEMPTS) throw error;
      return submitOnce(actor, input, attempt + 1);
    }
  };

  return {
    async submitReport(actor, body, deviceId, evidence) {
      const score = await assertCanReport(actor);
      const { subject, ownerId, hideable } = await resolve(actor, body);
      if (ownerId === actor.accountId) {
        throw new BadRequestError(
          'Không báo cáo chính mình hay tin của mình',
          'CANNOT_REPORT_SELF',
        );
      }
      const deviceHash = deviceId ? identity.deviceToken(deviceId) : null;
      const tier = await trust.tierOf(actor.accountId);
      const rules = reportRules();
      const { created, report, entry } = await submitOnce(actor, {
        subject,
        ownerId,
        category: body.category,
        deviceHash,
        counts: countsForHide({ deviceHash, tier, score }, rules),
        normal: normalScore(score, rules),
        hideable,
        conversationId: evidence?.conversationId ?? null,
      });
      return { created, report: toMine(report, entry) };
    },

    async myReports(actor, query) {
      const { items, total } = await reports.myReports(actor.accountId, toSkipTake(query));
      return toPage(
        items.map((row) => toMine(row.report, row)),
        total,
        query,
      );
    },

    reportHidden: (listingId) => reports.hidesListing(listingId),

    async onReportDecided(input) {
      if (input.verdict !== 'upheld') return;
      const { accountId, by } = input;
      if (input.subjectKind === 'listing' && input.listingId) {
        await trust.voidByReport(input.listingId, accountId);
      }
      if (input.banGroupId) {
        await groups.banFromReport({
          groupId: input.banGroupId,
          accountId,
          by,
          byMaster: input.byMaster,
        });
      }
      if (input.lockAccount) await identity.lockFromReport({ accountId, by, reason: LOCK_REASON });
    },
  };
}
