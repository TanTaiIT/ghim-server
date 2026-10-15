import type { ReviewCloseCause, ReviewReason, ReviewTask } from '@prisma/client';

import { sequentially } from '../../../common/utils/sequential.js';
import type { ReviewSubject } from '../../listing/listing.ports.js';
import {
  deadlineOf,
  earliest,
  QUEUE_OF,
  queueOf,
  SAMPLE_REASONS,
  withoutReasons,
  withReasons,
} from '../calc/task.calc.js';
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
}

/** Thay đổi trạng thái tin `listing` phát (`listing.state.changed`) — phần `review` đọc. */
export interface StateChange {
  listingId: string;
  version: number;
  arrow: string;
}

export interface ReviewQueueService {
  addReason(listingId: string, input: AddReason): Promise<void>;
  dropReasons(
    listingId: string,
    reasons: readonly ReviewReason[],
    cause: ReviewCloseCause,
  ): Promise<void>;
  onStateChanged(change: StateChange): Promise<void>;
  onEdited(listingId: string): Promise<void>;
  onDeleted(listingId: string): Promise<void>;
  onMachineRestricted(listingId: string): Promise<void>;
  onMemberLeft(groupId: string, accountId: string): Promise<void>;
  onMemberBack(groupId: string, accountId: string): Promise<void>;
  onGroupClosed(groupId: string): Promise<void>;
  /** Tin chờ duyệt, tin hạn chế do máy có từ trước khi có hàng chờ — chạy lúc khởi động, gộp nên chạy lại vô hại. */
  backfill(): Promise<{ held: number; machineRestricted: number }>;
  /** Cổng `OpenWork` cho `listing`: tin có việc mở thì không đổi nơi đăng (spec listing/editing). */
  blocksPlacement(listingId: string): Promise<boolean>;
}

const SAMPLES = [...SAMPLE_REASONS];
/** Đóng nhóm huỷ việc máy giữ, hạn chế do máy, mẫu hậu kiểm; việc nhóm chuyển lên sàn vẫn xử (chốt 15/10/2026). */
const CLOSED_GROUP_REASONS: readonly ReviewReason[] = [
  'machine_hold',
  'machine_restricted',
  ...SAMPLES,
];

const scopeOf = (subject: ReviewSubject) => ({
  categoryId: subject.categoryId,
  groupId: subject.groupId,
  unitId: subject.unitId,
  placement: subject.placement,
});

/**
 * Việc sinh, gộp, huỷ theo chuyện xảy ra với tin (design add-review-queues mục 3, 7): một tin một việc mở; gộp thêm lý
 * do và lấy hạn sớm nhất; bỏ lý do không kéo dài hạn; hết lý do thì huỷ.
 */
export function createQueueService(shared: ReviewShared): ReviewQueueService {
  const { repository, listings, clock, deadlines, withSharedDevices } = shared;

  /** Mọi lượt ghi việc khoá dòng tin trước rồi mới tới việc — cùng thứ tự với lượt đổi tin chạy hook `after`. */
  const onOpenTask = (
    listingId: string,
    write: (tx: Tx, open: ReviewTask | null) => Promise<void>,
    tx?: Tx,
  ): Promise<void> =>
    repository.withOpenTask(listingId, write, {
      lockListing: (locking) => listings.lockForReview(locking, listingId),
      tx,
    });

  const addReason = async (listingId: string, input: AddReason): Promise<void> => {
    const subject = await listings.reviewSubject(listingId);
    if (!subject) return;
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
      async (tx, open) => {
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
  ): Promise<void> => {
    const subject = await listings.reviewSubject(listingId);
    await onOpenTask(listingId, async (tx, open) => {
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

  const cancel = (listingId: string, cause: ReviewCloseCause): Promise<void> =>
    onOpenTask(listingId, async (tx, open) => {
      if (open) await repository.closeTask(tx, open.id, cause, clock());
    });

  const wentLive = (change: StateChange) =>
    repository.addSampleCandidate(change.listingId, change.version, clock());

  return {
    addReason,
    dropReasons,

    async onStateChanged(change) {
      const { listingId } = change;
      switch (change.arrow) {
        case 'hold':
        case 'recall':
          return addReason(listingId, { reason: 'machine_hold' });
        case 'pass': {
          await dropReasons(listingId, ['machine_hold'], 'machine_passed');
          // Đọc lý do hạn chế từ tin — máy cho qua hạn chế đặt lý do "máy" trong cùng lượt ghi đã phát sự kiện này.
          const subject = await listings.reviewSubject(listingId);
          if (subject?.restrictions.includes('machine')) {
            await addReason(listingId, { reason: 'machine_restricted' });
          } else {
            await dropReasons(listingId, ['machine_restricted'], 'machine_passed');
          }
          return wentLive(change);
        }
        case 'approve':
        case 'restore':
        case 'appealWin':
          return wentLive(change);
        case 'withdraw':
          return cancel(listingId, 'withdrawn');
        case 'markSold':
        case 'expire':
          return cancel(listingId, 'listing_closed');
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

    async onMemberLeft(groupId, accountId) {
      const held = await listings.pendingInGroup(accountId, groupId);
      await sequentially(held, (listingId) =>
        dropReasons(listingId, ['machine_hold'], 'member_left'),
      );
    },

    async onMemberBack(groupId, accountId) {
      const held = await listings.pendingInGroup(accountId, groupId);
      await sequentially(held, (listingId) => addReason(listingId, { reason: 'machine_hold' }));
    },

    async onGroupClosed(groupId) {
      const tasks = await repository.openTasksInGroup(groupId);
      await sequentially(tasks, (task) =>
        dropReasons(task.listingId, CLOSED_GROUP_REASONS, 'group_closed'),
      );
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
