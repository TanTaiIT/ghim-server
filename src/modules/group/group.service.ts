import type { Group, GroupState } from '@prisma/client';

import { createGroupAdminService, type GroupAdminService } from './group.admin.service.js';
import {
  createGroupMembershipService,
  type GroupMembershipService,
} from './group.membership.service.js';
import { sequentially } from '../../common/utils/sequential.js';
import { createGroupPostingService, type GroupPostingService } from './group.posting.service.js';
import { pickNominee } from './membership.calc.js';
import { createGroupShared, type GroupServiceDeps } from './group.shared.js';

export type { GroupServiceDeps } from './group.shared.js';

const STATES_LOSING_OWNER: ReadonlySet<GroupState> = new Set(['active', 'going_private']);
const OWNERLESS: ReadonlySet<GroupState> = new Set(['ownerless']);

/** Việc hệ thống tự làm (bên nghe outbox, việc theo lịch) và cổng cho module khác. */
export interface GroupSystemService {
  /** Chủ nhóm bị khoá → thiếu chủ (còn điều hành viên dùng được) hoặc tạm khoá; điều hành viên bị khoá → xét lại đề cử. */
  onAccountLocked(accountId: string): Promise<void>;
  /** Chủ cũ được mở khoá trước khi có chủ mới → nhóm trở lại với chủ cũ; khoá do hệ thống thì tự mở. */
  onAccountUnlocked(accountId: string): Promise<void>;
  /** Tài khoản bị xoá rời mọi nhóm; chủ nhóm không tự xoá được nên không bao giờ rơi vào đây. */
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
  const { repository, clock, usableModerators } = shared;

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

  const system: GroupSystemService = {
    async onAccountLocked(accountId) {
      const at = clock();
      const { owned, moderatingOwnerless } = await repository.groupsAffectedByLock(accountId);
      await sequentially(owned, async (group) => {
        const nominee = pickNominee(await usableModerators(group.id, accountId));
        if (nominee) {
          await repository.markOwnerless({ groupId: group.id, nomineeId: nominee, at });
          return;
        }
        await repository.lockBySystem({
          groupId: group.id,
          cause: 'no_moderators',
          expectStates: STATES_LOSING_OWNER,
          at,
        });
      });
      await sequentially(moderatingOwnerless, (group) => reevaluateOwnerless(group.id, accountId));
    },

    async onAccountUnlocked(accountId) {
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
        if (result !== 'owner' && membership.role === 'moderator') {
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
  };

  return {
    ...createGroupAdminService(shared, reevaluateOwnerless),
    ...createGroupMembershipService(shared, reevaluateOwnerless),
    ...createGroupPostingService(shared),
    ...system,
  };
}
