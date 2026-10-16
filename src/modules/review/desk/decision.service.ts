import type {
  Listing,
  ListingState,
  ReviewActorRole,
  ReviewDecision,
  ReviewOutcome,
  ReviewReasonTemplate,
  ReviewTask,
} from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import type { OutboxEventInput } from '../../../common/outbox/outbox.js';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/app-error.js';
import type { ReviewSubject } from '../../listing/listing.ports.js';
import { sampled } from '../calc/sampling.calc.js';
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
      fault: faulted ? 'mistake' : null,
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

/** Kết quả thật của lượt quyết: `mistake` thành từ chối hay gỡ theo trạng thái tin. */
const outcomeOf = (body: DecisionBody, subject: ReviewSubject): ReviewOutcome => {
  if (body.outcome !== 'mistake') return body.outcome;
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
  const { repository, listings, screening, trust, groups, config, clock, random } = shared;
  const { viewerOf, locateTask, withSharedDevices } = shared;

  /** Vai trên phạm vi của việc, đọc lại lúc quyết — mất vai thì 403 dù việc còn trong tay (spec review/decisions). */
  const roleOn = async (
    actor: Actor,
    surface: Surface,
    categoryId: string | null,
    viewer: Viewer,
  ): Promise<ReviewActorRole | null> => {
    if (viewer.isMaster) return 'master';
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
    outcome: ReviewOutcome,
    subject: ReviewSubject,
    version: number,
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
          .review({ ...base, arrow: outcome, fault: 'mistake', faultReason })
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
    return { decisionId: written.decision.id, outcome, listingState: state };
  };

  return {
    async decide(actor, taskId, surface, body) {
      const found = await locateTask(actor, taskId, surface);
      if (!found) throw taskNotFound();
      const { task, viewer, allowed } = found;
      if (task.status !== 'open') throw taskClosed();
      const role = await roleOn(actor, surface, task.categoryId, viewer);
      if (!role) throw new ForbiddenError();
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
      const subject = await listings.reviewSubject(task.listingId);
      if (!subject) throw taskClosed();
      if (subject.version !== task.claimedVersion) throw listingChanged();

      const outcome = outcomeOf(body, subject);
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
        throw outcomeNotAllowed('Việc nhóm chuyển lên chỉ bác được, hoặc gỡ vì sai sót');
      }
      if (outcome === 'pass' && task.reasons.includes('machine_hold') && !body.machineJudgment) {
        throw invalid('Cho đạt tin máy giữ thì chọn "máy đúng" hay "máy quá tay"');
      }
      const template =
        outcome === 'reject' || outcome === 'remove'
          ? await activeTemplate(body.reasonTemplateId)
          : null;
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
      await applyToListing(
        outcome,
        subject,
        task.claimedVersion,
        template?.text ?? null,
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
                listingId: task.listingId,
                listingVersion: row.version,
                at: now,
                approvedBy: actor.accountId,
              },
              tx,
            );
          }
          written.decision = await repository.insertDecision(tx, {
            taskId: task.id,
            listingId: task.listingId,
            actorId: actor.accountId,
            actorRole: role,
            outcome,
            severity: outcome === 'reject' || outcome === 'remove' ? 'mistake' : null,
            reasonTemplateId: template?.id ?? null,
            reasonText: template?.text ?? null,
            note: body.note ?? null,
            machineJudgment: outcome === 'pass' ? (body.machineJudgment ?? null) : null,
            machineOutcome: facts.machineOutcome,
            machineHits: facts.machineHits,
            taskReasons: task.reasons,
            queue: task.queue,
            listingStateAfter: state,
            posterTierAfter: facts.tier,
            overturnsDecisionId: overturns,
            decidedAt: now,
          });
          await repository.emitIn(
            tx,
            decidedEvents({
              decisionId: written.decision.id,
              subject,
              outcome,
              role,
              groupId: task.groupId,
              reason: template?.text ?? null,
            }),
          );
          if (sampleReviewer) {
            await queue.addReason(task.listingId, {
              reason: 'sample_reviewer',
              alsoExclude: [actor.accountId],
              sampledDecisionId: written.decision.id,
              tx,
            });
          }
          if (outcome === 'detach' && body.platformViolation && body.note) {
            await escalate(tx, task.listingId, actor, body.note);
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
      return { decisionId: written.decision.id, outcome, listingState: state };
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
