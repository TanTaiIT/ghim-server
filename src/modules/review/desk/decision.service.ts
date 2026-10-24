import type {
  Listing,
  ListingFault,
  ListingState,
  ReportVerdict,
  ReviewActorRole,
  ReviewDecision,
  ReviewOutcome,
  ReviewReasonTemplate,
  ReviewTask,
  TrustTier,
} from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import type { OutboxEventInput } from '../../../common/outbox/outbox.js';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/app-error.js';
import { sequentially } from '../../../common/utils/sequential.js';
import type { ReviewSubject } from '../../listing/listing.ports.js';
import type { RuleArticleDto } from '../../trust/strike/strike.schema.js';
import type { IssueStrikeInput } from '../../trust/strike/strike.service.js';
import { scoreDelta, suspendedUntilAfter } from '../calc/report.calc.js';
import { sampled } from '../calc/sampling.calc.js';
import { REPORT_REASONS } from '../calc/task.calc.js';
import type { ReportSubject } from '../report/report.repository.js';
import type { ReviewQueueService } from '../queue/queue.service.js';
import { type ListingDecidedOutcome, REVIEW_EVENTS, reviewEvent } from '../review.outbox.js';
import type { Tx } from '../review.repository.js';
import {
  type CreateTemplateBody,
  type DecisionBody,
  type DecisionResultDto,
  DEFAULT_REASON_TEMPLATES,
  type DirectDetachBody,
  type ReasonTemplateDto,
  type UpdateTemplateBody,
} from '../review.schema.js';
import {
  listingChanged,
  outcomeNotAllowed,
  type ReviewShared,
  type Surface,
  taskClosed,
  taskNotClaimed,
  taskNotFound,
  taskOpen,
  taskReassigned,
  type Viewer,
} from '../review.shared.js';

export interface ReviewDecisionService {
  decide(
    actor: Actor,
    taskId: string,
    surface: Surface,
    body: DecisionBody,
  ): Promise<DecisionResultDto>;
  /** Gỡ thẳng một tin sàn đang hiện không có việc mở (TK 6, chốt 15/10/2026). */
  removeDirectly(
    actor: Actor,
    listingId: string,
    input: { reasonTemplateId: string },
  ): Promise<DecisionResultDto>;
  /** Khôi phục tin sàn đã bị gỡ — thao tác trực tiếp, không qua việc; ngày hiển thị chạy tiếp. */
  restore(actor: Actor, listingId: string): Promise<DecisionResultDto>;
  /** Gỡ khỏi nhóm một tin của nhóm không có việc mở, kèm "trái quy định sàn" thì chuyển lên (design mục 11). */
  detachDirectly(
    actor: Actor,
    groupId: string,
    listingId: string,
    body: DirectDetachBody,
  ): Promise<DecisionResultDto>;
  /** Bước khởi động: sáu lý do khởi đầu khi bảng trống (test gọi tay — `buildTestApp` không chạy khởi động). */
  ensureReasonTemplates(): Promise<{ reasonTemplates: number }>;
  reasonTemplates(input: { includeInactive: boolean }): Promise<ReasonTemplateDto[]>;
  createReasonTemplate(actor: Actor, body: CreateTemplateBody): Promise<ReasonTemplateDto>;
  updateReasonTemplate(
    actor: Actor,
    templateId: string,
    body: UpdateTemplateBody,
  ): Promise<ReasonTemplateDto>;
}

const MACHINE_REASONS = new Set(['machine_hold', 'machine_restricted']);

/** Vai quản trị nhóm: thông báo cho người đăng ký "Quản trị nhóm" thay vì "Ghim" (notify-listing-decisions). */
const GROUP_ROLES: ReadonlySet<ReviewActorRole> = new Set(['owner', 'moderator']);

/**
 * Kết quả người đăng được báo (N45): cho đạt tin chờ duyệt, từ chối, gỡ, khôi phục. Đạt khi hậu kiểm tin đang hiện, gỡ
 * khỏi nhóm (N33 đã báo), bác việc nhóm chuyển lên — không báo.
 */
const noticeOutcome = (
  outcome: ReviewOutcome,
  stateBefore: ListingState,
): ListingDecidedOutcome | null => {
  switch (outcome) {
    case 'pass':
      return stateBefore === 'pending' ? 'approved' : null;
    case 'reject':
      return 'rejected';
    case 'remove':
      return 'removed';
    case 'restore':
      return 'restored';
    default:
      return null;
  }
};

/** Sự kiện cho người đăng, phát trong transaction của nhật ký quyết định: quyết định cuộn lại thì không ai được báo. */
const decidedEvents = (input: {
  decisionId: string;
  subject: ReviewSubject;
  outcome: ReviewOutcome;
  role: ReviewActorRole;
  groupId: string | null;
  reason: string | null;
  fault: ListingFault;
}): OutboxEventInput[] => {
  const outcome = noticeOutcome(input.outcome, input.subject.state);
  if (!outcome) return [];
  const faulted = outcome === 'rejected' || outcome === 'removed';
  return [
    reviewEvent(REVIEW_EVENTS.listingDecided, {
      decisionId: input.decisionId,
      listingId: input.subject.id,
      ownerId: input.subject.ownerId,
      outcome,
      fault: faulted ? input.fault : null,
      reason: faulted ? input.reason : null,
      groupId: GROUP_ROLES.has(input.role) ? input.groupId : null,
    }),
  ];
};

const templateDto = (row: ReviewReasonTemplate): ReasonTemplateDto => ({
  id: row.id,
  text: row.text,
  active: row.active,
  sort: row.sort,
});

/** Lượt ghi của `listing` báo phiên bản đã đổi bằng `CONFLICT` — với người xử, đó là người đăng vừa sửa tin. */
const asListingChanged = (error: unknown): never => {
  if (error instanceof AppError && error.code === 'CONFLICT') throw listingChanged();
  throw error;
};

const invalid = (message: string): BadRequestError =>
  new BadRequestError(message, 'VALIDATION_ERROR');

/** Trần T1 khi nhận gậy là tất định (spec trust-tiers): nhật ký ghi mức sau quyết định, không chờ bên nghe tính lại. */
const capT1 = (tier: TrustTier): TrustTier => (tier === 'T0' ? 'T0' : 'T1');

const STRIKE_PROMPT = {
  appeal: 'Khiếu nại: chọn chấp nhận hay bác',
  serious: 'Vi phạm nghiêm trọng: chọn khoá vĩnh viễn, hạ thành cảnh cáo nặng hay xoá',
  permanent: 'Xem lại khoá vĩnh viễn: chọn giữ tiếp hay gỡ khoá',
} as const;

/** `violation` của enum chỉ là nút bấm: nhật ký ghi `reject` / `remove` với `severity = violation` (add-strikes). */
type ListingOutcome = Exclude<ReviewOutcome, 'violation'>;

/** Kết quả thật của lượt quyết: `mistake` / `violation` thành từ chối hay gỡ theo trạng thái tin. */
const outcomeOf = (body: DecisionBody, subject: ReviewSubject): ListingOutcome => {
  if (body.outcome !== 'mistake' && body.outcome !== 'violation') return body.outcome;
  if (subject.state === 'pending') return 'reject';
  if (subject.state === 'live') return 'remove';
  throw outcomeNotAllowed('Tin không ở trạng thái từ chối hay gỡ được');
};

/**
 * Quyết định của người (TK 17, design add-review-queues mục 5, 6): kiểm theo thứ tự việc còn mở → còn vai trên phạm vi
 * → đang giữ việc → việc chưa chuyển chỗ → tin chưa đổi → kết quả hợp lệ; rồi đổi tin, đóng việc, ghi nhật ký, quay mẫu
 * hậu kiểm người duyệt và mở việc hàng 4 — tất cả trong transaction đổi tin.
 */
export function createDecisionService(
  shared: ReviewShared,
  queue: ReviewQueueService,
): ReviewDecisionService {
  const { repository, reports, listings, screening, trust, groups, config, clock, random } = shared;
  const { reportRules } = shared;
  const { viewerOf, locateTask, withSharedDevices } = shared;

  /** Vai trên phạm vi của việc, đọc lại lúc quyết — mất vai thì 403 dù việc còn trong tay (spec review/decisions). */
  const roleOn = async (
    actor: Actor,
    surface: Surface,
    task: Pick<ReviewTask, 'categoryId' | 'accountId'>,
    viewer: Viewer,
  ): Promise<ReviewActorRole | null> => {
    const { categoryId } = task;
    if (viewer.isMaster) return 'master';
    // Việc về một người: staff được giao việc an toàn (add-reports).
    if (task.accountId) return viewer.scopes.has('user_reports') ? 'staff' : null;
    if (surface.kind === 'ops') {
      return categoryId !== null && viewer.categoryIds.has(categoryId) ? 'staff' : null;
    }
    const reviewers = await groups.reviewersOf(surface.groupId);
    if (reviewers?.ownerId === actor.accountId) return 'owner';
    return reviewers?.moderators.some((m) => m.accountId === actor.accountId) ? 'moderator' : null;
  };

  const activeTemplate = async (id: string | undefined): Promise<ReviewReasonTemplate> => {
    const template = id ? await repository.findTemplate(id) : null;
    if (!template?.active) throw invalid('Chọn một lý do mẫu đang dùng cho kết quả "sai sót"');
    return template;
  };

  /**
   * Cảnh cáo chỉ kèm quyết định vi phạm hay báo cáo đúng; điều trích phải đang dùng (spec decisions "Thiếu điều trích" →
   * 400). Câu trích là lý do người đăng thấy trên tin.
   */
  const articleFor = async (
    body: DecisionBody,
    verdict: ReportVerdict | null,
  ): Promise<RuleArticleDto | null> => {
    if (!body.strike) return null;
    if (body.outcome !== 'violation' && verdict !== 'upheld') {
      throw invalid('Cảnh cáo chỉ kèm quyết định vi phạm hay báo cáo đúng');
    }
    const article = await trust.ruleArticle(body.strike.ruleArticleId);
    if (!article?.active) throw invalid('Chọn một điều đang dùng trong quy định sàn');
    return article;
  };

  /** Ra gậy trong transaction quyết định — `trust` ghi, nhật ký trỏ về gậy (spec decisions "ghi hậu quả thật"). */
  const issueStrike = async (
    tx: Tx,
    decisionId: string,
    input: Omit<IssueStrikeInput, 'decisionId'>,
  ): Promise<string> => {
    const issued = await trust.issueStrike(tx, { ...input, decisionId });
    await repository.linkIssuedStrike(tx, decisionId, issued.id);
    return issued.id;
  };

  /** Ảnh chụp cho nhật ký: kết quả máy trước đó và mức tin cậy của người đăng — đọc trước transaction. */
  const snapshot = async (subject: ReviewSubject) => {
    const [run, tier] = await Promise.all([
      screening.runOf(subject.id),
      trust.tierOf(subject.ownerId),
    ]);
    return { machineOutcome: run?.outcome ?? null, machineHits: run?.hits ?? [], tier };
  };

  /** Đổi tin theo kết quả; `after` chạy trong transaction đó. Không đổi tin (bác) thì vẫn một transaction riêng. */
  const applyToListing = async (
    outcome: ListingOutcome,
    subject: ReviewSubject,
    version: number,
    fault: ListingFault,
    faultReason: string | null,
    groupId: string | null,
    after: (tx: Tx, listing: Listing | null) => Promise<void>,
  ): Promise<void> => {
    const base = {
      listingId: subject.id,
      version,
      after: (tx: Tx, row: Listing) => after(tx, row),
    };
    switch (outcome) {
      case 'pass':
        await (
          subject.state === 'pending'
            ? listings.review({ ...base, arrow: 'approve' })
            : listings.confirmLive(base)
        ).catch(asListingChanged);
        return;
      case 'reject':
      case 'remove':
        await listings
          .review({ ...base, arrow: outcome, fault, faultReason })
          .catch(asListingChanged);
        return;
      case 'restore':
        await listings.review({ ...base, arrow: 'restore' }).catch(asListingChanged);
        return;
      case 'detach':
        if (!groupId) throw outcomeNotAllowed('Chỉ gỡ khỏi nhóm được tin trong nhóm');
        await listings.detachByGroup({ ...base, groupId }).catch(asListingChanged);
        return;
      case 'dismiss':
      case 'keep':
        await repository.inTransaction((tx) => after(tx, null));
        return;
    }
  };

  const conflictOfInterest = async (actor: Actor, isMaster: boolean, ownerId: string) => {
    if (isMaster) return;
    if ((await withSharedDevices([ownerId])).includes(actor.accountId)) {
      throw new ForbiddenError('Không xử tin của chính mình hay của tài khoản dùng chung thiết bị');
    }
  };

  /** Gỡ khỏi nhóm kèm "trái quy định sàn": việc hàng 4, người chuyển lên và máy của họ không xử nó (TK 17). */
  const escalate = (tx: Tx, listingId: string, actor: Actor, note: string) =>
    queue.addReason(listingId, {
      reason: 'group_escalation',
      alsoExclude: [actor.accountId],
      escalation: { by: actor.accountId, note },
      tx,
    });

  /** Gỡ / khôi phục trực tiếp: staff của danh mục hay master, chỉ tin sàn chung, không tin của chính mình. */
  const directSubject = async (actor: Actor, listingId: string) => {
    const subject = await listings.reviewSubject(listingId);
    if (!subject) throw new NotFoundError('Không có tin này');
    const viewer = await viewerOf(actor);
    if (!viewer.isMaster && !(subject.categoryId && viewer.categoryIds.has(subject.categoryId))) {
      throw new ForbiddenError();
    }
    if (subject.placement !== 'marketplace') {
      throw outcomeNotAllowed('Thao tác trực tiếp chỉ áp cho tin sàn chung');
    }
    await conflictOfInterest(actor, viewer.isMaster, subject.ownerId);
    return { subject, role: viewer.isMaster ? ('master' as const) : ('staff' as const) };
  };

  /**
   * Vai trong nhóm với một tin của nhóm: chủ nhóm, điều hành cả nhóm, điều hành đúng đơn vị của tin. Không theo chuỗi
   * chuyển tiếp như việc: thao tác trực tiếp là của ai có quyền trên phạm vi tin.
   */
  const groupRoleOver = async (
    actor: Actor,
    groupId: string,
    unitId: string | null,
  ): Promise<'owner' | 'moderator' | null> => {
    const reviewers = await groups.reviewersOf(groupId);
    if (!reviewers?.moderationAllowed) return null;
    if (reviewers.ownerId === actor.accountId) return 'owner';
    const covers = reviewers.moderators.some(
      (m) => m.accountId === actor.accountId && (m.unitId === null || m.unitId === unitId),
    );
    return covers ? 'moderator' : null;
  };

  /** Việc không đóng được vì quyết định: đọc lại trong `tx` để báo đúng chuyện đã xảy ra (T6). */
  const whyNotClosed = async (tx: Tx, task: ReviewTask): Promise<Error> => {
    const fresh = await repository.findTaskIn(tx, task.id);
    if (fresh?.status !== 'open') return taskClosed();
    if (fresh.escalatedAt?.getTime() !== task.escalatedAt?.getTime()) return taskReassigned();
    return taskNotClaimed();
  };

  /** Quyết định không qua việc: gỡ / khôi phục tin sàn, gỡ khỏi nhóm — nhật ký không gắn việc. */
  const directDecision = async (
    actor: Actor,
    subject: ReviewSubject,
    role: ReviewActorRole,
    outcome: 'remove' | 'restore' | 'detach',
    extra: { template?: ReviewReasonTemplate; note?: string; escalate?: boolean } = {},
  ): Promise<DecisionResultDto> => {
    const { template, note } = extra;
    const facts = await snapshot(subject);
    const written: { decision?: ReviewDecision } = {};
    let state = subject.state;
    await applyToListing(
      outcome,
      subject,
      subject.version,
      'mistake',
      template?.text ?? null,
      subject.groupId,
      async (tx, row) => {
        state = row?.state ?? state;
        written.decision = await repository.insertDecision(tx, {
          listingId: subject.id,
          actorId: actor.accountId,
          actorRole: role,
          outcome,
          severity: outcome === 'remove' ? 'mistake' : null,
          reasonTemplateId: template?.id ?? null,
          reasonText: template?.text ?? null,
          note: note ?? null,
          machineOutcome: facts.machineOutcome,
          machineHits: facts.machineHits,
          listingStateAfter: state,
          posterTierAfter: facts.tier,
          decidedAt: clock(),
        });
        await repository.emitIn(
          tx,
          decidedEvents({
            decisionId: written.decision.id,
            subject,
            outcome,
            role,
            groupId: subject.groupId,
            reason: template?.text ?? null,
            fault: 'mistake',
          }),
        );
        if (outcome === 'restore' && row) {
          await repository.addSampleCandidate(
            {
              listingId: subject.id,
              listingVersion: row.version,
              at: clock(),
              approvedBy: actor.accountId,
            },
            tx,
          );
        }
        if (extra.escalate && note) await escalate(tx, subject.id, actor, note);
      },
    );
    if (!written.decision) throw new Error('Quyết định không được ghi');
    return {
      decisionId: written.decision.id,
      outcome,
      listingState: state,
      reportVerdict: null,
      strikeId: null,
    };
  };

  /**
   * Đóng báo cáo trong transaction của quyết định (design add-reports mục 7, 8): cộng / trừ điểm từng người báo, phát
   * sự kiện cho người báo (N46) và cho hệ quả; báo cáo đã tự ẩn tin thì `listing` gỡ cờ.
   */
  const closeReport = async (
    tx: Tx,
    input: {
      reportId: string;
      verdict: ReportVerdict;
      decisionId: string;
      actor: Actor;
      banGroupId: string | null;
      lockAccount: boolean;
      at: Date;
    },
  ): Promise<void> => {
    const { verdict, at } = input;
    const closed = await reports.close(tx, {
      id: input.reportId,
      verdict,
      decisionId: input.decisionId,
      at,
    });
    if (!closed) throw taskClosed();
    const rules = reportRules();
    await sequentially(closed.entries, async ({ reporterId }) => {
      const score = await reports.adjustScore(tx, reporterId, scoreDelta(verdict));
      const until = suspendedUntilAfter(verdict, score, at, rules);
      if (until) await reports.suspend(tx, reporterId, until);
    });
    await repository.emitIn(tx, [
      reviewEvent(REVIEW_EVENTS.reportDecided, {
        reportId: closed.id,
        verdict,
        subjectKind: closed.subjectKind,
        listingId: closed.listingId,
        accountId: closed.accountId,
        reporterIds: closed.entries.map((entry) => entry.reporterId),
        banGroupId: input.banGroupId,
        lockAccount: input.lockAccount,
        by: input.actor.accountId,
        byMaster: input.actor.role === 'master',
      }),
      ...(closed.autoHiddenAt && closed.listingId
        ? [reviewEvent(REVIEW_EVENTS.reportHideChanged, { listingId: closed.listingId })]
        : []),
    ]);
  };

  /**
   * Hệ quả ngoài tin của báo cáo đúng, kiểm quyền trước mọi lượt ghi (spec review/reports "Hệ quả khi báo cáo đúng"):
   * cấm khỏi nhóm — quản trị nhóm, master, tin trong nhóm, người đăng không phải chủ nhóm; khoá tài khoản — master.
   */
  const consequencesOf = async (
    body: DecisionBody,
    role: ReviewActorRole,
    scope: { groupId: string | null; inGroup: boolean; ownerId: string },
  ): Promise<{ banGroupId: string | null; lockAccount: boolean }> => {
    const report = body.report;
    if (!report) return { banGroupId: null, lockAccount: false };
    const wants = report.banFromGroup === true || report.lockAccount === true;
    if (wants && report.verdict !== 'upheld') {
      throw outcomeNotAllowed('Chỉ báo cáo đúng mới kèm cấm khỏi nhóm hay khoá tài khoản');
    }
    if (report.lockAccount && role !== 'master') {
      throw new ForbiddenError('Chỉ master khoá được tài khoản');
    }
    if (!report.banFromGroup) return { banGroupId: null, lockAccount: report.lockAccount === true };
    if (role === 'staff')
      throw new ForbiddenError('Cấm khỏi nhóm là việc của quản trị nhóm hay master');
    if (!scope.inGroup || !scope.groupId) throw outcomeNotAllowed('Tin không ở trong nhóm nào');
    const reviewers = await groups.reviewersOf(scope.groupId);
    if (reviewers?.ownerId === scope.ownerId) throw outcomeNotAllowed('Không cấm được chủ nhóm');
    return { banGroupId: scope.groupId, lockAccount: report.lockAccount === true };
  };

  /** Quyết định về một người (báo cáo về người — add-reports): "đúng" hay "bác", không có tin nào để đổi. */
  const decideAboutPerson = async (
    actor: Actor,
    task: ReviewTask,
    role: ReviewActorRole,
    body: DecisionBody,
  ): Promise<DecisionResultDto> => {
    const accountId = task.accountId ?? '';
    const verdict = body.report?.verdict;
    if (!verdict) throw invalid('Việc có báo cáo: chọn báo cáo đúng hay bác');
    if (body.outcome !== 'keep') {
      throw outcomeNotAllowed('Báo cáo về một người chỉ quyết đúng hay bác, không đổi tin nào');
    }
    if (body.report?.banFromGroup)
      throw outcomeNotAllowed('Báo cáo về một người không gắn nhóm nào');
    const article = await articleFor(body, verdict);
    const { lockAccount } = await consequencesOf(body, role, {
      groupId: null,
      inGroup: false,
      ownerId: accountId,
    });
    const tier = await trust.tierOf(accountId);
    const now = clock();
    let issuedStrikeId: string | null = null;
    const decision = await repository.inTransaction(async (tx) => {
      const closed = await repository.closeDecided(tx, {
        id: task.id,
        actorId: actor.accountId,
        claimedVersion: null,
        escalatedAt: task.escalatedAt,
        now: clock(),
      });
      if (!closed) throw await whyNotClosed(tx, task);
      const subject: ReportSubject = { kind: 'account', accountId };
      const report = await reports.lockOpenIn(tx, subject);
      const written = await repository.insertDecision(tx, {
        taskId: task.id,
        accountId,
        actorId: actor.accountId,
        actorRole: role,
        outcome: 'keep',
        reasonText: article?.text ?? null,
        note: body.note ?? null,
        taskReasons: task.reasons,
        queue: task.queue,
        posterTierAfter: body.strike ? capT1(tier) : tier,
        reportId: report?.id ?? null,
        reportVerdict: report ? verdict : null,
        decidedAt: now,
      });
      if (report) {
        await closeReport(tx, {
          reportId: report.id,
          verdict,
          decisionId: written.id,
          actor,
          banGroupId: null,
          lockAccount,
          at: now,
        });
      }
      // Gậy từ báo cáo về người: master xét khiếu nại (spec appeals) — kể cả khi tài khoản đã tự xoá, gậy đi theo email.
      if (body.strike) {
        issuedStrikeId = await issueStrike(tx, written.id, {
          accountId,
          kind: body.strike.kind,
          ruleArticleId: body.strike.ruleArticleId,
          issuedBy: actor.accountId,
          issuedByRole: role,
          categoryId: null,
          fromReport: true,
          listingId: null,
        });
      }
      return written;
    });
    return {
      decisionId: decision.id,
      outcome: 'keep',
      listingState: null,
      reportVerdict: verdict,
      strikeId: issuedStrikeId,
    };
  };

  /**
   * Quyết định về một gậy (add-strikes): khiếu nại gậy thường / nặng (staff danh mục của gậy, master); gậy nghiêm trọng
   * và xem lại khoá vĩnh viễn (chỉ master, khác người ra gậy). Nút phải khớp tình trạng gậy lúc quyết; `trust` ghi
   * trong cùng transaction với nhật ký và việc đóng.
   */
  const decideAboutStrike = async (
    actor: Actor,
    task: ReviewTask,
    role: ReviewActorRole,
    body: DecisionBody,
  ): Promise<DecisionResultDto> => {
    const strikeId = task.strikeId ?? '';
    const strike = await trust.strikeDetail(strikeId);
    if (!strike) throw taskClosed();
    if (body.outcome !== 'keep' || body.report || body.strike) {
      throw outcomeNotAllowed(
        'Việc về cảnh cáo chỉ quyết khiếu nại, vi phạm nghiêm trọng hay xem lại khoá vĩnh viễn',
      );
    }
    const expected =
      strike.kind === 'serious' && strike.status === 'active'
        ? 'serious'
        : strike.status === 'permanent'
          ? 'permanent'
          : 'appeal';
    const given = (['appeal', 'serious', 'permanent'] as const).filter((key) => body[key]);
    if (given.length !== 1 || given[0] !== expected) throw invalid(STRIKE_PROMPT[expected]);
    if (expected !== 'appeal' && role !== 'master') {
      throw new ForbiddenError('Chỉ master quyết vi phạm nghiêm trọng');
    }
    // Master xem lại gậy thường / nặng do mình ra (spec appeals); gậy nghiêm trọng thì master kia quyết.
    if (strike.issuedBy === actor.accountId && (expected !== 'appeal' || role !== 'master')) {
      throw new ForbiddenError('Người ghi cảnh cáo không tự quyết cảnh cáo đó');
    }
    if (expected === 'appeal' && strike.appeal?.status !== 'pending') throw taskClosed();
    const tier = await trust.tierOf(strike.accountId);
    const now = clock();
    const decision = await repository.inTransaction(async (tx) => {
      const closed = await repository.closeDecided(tx, {
        id: task.id,
        actorId: actor.accountId,
        claimedVersion: null,
        escalatedAt: task.escalatedAt,
        now,
      });
      if (!closed) throw await whyNotClosed(tx, task);
      const written = await repository.insertDecision(tx, {
        taskId: task.id,
        strikeId,
        actorId: actor.accountId,
        actorRole: role,
        outcome: 'keep',
        note: body.note ?? null,
        taskReasons: task.reasons,
        queue: task.queue,
        posterTierAfter: tier,
        decidedAt: now,
      });
      const by = actor.accountId;
      if (body.appeal) {
        await trust.decideAppeal(tx, { strikeId, verdict: body.appeal.verdict, by, at: now });
      } else if (body.serious) {
        await trust.decideSerious(tx, { strikeId, decision: body.serious.decision, by, at: now });
      } else if (body.permanent) {
        await trust.decidePermanentReview(tx, {
          strikeId,
          decision: body.permanent.decision,
          by,
          at: now,
        });
      }
      return written;
    });
    return {
      decisionId: decision.id,
      outcome: 'keep',
      listingState: null,
      reportVerdict: null,
      strikeId,
    };
  };

  return {
    async decide(actor, taskId, surface, body) {
      const found = await locateTask(actor, taskId, surface);
      if (!found) throw taskNotFound();
      const { task, viewer, allowed } = found;
      if (task.status !== 'open') throw taskClosed();
      const role = await roleOn(actor, surface, task, viewer);
      if (!role) throw new ForbiddenError();
      // Việc về gậy: người ra gậy, người nhận và máy của họ có vai trên phạm vi, chỉ bị luật hai người chặn (spec appeals).
      if (task.strikeId && task.excludedIds.includes(actor.accountId)) {
        throw new ForbiddenError(
          'Việc về cảnh cáo cần một người khác người ghi cảnh cáo hay người nhận cảnh cáo',
        );
      }
      // Việc đã chuyển chỗ (chuyển master xoá người giữ) nói đúng chuyện trước khi nói "chưa nhận" (L11).
      if (!allowed) throw taskReassigned();
      const now = clock();
      if (
        task.claimedBy !== actor.accountId ||
        !task.claimExpiresAt ||
        task.claimExpiresAt <= now
      ) {
        throw taskNotClaimed();
      }
      if (task.strikeId) return decideAboutStrike(actor, task, role, body);
      const { listingId } = task;
      if (!listingId) return decideAboutPerson(actor, task, role, body);
      // Bản lưu của tin đã xoá vẫn quyết được báo cáo về nó (add-reports).
      const subject = await listings.reviewSubject(listingId, { includeDeleted: true });
      if (!subject) throw taskClosed();
      if (subject.version !== task.claimedVersion) throw listingChanged();

      const reported = task.reasons.some((reason) => REPORT_REASONS.has(reason));
      const verdict = body.report?.verdict ?? null;
      if (reported && !verdict) throw invalid('Việc có báo cáo: chọn báo cáo đúng hay bác');
      if (!reported && body.report) throw invalid('Việc này không có báo cáo nào để quyết');
      if (body.outcome === 'keep' && !reported) {
        throw outcomeNotAllowed('Giữ nguyên tin chỉ dùng cho việc có báo cáo');
      }
      if (subject.deleted && body.outcome !== 'keep') {
        throw outcomeNotAllowed(
          'Người đăng đã xoá tin — chỉ quyết được báo cáo, không đổi được tin',
        );
      }
      const outcome = outcomeOf(body, subject);
      const fault: ListingFault = body.outcome === 'violation' ? 'violation' : 'mistake';
      // Gậy chỉ từ staff danh mục, master (spec strikes) — điều hành nhóm có nút gỡ khỏi nhóm, không có nút vi phạm.
      if ((fault === 'violation' || body.strike) && GROUP_ROLES.has(role)) {
        throw new ForbiddenError('Điều hành nhóm không ghi cảnh cáo được');
      }
      const machineHeld = task.reasons.some((reason) => MACHINE_REASONS.has(reason));
      const escalated = task.reasons.includes('group_escalation');
      const inGroup = task.groupId !== null && task.placement !== 'marketplace';
      if (outcome === 'detach' && !inGroup) {
        throw outcomeNotAllowed('Chỉ gỡ khỏi nhóm được tin trong nhóm');
      }
      if (outcome === 'detach' && role === 'staff') throw new ForbiddenError();
      if (outcome === 'dismiss' && (!escalated || (role !== 'staff' && role !== 'master'))) {
        throw outcomeNotAllowed('Chỉ bác được việc nhóm chuyển lên');
      }
      if (outcome === 'pass' && escalated && !machineHeld) {
        throw outcomeNotAllowed('Việc nhóm chuyển lên chỉ bác được, hoặc gỡ vì sai sót / vi phạm');
      }
      if (outcome === 'pass' && task.reasons.includes('machine_hold') && !body.machineJudgment) {
        throw invalid('Cho đạt tin máy giữ thì chọn "máy đúng" hay "máy quá tay"');
      }
      if (outcome === 'keep' && task.reasons.includes('machine_hold')) {
        throw outcomeNotAllowed('Tin đang chờ duyệt — cho đạt hay từ chối');
      }
      if (verdict === 'upheld' && outcome === 'pass') {
        throw outcomeNotAllowed('Báo cáo đúng thì không cho đạt tin');
      }
      // Gỡ tin vì báo cáo là của staff danh mục, master; quản trị nhóm gỡ khỏi nhóm (TK 23).
      if (reported && outcome === 'remove' && (role === 'owner' || role === 'moderator')) {
        throw new ForbiddenError();
      }
      const consequences = await consequencesOf(body, role, {
        groupId: task.groupId,
        inGroup,
        ownerId: subject.ownerId,
      });
      const faulted = outcome === 'reject' || outcome === 'remove';
      const template =
        faulted && fault === 'mistake' ? await activeTemplate(body.reasonTemplateId) : null;
      const article = await articleFor(body, verdict);
      const faultReason = template?.text ?? article?.text ?? null;
      const facts = await snapshot(subject);
      // Mẫu hậu kiểm người duyệt: người cho đạt điều máy giữ hay hạn chế, trừ master (nguyên tắc 3, chốt 15/10/2026).
      const sampleReviewer =
        outcome === 'pass' &&
        machineHeld &&
        subject.hideReasons.length === 0 &&
        role !== 'master' &&
        sampled(config.get('postcheck.reviewerPassSamplePercent'), random());
      const overturns =
        task.sampledDecisionId && (outcome === 'remove' || outcome === 'detach')
          ? task.sampledDecisionId
          : null;

      const written: { decision?: ReviewDecision } = {};
      let state = subject.state;
      let issuedStrikeId: string | null = null;
      await applyToListing(
        outcome,
        subject,
        task.claimedVersion,
        fault,
        faultReason,
        task.groupId,
        async (tx, row) => {
          state = row?.state ?? state;
          // Một việc một quyết định (T6): không đóng được thì ném — lượt đổi tin quay lui theo.
          const closed = await repository.closeDecided(tx, {
            id: task.id,
            actorId: actor.accountId,
            claimedVersion: task.claimedVersion,
            escalatedAt: task.escalatedAt,
            now: clock(),
          });
          if (!closed) throw await whyNotClosed(tx, task);
          if (outcome === 'pass' && subject.state === 'pending' && row) {
            await repository.addSampleCandidate(
              {
                listingId,
                listingVersion: row.version,
                at: now,
                approvedBy: actor.accountId,
              },
              tx,
            );
          }
          const report = verdict
            ? await reports.lockOpenIn(tx, { kind: 'listing', listingId })
            : null;
          written.decision = await repository.insertDecision(tx, {
            taskId: task.id,
            listingId,
            actorId: actor.accountId,
            actorRole: role,
            outcome,
            severity: faulted ? fault : null,
            reasonTemplateId: template?.id ?? null,
            reasonText: faultReason,
            note: body.note ?? null,
            machineJudgment: outcome === 'pass' ? (body.machineJudgment ?? null) : null,
            machineOutcome: facts.machineOutcome,
            machineHits: facts.machineHits,
            taskReasons: task.reasons,
            queue: task.queue,
            listingStateAfter: state,
            posterTierAfter: body.strike ? capT1(facts.tier) : facts.tier,
            overturnsDecisionId: overturns,
            reportId: report?.id ?? null,
            reportVerdict: report ? verdict : null,
            decidedAt: now,
          });
          if (report && verdict) {
            await closeReport(tx, {
              reportId: report.id,
              verdict,
              decisionId: written.decision.id,
              actor,
              ...consequences,
              at: now,
            });
          }
          if (body.strike) {
            issuedStrikeId = await issueStrike(tx, written.decision.id, {
              accountId: subject.ownerId,
              kind: body.strike.kind,
              ruleArticleId: body.strike.ruleArticleId,
              issuedBy: actor.accountId,
              issuedByRole: role,
              categoryId: subject.categoryId,
              fromReport: false,
              listingId,
            });
          }
          await repository.emitIn(
            tx,
            decidedEvents({
              decisionId: written.decision.id,
              subject,
              outcome,
              role,
              groupId: task.groupId,
              reason: faultReason,
              fault,
            }),
          );
          if (sampleReviewer) {
            await queue.addReason(listingId, {
              reason: 'sample_reviewer',
              alsoExclude: [actor.accountId],
              sampledDecisionId: written.decision.id,
              tx,
            });
          }
          if (outcome === 'detach' && body.platformViolation && body.note) {
            await escalate(tx, listingId, actor, body.note);
          }
        },
      ).catch(async (error: unknown) => {
        // Lượt quyết thứ hai trên tin vừa đổi vấp phiên bản tin trước: việc đã đóng thì nói việc đã đóng (T6).
        if (error instanceof AppError && error.code === 'LISTING_CHANGED') {
          const fresh = await repository.findTask(task.id);
          if (fresh?.status !== 'open') throw taskClosed();
        }
        throw error;
      });
      if (!written.decision) throw new Error('Quyết định không được ghi');
      return {
        decisionId: written.decision.id,
        outcome,
        listingState: state,
        reportVerdict: verdict,
        strikeId: issuedStrikeId,
      };
    },

    async removeDirectly(actor, listingId, { reasonTemplateId }) {
      const { subject, role } = await directSubject(actor, listingId);
      if (await repository.hasOpenTask(listingId)) throw taskOpen();
      const template = await activeTemplate(reasonTemplateId);
      return directDecision(actor, subject, role, 'remove', { template });
    },

    async restore(actor, listingId) {
      const { subject, role } = await directSubject(actor, listingId);
      return directDecision(actor, subject, role, 'restore');
    },

    async detachDirectly(actor, groupId, listingId, body) {
      const subject = await listings.reviewSubject(listingId);
      if (!subject || subject.groupId !== groupId || subject.placement === 'marketplace') {
        throw new NotFoundError('Không có tin này trong nhóm');
      }
      const role = await groupRoleOver(actor, groupId, subject.unitId);
      if (!role) throw new ForbiddenError();
      await conflictOfInterest(actor, false, subject.ownerId);
      if (await repository.hasOpenTask(listingId)) throw taskOpen();
      return directDecision(actor, subject, role, 'detach', {
        ...(body.note === undefined ? {} : { note: body.note }),
        escalate: body.platformViolation === true,
      });
    },

    async ensureReasonTemplates() {
      return {
        reasonTemplates: await repository.seedTemplatesIfEmpty(DEFAULT_REASON_TEMPLATES),
      };
    },

    async reasonTemplates(input) {
      return (await repository.listTemplates(input)).map(templateDto);
    },

    async createReasonTemplate(actor, body) {
      const row = await repository.createTemplate({ ...body, createdBy: actor.accountId });
      return templateDto(row);
    },

    async updateReasonTemplate(_actor, templateId, body) {
      const row = await repository.updateTemplate(templateId, {
        ...(body.text !== undefined ? { text: body.text } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.sort !== undefined ? { sort: body.sort } : {}),
      });
      if (!row) throw new NotFoundError('Không có lý do mẫu này');
      return templateDto(row);
    },
  };
}
