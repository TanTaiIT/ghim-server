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
