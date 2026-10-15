import { z } from 'zod';

import { paginationQuerySchema } from '../../common/schemas/pagination.js';
import { ownListingSchema } from '../listing/listing.schema.js';

/** Tuple của enum `review_reason` — số hàng ở `calc/task.calc.ts`. */
export const REVIEW_REASONS = [
  'machine_hold',
  'machine_restricted',
  'group_escalation',
  'sample_risk',
  'sample_reviewer',
] as const;

export const ROUTE_LEVELS = [
  'unit_moderators',
  'group_moderators',
  'group_owner',
  'category_staff',
  'master',
] as const;

const iso = z.iso.datetime();

export const taskParamsSchema = z.object({ taskId: z.uuid() });
export const groupParamsSchema = z.object({ groupId: z.uuid() });
export const groupTaskParamsSchema = z.object({ groupId: z.uuid(), taskId: z.uuid() });
export const groupListingParamsSchema = z.object({ groupId: z.uuid(), listingId: z.uuid() });

export const queueQuerySchema = paginationQuerySchema.extend({
  queue: z.coerce.number().int().min(0).max(5).optional(),
  /** Master: chỉ việc đang nằm ở hàng của master (quá hạn chuyển lên, hay danh mục không còn staff). */
  atMaster: z.stringbool().optional(),
});

/** `taken` = người khác đang giữ — người xem thấy "đang có người xử" (spec review/task-handling). */
const claimStateSchema = z.object({
  state: z.enum(['free', 'mine', 'taken']),
  expiresAt: iso.nullable(),
});

export const taskItemSchema = z.object({
  id: z.uuid(),
  listingId: z.uuid(),
  title: z.string().nullable(),
  queue: z.number().int(),
  reasons: z.array(z.enum(REVIEW_REASONS)),
  dueAt: iso,
  overdue: z.boolean(),
  /** Bậc đang giữ việc theo chuỗi TK 16 — master thấy việc đang ở chỗ ai. */
  level: z.enum(ROUTE_LEVELS),
  categoryId: z.uuid().nullable(),
  groupId: z.uuid().nullable(),
  claim: claimStateSchema,
});

/**
 * Bối cảnh người xử thấy (TK 17, spec review/task-handling): tin, điểm và luật máy đã trúng, tin sạch của người bán,
 * ảnh trùng ở tài khoản khác, tài khoản dùng chung thiết bị — không bao giờ có mã thiết bị.
 */
export const taskDetailSchema = taskItemSchema.extend({
  listing: ownListingSchema,
  machine: z
    .object({
      listingVersion: z.number().int(),
      outcome: z.enum(['pass_full', 'pass_limited', 'hold']).nullable(),
      cause: z.string().nullable(),
      score: z.number().int().nullable(),
      band: z.string().nullable(),
      tier: z.enum(['T0', 'T1', 'T2', 'T3']).nullable(),
      hits: z.array(z.string()),
    })
    .nullable(),
  seller: z.object({
    accountId: z.uuid(),
    displayName: z.string().nullable(),
    tier: z.enum(['T0', 'T1', 'T2', 'T3']),
    cleanListings: z.number().int(),
  }),
  duplicates: z.array(
    z.object({
      imageId: z.uuid(),
      matchImageId: z.uuid(),
      accountId: z.uuid(),
      displayName: z.string().nullable(),
      listingId: z.uuid().nullable(),
    }),
  ),
  sharedDeviceAccounts: z.array(
    z.object({ accountId: z.uuid(), displayName: z.string().nullable() }),
  ),
  escalation: z.object({ by: z.uuid(), note: z.string() }).nullable(),
});

export const claimResultSchema = z.object({
  taskId: z.uuid(),
  claimExpiresAt: iso,
  listingVersion: z.number().int(),
});

export type QueueQuery = z.infer<typeof queueQuerySchema>;
export type TaskItemDto = z.infer<typeof taskItemSchema>;
export type TaskDetailDto = z.infer<typeof taskDetailSchema>;
export type ClaimResultDto = z.infer<typeof claimResultSchema>;

// ── QUYẾT ĐỊNH ───────────────────────────────────────────────────────────────────────────────────

/**
 * `mistake` = từ chối (tin chờ duyệt) hay gỡ (tin đang hiện) vì sai sót — server chọn theo trạng thái tin. `detach` chỉ
 * với tin trong nhóm; kèm `platformViolation` thì sinh việc hàng 4 và bắt buộc có `note` (spec review/group-escalation).
 * `dismiss` = bác việc nhóm chuyển lên.
 */
const escalation = {
  platformViolation: z.boolean().optional(),
  note: z.string().trim().min(1).max(1000).optional(),
};
const hasNoteWhenEscalating = (body: {
  platformViolation?: boolean | undefined;
  note?: string | undefined;
}): boolean => !body.platformViolation || body.note !== undefined;
const noteRequired = {
  message: 'Chuyển lên vì trái quy định sàn thì phải ghi lý do',
  path: ['note'],
};

export const decisionBodySchema = z
  .object({
    outcome: z.enum(['pass', 'mistake', 'detach', 'dismiss']),
    machineJudgment: z.enum(['machine_right', 'machine_overreach']).optional(),
    reasonTemplateId: z.uuid().optional(),
    ...escalation,
  })
  .strict()
  .refine(hasNoteWhenEscalating, noteRequired);

/** Gỡ khỏi nhóm một tin không có việc mở (design mục 11) — kèm `platformViolation` thì như quyết định `detach`. */
export const directDetachBodySchema = z
  .object(escalation)
  .strict()
  .refine(hasNoteWhenEscalating, noteRequired);

export const decisionResultSchema = z.object({
  decisionId: z.uuid(),
  outcome: z.enum(['pass', 'reject', 'remove', 'detach', 'dismiss', 'restore']),
  listingState: z.string(),
});

export const listingParamsSchema = z.object({ listingId: z.uuid() });
export const directRemoveBodySchema = z.object({ reasonTemplateId: z.uuid() }).strict();

// ── LÝ DO MẪU ────────────────────────────────────────────────────────────────────────────────────

/**
 * Sáu lý do khởi đầu (chốt 15/10/2026), theo thứ tự hiện. Bước khởi động chèn khi bảng trống — migration
 * `init_review` cũng chèn đúng sáu câu này, nên trên DB đã có dữ liệu bước khởi động không làm gì.
 */
export const DEFAULT_REASON_TEMPLATES = [
  'Ảnh chưa rõ sản phẩm',
  'Thiếu thông tin quan trọng',
  'Sai danh mục',
  'Giá ghi sai',
  'Tiêu đề không mô tả món hàng',
  'Trùng tin đã đăng',
] as const;

export const reasonTemplateSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  active: z.boolean(),
  sort: z.number().int(),
});
export const templateParamsSchema = z.object({ templateId: z.uuid() });
export const createTemplateBodySchema = z
  .object({ text: z.string().trim().min(1).max(200), sort: z.number().int().min(0).default(0) })
  .strict();
export const updateTemplateBodySchema = z
  .object({
    text: z.string().trim().min(1).max(200).optional(),
    active: z.boolean().optional(),
    sort: z.number().int().min(0).optional(),
  })
  .strict();

// ── SỐ LIỆU CHO MASTER ───────────────────────────────────────────────────────────────────────────

const count = z.number().int().min(0);

export const boardSchema = z.object({
  open: count,
  queues: z.array(z.object({ queue: z.number().int(), open: count, overdue: count })),
  /** Việc đang ở bậc master; quá `overdueAfterHours` giờ ở đó là quá hạn (spec review/queues). */
  atMaster: z.object({ open: count, overdue: count, overdueAfterHours: count }),
});

export const reviewerRateSchema = z.object({
  accountId: z.uuid(),
  name: z.string().nullable(),
  /** Quyết định "đạt" đã được hậu kiểm, và bao nhiêu trong số đó bị gỡ tin hay gỡ khỏi nhóm. */
  reviewed: count,
  overturned: count,
  /** Phần trăm một chữ số thập phân; `null` = chưa có quyết định nào được hậu kiểm. */
  rate: z.number().nullable(),
});

export const ruleRateSchema = z.object({
  code: z.string(),
  decided: count,
  passed: count,
  overreach: count,
  passRate: z.number().nullable(),
});

export type BoardDto = z.infer<typeof boardSchema>;
export type ReviewerRateDto = z.infer<typeof reviewerRateSchema>;
export type RuleRateDto = z.infer<typeof ruleRateSchema>;

export type DecisionBody = z.infer<typeof decisionBodySchema>;
export type DirectDetachBody = z.infer<typeof directDetachBodySchema>;
export type DecisionResultDto = z.infer<typeof decisionResultSchema>;
export type ReasonTemplateDto = z.infer<typeof reasonTemplateSchema>;
export type CreateTemplateBody = z.infer<typeof createTemplateBodySchema>;
export type UpdateTemplateBody = z.infer<typeof updateTemplateBodySchema>;
