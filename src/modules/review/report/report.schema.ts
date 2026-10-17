import { z } from 'zod';

/** Năm loại cố định để thống kê được (TK 23): lừa đảo, sai thông tin, quấy rối, hàng cấm, khác. */
export const REPORT_CATEGORIES = [
  'fraud',
  'misinformation',
  'harassment',
  'prohibited',
  'other',
] as const;
const category = z.enum(REPORT_CATEGORIES);
const subjectKind = z.enum(['listing', 'account']);

export const reportBodySchema = z
  .object({
    subject: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('listing'), listingId: z.uuid() }).strict(),
      z.object({ kind: z.literal('account'), accountId: z.uuid() }).strict(),
    ]),
    category,
  })
  .strict();

/** Báo cáo của người báo: lượt của chính họ và kết quả — không có ai khác đã báo (TK 23). */
export const myReportSchema = z.object({
  reportId: z.uuid(),
  subjectKind,
  listingId: z.uuid().nullable(),
  /** Chỉ với báo cáo về một người — người đó do chính người báo chọn. */
  accountId: z.uuid().nullable(),
  category,
  status: z.enum(['open', 'upheld', 'dismissed']),
  reportedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});

/** Báo cáo liên quan trong màn xử việc: loại, số người báo, lúc từng lượt — không có danh tính người báo. */
export const relatedReportSchema = z.object({
  reportId: z.uuid(),
  subjectKind,
  listingId: z.uuid().nullable(),
  status: z.enum(['open', 'upheld', 'dismissed']),
  severe: z.boolean(),
  autoHidden: z.boolean(),
  reporterCount: z.number().int(),
  entries: z.array(z.object({ category, reportedAt: z.iso.datetime() })),
  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});

export type ReportBody = z.infer<typeof reportBodySchema>;
export type MyReportDto = z.infer<typeof myReportSchema>;
export type RelatedReportDto = z.infer<typeof relatedReportSchema>;
