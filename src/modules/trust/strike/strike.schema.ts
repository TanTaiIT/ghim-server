import { z } from 'zod';

/** Tuple của các enum `strike_*` — đổi enum thì đổi luôn ở đây (CLAUDE.md luật 5). */
export const STRIKE_KINDS = ['normal', 'severe', 'serious'] as const;
export const STRIKE_STATUSES = ['active', 'expired', 'cancelled', 'permanent', 'lifted'] as const;
export const SERIOUS_DECISIONS = ['permanent', 'downgrade', 'cancel'] as const;
const APPEAL_STATUSES = ['pending', 'won', 'lost', 'closed'] as const;
const iso = z.iso.datetime();

export const STATEMENT_MAX = 2000;
export const COMMENT_MAX = 2000;
export const RULE_TEXT_MAX = 2000;

/** Một gậy như người nhận và người xử thấy: loại, điểm, điều trích, hạn, đã huỷ chưa (TK 21, 22). */
export const strikeSchema = z.object({
  id: z.uuid(),
  kind: z.enum(STRIKE_KINDS),
  status: z.enum(STRIKE_STATUSES),
  /** Điểm của gậy; gậy nghiêm trọng là 0. */
  points: z.number().int(),
  /** Đang được tính vào điểm gậy lúc đọc. */
  inForce: z.boolean(),
  ruleCode: z.string(),
  ruleText: z.string(),
  issuedAt: iso,
  expiresAt: iso.nullable(),
  /** Số ngày còn lại tới hạn, làm tròn lên; `null` khi không có hạn hay đã hết. */
  remainingDays: z.number().int().nullable(),
  listingId: z.uuid().nullable(),
  cancelledAt: iso.nullable(),
  cancelCause: z.enum(['appeal', 'amnesty', 'serious_cancel']).nullable(),
  seriousDecision: z.enum(SERIOUS_DECISIONS).nullable(),
  /** Còn khiếu nại được trong app (gậy thường, nặng; trong hạn; chưa khiếu nại). */
  appealable: z.boolean(),
  appealUntil: iso.nullable(),
  appeal: z
    .object({ status: z.enum(APPEAL_STATUSES), filedAt: iso, decidedAt: iso.nullable() })
    .nullable(),
});

/** Hồ sơ gậy cho người xử (chi tiết việc về gậy): thêm người ra, người nhận, lời khiếu nại, nhận xét. */
export const strikeDetailSchema = strikeSchema.extend({
  accountId: z.uuid(),
  issuedBy: z.uuid(),
  issuedByRole: z.enum(['master', 'staff', 'moderator', 'owner']),
  categoryId: z.uuid().nullable(),
  fromReport: z.boolean(),
  statement: z.string().nullable(),
  comments: z.array(
    z.object({
      id: z.uuid(),
      authorId: z.uuid(),
      authorName: z.string().nullable(),
      body: z.string(),
      createdAt: iso,
    }),
  ),
  permanentReviewAt: iso.nullable(),
});

export const appealBodySchema = z
  .object({ statement: z.string().trim().min(1).max(STATEMENT_MAX) })
  .strict();

export const seriousAppealCodeBodySchema = z.object({ email: z.email() }).strict();
export const seriousAppealBodySchema = z
  .object({
    email: z.email(),
    code: z.string().regex(/^\d{6}$/, 'Mã gồm 6 chữ số'),
    statement: z.string().trim().min(1).max(STATEMENT_MAX),
  })
  .strict();
/** Kênh hỗ trợ trả lại cho người bị khoá đúng những gì họ được biết: lý do, lúc ra gậy, hạn khiếu nại. */
export const seriousAppealResultSchema = z.object({
  strikeId: z.uuid(),
  ruleText: z.string(),
  issuedAt: iso,
  appealUntil: iso,
  appealStatus: z.enum(APPEAL_STATUSES),
});

export const amnestyBodySchema = z
  .object({
    strikeIds: z.array(z.uuid()).min(1).max(50),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const commentBodySchema = z
  .object({ body: z.string().trim().min(1).max(COMMENT_MAX) })
  .strict();
export const commentSchema = z.object({
  id: z.uuid(),
  strikeId: z.uuid(),
  authorId: z.uuid(),
  body: z.string(),
  createdAt: iso,
});

export const ruleArticleSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  text: z.string(),
  active: z.boolean(),
  sort: z.number().int(),
});
export const createRuleArticleBodySchema = z
  .object({
    code: z.string().trim().min(1).max(20),
    title: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(RULE_TEXT_MAX),
    sort: z.number().int().min(0).optional(),
  })
  .strict();
export const updateRuleArticleBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    text: z.string().trim().min(1).max(RULE_TEXT_MAX).optional(),
    active: z.boolean().optional(),
    sort: z.number().int().min(0).optional(),
  })
  .strict();
export const articleQuerySchema = z.object({ includeInactive: z.stringbool().optional() });

export const strikeParamsSchema = z.object({ strikeId: z.uuid() });
export const accountParamsSchema = z.object({ accountId: z.uuid() });
export const articleParamsSchema = z.object({ articleId: z.uuid() });

/**
 * Quy định sàn khởi đầu (chốt 17/10/2026) — master sửa trên bàn vận hành; gậy giữ bản trích lúc ra nên đổi câu không
 * đổi gậy đã ra.
 */
export const DEFAULT_RULE_ARTICLES: readonly { code: string; title: string; text: string }[] = [
  {
    code: 'Q1',
    title: 'Hàng cấm',
    text: 'Không đăng bán hàng hoá, dịch vụ pháp luật cấm mua bán.',
  },
  {
    code: 'Q2',
    title: 'Lừa đảo',
    text: 'Không nhận tiền rồi không giao hàng, không giả danh người khác để bán.',
  },
  {
    code: 'Q3',
    title: 'Hàng giả',
    text: 'Không đăng bán hàng giả, hàng nhái, hàng không rõ nguồn gốc.',
  },
  {
    code: 'Q4',
    title: 'Quấy rối',
    text: 'Không đe doạ, xúc phạm, làm phiền người mua hay người bán khác.',
  },
  {
    code: 'Q5',
    title: 'Thông tin sai sự thật',
    text: 'Mô tả, giá, ảnh phải đúng món đồ đang bán.',
  },
  {
    code: 'Q6',
    title: 'Cố ý sai danh mục',
    text: 'Đăng đúng danh mục của món đồ; không đăng lặp để chiếm bảng tin.',
  },
];

export type StrikeDto = z.infer<typeof strikeSchema>;
export type StrikeDetailDto = z.infer<typeof strikeDetailSchema>;
export type AppealBody = z.infer<typeof appealBodySchema>;
export type SeriousAppealBody = z.infer<typeof seriousAppealBodySchema>;
export type SeriousAppealResultDto = z.infer<typeof seriousAppealResultSchema>;
export type AmnestyBody = z.infer<typeof amnestyBodySchema>;
export type CommentDto = z.infer<typeof commentSchema>;
export type RuleArticleDto = z.infer<typeof ruleArticleSchema>;
export type CreateRuleArticleBody = z.infer<typeof createRuleArticleBodySchema>;
export type UpdateRuleArticleBody = z.infer<typeof updateRuleArticleBodySchema>;
