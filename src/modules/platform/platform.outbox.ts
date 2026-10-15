import type { OutboxEventInput, OutboxEventType } from '../../common/outbox/outbox.js';

export const PLATFORM_EVENTS = {
  /**
   * Quyền staff của một người vừa đổi — cấp, đổi danh mục, thu, treo, gỡ treo. Payload chỉ mang mã: bên nghe đọc lại
   * quyền hiện tại (`review` trả việc người đó đang nhận mà không còn quyền xử, delta platform/staff-permissions).
   */
  staffChanged: 'platform.staff.changed',
} as const satisfies Record<string, OutboxEventType>;

export const staffChangedEvent = (accountId: string): OutboxEventInput => ({
  type: PLATFORM_EVENTS.staffChanged,
  payload: { accountId },
});
