import type { ReviewReason } from '@prisma/client';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type Queue = 0 | 1 | 2 | 3 | 4 | 5;

/** TK 16: số hàng của từng lý do; việc gộp nhiều lý do nằm ở hàng có số nhỏ nhất. */
export const QUEUE_OF: Readonly<Record<ReviewReason, Queue>> = {
  machine_hold: 0,
  machine_restricted: 3,
  group_escalation: 4,
  sample_risk: 5,
  sample_reviewer: 5,
};

export const SAMPLE_REASONS: ReadonlySet<ReviewReason> = new Set([
  'sample_risk',
  'sample_reviewer',
]);

export function queueOf(reasons: readonly ReviewReason[]): Queue {
  if (reasons.length === 0) throw new Error('Việc không có lý do nào');
  return reasons.reduce<Queue>((low, reason) => Math.min(low, QUEUE_OF[reason]) as Queue, 5);
}

/** Thứ tự cố định — so hai tập lý do bằng mảng, và hiện cho người xử theo hàng. */
const sorted = (reasons: Iterable<ReviewReason>): ReviewReason[] =>
  [...new Set(reasons)].toSorted((a, b) => QUEUE_OF[a] - QUEUE_OF[b] || a.localeCompare(b));

export const withReasons = (
  current: readonly ReviewReason[],
  added: readonly ReviewReason[],
): ReviewReason[] => sorted([...current, ...added]);

export const withoutReasons = (
  current: readonly ReviewReason[],
  dropped: readonly ReviewReason[],
): ReviewReason[] => sorted(current.filter((reason) => !dropped.includes(reason)));

export interface Deadlines {
  machineHoldHours: number;
  machineRestrictionHours: number;
  groupEscalationHours: number;
  sampleDays: number;
}

/** Hạn xử của một lý do tính từ lúc lý do vào hàng (TK 16, bảng con số "Hàng chờ"). */
export function deadlineOf(reason: ReviewReason, from: Date, deadlines: Deadlines): Date {
  const span: Record<ReviewReason, number> = {
    machine_hold: deadlines.machineHoldHours * HOUR_MS,
    machine_restricted: deadlines.machineRestrictionHours * HOUR_MS,
    group_escalation: deadlines.groupEscalationHours * HOUR_MS,
    sample_risk: deadlines.sampleDays * DAY_MS,
    sample_reviewer: deadlines.sampleDays * DAY_MS,
  };
  return new Date(from.getTime() + span[reason]);
}

/** Gộp lấy hạn sớm nhất; bỏ lý do không bao giờ kéo dài hạn — nên hạn chỉ đổi ở chiều sớm hơn. */
export const earliest = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

export type OverdueAction = 'escalate' | 'expire' | null;

/**
 * Việc quá hạn chỉ chuyển cấp, không bao giờ tự mở tin. Việc chỉ còn lý do mẫu hậu kiểm tự huỷ — hàng duy nhất được tự
 * huỷ (TK 16). Việc đã ở chỗ master thì không chuyển nữa.
 */
export function overdueAction(
  task: { reasons: readonly ReviewReason[]; dueAt: Date; escalatedAt: Date | null },
  now: Date,
): OverdueAction {
  if (task.dueAt.getTime() > now.getTime() || task.escalatedAt) return null;
  return task.reasons.every((reason) => SAMPLE_REASONS.has(reason)) ? 'expire' : 'escalate';
}

/** Nhắc master khi việc nằm ở chỗ master quá `afterHours`, rồi nhắc lại mỗi ngày tới khi có người xử (TK 16). */
export function masterReminderDue(input: {
  atMasterSince: Date;
  remindedAt: Date | null;
  now: Date;
  afterHours: number;
}): boolean {
  const { atMasterSince, remindedAt, now, afterHours } = input;
  if (now.getTime() - atMasterSince.getTime() < afterHours * HOUR_MS) return false;
  return !remindedAt || now.getTime() - remindedAt.getTime() >= DAY_MS;
}

/** TK 16: "cảnh báo khi một nửa số việc sắp chạm hạn trong 24 giờ" — hai con số không nằm trong bảng con số (TK 28). */
export const DUE_SOON_HOURS = 24;

export const dueSoonWarning = (open: number, dueSoon: number): boolean =>
  open > 0 && dueSoon * 2 >= open;
