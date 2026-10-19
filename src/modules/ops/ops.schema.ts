import { z } from 'zod';

/** Tuple của enum `job_run_status` (CLAUDE.md luật 5). */
export const JOB_RUN_STATUSES = ['done', 'partial', 'failed'] as const;

/** Một lượt việc theo lịch như sổ `job_runs` ghi: xong, mới làm được một phần, hay hỏng (TK 26 luật 2). */
export const jobRunSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(JOB_RUN_STATUSES),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  summary: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  error: z.string().nullable(),
});
export type JobRunDto = z.infer<typeof jobRunSchema>;

export const jobRunsQuerySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type JobRunsQuery = z.infer<typeof jobRunsQuerySchema>;
