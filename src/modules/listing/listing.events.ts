import type { ListingHideReason, Prisma } from '@prisma/client';
import { z } from 'zod';

import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import type { OutboxEventType } from '../../common/outbox/outbox.js';
import type { HideEvent } from './calc/hide.calc.js';
import type { ListingService } from './listing.service.js';

const account = z.object({ accountId: z.string() });
const member = z.object({ groupId: z.string(), accountId: z.string() });
const groupOnly = z.object({ groupId: z.string() });

/** Payload sai là lỗi của bên phát: ném để sự kiện nằm lại outbox và người trực thấy, không âm thầm bỏ qua. */
function parse<T>(schema: z.ZodType<T>, type: string, payload: Record<string, unknown>): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(`${type}: payload sai — ${z.prettifyError(result.error)}`);
  return result.data;
}

/** Gỡ chỉ cần chạm tin đang mang lý do đó — bên nghe không quét lại cả nhóm hay cả danh mục. */
const carrying = (...reasons: ListingHideReason[]): Prisma.ListingWhereInput => ({
  hideReasons: { hasSome: reasons },
});

/**
 * Bên nghe của `listing` (design mục 9, 10, 14, 16). Mọi bên nghe chịu được nhận trùng và không dựa vào thứ tự: lý do
 * đặt / gỡ là phép tính trên dòng đã khoá (`hide.calc.ts`), kết quả máy ghi có điều kiện `version`.
 */
export function registerListingListeners(
  dispatcher: OutboxDispatcher,
  listing: ListingService,
): void {
  const on = <T>(
    type: OutboxEventType,
    schema: z.ZodType<T>,
    handle: (payload: T) => Promise<unknown>,
  ): void => {
    dispatcher.register(type, async (payload) => {
      await handle(parse(schema, type, payload));
    });
  };
  const hide = (where: Prisma.ListingWhereInput, event: HideEvent, groupId: string | null = null) =>
    listing.onHideEvent(where, event, groupId);

  // ── TÀI KHOẢN ──────────────────────────────────────────────────────────────────────────────────
  on('identity.account.locked', account, ({ accountId }) =>
    hide({ ownerId: accountId }, { kind: 'account_locked' }),
  );
  on('identity.account.unlocked', account, ({ accountId }) =>
    hide({ ownerId: accountId, ...carrying('account_locked') }, { kind: 'account_unlocked' }),
  );
  on('identity.account.deleted', account, ({ accountId }) =>
    hide({ ownerId: accountId }, { kind: 'account_deleted' }),
  );

  // ── NHÓM ───────────────────────────────────────────────────────────────────────────────────────
  on(
    'group.member.left',
    member.extend({
      reason: z.enum(['left', 'removed', 'banned', 'account_deleted']),
      allowOutsiders: z.boolean(),
    }),
    ({ groupId, accountId, reason, allowOutsiders }) =>
      hide(
        { ownerId: accountId, groupId },
        { kind: 'member_left', reason, allowOutsiders },
        groupId,
      ),
  );
  on('group.member.joined', member, ({ groupId, accountId }) =>
    hide(
      { ownerId: accountId, groupId, ...carrying('left_group', 'removed_from_group') },
      { kind: 'member_joined' },
      groupId,
    ),
  );
  on(
    'group.member.unit_changed',
    member.extend({ unitId: z.string().nullable() }),
    ({ groupId, accountId, unitId }) => listing.onUnitChanged(groupId, accountId, unitId),
  );
  on('group.ban.created', member, ({ groupId, accountId }) =>
    hide({ ownerId: accountId, groupId }, { kind: 'ban_created' }, groupId),
  );
  on('group.ban.lifted', member, ({ groupId, accountId }) =>
    hide(
      { ownerId: accountId, groupId, ...carrying('group_banned') },
      { kind: 'ban_lifted' },
      groupId,
    ),
  );
  on('group.state.locked', groupOnly, ({ groupId }) =>
    hide({ groupId }, { kind: 'group_locked' }, groupId),
  );
  on('group.state.unlocked', groupOnly, ({ groupId }) =>
    hide({ groupId, ...carrying('group_locked') }, { kind: 'group_unlocked' }, groupId),
  );
  on('group.state.closed', groupOnly, ({ groupId }) =>
    hide({ groupId }, { kind: 'group_closed' }, groupId),
  );
  on('group.privatization.started', groupOnly, ({ groupId }) =>
    listing.onPrivatizationStarted(groupId),
  );
  on(
    'group.badge.rights_changed',
    groupOnly.extend({ accountId: z.string().nullable() }),
    ({ groupId, accountId }) => listing.onBadgeRightsChanged(groupId, accountId),
  );

  // ── DANH MỤC, MỨC TIN CẬY ──────────────────────────────────────────────────────────────────────
  on(
    'category.status.changed',
    z.object({ categoryId: z.string(), enabled: z.boolean() }),
    ({ categoryId, enabled }) =>
      enabled
        ? hide({ categoryId, ...carrying('category_disabled') }, { kind: 'category_enabled' })
        : hide({ categoryId }, { kind: 'category_disabled' }),
  );
  // Bên phát ở `add-trust-tiers`. Tụt về T0 không đặt lại lý do lên tin đang hiện (design mục 7).
  on(
    'trust.tier.changed',
    account.extend({ from: z.string(), to: z.string() }),
    async ({ accountId, from, to }) => {
      if (from === 'T0' && to !== 'T0') await listing.onTierRaised(accountId);
    },
  );

  // ── MÁY DUYỆT ──────────────────────────────────────────────────────────────────────────────────
  // Bên phát ở `add-screening`; kết quả cũ (tin đã sửa) trượt êm qua ghi có điều kiện `version`.
  on(
    'screening.result.recorded',
    z.object({
      listingId: z.string(),
      listingVersion: z.number().int(),
      outcome: z.enum(['pass', 'hold']),
      restrictMachine: z.boolean(),
      rankAsListingId: z.string().nullish(),
    }),
    (result) => listing.applyMachineOutcome(result),
  );
  on(
    'screening.listing.recalled',
    z.object({ listingId: z.string(), listingVersion: z.number().int() }),
    ({ listingId, listingVersion }) => listing.recallByMachine(listingId, listingVersion),
  );
  on('screening.listing.restricted', z.object({ listingId: z.string() }), ({ listingId }) =>
    listing.restrictByMachine(listingId),
  );
}
