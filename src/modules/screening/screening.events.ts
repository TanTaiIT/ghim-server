import { z } from 'zod';

import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import { LISTING_EVENTS } from '../listing/listing.outbox.js';
import { MEDIA_EVENTS } from '../media/media.schema.js';
import type { ScreeningService } from './screening.service.js';

const submitted = z.object({
  listingId: z.string(),
  version: z.number().int(),
  ownerId: z.string(),
});

const imagesDeleted = z.object({ imageIds: z.array(z.string()) });

/**
 * Bên nghe của `screening` (design mục 11): lượt gửi đã commit thì xếp kiểm ảnh còn thiếu; ảnh đã xoá hẳn thì bỏ dấu ảnh.
 * Nhận trùng vô hại — ảnh đã có dòng kiểm thì không xếp lại, dấu đã bỏ thì xoá 0 dòng.
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

  // Ảnh đã xoá hẳn ở `media`: dấu ảnh đi theo (rà soát L10).
  dispatcher.register(MEDIA_EVENTS.imagesDeleted, async (payload) => {
    const result = imagesDeleted.safeParse(payload);
    if (!result.success) {
      throw new Error(
        `${MEDIA_EVENTS.imagesDeleted}: payload sai — ${z.prettifyError(result.error)}`,
      );
    }
    await screening.onImagesDeleted(result.data.imageIds);
  });
}
