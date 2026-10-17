import type { Prisma } from '@prisma/client';
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

/**
 * Bên nghe của `listing` (design mục 9, 10, 14, 16). Mọi bên nghe chịu được nhận trùng và không dựa vào thứ tự: cặp
 * đặt / gỡ (khoá, cấm, rời, danh mục) lấy chiều từ trạng thái hiện tại, đọc sau khi đã khoá dòng — sự kiện chỉ là tín
 * hiệu "có đổi" (fix-audit-listeners, C1); kết quả máy ghi có điều kiện `version`.
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
    listing.onAccountLockChanged(accountId),
  );
  on('identity.account.unlocked', account, ({ accountId }) =>
    listing.onAccountLockChanged(accountId),
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
      listing.onMembershipChanged(groupId, accountId, { reason, allowOutsiders }),
  );
  on('group.member.joined', member, async ({ groupId, accountId }) => {
    await listing.onMembershipChanged(groupId, accountId, null);
    // Vào lại nhóm với đơn vị khác: tin của người đó trong nhóm theo đơn vị hiện tại (fix-audit-review, T8).
    await listing.onUnitChanged(groupId, accountId);
  });
  on('group.member.unit_changed', member, ({ groupId, accountId }) =>
    listing.onUnitChanged(groupId, accountId),
  );
  on('group.ban.created', member, ({ groupId, accountId }) =>
    listing.onBanChanged(groupId, accountId),
  );
  on('group.ban.lifted', member, ({ groupId, accountId }) =>
    listing.onBanChanged(groupId, accountId),
  );
  on('group.state.locked', groupOnly, ({ groupId }) => listing.onGroupLockChanged(groupId));
  on('group.state.unlocked', groupOnly, ({ groupId }) => listing.onGroupLockChanged(groupId));
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

  // ── GẬY ──
  // Bên phát ở `trust` (add-strikes): đối chiếu theo điểm hiện tại; gậy đi kèm tin bị huỷ thì tin trở lại hiển thị.
  on('trust.strike.standing', account, ({ accountId }) =>
    listing.onStrikeStandingChanged(accountId),
  );
  on('trust.strike.cancelled', z.object({ listingId: z.string().nullable() }), ({ listingId }) =>
    listingId ? listing.restoreAfterStrike(listingId) : Promise.resolve(false),
  );

  // ── BÁO CÁO ──
  // Bên phát ở `review` (add-reports): báo cáo tự ẩn tin, hay vừa có quyết định — chiều lấy từ `review` lúc xử.
  on('review.report.hide_changed', z.object({ listingId: z.string() }), ({ listingId }) =>
    listing.onReportHideChanged(listingId),
  );

  // ── DANH MỤC, MỨC TIN CẬY ──────────────────────────────────────────────────────────────────────
  on(
    'category.status.changed',
    z.object({ categoryId: z.string(), enabled: z.boolean() }),
    ({ categoryId }) => listing.onCategoryStatusChanged(categoryId),
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
  // `listingVersion` có từ fix-audit-image-checks (L8); sự kiện cũ còn trong outbox không mang nó.
  on(
    'screening.listing.restricted',
    z.object({ listingId: z.string(), listingVersion: z.number().int().optional() }),
    ({ listingId, listingVersion }) => listing.restrictByMachine(listingId, listingVersion),
  );
}
