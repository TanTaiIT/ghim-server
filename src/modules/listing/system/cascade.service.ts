import type { Listing, ListingHideReason, Prisma } from '@prisma/client';

import type { OutboxEventInput } from '../../../common/outbox/outbox.js';
import { DAY_MS, nextClock } from '../calc/display-period.calc.js';
import { applyHideEvent, DETACHED_REASONS, type HideEvent, isDetached } from '../calc/hide.calc.js';
import type { GroupLeave } from '../listing.ports.js';
import { LISTING_EVENTS, listingEvent } from '../listing.outbox.js';
import type { BatchRow, Tx } from '../listing.repository.js';
import {
  clockSettings,
  invalidTransition,
  type ListingShared,
  withRestriction,
} from '../listing.shared.js';

/** Tin đổi theo sự kiện của module khác (design mục 9, 10, 14, 7) — đều theo lô, đều chịu được nhận trùng. */
export interface ListingCascadeService {
  onHideEvent(
    where: Prisma.ListingWhereInput,
    event: HideEvent,
    groupId?: string | null,
  ): Promise<number>;
  /**
   * Người xử của nhóm gỡ một tin khỏi nhóm (TK 17, design add-review-queues mục 6): như `onHideEvent` với
   * `detached_by_group` nhưng cho đúng một tin, có điều kiện phiên bản, cùng transaction với nhật ký quyết định.
   */
  detachByGroup(input: {
    listingId: string;
    version: number;
    groupId: string;
    after?: ((tx: Tx, updated: Listing) => Promise<void>) | undefined;
  }): Promise<Listing>;
  onPrivatizationStarted(groupId: string): Promise<void>;
  /*
   * Bên nghe theo cặp (fix-audit-listeners, C1): sự kiện chỉ báo "có đổi"; chiều đặt / gỡ lấy từ trạng thái hiện tại, đọc
   * trong transaction của mỗi lô sau khi đã khoá dòng — xử lại sự kiện cũ, tới trễ, hay nhiều tiến trình phát cùng lúc
   * đều ra cùng một kết quả.
   */
  onAccountLockChanged(accountId: string): Promise<number>;
  onGroupLockChanged(groupId: string): Promise<number>;
  onBanChanged(groupId: string, accountId: string): Promise<number>;
  /** `leave` = lượt rời (chụp lý do và công tắc người ngoài lúc rời); `null` = lượt vào. */
  onMembershipChanged(
    groupId: string,
    accountId: string,
    leave: GroupLeave | null,
  ): Promise<number>;
  onCategoryStatusChanged(categoryId: string): Promise<number>;
  /** Ghi đơn vị hiện tại của thành viên lên tin của họ trong nhóm; không còn là thành viên thì thôi. */
  onUnitChanged(groupId: string, accountId: string): Promise<number>;
  onBadgeRightsChanged(groupId: string, accountId: string | null): Promise<number>;
  /** Gỡ "tài khoản mới" khi mức hiện tại đã khác T0 — lượt lên mức tới trễ sau một lượt tụt không gỡ nhầm. */
  onTierRaised(accountId: string): Promise<number>;
}

interface HideNotice {
  reason: ListingHideReason;
  change: 'added' | 'removed';
}

/**
 * Chuyện N32 kể cho người đăng. Khoá / xoá tài khoản không có dòng nào: người đó không vào được app (design mục 11);
 * ba lý do rời nhóm hẳn đi N33 thay vì N32.
 */
function hideNotice(event: HideEvent): HideNotice | null {
  switch (event.kind) {
    case 'member_left':
      return {
        reason: event.reason === 'left' ? 'left_group' : 'removed_from_group',
        change: 'added',
      };
    case 'member_joined':
      return { reason: 'left_group', change: 'removed' };
    case 'ban_created':
      return { reason: 'group_banned', change: 'added' };
    case 'ban_lifted':
      return { reason: 'group_banned', change: 'removed' };
    case 'group_locked':
      return { reason: 'group_locked', change: 'added' };
    case 'group_unlocked':
      return { reason: 'group_locked', change: 'removed' };
    case 'category_disabled':
      return { reason: 'category_disabled', change: 'added' };
    case 'category_enabled':
      return { reason: 'category_disabled', change: 'removed' };
    default:
      return null;
  }
}

const DETACH_REASON: Partial<Record<HideEvent['kind'], ListingHideReason>> = {
  group_closed: 'group_closed',
  outsider_privatized: 'group_privatized',
  detached_by_group: 'detached_by_group',
};

type Changed = { before: Listing; after: BatchRow }[];

const ownersOf = (rows: Changed): string[] => [
  ...new Set(rows.map(({ before }) => before.ownerId)),
];

export function createListingCascadeService(shared: ListingShared): ListingCascadeService {
  const { repository, groups, categories, identity, trust, config, clock, explainMiss } = shared;

  /** Một sự kiện gộp cho cả lô (N32 / N33 gộp theo người đăng ở `notification`), không một sự kiện mỗi tin. */
  const hideEvents = (event: HideEvent, changed: Changed, groupId: string | null) => {
    const events: OutboxEventInput[] = [];
    const detached = changed.filter(
      ({ before, after }) => !isDetached(before.hideReasons) && isDetached(after.hideReasons),
    );
    const notice = hideNotice(event);
    const plain = changed.filter((row) => !detached.includes(row));
    if (notice && plain.length > 0) {
      events.push(
        listingEvent(LISTING_EVENTS.hiddenChanged, {
          listingIds: plain.map(({ after }) => after.id),
          ownerIds: ownersOf(plain),
          groupId,
          ...notice,
        }),
      );
    }
    const detachReason = DETACH_REASON[event.kind];
    if (detachReason && detached.length > 0) {
      const days = config.get('listing.moveToMarketplaceDays');
      events.push(
        listingEvent(LISTING_EVENTS.detached, {
          listingIds: detached.map(({ after }) => after.id),
          ownerIds: ownersOf(detached),
          groupId,
          reason: detachReason,
          moveUntil: new Date(clock().getTime() + days * DAY_MS).toISOString(),
        }),
      );
    }
    return events;
  };

  /** Cột mới của một dòng sau sự kiện tạm ẩn; `null` = dòng không đổi. */
  const hidden = (row: Listing, event: HideEvent, now: Date): BatchRow | null => {
    const change = applyHideEvent(row, event);
    if (!change) return null;
    return {
      ...row,
      hideReasons: change.hideReasons,
      leftGroupAt: change.detachedNow ? now : row.leftGroupAt,
      ...nextClock(
        row,
        { state: row.state, hideReasons: change.hideReasons },
        now,
        clockSettings(config),
      ),
    };
  };

  /** `decide` chạy trong lô sau khi khoá dòng và trả sự kiện tạm ẩn đúng chiều hiện tại; `null` = lô không đổi. */
  const reconcile = (
    where: Prisma.ListingWhereInput,
    decide: () => Promise<HideEvent | null>,
    groupId: string | null = null,
  ) => {
    const now = clock();
    return repository.applyBatch<HideEvent | null>({
      where: { ...where, deletedAt: null },
      at: now,
      prepare: decide,
      compute: (rows, event) => (event ? rows.flatMap((row) => hidden(row, event, now) ?? []) : []),
      events: (changed, event) => (event ? hideEvents(event, changed, groupId) : []),
    });
  };

  return {
    onAccountLockChanged: (accountId) =>
      reconcile({ ownerId: accountId }, async () =>
        (await identity.accountState(accountId))?.status === 'locked'
          ? { kind: 'account_locked' }
          : { kind: 'account_unlocked' },
      ),

    onGroupLockChanged: (groupId) =>
      reconcile(
        { groupId },
        async () => {
          const group = await groups.findGroup(groupId);
          // Nhóm đã đóng: tin đã rời nhóm hẳn, lý do khoá không còn nghĩa gì để báo.
          if (!group || group.state === 'closed') return null;
          return { kind: group.state === 'locked' ? 'group_locked' : 'group_unlocked' };
        },
        groupId,
      ),

    onBanChanged: (groupId, accountId) =>
      reconcile(
        { ownerId: accountId, groupId },
        async () => ({
          kind: (await groups.isBanned(groupId, accountId)) ? 'ban_created' : 'ban_lifted',
        }),
        groupId,
      ),

    onMembershipChanged: (groupId, accountId, leave) =>
      reconcile(
        { ownerId: accountId, groupId },
        async () => {
          if ((await groups.membersAmong(groupId, [accountId])).has(accountId)) {
            return { kind: 'member_joined' };
          }
          // Không còn là thành viên: chỉ lượt rời mới biết lý do và công tắc người ngoài để đặt lý do.
          return leave ? { kind: 'member_left', ...leave } : null;
        },
        groupId,
      ),

    onCategoryStatusChanged: (categoryId) =>
      reconcile({ categoryId }, async () => {
        const category = (await categories.statusOf([categoryId])).get(categoryId);
        if (!category) return null;
        return { kind: category.enabled ? 'category_enabled' : 'category_disabled' };
      }),

    onHideEvent(where, event, groupId = null) {
      const now = clock();
      return repository.applyBatch({
        where: { ...where, deletedAt: null },
        at: now,
        compute: (rows) => rows.flatMap((row) => hidden(row, event, now) ?? []),
        events: (changed) => hideEvents(event, changed, groupId),
      });
    },

    async detachByGroup({ listingId, version, groupId, after }) {
      const now = clock();
      const event: HideEvent = { kind: 'detached_by_group' };
      const changed = await repository.change({
        id: listingId,
        states: ['checking', 'pending', 'live', 'rejected', 'removed', 'sold', 'expired'],
        version,
        data: (locked) => {
          const change = locked.groupId === groupId ? applyHideEvent(locked, event) : null;
          if (!change?.detachedNow) throw invalidTransition('Tin không còn trong nhóm này');
          return {
            hideReasons: change.hideReasons,
            leftGroupAt: now,
            ...nextClock(
              locked,
              { state: locked.state, hideReasons: change.hideReasons },
              now,
              clockSettings(config),
            ),
          };
        },
        after,
        events: (updated, locked) =>
          hideEvents(event, [{ before: locked, after: updated }], groupId),
      });
      return changed?.after ?? explainMiss(listingId, version);
    },

    async onPrivatizationStarted(groupId) {
      // Nhận trùng sau khi nhóm đã thành riêng tư: không còn gì để hạ, `completePrivatization` sẽ ném 409.
      if ((await groups.findGroup(groupId))?.state !== 'going_private') return;
      const now = clock();
      const where: Prisma.ListingWhereInput = {
        groupId,
        placement: 'group_public',
        deletedAt: null,
        state: { not: 'draft' },
        NOT: { hideReasons: { hasSome: [...DETACHED_REASONS] } },
      };
      const members = await groups.membersAmong(groupId, await repository.ownersWhere(where));
      const outsider: HideEvent = { kind: 'outsider_privatized' };
      await repository.applyBatch({
        where,
        at: now,
        compute: (rows) =>
          rows.flatMap((row) =>
            // Thành viên: hạ về "chỉ thành viên", không qua máy, không đổi phiên bản — không phải sửa của người đăng.
            members.has(row.ownerId)
              ? [
                  {
                    ...row,
                    placement: 'members_only' as const,
                    restrictions: withRestriction(row.restrictions, 'new_account', false),
                  },
                ]
              : (hidden(row, outsider, now) ?? []),
          ),
        events: (changed) => {
          const downgraded = changed.filter(({ after }) => after.placement === 'members_only');
          const outsiders = changed.filter(({ after }) => after.placement !== 'members_only');
          return [
            ...(downgraded.length > 0
              ? [
                  listingEvent(LISTING_EVENTS.placementDowngraded, {
                    groupId,
                    listingIds: downgraded.map(({ after }) => after.id),
                    ownerIds: ownersOf(downgraded),
                  }),
                ]
              : []),
            ...hideEvents(outsider, outsiders, groupId),
          ];
        },
      });
      await groups.completePrivatization(groupId);
    },

    onUnitChanged(groupId, accountId) {
      return repository.applyBatch<string | null | undefined>({
        where: { groupId, ownerId: accountId, deletedAt: null },
        at: clock(),
        prepare: () => groups.memberUnit(groupId, accountId),
        compute: (rows, unitId) =>
          unitId === undefined
            ? []
            : rows.filter((row) => row.unitId !== unitId).map((row) => ({ ...row, unitId })),
      });
    },

    async onBadgeRightsChanged(groupId, accountId) {
      const where: Prisma.ListingWhereInput = {
        badgeGroupId: groupId,
        deletedAt: null,
        ...(accountId ? { ownerId: accountId } : {}),
      };
      const holders = await groups.badgeHolders(groupId, await repository.ownersWhere(where));
      return repository.applyBatch({
        where,
        at: clock(),
        // Mất quyền thì gỡ, không ghi chặn: có lại quyền thì người đăng gắn lại được (design mục 14).
        compute: (rows) =>
          rows
            .filter((row) => !holders.has(row.ownerId))
            .map((row) => ({ ...row, badgeGroupId: null })),
        events: (changed) =>
          changed.map(({ before }) =>
            listingEvent(LISTING_EVENTS.badgeRemoved, {
              listingId: before.id,
              ownerId: before.ownerId,
              groupId,
              cause: 'rights',
            }),
          ),
      });
    },

    onTierRaised(accountId) {
      return repository.applyBatch<string>({
        where: { ownerId: accountId, deletedAt: null, restrictions: { has: 'new_account' } },
        at: clock(),
        prepare: () => trust.tierOf(accountId),
        compute: (rows, tier) =>
          (tier === 'T0' ? [] : rows).map((row) => ({
            ...row,
            restrictions: withRestriction(row.restrictions, 'new_account', false),
          })),
      });
    },
  };
}
