import type {
  Listing,
  ListingFault,
  ListingRestriction,
  ListingState,
  Prisma,
} from '@prisma/client';

import { auditActor } from '../../../common/audit/audit.js';
import type { Actor } from '../../../common/auth/actor.js';
import { ForbiddenError } from '../../../common/errors/app-error.js';
import { startOfDayVN } from '../../../common/time/time.js';
import { DAY_MS, isDue, nextClock } from '../calc/display-period.calc.js';
import { type ListingArrow, type ListingSide, transition } from '../calc/listing.calc.js';
import { LISTING_EVENTS, listingEvent, stateChangedEvent } from '../listing.outbox.js';
import { LISTING_STATES } from '../listing.schema.js';
import type { Tx } from '../listing.repository.js';
import {
  clockSettings,
  invalidTransition,
  isPublicPlacement,
  type ListingShared,
  listingNotFound,
  withRestriction,
} from '../listing.shared.js';
import { type ListingLock, type TrustTier } from '../listing.ports.js';

export interface MachineResult {
  listingId: string;
  /** Phiên bản tin lúc máy chấm — sửa sau đó thì kết quả này của nội dung cũ, bỏ qua (luật 16). */
  listingVersion: number;
  outcome: 'pass' | 'hold';
  /** Cho qua mà hạn chế: đặt lý do "máy"; cho qua đầy đủ thì gỡ — kết quả mới thay kết quả của nội dung cũ. */
  restrictMachine: boolean;
  /** Tin trùng tin cũ của chính mình: lên bảng ở vị trí tin cũ (`add-screening`). */
  rankAsListingId?: string | null | undefined;
}

/** Sau khi ghi tin, cùng transaction: `review` ghi nhật ký quyết định, đóng việc (design add-review-queues mục 6). */
type AfterWrite = ((tx: Tx, updated: Listing) => Promise<void>) | undefined;

/**
 * Từ chối / gỡ luôn kèm lỗi: sai sót thì sửa gửi lại được, vi phạm thì không (TK 17). `faultReason` là lý do mẫu người
 * đăng thấy.
 */
export type ReviewInput = { listingId: string; version: number; after?: AfterWrite } & (
  | { arrow: 'approve' | 'restore' | 'appealWin' }
  | { arrow: 'reject' | 'remove'; fault: ListingFault; faultReason?: string | null | undefined }
);

export interface ListingSystemService {
  /** `false` = kết quả không còn áp được (tin đã sửa, đã rời đang kiểm) — bỏ qua, không lỗi. */
  applyMachineOutcome(result: MachineResult): Promise<boolean>;
  /** Cụm từ cấm mới bật thật: rút tin đang hiện về chờ duyệt, không từ chối (cam kết 16). */
  recallByMachine(listingId: string, listingVersion: number): Promise<boolean>;
  /** Lưới an toàn thiếu kết quả ảnh: thêm lý do "máy" (design mục 8). */
  /** Lưới an toàn hạn chế "máy"; có `version` thì chỉ khi tin còn đúng phiên bản đó — sự kiện tới trễ trượt qua (L8). */
  restrictByMachine(listingId: string, version?: number): Promise<boolean>;
  /** Mũi tên của người duyệt / người xét khiếu nại — `review`, `add-strikes` gọi. */
  review(input: ReviewInput): Promise<Listing>;
  /**
   * Người duyệt cho đạt việc hàng 3, 5: tin đang hiện giữ nguyên trạng thái và phiên bản, chỉ gỡ lý do "máy" (spec
   * review/decisions).
   */
  confirmLive(input: { listingId: string; version: number; after?: AfterWrite }): Promise<Listing>;
  expireDue(): Promise<number>;
  /**
   * Gậy đi kèm tin bị huỷ (khiếu nại thắng, ân xá): tin bị từ chối / gỡ vì vi phạm trở lại hiển thị với số ngày còn lại
   * (spec appeals, display-period). Tin đã đổi khác đi thì thôi — chạy lại vô hại.
   */
  restoreAfterStrike(listingId: string): Promise<boolean>;
  remindExpiring(): Promise<number>;
  removeBadgeByGroup(actor: Actor, groupId: string, listingId: string): Promise<void>;
  /** Cổng `ImageOwnership` cho `media`: tải ảnh cho tin của mình, chưa xoá. */
  canUpload(accountId: string, listingId: string): Promise<boolean>;
  existingListings(ids: string[]): Promise<Set<string>>;
  /** Cổng `PublicListingCounter` cho `group` — đếm trong transaction đổi chế độ (cam kết 22). */
  countGroupPublic(tx: Tx, groupId: string): Promise<number>;
  /**
   * Cổng cho `review`: giữ khoá dòng tin trong `tx` của nó trước khi sinh hay gộp việc. Lượt đổi tin khoá dòng tin rồi
   * mới ghi việc (quyết định, hook `after`); ghi việc ngoài lượt đó cũng phải khoá tin trước, không thì hai bên chờ nhau
   * — một bên giữ chỗ trong chỉ mục việc mở, một bên giữ dòng tin mà khoá ngoại của việc cần.
   */
  lockForReview(tx: Tx, listingId: string): Promise<ListingLock | null>;
}

/** Lên bảng (máy cho qua, người duyệt đạt / khôi phục, khiếu nại thắng): tính lý do "tài khoản mới" (mục 7). */
function restrictionsGoingLive(
  locked: Listing,
  tier: TrustTier,
  machine: boolean | null,
  strikePoints: number,
): ListingRestriction[] {
  const base =
    machine === null
      ? locked.restrictions
      : withRestriction(locked.restrictions, 'machine', machine);
  const newAccount = withRestriction(
    base,
    'new_account',
    tier === 'T0' && isPublicPlacement(locked.placement),
  );
  // Lên bảng khi người bán đang có gậy: hạn chế "gậy" tới khi điểm về 0 (spec listing/visibility, add-strikes).
  return withRestriction(newAccount, 'strike', strikePoints > 0 || base.includes('strike'));
}

/**
 * Cột ghi thêm của một mũi tên. Mũi tên lên bảng (`live`) cần mức tin cậy của người đăng cho lý do "tài khoản mới" —
 * đọc trong transaction sau khoá chung của `trust` (rà soát L7); mũi tên khác không đọc mức, không chờ khoá đó.
 */
type Columns =
  | ((locked: Listing) => Prisma.ListingUncheckedUpdateInput)
  | {
      live: (
        locked: Listing,
        tier: TrustTier,
        strikePoints: number,
      ) => Prisma.ListingUncheckedUpdateInput;
    };

export function createListingSystemService(shared: ListingShared): ListingSystemService {
  const { repository, groups, trust, config, clock, explainMiss } = shared;
  const settings = () => clockSettings(config);

  /**
   * Một mũi tên có điều kiện `version` từ bảng của `listing.calc.ts`; lên bảng thì tính lý do "tài khoản mới" theo mức
   * tin cậy đọc TRONG transaction, sau khoá chung của `trust` (mục 7; rà soát L7): đọc trước transaction thì lượt lên mức
   * chen giữa — bên nghe đổi mức chạy khi tin còn đang kiểm — để lý do bám mãi. `null` = phiên bản đã đổi, hay trạng thái
   * ngoài `states` — máy truyền đúng trạng thái nguồn để kết quả cũ trượt êm; người duyệt để mặc định nên sai trạng thái
   * là 409 `INVALID_TRANSITION`.
   */
  const decide = async (
    input: {
      listingId: string;
      version: number;
      arrow: ListingArrow;
      side: ListingSide;
      states?: readonly ListingState[];
      after?: AfterWrite;
    },
    columns: Columns,
    rankAt: Date | null = null,
  ) => {
    const now = clock();
    let tier: TrustTier = 'T0';
    let strikePoints = 0;
    return repository.change({
      id: input.listingId,
      states: input.states ?? LISTING_STATES,
      version: input.version,
      // Chỉ mũi tên lên bảng mới cần mức: mũi tên khác (gỡ, từ chối, giữ) không chờ lượt tính mức đang giữ khoá.
      ...(typeof columns === 'function'
        ? {}
        : {
            before: async (tx: Tx, locked: Listing) => {
              tier = await trust.tierIn(tx, locked.ownerId);
              strikePoints = await trust.strikePointsIn(tx, locked.ownerId);
            },
          }),
      data: (locked) => {
        const next = transition(locked.state, input.arrow, input.side);
        if (!next) throw invalidTransition();
        return {
          state: next,
          version: locked.version + 1,
          ...nextClock(
            locked,
            { state: next, hideReasons: locked.hideReasons },
            now,
            settings(),
            rankAt,
          ),
          ...(typeof columns === 'function'
            ? columns(locked)
            : columns.live(locked, tier, strikePoints)),
        };
      },
      after: input.after,
      events: (updated, locked) => [stateChangedEvent(updated, locked, input.arrow)],
    });
  };

  return {
    async applyMachineOutcome(result) {
      // Tin đã rời đang kiểm (sửa, rút về) thì kết quả này của nội dung cũ: trượt êm, không lỗi.
      const input = {
        listingId: result.listingId,
        version: result.listingVersion,
        side: 'machine' as const,
        states: ['checking' as const],
      };
      if (result.outcome === 'hold') {
        return (await decide({ ...input, arrow: 'hold' }, () => ({}))) !== null;
      }
      const ranked = result.rankAsListingId
        ? await repository.findById(result.rankAsListingId)
        : null;
      const passed = await decide(
        { ...input, arrow: 'pass' },
        {
          live: (locked, tier, points) => ({
            restrictions: restrictionsGoingLive(locked, tier, result.restrictMachine, points),
          }),
        },
        ranked?.rankAt ?? null,
      );
      return passed !== null;
    },

    async recallByMachine(listingId, listingVersion) {
      const recalled = await decide(
        { listingId, version: listingVersion, arrow: 'recall', side: 'machine', states: ['live'] },
        () => ({}),
      );
      return recalled !== null;
    },

    async restrictByMachine(listingId, version) {
      const changed = await repository.change({
        id: listingId,
        states: ['checking', 'pending', 'live', 'sold', 'expired'],
        ...(version === undefined ? {} : { version }),
        data: (locked) => ({ restrictions: withRestriction(locked.restrictions, 'machine', true) }),
      });
      return changed !== null;
    },

    async review(input) {
      const side = input.arrow === 'appealWin' ? 'appeal' : 'reviewer';
      // Người duyệt đạt hay khôi phục là người đã xem thay máy: gỡ lý do "máy" (chốt 15/10/2026); khiếu nại thắng giữ nguyên.
      const machine = input.arrow === 'appealWin' ? null : false;
      const fault =
        'fault' in input ? { fault: input.fault, faultReason: input.faultReason ?? null } : null;
      const decided = await decide(
        { ...input, side },
        fault
          ? () => fault
          : {
              live: (locked, tier, points) => ({
                fault: null,
                faultReason: null,
                restrictions: restrictionsGoingLive(locked, tier, machine, points),
              }),
            },
      );
      return decided?.after ?? explainMiss(input.listingId, input.version);
    },

    async confirmLive({ listingId, version, after }) {
      const confirmed = await repository.change({
        id: listingId,
        states: ['live'],
        version,
        data: (locked) => ({
          restrictions: withRestriction(locked.restrictions, 'machine', false),
        }),
        after,
      });
      return confirmed?.after ?? explainMiss(listingId, version);
    },

    async restoreAfterStrike(listingId) {
      const row = await repository.findById(listingId);
      if (!row || row.deletedAt !== null || row.fault !== 'violation') return false;
      if (row.state !== 'rejected' && row.state !== 'removed') return false;
      const restored = await decide(
        { listingId, version: row.version, arrow: 'appealWin', side: 'appeal' },
        {
          live: (locked, tier, points) => ({
            fault: null,
            faultReason: null,
            restrictions: restrictionsGoingLive(locked, tier, null, points),
          }),
        },
      );
      return restored !== null;
    },

    expireDue() {
      const now = clock();
      return repository.applyBatch({
        where: { state: 'live', expiresAt: { lte: now }, deletedAt: null },
        at: now,
        compute: (rows) =>
          rows
            .filter((row) => isDue(row.state, row, now))
            .map((row) => ({
              ...row,
              state: 'expired' as const,
              version: row.version + 1,
              ...nextClock(
                row,
                { state: 'expired', hideReasons: row.hideReasons },
                now,
                settings(),
              ),
            })),
        events: (changed) =>
          changed.map(({ before, after }) =>
            stateChangedEvent({ ...before, ...after }, before, 'expire'),
          ),
      });
    },

    remindExpiring() {
      const now = clock();
      const day = startOfDayVN(now).getTime() + config.get('listing.remindBeforeDays') * DAY_MS;
      return repository.applyBatch({
        where: {
          state: 'live',
          deletedAt: null,
          expiresAt: { gte: new Date(day), lt: new Date(day + DAY_MS) },
        },
        at: now,
        // Nhắc một lần cho mỗi hạn: gia hạn đổi hạn thì tự được nhắc lại (design mục 2).
        compute: (rows) =>
          rows
            .filter(
              (row) => row.expiresAt && row.remindedFor?.getTime() !== row.expiresAt.getTime(),
            )
            .map((row) => ({ ...row, remindedFor: row.expiresAt })),
        events: (changed) =>
          changed.map(({ before }) =>
            listingEvent(LISTING_EVENTS.expiryReminder, {
              listingId: before.id,
              ownerId: before.ownerId,
              expiresAt: before.expiresAt?.toISOString() ?? null,
            }),
          ),
      });
    },

    async removeBadgeByGroup(actor, groupId, listingId) {
      const listing = await repository.findById(listingId);
      if (!listing || listing.deletedAt !== null) throw listingNotFound();
      // Nhóm chỉ gỡ được huy hiệu của chính mình — không gỡ được tin sàn hay huy hiệu nhóm khác (cam kết 23).
      if (listing.badgeGroupId !== groupId)
        throw new ForbiddenError('Tin không mang huy hiệu của nhóm này');
      if (!(await groups.canRemoveBadge(actor, groupId, listing.ownerId)))
        throw new ForbiddenError();
      const now = clock();
      const removed = await repository.change({
        id: listingId,
        states: LISTING_STATES,
        data: () => ({ badgeGroupId: null }),
        after: (tx) =>
          repository.blockBadge(tx, { listingId, groupId, removedBy: actor.accountId, at: now }),
        events: (updated) => [
          listingEvent(LISTING_EVENTS.badgeRemoved, {
            listingId: updated.id,
            ownerId: updated.ownerId,
            groupId,
            cause: 'group',
          }),
        ],
        audit:
          actor.role === 'master'
            ? {
                ...auditActor(actor),
                action: 'listing.badge.remove',
                targetType: 'listing',
                targetId: listingId,
                details: { groupId },
              }
            : undefined,
      });
      if (!removed) throw listingNotFound();
    },

    async canUpload(accountId, listingId) {
      const listing = await repository.findById(listingId);
      return listing !== null && listing.deletedAt === null && listing.ownerId === accountId;
    },

    existingListings: (ids) => repository.existingIds(ids),
    countGroupPublic: (tx, groupId) => repository.countGroupPublic(tx, groupId),
    lockForReview: (tx, listingId) => repository.holdKey(tx, listingId),
  };
}
