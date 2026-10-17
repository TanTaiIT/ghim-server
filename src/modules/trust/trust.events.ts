import { z } from 'zod';

import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import { LISTING_EVENTS } from '../listing/listing.outbox.js';
import { LISTING_STATES } from '../listing/listing.schema.js';
import { TRUST_EVENTS } from './trust.outbox.js';
import type { TrustService } from './trust.service.js';

const stateChanged = z.object({
  listingId: z.string(),
  ownerId: z.string(),
  from: z.enum(LISTING_STATES),
  to: z.enum(LISTING_STATES),
  fault: z.enum(['mistake', 'violation']).nullable(),
});

const accountDeleted = z.object({ accountId: z.string() });
const accountEmail = z.object({ accountId: z.string(), emailHash: z.string() });
const strikeAccount = z.object({ accountId: z.string() });
const accountsPurged = z.object({ accountIds: z.array(z.string()) });

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
  // Gậy đi theo email (add-strikes): lập tài khoản bằng email có gậy thì kế thừa; đổi email thì gậy theo cả hai.
  dispatcher.register('identity.account.created', async (payload) => {
    const { accountId, emailHash } = parse(accountEmail, 'identity.account.created', payload);
    await trust.onAccountCreated(accountId, emailHash);
  });
  dispatcher.register('identity.account.email_changed', async (payload) => {
    const { accountId, emailHash } = parse(accountEmail, 'identity.account.email_changed', payload);
    await trust.onEmailChanged(accountId, emailHash);
  });
  // Đăng ký dở dang bị xoá hẳn (add-data-retention): gậy không còn khoá ngoại sang tài khoản, `trust` tự dọn.
  dispatcher.register('identity.account.purged', async (payload) => {
    await trust.onAccountsPurged(
      parse(accountsPurged, 'identity.account.purged', payload).accountIds,
    );
  });
  // Mức tính lại theo mọi thay đổi của gậy — trần T1, điều kiện T3 (spec trust-tiers).
  dispatcher.register(TRUST_EVENTS.strikeStanding, async (payload) => {
    await trust.recompute(parse(strikeAccount, TRUST_EVENTS.strikeStanding, payload).accountId);
  });
}
