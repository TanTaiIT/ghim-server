import { z } from 'zod';

import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import { LISTING_EVENTS } from '../listing/listing.outbox.js';
import { LISTING_STATES } from '../listing/listing.schema.js';
import type { TrustService } from './trust.service.js';

const stateChanged = z.object({
  listingId: z.string(),
  ownerId: z.string(),
  from: z.enum(LISTING_STATES),
  to: z.enum(LISTING_STATES),
  fault: z.enum(['mistake', 'violation']).nullable(),
});

const accountDeleted = z.object({ accountId: z.string() });

/** Payload sai là lỗi của bên phát: ném để sự kiện nằm lại outbox, không âm thầm bỏ qua. */
function parse<T>(schema: z.ZodType<T>, type: string, payload: Record<string, unknown>): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(`${type}: payload sai — ${z.prettifyError(result.error)}`);
  return result.data;
}

/**
 * Bên nghe của `trust` (design mục 10). Chịu được nhận trùng: ghi tin sạch theo PK, void / gỡ void là upsert, tính lại
 * không ghi gì khi kết quả không đổi.
 */
export function registerTrustListeners(dispatcher: OutboxDispatcher, trust: TrustService): void {
  dispatcher.register(LISTING_EVENTS.stateChanged, (payload) =>
    trust.onListingStateChanged(parse(stateChanged, LISTING_EVENTS.stateChanged, payload)),
  );
  dispatcher.register('identity.account.deleted', async (payload) => {
    await trust.onAccountDeleted(
      parse(accountDeleted, 'identity.account.deleted', payload).accountId,
    );
  });
}
