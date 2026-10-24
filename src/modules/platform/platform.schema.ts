import { z } from 'zod';

import { OPS_SCOPES } from '../../common/auth/privilege-source.js';
import { paginationQuerySchema } from '../../common/schemas/pagination.js';

/** Tuple của enum `staff_permission_status` (CLAUDE.md luật 5). */
export const STAFF_PERMISSION_STATUSES = ['active', 'suspended'] as const;

/** Lý do treo do hệ thống đặt khi `identity` khoá tài khoản; master trả lại thì xoá. */
export const SUSPENDED_REASON_LOCKED = 'tài khoản bị khoá';
/** Treo vì nhận gậy (add-strikes): gậy bị huỷ thì trả tự động, gậy hết hạn thì master trả (TK 5, 20). */
export const SUSPENDED_REASON_STRIKE = 'đang có cảnh cáo';

/** Nhật ký và bảng con số không có "ai" khi hệ thống tự nạp: id rỗng thay cho một tài khoản. */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export const accountIdParamsSchema = z.object({ accountId: z.uuid() });

/**
 * `.strict()`: body mang `role` hay bất kỳ khoá lạ nào là 400 — không có đường nào nâng master
 * qua HTTP (spec master-accounts), và phạm vi gửi lên luôn là TRỌN gói (phân quyền đầy đủ).
 */
export const staffGrantBodySchema = z
  .object({
    categoryIds: z.array(z.uuid()).max(100),
    scopes: z.array(z.enum(OPS_SCOPES)).max(OPS_SCOPES.length),
  })
  .strict()
  .refine((value) => value.categoryIds.length + value.scopes.length > 0, {
    message: 'Phạm vi không được rỗng: cần ít nhất một danh mục hoặc một việc toàn hệ thống',
    path: ['scopes'],
  });

export const staffPermissionSchema = z.object({
  accountId: z.uuid(),
  scopes: z.array(z.enum(OPS_SCOPES)),
  categoryIds: z.array(z.uuid()),
  status: z.enum(STAFF_PERMISSION_STATUSES),
  suspendedReason: z.string().nullable(),
  grantedAt: z.iso.datetime(),
});

export const staffListQuerySchema = z.object({ categoryId: z.uuid().optional() });

export const configVersionSchema = z.object({
  version: z.number().int(),
  values: z.record(z.string(), z.number()),
  note: z.string().nullable(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const configVersionParamsSchema = z.object({ version: z.coerce.number().int().positive() });

export const configChangeBodySchema = z
  .object({
    baseVersion: z.number().int().positive(),
    changes: z.record(z.string(), z.number()),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => Object.keys(value.changes).length > 0, {
    message: 'Cần ít nhất một con số',
    path: ['changes'],
  });

export const auditQuerySchema = paginationQuerySchema.extend({
  actorId: z.uuid().optional(),
  targetType: z.string().trim().min(1).max(40).optional(),
  targetId: z.string().trim().min(1).max(64).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const auditEntrySchema = z.object({
  id: z.uuid(),
  actorId: z.uuid(),
  actorRole: z.enum(['user', 'master']),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  reason: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
});
