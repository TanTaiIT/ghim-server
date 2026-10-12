import type { OutboxEventType } from '../../common/outbox/outbox.js';

/** Sự kiện `category` phát vào outbox: tin đăng tạm ẩn / hiện lại theo danh mục (TK 11, design add-listings mục 9). */
export const CATEGORY_EVENTS = {
  statusChanged: 'category.status.changed',
} as const satisfies Record<string, OutboxEventType>;
