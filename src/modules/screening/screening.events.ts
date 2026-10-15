import { z } from 'zod';

import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import { LISTING_EVENTS } from '../listing/listing.outbox.js';
import type { ScreeningService } from './screening.service.js';

const submitted = z.object({
  listingId: z.string(),
  version: z.number().int(),
  ownerId: z.string(),
});

/**
 * Bên nghe của `screening` (design mục 11): lượt gửi đã commit thì xếp kiểm ảnh còn thiếu. Nhận trùng vô hại — ảnh đã có
 * dòng kiểm thì không xếp lại.
 */
export function registerScreeningListeners(
  dispatcher: OutboxDispatcher,
  screening: ScreeningService,
): void {
  dispatcher.register(LISTING_EVENTS.submitted, async (payload) => {
    const result = submitted.safeParse(payload);
    // Payload sai là lỗi của bên phát: ném để sự kiện nằm lại outbox và người trực thấy.
    if (!result.success) {
      throw new Error(
        `${LISTING_EVENTS.submitted}: payload sai — ${z.prettifyError(result.error)}`,
      );
    }
    await screening.scheduleChecks(result.data);
  });
}
