import type {
  OutboxEventInput,
  OutboxEventType,
  OutboxPayload,
} from '../../common/outbox/outbox.js';
import { formatMomentVN } from '../../common/time/time.js';

/**
 * Sự kiện `screening` phát vào outbox (design add-screening mục 11). `listing` nghe ba sự kiện đầu — kết quả máy, rút tin
 * về khi bật cụm, hạ tin thiếu kết quả ảnh; `notification` nghe thời gian chờ ở `add-notifications`.
 */
export const SCREENING_EVENTS = {
  resultRecorded: 'screening.result.recorded',
  listingRecalled: 'screening.listing.recalled',
  listingRestricted: 'screening.listing.restricted',
  cooldownStarted: 'screening.cooldown.started',
} as const satisfies Record<string, OutboxEventType>;

export const screeningEvent = (
  type: (typeof SCREENING_EVENTS)[keyof typeof SCREENING_EVENTS],
  payload: OutboxPayload,
): OutboxEventInput => ({ type, payload });

/**
 * Câu người dùng đọc về thời gian chờ — lỗi 429 `SUBMISSION_COOLDOWN` và thông báo của `notification` khi vào chờ
 * (add-trust-notices) dùng chung để khớp từng chữ. Không nêu cổng cứng nào (TK 13), chỉ mốc gửi lại.
 */
export const cooldownSentence = (until: Date): string =>
  `Tạm thời chưa gửi được tin mới — gửi lại từ ${formatMomentVN(until)}`;
