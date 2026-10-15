import type { Prisma } from '@prisma/client';

import type { Actor } from '../../common/auth/actor.js';
import { badgeEligible } from './calc/badges.calc.js';
import type { GroupPostingSnapshot } from './group.repository.js';
import { isOwner, isWholeModerator, type GroupShared } from './group.shared.js';

export type { GroupPostingSnapshot } from './group.repository.js';

/** Huy hiệu hiện trên tin: tên nhóm, và nhóm đang tạm khoá thì ẩn lúc đọc — không lưu gì nên mở khoá là hiện lại. */
export interface BadgeLabel {
  name: string;
  locked: boolean;
}

/**
 * Cửa của `group` cho tin đăng (design add-listings mục 10). Luật nơi đăng là hàm thuần của `listing` chạy trên ảnh
 * chụp `lockForPosting` trả; `group` chỉ khoá và trả dữ kiện.
 */
export interface GroupPostingService {
  lockForPosting(
    tx: Prisma.TransactionClient,
    groupId: string,
    accountId: string,
  ): Promise<GroupPostingSnapshot | null>;
  membersAmong(groupId: string, accountIds: string[]): Promise<Set<string>>;
  /** Nhóm người xem đang là thành viên — phạm vi tin "chỉ thành viên". */
  memberGroupIds(accountId: string): Promise<Set<string>>;
  /** Ai trong danh sách đang có quyền mang huy hiệu của nhóm (TK 10). */
  badgeHolders(groupId: string, accountIds: string[]): Promise<Set<string>>;
  badgeLabels(groupIds: string[]): Promise<Map<string, BadgeLabel>>;
  /** Chủ nhóm, điều hành viên có phạm vi gồm người đăng, master (spec group/badges). */
  canRemoveBadge(actor: Actor, groupId: string, ownerId: string): Promise<boolean>;
}

export function createGroupPostingService(shared: GroupShared): GroupPostingService {
  const { repository, context } = shared;

  return {
    lockForPosting: (tx, groupId, accountId) => repository.lockForPosting(tx, groupId, accountId),

    async membersAmong(groupId, accountIds) {
      if (accountIds.length === 0) return new Set();
      const rows = await repository.membersAmong(groupId, accountIds);
      return new Set(rows.map((row) => row.accountId));
    },

    async memberGroupIds(accountId) {
      return new Set(await repository.memberGroupIds(accountId));
    },

    async badgeHolders(groupId, accountIds) {
      if (accountIds.length === 0) return new Set();
      const group = await repository.findGroup(groupId);
      if (!group) return new Set();
      const rows = await repository.membersAmong(groupId, accountIds);
      return new Set(rows.filter((row) => badgeEligible(row, group)).map((row) => row.accountId));
    },

    async badgeLabels(groupIds) {
      if (groupIds.length === 0) return new Map();
      const groups = await repository.findGroups([...new Set(groupIds)]);
      return new Map(
        groups.map((group) => [group.id, { name: group.name, locked: group.state === 'locked' }]),
      );
    },

    async canRemoveBadge(actor, groupId, ownerId) {
      const ctx = await context(actor, groupId);
      if (ctx.isMaster || isOwner(ctx) || isWholeModerator(ctx)) return true;
      const scope = ctx.member?.role === 'moderator' ? ctx.member.moderatorUnitId : null;
      if (scope === null) return false;
      const [owner] = await repository.membersAmong(groupId, [ownerId]);
      return owner?.unitId === scope;
    },
  };
}
