import type {
  ListingHideReason,
  ListingState,
  ReviewCloseCause,
  ReviewReason,
  ReviewTask,
} from '@prisma/client';

import { sequentially } from '../../../common/utils/sequential.js';
import type { GroupLeave, ListingLock, ReviewSubject } from '../../listing/listing.ports.js';
import {
  deadlineOf,
  earliest,
  QUEUE_OF,
  queueOf,
  REPORT_REASONS,
  SAMPLE_REASONS,
  withoutReasons,
  withReasons,
} from '../calc/task.calc.js';
import type { StrikeDetailDto } from '../../trust/strike/strike.schema.js';
import type { Tx } from '../review.repository.js';
import type { ReviewShared } from '../review.shared.js';

export interface AddReason {
  reason: ReviewReason;
  /** Cũng không được xử việc này (cùng tài khoản dùng chung máy với họ): người chuyển lên, người đã cho đạt. */
  alsoExclude?: readonly string[];
  escalation?: { by: string; note: string };
  sampledDecisionId?: string;
  /** Trong transaction của bên gọi — quyết định của người mở việc mới cùng lượt ghi. */
  tx?: Tx;
  expect?: ListingExpect;
}

export interface AddStrikeReason {
  reason: Extract<ReviewReason, 'appeal' | 'serious_strike' | 'permanent_review'>;
  /** Danh mục của gậy — staff khác của danh mục xét; `null` → bậc staff rỗng → master (spec appeals). */
  categoryId: string | null;
  /** Người nhận gậy, người ra gậy — và máy của cả hai. */
  exclude: readonly string[];
  tx?: Tx;
}

/**
 * Tin phải còn đúng như lúc sự kiện phát — sự kiện cũ được xử lại sau thay đổi mới hơn thì trượt qua
 * (fix-audit-review, T5). Kiểm trên dòng tin đang giữ khoá trong lượt ghi việc.
 */
export interface ListingExpect {
  version: number;
  states?: readonly ListingState[];
}

/** Thay đổi trạng thái tin `listing` phát (`listing.state.changed`) — phần `review` đọc. */
export interface StateChange {
  listingId: string;
  version: number;
  arrow: string;
}

export interface ReviewQueueService {
  addReason(listingId: string, input: AddReason): Promise<void>;
  /** Việc về một người (báo cáo về người — add-reports): như `addReason`, không có tin. */
  addAccountReason(
    accountId: string,
    input: Pick<AddReason, 'reason' | 'alsoExclude' | 'tx'>,
  ): Promise<void>;
  /** Việc về một gậy (add-strikes): khiếu nại, gậy nghiêm trọng chờ master, xem lại khoá vĩnh viễn — hàng 2. */
  addStrikeReason(strikeId: string, input: AddStrikeReason): Promise<void>;
  /**
   * Bên nghe mọi sự kiện gậy: đối chiếu việc về gậy với tình trạng gậy lúc nghe (C1) — còn chờ thì mở / gộp, không
   * còn gì chờ (ân xá, hết hạn, đã quyết qua việc khác) thì đóng việc còn mở.
   */
  onStrikeChanged(strikeId: string): Promise<void>;
  dropReasons(
    listingId: string,
    reasons: readonly ReviewReason[],
    cause: ReviewCloseCause,
    expect?: ListingExpect,
  ): Promise<void>;
  onStateChanged(change: StateChange): Promise<void>;
  onEdited(listingId: string): Promise<void>;
  onDeleted(listingId: string): Promise<void>;
  onMachineRestricted(listingId: string): Promise<void>;
  onMemberLeft(groupId: string, accountId: string, leave: GroupLeave): Promise<void>;
  onMemberBack(groupId: string, accountId: string): Promise<void>;
  onGroupClosed(groupId: string): Promise<void>;
  /** Người đăng xoá tài khoản: huỷ mọi việc mở về tin của họ (T4). */
  onAccountDeleted(accountId: string): Promise<void>;
  /** Tin vừa rời nhóm hẳn: chỉ còn việc nhóm chuyển lên staff (T7). */
  onDetached(listingIds: string[]): Promise<void>;
  /** Người (kể cả người ngoài) bị cấm khỏi nhóm: huỷ việc máy giữ về tin của họ trong nhóm (T7). */
  onBanned(groupId: string, accountId: string): Promise<void>;
  /** Thành viên đổi đơn vị: việc mở về tin của họ trong nhóm đi theo đơn vị mới (T8). */
  onUnitChanged(groupId: string, accountId: string): Promise<void>;
  /** Tin chờ duyệt, tin hạn chế do máy có từ trước khi có hàng chờ — chạy lúc khởi động, gộp nên chạy lại vô hại. */
  backfill(): Promise<{ held: number; machineRestricted: number }>;
  /** Cổng `OpenWork` cho `listing`: tin có việc mở thì không đổi nơi đăng (spec listing/editing). */
  blocksPlacement(listingId: string): Promise<boolean>;
}

const SAMPLES = [...SAMPLE_REASONS];
/** Lý do tạm ẩn vì nhóm: người ngoài được gỡ cấm mà tin còn mang một trong số này thì chưa có lại việc. */
const GROUP_HIDE_REASONS: ReadonlySet<ListingHideReason> = new Set([
  'left_group',
  'removed_from_group',
  'group_banned',
]);

/** Đóng nhóm huỷ việc máy giữ, hạn chế do máy, mẫu hậu kiểm; việc nhóm chuyển lên sàn vẫn xử (chốt 15/10/2026). */
const CLOSED_GROUP_REASONS: readonly ReviewReason[] = [
  'machine_hold',
  'machine_restricted',
  ...SAMPLES,
];

const matches = (listing: ListingLock | null, expect: ListingExpect | undefined): boolean =>
  !expect ||
  (listing !== null &&
    listing.version === expect.version &&
    (!expect.states || expect.states.includes(listing.state)));

const scopeOf = (subject: ReviewSubject) => ({
  categoryId: subject.categoryId,
  groupId: subject.groupId,
  unitId: subject.unitId,
  placement: subject.placement,
});

/**
 * Việc gậy đang chờ: gậy nghiêm trọng chưa quyết chờ master; khoá vĩnh viễn tới kỳ xem lại; khiếu nại chờ xét của gậy
 * còn hiệu lực (khiếu nại gậy nghiêm trọng chỉ thêm lời vào việc đang chờ master — design mục 12, câu 3). Gậy do
 * master ra thì master tự xem lại (spec appeals) nên người ra không bị loại; gậy nghiêm trọng thì master kia quyết.
 */
const pendingOf = (strike: StrikeDetailDto, now: Date): AddStrikeReason | null => {
  const exclude = [strike.accountId, strike.issuedBy];
  if (strike.kind === 'serious' && strike.status === 'active') {
    return { reason: 'serious_strike', categoryId: null, exclude };
  }
  if (strike.status === 'permanent') {
    const due = strike.permanentReviewAt !== null && new Date(strike.permanentReviewAt) <= now;
    return due
      ? { reason: 'permanent_review', categoryId: null, exclude: [strike.accountId] }
      : null;
  }
  if (strike.appeal?.status !== 'pending' || !strike.inForce) return null;
  return {
    reason: 'appeal',
    categoryId: strike.categoryId,
    exclude: strike.issuedByRole === 'master' ? [strike.accountId] : exclude,
  };
};

/**
 * Việc sinh, gộp, huỷ theo chuyện xảy ra với tin (design add-review-queues mục 3, 7): một tin một việc mở; gộp thêm lý
 * do và lấy hạn sớm nhất; bỏ lý do không kéo dài hạn; hết lý do thì huỷ.
 */
export function createQueueService(shared: ReviewShared): ReviewQueueService {
  const { repository, listings, groups, trust, clock, deadlines, withSharedDevices } = shared;

  /**
   * Mọi lượt ghi việc khoá dòng tin trước rồi mới tới việc — cùng thứ tự với lượt đổi tin chạy hook `after`. Lượt ghi
   * nhận phiên bản, trạng thái của dòng tin đang giữ khoá.
   */
  const onOpenTask = (
    listingId: string,
    write: (tx: Tx, open: ReviewTask | null, listing: ListingLock | null) => Promise<void>,
    tx?: Tx,
  ): Promise<void> => {
    let held: ListingLock | null = null;
    return repository.withOpenTask(listingId, (locking, open) => write(locking, open, held), {
      lockListing: async (locking) => {
        held = await listings.lockForReview(locking, listingId);
      },
      tx,
    });
  };

  const addReason = async (listingId: string, input: AddReason): Promise<void> => {
    const subject = await listings.reviewSubject(listingId);
    if (!subject) return;
    // Tin của tài khoản đã xoá không còn ai xem (T4); tin rời nhóm hẳn chỉ còn việc nhóm chuyển lên staff (T7).
    if (subject.hideReasons.includes('account_deleted')) return;
    if (subject.detached && input.reason !== 'group_escalation') return;
    const excluded = await withSharedDevices([subject.ownerId, ...(input.alsoExclude ?? [])]);
    const now = clock();
    const due = deadlineOf(input.reason, now, deadlines());
    const extra = {
      ...(input.escalation
        ? { escalatedBy: input.escalation.by, escalationNote: input.escalation.note }
        : {}),
      ...(input.sampledDecisionId ? { sampledDecisionId: input.sampledDecisionId } : {}),
    };
    await onOpenTask(
      listingId,
      async (tx, open, listing) => {
        if (!matches(listing, input.expect)) return;
        if (!open) {
          await repository.insertTask(tx, {
            listingId,
            reasons: [input.reason],
            createdAt: now,
            queue: QUEUE_OF[input.reason],
            dueAt: due,
            excludedIds: excluded,
            ...scopeOf(subject),
            ...extra,
          });
          return;
        }
        const reasons = withReasons(open.reasons, [input.reason]);
        await repository.updateTask(tx, open.id, {
          reasons,
          queue: queueOf(reasons),
          dueAt: earliest(open.dueAt, due),
          excludedIds: [...new Set([...open.excludedIds, ...excluded])],
          ...scopeOf(subject),
          ...extra,
        });
      },
      input.tx,
    );
  };

  const dropReasons = async (
    listingId: string,
    reasons: readonly ReviewReason[],
    cause: ReviewCloseCause,
    expect?: ListingExpect,
  ): Promise<void> => {
    const subject = await listings.reviewSubject(listingId);
    await onOpenTask(listingId, async (tx, open, listing) => {
      if (!matches(listing, expect)) return;
      if (!open || !open.reasons.some((reason) => reasons.includes(reason))) return;
      const left = withoutReasons(open.reasons, reasons);
      if (left.length === 0) {
        await repository.closeTask(tx, open.id, cause, clock());
        return;
      }
      await repository.updateTask(tx, open.id, {
        reasons: left,
        queue: queueOf(left),
        ...(subject ? scopeOf(subject) : {}),
      });
    });
  };

  /**
   * Huỷ việc vì chuyện xảy ra với tin (xoá, rút, đã bán, hết hạn, chủ tin xoá tài khoản). Lý do báo cáo ở lại: báo cáo
   * chỉ đóng bằng quyết định của người, xử trên bản lưu (cam kết 25, add-reports).
   */
  const cancel = (
    listingId: string,
    cause: ReviewCloseCause,
    expect?: ListingExpect,
  ): Promise<void> =>
    onOpenTask(listingId, async (tx, open, listing) => {
      if (!open || !matches(listing, expect)) return;
      const kept = open.reasons.filter((reason) => REPORT_REASONS.has(reason));
      if (kept.length === 0) {
        await repository.closeTask(tx, open.id, cause, clock());
        return;
      }
      if (kept.length < open.reasons.length) {
        await repository.updateTask(tx, open.id, { reasons: kept, queue: queueOf(kept) });
      }
    });

  const addAccountReason: ReviewQueueService['addAccountReason'] = async (accountId, input) => {
    const excluded = await withSharedDevices([accountId, ...(input.alsoExclude ?? [])]);
    const now = clock();
    const due = deadlineOf(input.reason, now, deadlines());
    await repository.withOpenAccountTask(
      accountId,
      async (tx, open) => {
        if (!open) {
          await repository.insertTask(tx, {
            accountId,
            reasons: [input.reason],
            createdAt: now,
            queue: QUEUE_OF[input.reason],
            dueAt: due,
            excludedIds: excluded,
          });
          return;
        }
        const reasons = withReasons(open.reasons, [input.reason]);
        await repository.updateTask(tx, open.id, {
          reasons,
          queue: queueOf(reasons),
          dueAt: earliest(open.dueAt, due),
          excludedIds: [...new Set([...open.excludedIds, ...excluded])],
        });
      },
      input.tx,
    );
  };

  const addStrikeReason: ReviewQueueService['addStrikeReason'] = async (strikeId, input) => {
    const excluded = await withSharedDevices(input.exclude);
    const now = clock();
    const due = deadlineOf(input.reason, now, deadlines());
    await repository.withOpenStrikeTask(
      strikeId,
      async (tx, open) => {
        if (!open) {
          await repository.insertTask(tx, {
            strikeId,
            categoryId: input.categoryId,
            reasons: [input.reason],
            createdAt: now,
            queue: QUEUE_OF[input.reason],
            dueAt: due,
            excludedIds: excluded,
          });
          return;
        }
        const reasons = withReasons(open.reasons, [input.reason]);
        await repository.updateTask(tx, open.id, {
          reasons,
          queue: queueOf(reasons),
          dueAt: earliest(open.dueAt, due),
          excludedIds: [...new Set([...open.excludedIds, ...excluded])],
        });
      },
      input.tx,
    );
  };

  const closeStrikeTask = (strikeId: string, cause: ReviewCloseCause): Promise<void> =>
    repository.withOpenStrikeTask(strikeId, async (tx, open) => {
      if (open) await repository.closeTask(tx, open.id, cause, clock());
    });

  /** Việc mở của tin lấy lại phạm vi (danh mục, nhóm, đơn vị) từ tin hiện tại. */
  const rescope = async (listingId: string): Promise<void> => {
    const subject = await listings.reviewSubject(listingId);
    if (!subject) return;
    await onOpenTask(listingId, async (tx, open) => {
      if (open) await repository.updateTask(tx, open.id, scopeOf(subject));
    });
  };

  const wentLive = (change: StateChange) =>
    repository.addSampleCandidate({
      listingId: change.listingId,
      listingVersion: change.version,
      at: clock(),
    });

  return {
    addReason,
    addAccountReason,
    addStrikeReason,
    dropReasons,

    async onStrikeChanged(strikeId) {
      const strike = await trust.strikeDetail(strikeId);
      const pending = strike ? pendingOf(strike, clock()) : null;
      if (pending) await addStrikeReason(strikeId, pending);
      else await closeStrikeTask(strikeId, 'strike_closed');
    },

    async onStateChanged(change) {
      const { listingId } = change;
      // Đúng phiên bản sự kiện mang: lượt xử lại tới sau một thay đổi mới hơn của tin thì thôi (T5).
      const atVersion: ListingExpect = { version: change.version };
      switch (change.arrow) {
        case 'hold':
        case 'recall':
          return addReason(listingId, {
            reason: 'machine_hold',
            expect: { ...atVersion, states: ['pending'] },
          });
        case 'pass': {
          await dropReasons(listingId, ['machine_hold'], 'machine_passed', atVersion);
          // Đọc lý do hạn chế từ tin — máy cho qua hạn chế đặt lý do "máy" trong cùng lượt ghi đã phát sự kiện này.
          const subject = await listings.reviewSubject(listingId);
          if (subject?.restrictions.includes('machine')) {
            await addReason(listingId, { reason: 'machine_restricted', expect: atVersion });
          } else {
            await dropReasons(listingId, ['machine_restricted'], 'machine_passed', atVersion);
          }
          return wentLive(change);
        }
        case 'approve':
        case 'restore':
        case 'appealWin':
          return wentLive(change);
        case 'withdraw':
          return cancel(listingId, 'withdrawn', atVersion);
        case 'markSold':
        case 'expire':
          return cancel(listingId, 'listing_closed', atVersion);
        default:
          return undefined;
      }
    },

    onEdited: (listingId) => dropReasons(listingId, SAMPLES, 'edited'),

    onDeleted: (listingId) => cancel(listingId, 'listing_deleted'),

    async onMachineRestricted(listingId) {
      const subject = await listings.reviewSubject(listingId);
      if (subject?.state === 'live') await addReason(listingId, { reason: 'machine_restricted' });
    },

    async onMemberLeft(groupId, accountId, leave) {
      // Lượt rời được xử lại sau khi người đó đã vào lại: không huỷ việc (fix-audit-listeners, C1).
      if (await groups.isMember(groupId, accountId)) return;
      const held = await listings.pendingInGroup(accountId, groupId, leave);
      await sequentially(held, (listingId) =>
        dropReasons(listingId, ['machine_hold'], 'member_left'),
      );
    },

    async onMemberBack(groupId, accountId) {
      // Lượt vào lại / gỡ cấm được xử lại khi người đó đang bị cấm: không sinh việc.
      const [member, banned] = await Promise.all([
        groups.isMember(groupId, accountId),
        groups.isBanned(groupId, accountId),
      ]);
      if (banned) return;
      const held = await listings.pendingInGroup(accountId, groupId);
      // Người ngoài được gỡ cấm: chỉ tin không còn bị ẩn vì lý do của nhóm mới có lại việc (T7).
      const eligible = member
        ? held
        : (
            await Promise.all(
              held.map(async (listingId) => {
                const subject = await listings.reviewSubject(listingId);
                const hidden = subject?.hideReasons.some((reason) =>
                  GROUP_HIDE_REASONS.has(reason),
                );
                return subject && !subject.detached && !hidden ? [listingId] : [];
              }),
            )
          ).flat();
      await sequentially(eligible, (listingId) => addReason(listingId, { reason: 'machine_hold' }));
    },

    async onBanned(groupId, accountId) {
      if (!(await groups.isBanned(groupId, accountId))) return;
      const held = await listings.pendingInGroup(accountId, groupId, {
        reason: 'banned',
        allowOutsiders: false,
      });
      await sequentially(held, (listingId) =>
        dropReasons(listingId, ['machine_hold'], 'member_left'),
      );
    },

    async onDetached(listingIds) {
      await sequentially(listingIds, async (listingId) => {
        const subject = await listings.reviewSubject(listingId);
        if (subject?.detached) await dropReasons(listingId, CLOSED_GROUP_REASONS, 'group_closed');
      });
    },

    async onAccountDeleted(accountId) {
      // Người đăng luôn nằm trong danh sách loại trừ của việc về tin của mình.
      const tasks = await repository.openTasksExcluding(accountId);
      await sequentially(tasks, async ({ listingId }) => {
        // Việc về chính người đó (báo cáo về người) ở lại — xử trên bản lưu (add-reports).
        if (!listingId) return;
        const subject = await listings.reviewSubject(listingId);
        if (subject?.ownerId === accountId) await cancel(listingId, 'listing_deleted');
      });
    },

    async onUnitChanged(groupId, accountId) {
      const tasks = await repository.openTasksInGroup(groupId);
      await sequentially(tasks, async ({ listingId }) => {
        if (!listingId) return;
        const subject = await listings.reviewSubject(listingId);
        if (subject?.ownerId === accountId) await rescope(listingId);
      });
    },

    async onGroupClosed(groupId) {
      const tasks = await repository.openTasksInGroup(groupId);
      await sequentially(tasks, async ({ listingId }) => {
        if (listingId) await dropReasons(listingId, CLOSED_GROUP_REASONS, 'group_closed');
      });
    },

    async backfill() {
      const { held, machineRestricted } = await listings.reviewBacklog();
      await sequentially(held, (listingId) => addReason(listingId, { reason: 'machine_hold' }));
      await sequentially(machineRestricted, (listingId) =>
        addReason(listingId, { reason: 'machine_restricted' }),
      );
      return { held: held.length, machineRestricted: machineRestricted.length };
    },

    blocksPlacement: (listingId) => repository.hasOpenTask(listingId),
  };
}
