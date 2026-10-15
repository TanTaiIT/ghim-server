import type {
  Listing,
  ReviewActorRole,
  ReviewDecision,
  ReviewOutcome,
  ReviewReasonTemplate,
} from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/app-error.js';
import type { ReviewSubject } from '../../listing/listing.ports.js';
import { sampled } from '../calc/sampling.calc.js';
import type { ReviewQueueService } from '../queue/queue.service.js';
import type { Tx } from '../review.repository.js';
import type {
  CreateTemplateBody,
  DecisionBody,
  DecisionResultDto,
  ReasonTemplateDto,
  UpdateTemplateBody,
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
  reasonTemplates(input: { includeInactive: boolean }): Promise<ReasonTemplateDto[]>;
  createReasonTemplate(actor: Actor, body: CreateTemplateBody): Promise<ReasonTemplateDto>;
  updateReasonTemplate(
    actor: Actor,
    templateId: string,
    body: UpdateTemplateBody,
  ): Promise<ReasonTemplateDto>;
}

const MACHINE_REASONS = new Set(['machine_hold', 'machine_restricted']);

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

  const conflictOfInterest = async (actor: Actor, viewer: Viewer, ownerId: string) => {
    if (viewer.isMaster) return;
    if ((await withSharedDevices([ownerId])).includes(actor.accountId)) {
      throw new ForbiddenError('Không xử tin của chính mình hay của tài khoản dùng chung thiết bị');
    }
  };

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
    await conflictOfInterest(actor, viewer, subject.ownerId);
    return { subject, viewer };
  };

  const directDecision = async (
    actor: Actor,
    subject: ReviewSubject,
    viewer: Viewer,
    outcome: 'remove' | 'restore',
    template: ReviewReasonTemplate | null,
  ): Promise<DecisionResultDto> => {
    const facts = await snapshot(subject);
    const written: { decision?: ReviewDecision } = {};
    let state = subject.state;
    await applyToListing(
      outcome,
      subject,
      subject.version,
      template?.text ?? null,
      null,
      async (tx, row) => {
        state = row?.state ?? state;
        written.decision = await repository.insertDecision(tx, {
          listingId: subject.id,
          actorId: actor.accountId,
          actorRole: viewer.isMaster ? 'master' : 'staff',
          outcome,
          severity: outcome === 'remove' ? 'mistake' : null,
          reasonTemplateId: template?.id ?? null,
          reasonText: template?.text ?? null,
          machineOutcome: facts.machineOutcome,
          machineHits: facts.machineHits,
          listingStateAfter: state,
          posterTierAfter: facts.tier,
          decidedAt: clock(),
        });
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
      const now = clock();
      if (
        task.claimedBy !== actor.accountId ||
        !task.claimExpiresAt ||
        task.claimExpiresAt <= now
      ) {
        throw taskNotClaimed();
      }
      if (!allowed) throw taskReassigned();
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
          await repository.closeTask(tx, task.id, 'decided', now);
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
          if (sampleReviewer) {
            await queue.addReason(task.listingId, {
              reason: 'sample_reviewer',
              alsoExclude: [actor.accountId],
              sampledDecisionId: written.decision.id,
              tx,
            });
          }
          if (outcome === 'detach' && body.platformViolation && body.note) {
            await queue.addReason(task.listingId, {
              reason: 'group_escalation',
              alsoExclude: [actor.accountId],
              escalation: { by: actor.accountId, note: body.note },
              tx,
            });
          }
        },
      );
      if (!written.decision) throw new Error('Quyết định không được ghi');
      return { decisionId: written.decision.id, outcome, listingState: state };
    },

    async removeDirectly(actor, listingId, { reasonTemplateId }) {
      const { subject, viewer } = await directSubject(actor, listingId);
      if (await repository.hasOpenTask(listingId)) throw taskOpen();
      const template = await activeTemplate(reasonTemplateId);
      return directDecision(actor, subject, viewer, 'remove', template);
    },

    async restore(actor, listingId) {
      const { subject, viewer } = await directSubject(actor, listingId);
      return directDecision(actor, subject, viewer, 'restore', null);
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
