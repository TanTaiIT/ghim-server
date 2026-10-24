import { paginationQuerySchema } from '../../common/schemas/pagination.js';
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

/** Trần số ngày của bảng số: một quý đủ để nhìn xu hướng trên trang chủ; dài hơn là báo cáo, không phải màn này. */
export const DAILY_STATS_MAX_DAYS = 90;
export const DAILY_STATS_DEFAULT_DAYS = 7;

export const dailyStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(DAILY_STATS_MAX_DAYS).default(DAILY_STATS_DEFAULT_DAYS),
});
export type DailyStatsQuery = z.infer<typeof dailyStatsQuerySchema>;

/** Một ngày Việt Nam (`day` = `YYYY-MM-DD`); từ chối gồm reject / remove / violation (design add-ops-daily-stats mục 3). */
export const dayStatsSchema = z.object({
  day: z.string(),
  newAccounts: z.number().int(),
  submissions: z.number().int(),
  firstLive: z.number().int(),
  machine: z.object({
    passFull: z.number().int(),
    passLimited: z.number().int(),
    hold: z.number().int(),
  }),
  decisions: z.object({ passed: z.number().int(), rejected: z.number().int() }),
});
export type DayStatsDto = z.infer<typeof dayStatsSchema>;

export const dailyStatsSchema = z.object({
  timeZone: z.string(),
  /** Hôm nay trước, kể cả hôm nay đang dở. */
  days: z.array(dayStatsSchema),
});
export type DailyStatsDto = z.infer<typeof dailyStatsSchema>;

/** Chuỗi tìm: tên hay email, đủ dài cho một địa chỉ email. */
export const ACCOUNT_SEARCH_MAX = 100;
/** Trạng thái liệt kê được — `deleted` không vào danh bạ (spec ops/account-directory). */
export const ACCOUNT_LISTED_STATUSES = ['pending_verification', 'active', 'locked'] as const;

export const accountListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(ACCOUNT_SEARCH_MAX).optional(),
  status: z.enum(ACCOUNT_LISTED_STATUSES).optional(),
});
export type AccountListQuery = z.infer<typeof accountListQuerySchema>;

export const opsAccountSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  role: z.enum(['user', 'master']),
  status: z.enum(ACCOUNT_LISTED_STATUSES),
  createdAt: z.iso.datetime(),
  lockedAt: z.iso.datetime().nullable(),
  lockedReason: z.string().nullable(),
  tier: z.enum(['T0', 'T1', 'T2', 'T3']),
  /** Đang có cảnh cáo tính điểm. */
  struck: z.boolean(),
});
export type OpsAccountDto = z.infer<typeof opsAccountSchema>;

export const opsAccountCardSchema = opsAccountSchema.extend({ strikePoints: z.number().int() });
export type OpsAccountCardDto = z.infer<typeof opsAccountCardSchema>;
