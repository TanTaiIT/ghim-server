import type { Group, GroupState } from '@prisma/client';

import { createGroupAdminService, type GroupAdminService } from './group.admin.service.js';
import {
  createGroupMembershipService,
  type GroupMembershipService,
} from './group.membership.service.js';
import { sequentially } from '../../common/utils/sequential.js';
import { createGroupPostingService, type GroupPostingService } from './group.posting.service.js';
import { ALLOWS_MODERATION } from './calc/group-state.calc.js';
import { pickNominee } from './calc/membership.calc.js';
import { createGroupShared, type GroupServiceDeps } from './group.shared.js';

export type { GroupServiceDeps } from './group.shared.js';

const OWNERLESS: ReadonlySet<GroupState> = new Set(['ownerless']);

/** Người xử việc của nhóm — `review` định tuyến theo chuỗi TK 16 từ đây. */
export interface GroupReviewers {
  /** Nhóm đang cho điều hành (đang hoạt động, thiếu chủ, đang chuyển riêng tư). */
  moderationAllowed: boolean;
  ownerId: string | null;
  moderators: { accountId: string; unitId: string | null }[];
}

/** Việc hệ thống tự làm (bên nghe outbox, việc theo lịch) và cổng cho module khác. */
export interface GroupSystemService {
  /** Chủ nhóm bị khoá → thiếu chủ (còn điều hành viên dùng được) hoặc tạm khoá; điều hành viên bị khoá → xét lại đề cử. */
  onAccountLocked(accountId: string): Promise<void>;
  /** Chủ cũ được mở khoá trước khi có chủ mới → nhóm trở lại với chủ cũ; khoá do hệ thống thì tự mở. */
  onAccountUnlocked(accountId: string): Promise<void>;
  /**
   * Tài khoản bị xoá rời mọi nhóm. Chủ nhóm không tự xoá được, trừ khi lượt xoá chen với lượt nhận làm chủ — nhóm đó
   * thiếu chủ như khi chủ bị khoá (rà soát L3).
   */
  onAccountDeleted(accountId: string): Promise<void>;
  expireDue(): Promise<{ requests: number; invitations: number; offers: number }>;
  lockOwnerlessTimedOut(): Promise<string[]>;
  ownsAnyGroup(accountId: string): Promise<boolean>;
  managerIds(groupId: string): Promise<string[]>;
  /** Mọi điều hành viên (mọi phạm vi) — thông báo thiếu chủ tới hết. */
  moderatorIds(groupId: string): Promise<string[]>;
  memberIds(
    groupId: string,
    query: { unitId?: string; after?: string; take: number },
  ): Promise<string[]>;
  findGroup(groupId: string): Promise<Group | null>;
  countPendingRequests(groupId: string): Promise<number>;
  ownerId(groupId: string): Promise<string | null>;
  unitName(groupId: string, unitId: string): Promise<string | null>;
  announcementBody(announcementId: string): Promise<string | null>;
  isMember(groupId: string, accountId: string): Promise<boolean>;
  /** Đang bị cấm khỏi nhóm không — bên nghe của module khác đối chiếu trạng thái hiện tại (fix-audit-listeners). */
  isBanned(groupId: string, accountId: string): Promise<boolean>;
  /** Đơn vị hiện tại của thành viên (`null` = cả nhóm); `undefined` = không còn là thành viên. */
  memberUnit(groupId: string, accountId: string): Promise<string | null | undefined>;
  /**
   * Người xử việc của nhóm cho `review` (TK 16): nhóm còn cho điều hành không, chủ nhóm, điều hành viên kèm phạm vi
   * (`unitId` null = cả nhóm). Nhóm không có thì `null`.
   */
  reviewersOf(groupId: string): Promise<GroupReviewers | null>;
}

export type GroupService = GroupAdminService &
  GroupMembershipService &
  GroupSystemService &
  GroupPostingService;

/**
 * Ghép ba mặt của `group` (quản trị, thành viên, hệ thống) trên một phần dùng chung — như `identity`, để mỗi file
 * dưới 500 dòng mà không lặp luật nào. Interface mà route và module khác thấy là `GroupService`.
 */
export function createGroupService(deps: GroupServiceDeps): GroupService {
  const shared = createGroupShared(deps);
  const { repository, clock, usableModerators, loseOwner } = shared;

  /** Nhóm đang thiếu chủ mất điều hành viên: không còn ai dùng được thì tạm khoá ngay, còn thì đề cử lại. */
  const reevaluateOwnerless = async (groupId: string, exclude?: string): Promise<void> => {
    const group = await repository.findGroup(groupId);
    if (group?.state !== 'ownerless') return;
    const moderators = await usableModerators(groupId, exclude);
    const nominee = pickNominee(moderators);
    if (!nominee) {
      await repository.lockBySystem({
        groupId,
        cause: 'no_moderators',
        expectStates: OWNERLESS,
        at: clock(),
      });
      return;
    }
    if (nominee !== group.nomineeId) await repository.setNominee(groupId, nominee);
  };

  /** Trạng thái hiện tại của tài khoản — bên nghe khoá / mở khoá thôi khi nó đã khác chiều (fix-audit-listeners, C1). */
  const statusOf = async (accountId: string) =>
    (await deps.identity.accountSummaries([accountId])).get(accountId)?.status;

  const system: GroupSystemService = {
    async onAccountLocked(accountId) {
      // Lượt khoá được xử lại sau khi đã mở khoá: nhóm không được thành thiếu chủ với chủ đang hoạt động.
      if ((await statusOf(accountId)) !== 'locked') return;
      const at = clock();
      const { owned, moderatingOwnerless } = await repository.groupsAffectedByLock(accountId);
      await sequentially(owned, (group) => loseOwner(group.id, accountId, at));
      await sequentially(moderatingOwnerless, (group) => reevaluateOwnerless(group.id, accountId));
    },

    async onAccountUnlocked(accountId) {
      // Lượt mở khoá được xử lại khi chủ lại đang bị khoá (hay đã xoá): không trả nhóm cho chủ đó.
      if ((await statusOf(accountId)) !== 'active') return;
      await sequentially(await repository.groupsAwaitingOwner(accountId), async (group) => {
        await repository.restoreOwner({ groupId: group.id, at: clock() });
      });
    },

    async onAccountDeleted(accountId) {
      const at = clock();
      await sequentially(await repository.myMemberships(accountId), async (membership) => {
        const result = await repository.removeMember({
          groupId: membership.groupId,
          accountId,
          reason: 'account_deleted',
          by: accountId,
          at,
        });
        // Chủ nhóm chỉ xoá được tài khoản khi lượt xoá chen với lượt nhận làm chủ (L3): nhóm thiếu chủ như chủ bị khoá.
        if (result === 'owner') await loseOwner(membership.groupId, accountId, at);
        else if (membership.role === 'moderator') {
          await reevaluateOwnerless(membership.groupId, accountId);
        }
      });
      await repository.cancelPendingFor(accountId, at);
    },

    expireDue: () => repository.expireDue(clock()),
    lockOwnerlessTimedOut: () =>
      repository.lockOwnerlessTimedOut(clock(), deps.config.get('group.ownerlessMaxDays')),
    ownsAnyGroup: (accountId) => repository.ownsAnyGroup(accountId),
    managerIds: (groupId) => repository.managerIds(groupId),
    async reviewersOf(groupId) {
      const [group, owner, moderators] = await Promise.all([
        repository.findGroup(groupId),
        repository.findOwner(groupId),
        usableModerators(groupId),
      ]);
      if (!group) return null;
      // Chỉ tài khoản đang hoạt động xử việc; nhóm thiếu chủ không có chủ để việc chuyển tới (fix-audit-review, T3).
      const ownerActive =
        owner !== null &&
        group.state !== 'ownerless' &&
        (await statusOf(owner.accountId)) === 'active';
      return {
        moderationAllowed: ALLOWS_MODERATION.has(group.state),
        ownerId: ownerActive ? owner.accountId : null,
        moderators: moderators.map((m) => ({ accountId: m.accountId, unitId: m.moderatorUnitId })),
      };
    },
    async moderatorIds(groupId) {
      return (await repository.listModerators(groupId)).map((row) => row.accountId);
    },
    memberIds: (groupId, query) => repository.memberIds(groupId, query),
    findGroup: (groupId) => repository.findGroup(groupId),
    countPendingRequests: (groupId) => repository.countPendingRequests(groupId, clock()),
    async ownerId(groupId) {
      return (await repository.findOwner(groupId))?.accountId ?? null;
    },
    async unitName(groupId, unitId) {
      return (await repository.findUnit(groupId, unitId))?.name ?? null;
    },
    async announcementBody(announcementId) {
      return (await repository.findAnnouncement(announcementId))?.body ?? null;
    },
    async isMember(groupId, accountId) {
      return (await repository.findMember(groupId, accountId)) !== null;
    },
    isBanned: (groupId, accountId) => repository.isBanned(groupId, accountId),
    async memberUnit(groupId, accountId) {
      const [member] = await repository.membersAmong(groupId, [accountId]);
      return member?.unitId;
    },
  };

  return {
    ...createGroupAdminService(shared, reevaluateOwnerless),
    ...createGroupMembershipService(shared, reevaluateOwnerless),
    ...createGroupPostingService(shared),
    ...system,
  };
}
