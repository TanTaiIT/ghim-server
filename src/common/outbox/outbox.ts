import type { Prisma } from '@prisma/client';

/** `<module>.<đối tượng>.<việc>` — vd `identity.account.locked`. Module ghi là chủ của tên. */
export type OutboxEventType = `${string}.${string}.${string}`;

export type OutboxPayload = Record<string, string | number | boolean | null>;

export interface OutboxEventInput {
  type: OutboxEventType;
  payload: OutboxPayload;
}

/**
 * Ghi sự kiện chéo module VÀO CÙNG transaction với thay đổi gốc (CLAUDE.md luật 12): nhận `tx`
 * chứ không nhận `prisma`, để không thể gọi ngoài transaction — thay đổi gốc rollback thì sự
 * kiện biến mất theo, không bao giờ có sự kiện "đã khoá" cho một tài khoản chưa khoá.
 *
 * Chỉ ghi. Đọc và phát cho bên nghe là dispatcher của `ops` (đợt 7); tới đó bên nghe phải chịu
 * được nhận trùng.
 */
export async function appendEvents(
  tx: Prisma.TransactionClient,
  events: OutboxEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  await tx.outboxEvent.createMany({ data: events });
}

export function appendEvent(
  tx: Prisma.TransactionClient,
  type: OutboxEventType,
  payload: OutboxPayload,
): Promise<void> {
  return appendEvents(tx, [{ type, payload }]);
}
