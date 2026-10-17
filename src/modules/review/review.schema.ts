import { z } from 'zod';

import { paginationQuerySchema } from '../../common/schemas/pagination.js';
import { ownListingSchema } from '../listing/listing.schema.js';
import {
  SERIOUS_DECISIONS,
  STRIKE_KINDS,
  strikeDetailSchema,
  strikeSchema,
} from '../trust/strike/strike.schema.js';
import { relatedReportSchema } from './report/report.schema.js';

/** Tuple của enum `review_reason` — số hàng ở `calc/task.calc.ts`. */
export const REVIEW_REASONS = [
  'machine_hold',
  'machine_restricted',
  'group_escalation',
  'sample_risk',
  'sample_reviewer',
  'report',
  'report_severe',
  'appeal',
  'serious_strike',
  'permanent_review',
] as const;

export const ROUTE_LEVELS = [
  'unit_moderators',
  'group_moderators',
  'group_owner',
  'category_staff',
  'safety_staff',
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
  /** Việc về một tin, về một người (báo cáo về người — add-reports), hay về một gậy (add-strikes). */
  subjectKind: z.enum(['listing', 'account', 'strike']),
  listingId: z.uuid().nullable(),
  accountId: z.uuid().nullable(),
  strikeId: z.uuid().nullable(),
  /** Tiêu đề tin, hay tên hiển thị của người bị báo / người nhận gậy. */
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
 * Bản ghi hội thoại đi kèm lượt báo (add-messaging): người xử đọc tới khi báo cáo đóng, không phụ thuộc hai bên đã
 * xoá phía mình. `flagged` = tin nhắn trúng cụm mơ hồ đang bật.
 */
export const conversationTranscriptSchema = z.object({
  id: z.uuid(),
  listingId: z.uuid(),
  buyerId: z.uuid(),
  sellerId: z.uuid(),
  messages: z.array(
    z.object({
      id: z.uuid(),
      senderId: z.uuid(),
      body: z.string(),
      flagged: z.boolean(),
      createdAt: iso,
    }),
  ),
});

/**
 * Bối cảnh người xử thấy (TK 17, spec review/task-handling): tin, điểm và luật máy đã trúng, tin sạch của người bán,
 * ảnh trùng ở tài khoản khác, tài khoản dùng chung thiết bị — không bao giờ có mã thiết bị.
 */
export const taskDetailSchema = taskItemSchema.extend({
  /** Bản lưu của tin — kể cả tin người đăng đã xoá còn báo cáo mở (add-reports); việc về người thì `null`. */
  listing: ownListingSchema.nullable(),
  listingDeleted: z.boolean(),
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
    /** Lịch sử gậy của người bán, kể cả đã huỷ / hết hạn (TK 17, add-strikes). */
    strikes: z.array(strikeSchema),
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
  /** Báo cáo về tin và về người (đăng) — kể cả đã đóng, không có ai đã báo (add-reports). */
  reports: z.array(relatedReportSchema),
  /** Việc về gậy: hồ sơ gậy — điều trích, lời khiếu nại, nhận xét của staff (add-strikes); việc khác thì `null`. */
  strike: strikeDetailSchema.nullable(),
  /** Hội thoại mà lượt báo của báo cáo đang mở trỏ tới (add-messaging). */
  conversations: z.array(conversationTranscriptSchema),
});

export const claimResultSchema = z.object({
  taskId: z.uuid(),
  claimExpiresAt: iso,
  /** `null` với việc về một người. */
  listingVersion: z.number().int().nullable(),
});

export type QueueQuery = z.infer<typeof queueQuerySchema>;
export type TaskItemDto = z.infer<typeof taskItemSchema>;
export type TaskDetailDto = z.infer<typeof taskDetailSchema>;
export type ClaimResultDto = z.infer<typeof claimResultSchema>;
export type ConversationTranscriptDto = z.infer<typeof conversationTranscriptSchema>;

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
    /**
     * `keep` = không đổi tin — quyết định về báo cáo (add-reports) hay về gậy (add-strikes); `violation` = từ chối / gỡ
     * vì vi phạm, bắt buộc kèm `strike`.
     */
    outcome: z.enum(['pass', 'mistake', 'detach', 'dismiss', 'keep', 'violation']),
    machineJudgment: z.enum(['machine_right', 'machine_overreach']).optional(),
    reasonTemplateId: z.uuid().optional(),
    /**
     * Bắt buộc với việc có lý do báo cáo (add-reports): báo cáo đúng hay bác, kèm hệ quả ngoài tin trong quyền người
     * xử — cấm người đăng khỏi nhóm (quản trị nhóm, master), khoá tài khoản (master).
     */
    report: z
      .object({
        verdict: z.enum(['upheld', 'dismissed']),
        banFromGroup: z.boolean().optional(),
        lockAccount: z.boolean().optional(),
      })
      .strict()
      .optional(),
    /** Gậy kèm quyết định vi phạm (bắt buộc) hay báo cáo đúng (tuỳ) — staff danh mục, master (add-strikes). */
    strike: z
      .object({ kind: z.enum(STRIKE_KINDS), ruleArticleId: z.uuid() })
      .strict()
      .optional(),
    /** Việc về gậy, mỗi tình trạng một nút: khiếu nại gậy thường / nặng; gậy nghiêm trọng; xem lại khoá vĩnh viễn. */
    appeal: z
      .object({ verdict: z.enum(['won', 'lost']) })
      .strict()
      .optional(),
    serious: z
      .object({ decision: z.enum(SERIOUS_DECISIONS) })
      .strict()
      .optional(),
    permanent: z
      .object({ decision: z.enum(['keep', 'lift']) })
      .strict()
      .optional(),
    ...escalation,
  })
  .strict()
  .refine(hasNoteWhenEscalating, noteRequired)
  .refine((body) => body.outcome !== 'violation' || body.strike !== undefined, {
    message: 'Quyết định vi phạm thì chọn loại gậy và trích một điều trong quy định sàn',
    path: ['strike'],
  });

/** Gỡ khỏi nhóm một tin không có việc mở (design mục 11) — kèm `platformViolation` thì như quyết định `detach`. */
export const directDetachBodySchema = z
  .object(escalation)
  .strict()
  .refine(hasNoteWhenEscalating, noteRequired);

export const decisionResultSchema = z.object({
  decisionId: z.uuid(),
  outcome: z.enum(['pass', 'reject', 'remove', 'detach', 'dismiss', 'restore', 'keep']),
  /** `null` với việc về một người. */
  listingState: z.string().nullable(),
  reportVerdict: z.enum(['upheld', 'dismissed']).nullable(),
  /** Gậy quyết định này ra, hay gậy nó quyết (việc về gậy) — add-strikes. */
  strikeId: z.uuid().nullable(),
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
