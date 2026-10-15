import { z } from 'zod';

import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { GROUP_EVENTS } from '../group/group.outbox.js';
import { LISTING_EVENTS } from '../listing/listing.outbox.js';
import { PLATFORM_EVENTS } from '../platform/platform.outbox.js';
import { SCREENING_EVENTS } from '../screening/screening.outbox.js';
import type { ReviewService } from './review.service.js';

const listingRef = z.object({ listingId: z.string() });
const stateChange = z.object({ listingId: z.string(), version: z.number(), arrow: z.string() });
const member = z.object({ groupId: z.string(), accountId: z.string() });
const memberLeft = member.extend({
  reason: z.enum(['left', 'removed', 'banned', 'account_deleted']),
  allowOutsiders: z.boolean(),
});
const groupOnly = z.object({ groupId: z.string() });
const account = z.object({ accountId: z.string() });
const ownerChange = z.object({ previousOwnerId: z.string().nullable() });

/** Payload sai là lỗi của bên phát: ném để sự kiện nằm lại outbox và người trực thấy, không âm thầm bỏ qua. */
function parse<T>(schema: z.ZodType<T>, type: string, payload: Record<string, unknown>): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(`${type}: payload sai — ${z.prettifyError(result.error)}`);
  return result.data;
}

/**
 * Bên nghe của `review` (design add-review-queues mục 7). Việc sinh từ thay đổi trạng thái của chính tin
 * (`listing.state.changed`, ghi cùng transaction với tin), không từ kết quả máy: hai bên cùng nghe một sự kiện không
 * có thứ tự, nên đọc tin lúc nghe kết quả máy có thể còn thấy trạng thái cũ. Mọi bên nghe chịu được nhận trùng — thêm
 * lý do là gộp, bỏ lý do là phép trừ tập.
 */
export function registerReviewListeners(dispatcher: OutboxDispatcher, review: ReviewService): void {
  const on = <T>(
    type: OutboxEventType,
    schema: z.ZodType<T>,
    handle: (payload: T) => Promise<unknown>,
  ): void => {
    dispatcher.register(type, async (payload) => {
      await handle(parse(schema, type, payload));
    });
  };

  // ── TIN ────────────────────────────────────────────────────────────────────────────────────────
  on(LISTING_EVENTS.stateChanged, stateChange, (change) => review.onStateChanged(change));
  on(LISTING_EVENTS.edited, listingRef, ({ listingId }) => review.onEdited(listingId));
  on(LISTING_EVENTS.deleted, listingRef, ({ listingId }) => review.onDeleted(listingId));
  on(SCREENING_EVENTS.listingRestricted, listingRef, ({ listingId }) =>
    review.onMachineRestricted(listingId),
  );

  // ── NHÓM ───────────────────────────────────────────────────────────────────────────────────────
  on(
    GROUP_EVENTS.memberLeft,
    memberLeft,
    async ({ groupId, accountId, reason, allowOutsiders }) => {
      await review.onMemberLeft(groupId, accountId, { reason, allowOutsiders });
      await review.recheckClaims(accountId);
    },
  );
  on(GROUP_EVENTS.memberJoined, member, ({ groupId, accountId }) =>
    review.onMemberBack(groupId, accountId),
  );
  on(GROUP_EVENTS.unbanned, member, ({ groupId, accountId }) =>
    review.onMemberBack(groupId, accountId),
  );
  on(GROUP_EVENTS.closed, groupOnly, ({ groupId }) => review.onGroupClosed(groupId));

  // ── NGƯỜI ĐANG GIỮ VIỆC MẤT QUYỀN XỬ: trả việc ngay, không đợi hết 10 phút (chốt 15/10/2026) ─────
  on(GROUP_EVENTS.moderatorChanged, member, ({ accountId }) => review.recheckClaims(accountId));
  on(GROUP_EVENTS.ownerChanged, ownerChange, ({ previousOwnerId }) =>
    previousOwnerId ? review.recheckClaims(previousOwnerId) : Promise.resolve(0),
  );
  on(GROUP_EVENTS.locked, groupOnly, ({ groupId }) => review.recheckGroupClaims(groupId));
  on(PLATFORM_EVENTS.staffChanged, account, ({ accountId }) => review.recheckClaims(accountId));
  on('identity.account.locked', account, ({ accountId }) => review.releaseAllClaims(accountId));
  on('identity.account.deleted', account, ({ accountId }) => review.releaseAllClaims(accountId));
}
