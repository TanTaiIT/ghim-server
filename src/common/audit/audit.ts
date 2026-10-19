import type { Prisma } from '@prisma/client';

import type { AccountRole, Actor } from '../auth/actor.js';

/** Chỉ mã và số — không bao giờ tiêu đề, mô tả, giá, ảnh của tin (TK cam kết 31). */
export type AuditDetails = Record<string, string | number | boolean | null>;

/** `<module>.<đối tượng>.<việc>` — vd `identity.account.lock`, `platform.staff.grant`. */
export type AuditAction = `${string}.${string}.${string}`;

export interface AuditEntry {
  actorId: string;
  actorRole: AccountRole;
  action: AuditAction;
  targetType: string;
  targetId: string;
  reason?: string | null;
  details?: AuditDetails;
}

/**
 * Ghi một dòng nhật ký VÀO CÙNG transaction với thay đổi (spec audit-log: không ghi được nhật ký
 * thì thay đổi không xảy ra). Hạ tầng dùng chung như outbox: module nào cũng ghi, `platform` sở hữu
 * cửa đọc. Trigger `audit_log_immutable` ở DB chặn sửa / xoá — hàm này là đường ghi duy nhất.
 */
export async function appendAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? null,
      ...(entry.details === undefined ? {} : { details: entry.details }),
    },
    select: { id: true },
  });
}

/**
 * Ẩn danh hoá gậy (TK 25, add-data-retention): dòng về gậy đó mang `details.accountId`, và dòng khoá tài khoản vì gậy đó
 * (`target_type = account`, `details.strikeId`) — mã người nhận thành mã giả. Chỉ đường này được sửa nhật ký: trigger
 * `audit_log_immutable` mở khi transaction đặt `ghim.anonymize = 'on'`, và chỉ cho `target_id`, `details` đổi.
 */
export async function pseudonymizeAudit(
  tx: Prisma.TransactionClient,
  input: { strikeId: string; accountId: string; pseudonym: string },
): Promise<number> {
  await tx.$executeRawUnsafe(`SET LOCAL ghim.anonymize = 'on'`);
  const onStrike = await tx.$executeRaw`
    UPDATE audit_log SET details = jsonb_set(details, '{accountId}', to_jsonb(${input.pseudonym}::text))
     WHERE target_type = 'strike' AND target_id = ${input.strikeId}
       AND details->>'accountId' = ${input.accountId}`;
  const onAccount = await tx.$executeRaw`
    UPDATE audit_log SET target_id = ${input.pseudonym}
     WHERE target_type = 'account' AND target_id = ${input.accountId}
       AND details->>'strikeId' = ${input.strikeId}`;
  return onStrike + onAccount;
}

/** Phần "ai làm" của một dòng nhật ký, lấy từ `request.actor` — staff ghi dưới tài khoản cá nhân của chính mình. */
export function auditActor(actor: Actor): Pick<AuditEntry, 'actorId' | 'actorRole'> {
  return { actorId: actor.accountId, actorRole: actor.role };
}
