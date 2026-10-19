import type { Group, GroupJoinRequest, GroupMember } from '@prisma/client';

import type { Actor } from '../../common/auth/actor.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '../../common/errors/app-error.js';
import { fold } from '../../common/text/fold.js';
import { formatDateVN, formatTimeVN, startOfDayVN } from '../../common/time/time.js';
import { badgeEligible } from './calc/badges.calc.js';
import { ACCEPTS_MEMBERS, ALLOWS_MODERATION, isPublicMode } from './calc/group-state.calc.js';
import { decideJoin, joinRequestBlock, normalizeGroupCode } from './calc/membership.calc.js';
import type { AddMemberFailure, Page } from './group.repository.js';
import type {
  AnnouncementDto,
  BadgeDto,
  BannedMemberDto,
  GroupSummaryDto,
  GroupViewDto,
  JoinRequestDto,
  JoinResultDto,
  MemberDto,
  MyGroupDto,
  MyInvitationsDto,
  OwnerOfferDto,
  PendingInvitationDto,
} from './group.schema.js';
import {
  type GroupContext,
  type GroupShared,
  forbidden,
  groupStateConflict,
  isOwner,
  isWholeModerator,
} from './group.shared.js';

interface PageQuery {
  skip: number;
  take: number;
}

export interface GroupMembershipService {
  search(q: string | undefined, page: PageQuery): Promise<Page<GroupSummaryDto>>;
  view(actor: Actor | null, groupId: string): Promise<GroupViewDto>;
  lookupCode(actor: Actor, code: string): Promise<GroupSummaryDto>;
  join(actor: Actor, groupId: string, code: string | undefined): Promise<JoinResultDto>;
  withdrawRequest(actor: Actor, groupId: string): Promise<void>;
  leave(actor: Actor, groupId: string): Promise<void>;
  myGroups(actor: Actor): Promise<MyGroupDto[]>;
  myBadges(actor: Actor): Promise<BadgeDto[]>;
  myInvitations(actor: Actor): Promise<MyInvitationsDto>;
  myOwnerOffers(actor: Actor): Promise<OwnerOfferDto[]>;
  acceptInvitation(actor: Actor, invitationId: string): Promise<MyGroupDto>;
  declineInvitation(actor: Actor, invitationId: string): Promise<void>;

  listMembers(
    actor: Actor,
    groupId: string,
    query: { unitId?: string } & PageQuery,
  ): Promise<Page<MemberDto>>;
  setMemberUnit(
    actor: Actor,
    groupId: string,
    accountId: string,
    unitId: string | null,
  ): Promise<MemberDto>;
  removeMember(actor: Actor, groupId: string, accountId: string): Promise<void>;
  ban(actor: Actor, groupId: string, accountId: string): Promise<void>;
  /**
   * Hệ quả "cấm khỏi nhóm" của báo cáo đúng (add-reports): quyền đã kiểm lúc quyết, ở đây chỉ áp. Nhóm không còn cho
   * điều hành, người đó là chủ nhóm hay đã bị cấm thì thôi — bên nghe chạy lại vô hại.
   */
  banFromReport(input: {
    groupId: string;
    accountId: string;
    by: string;
    byMaster: boolean;
  }): Promise<void>;
  unban(actor: Actor, groupId: string, accountId: string): Promise<void>;
  listJoinRequests(actor: Actor, groupId: string, page: PageQuery): Promise<Page<JoinRequestDto>>;
  decideJoinRequest(actor: Actor, requestId: string, approve: boolean): Promise<JoinRequestDto>;
  invite(actor: Actor, groupId: string, email: string, unitId: string | undefined): Promise<void>;
  /** Lời mời đang chờ — điều hành viên đơn vị chỉ thấy lời mời vào đơn vị mình. */
  listInvitations(
    actor: Actor,
    groupId: string,
    page: PageQuery,
  ): Promise<Page<PendingInvitationDto>>;
  revokeInvitation(actor: Actor, groupId: string, invitationId: string): Promise<void>;
  /** Người đang bị cấm — quyền như gỡ cấm. */
  listBans(actor: Actor, groupId: string, page: PageQuery): Promise<Page<BannedMemberDto>>;
  addRoster(
    actor: Actor,
    groupId: string,
    entries: { email: string; unitId?: string | undefined }[],
  ): Promise<{ added: number }>;
  removeRosterEntry(actor: Actor, groupId: string, email: string): Promise<void>;
  postAnnouncement(
    actor: Actor,
    groupId: string,
    input: { body: string; unitId?: string | undefined },
  ): Promise<AnnouncementDto>;
  listAnnouncements(actor: Actor, groupId: string, page: PageQuery): Promise<Page<AnnouncementDto>>;
}

const alreadyMember = (): ConflictError =>
  new ConflictError('Bạn đã là thành viên của nhóm này', 'ALREADY_MEMBER');
const banned = (): ForbiddenError =>
  new ForbiddenError('Bạn không vào được nhóm này', 'GROUP_BANNED');

/** Lỗi chung của mọi đường thêm thành viên, sau khi transaction kiểm lại điều kiện. */
function memberFailure(failure: AddMemberFailure): Error {
  switch (failure) {
    case 'state':
      return groupStateConflict('Nhóm chưa nhận thành viên lúc này');
    case 'banned':
      return banned();
    case 'member':
      return alreadyMember();
    case 'gone':
      return new ConflictError('Lời mời hay đơn này không còn hiệu lực', 'CONFLICT');
  }
}

/**
 * Mặt thành viên của `group`: tìm, xem, vào, rời nhóm; và việc hằng ngày của quản trị nhóm — duyệt đơn, mời, danh
 * sách lớp, gỡ, cấm, xếp đơn vị, thông báo của nhóm (TK 10, TK 24).
 */
const toRequestDto = (request: GroupJoinRequest, displayName: string): JoinRequestDto => ({
  id: request.id,
  groupId: request.groupId,
  accountId: request.accountId,
  displayName,
  status: request.status,
  createdAt: request.createdAt.toISOString(),
  expiresAt: request.expiresAt.toISOString(),
});

/** Điều hành viên đơn vị con chỉ làm việc trong đơn vị mình: phạm vi gửi lên phải trùng phạm vi được giao. */
const scopedUnit = (ctx: GroupContext, unitId: string | undefined): string | null => {
  const scope =
    ctx.isMaster || isOwner(ctx) || isWholeModerator(ctx)
      ? null
      : (ctx.member?.moderatorUnitId ?? null);
  if (scope === null) return unitId ?? null;
  if (unitId && unitId !== scope) throw forbidden('Bạn chỉ làm việc trong đơn vị mình phụ trách');
  return scope;
};

const notMaster = (actor: Actor): void => {
  if (actor.role === 'master') {
    throw new ForbiddenError('Tài khoản master không vào nhóm — dùng tài khoản cá nhân');
  }
};

export function createGroupMembershipService(
  shared: GroupShared,
  reevaluateOwnerless: (groupId: string, exclude?: string) => Promise<void>,
): GroupMembershipService {
  const {
    repository,
    identity,
    config,
    clock,
    context,
    loadGroup,
    requireManager,
    requireCanManageMember,
    requireState,
    masterAudit,
    daysFrom,
    toSummary,
    toProfile,
    toMembership,
    toMember,
    displayNames,
  } = shared;

  const summariesOf = async (groups: Group[]): Promise<GroupSummaryDto[]> => {
    const counts = await repository.countMembers(groups.map((group) => group.id));
    return groups.map((group) => toSummary(group, counts.get(group.id) ?? 0));
  };

  const myGroupOf = async (group: Group, member: GroupMember): Promise<MyGroupDto> => {
    const [summary] = await summariesOf([group]);
    if (!summary) throw new Error('Không dựng được tóm tắt nhóm');
    return { ...summary, membership: toMembership(member, group) };
  };

  /** Người nhận được lời mời: tài khoản chưa xoá mang email đó, không phải master, không phải người mời, chưa ở nhóm. */
  const inviteeOf = async (
    actor: Actor,
    groupId: string,
    email: string,
  ): Promise<string | null> => {
    const accountId = await identity.accountIdByEmail(email);
    if (!accountId || accountId === actor.accountId) return null;
    const summary = (await identity.accountSummaries([accountId])).get(accountId);
    if (!summary || summary.role === 'master') return null;
    return (await repository.findMember(groupId, accountId)) ? null : accountId;
  };

  const requireUnitOf = async (groupId: string, unitId: string): Promise<void> => {
    if (!(await repository.findUnit(groupId, unitId))) {
      throw new NotFoundError('Không có đơn vị này trong nhóm');
    }
  };

  return {
    // ── NGƯỜI DÙNG ──────────────────────────────────────────────────────────────────────────────

    async search(q, { skip, take }) {
      const { items, total } = await repository.searchPublic({
        folded: q ? fold(q) : '',
        skip,
        take,
      });
      return { items: await summariesOf(items), total };
    },

    async view(actor, groupId) {
      const group = await repository.findGroup(groupId);
      const isMaster = actor?.role === 'master';
      if (!group || (group.state === 'closed' && !isMaster))
        throw new NotFoundError('Không có nhóm này');
      const member =
        actor && !isMaster ? await repository.findMember(groupId, actor.accountId) : null;
      if (group.state === 'pending_owner' && !isMaster) {
        const offer = actor ? await repository.findPendingOffer(groupId) : null;
        if (offer?.toAccountId !== actor?.accountId) throw new NotFoundError('Không có nhóm này');
      }
      // Thành viên không thể còn đơn chờ (duyệt là vào), master không vào nhóm: chỉ người ngoài đã đăng nhập mới hỏi.
      const pending =
        actor && !isMaster && !member
          ? await repository.findPendingRequest(groupId, actor.accountId, clock())
          : null;
      const joinRequest = pending && {
        id: pending.id,
        createdAt: pending.createdAt.toISOString(),
        expiresAt: pending.expiresAt.toISOString(),
      };
      // Người ngoài nhóm riêng tư — kể cả khi bấm vào huy hiệu trên tin sàn — chỉ thấy tên nhóm (spec badges).
      if (!isPublicMode(group.mode) && !member && !isMaster) {
        return { visibility: 'name_only', id: group.id, name: group.name, joinRequest };
      }
      const [counts, units] = await Promise.all([
        repository.countMembers([groupId]),
        repository.listUnits(groupId),
      ]);
      return {
        ...toProfile({ group, member, isMaster }, counts.get(groupId) ?? 0, units),
        joinRequest,
      };
    },

    async lookupCode(actor, code) {
      notMaster(actor);
      const group = await repository.findGroupByCode(normalizeGroupCode(code));
      if (!group || group.mode !== 'private_code')
        throw new NotFoundError('Không có nhóm nào mang mã này');
      const [summary] = await summariesOf([group]);
      if (!summary) throw new NotFoundError('Không có nhóm nào mang mã này');
      return summary;
    },

    async join(actor, groupId, code) {
      notMaster(actor);
      const group = await loadGroup(groupId);
      const now = clock();
      const codeMatches =
        group.code !== null && code !== undefined && normalizeGroupCode(code) === group.code;
      const invitation = await repository.findLiveInvitation(groupId, actor.accountId, now);
      const emailHash = await identity.accountEmailHash(actor.accountId);
      const roster = emailHash ? await repository.findRosterUnit(groupId, emailHash) : null;
      // Nhóm có mã mà không có mã đúng, lời mời hay tên trong danh sách lớp: trả như không có nhóm, để nhóm riêng
      // tư không lộ ra cho người chỉ đoán được mã nhóm.
      if (group.mode === 'private_code' && !codeMatches && !invitation && !roster) {
        throw new NotFoundError('Không có nhóm nào mang mã này');
      }
      if (!ACCEPTS_MEMBERS.has(group.state))
        throw groupStateConflict('Nhóm chưa nhận thành viên lúc này');
      if (await repository.findMember(groupId, actor.accountId)) throw alreadyMember();
      if (await repository.isBanned(groupId, actor.accountId)) throw banned();
      const outcome = decideJoin({
        mode: group.mode,
        invitation: invitation ? { id: invitation.id, unitId: invitation.unitId } : null,
        roster,
        codeMatches,
      });

      if (outcome.kind === 'error') {
        throw outcome.code === 'NOT_FOUND'
          ? new NotFoundError('Không có nhóm nào mang mã này')
          : new ForbiddenError('Nhóm này chỉ vào được bằng lời mời', 'INVITATION_REQUIRED');
      }
      if (outcome.kind === 'member') {
        const result = outcome.invitationId
          ? await repository.acceptInvitation({
              invitationId: outcome.invitationId,
              accountId: actor.accountId,
              at: now,
            })
          : await repository.joinDirect({
              groupId,
              accountId: actor.accountId,
              via: outcome.via,
              unitId: outcome.unitId,
              at: now,
            });
        if (typeof result === 'string') throw memberFailure(result);
        return { result: 'member', membership: toMembership(result, group) };
      }

      const block = joinRequestBlock({
        lastRejectedAt: await repository.lastRejectedAt(groupId, actor.accountId),
        pendingCount: await repository.countPendingRequestsOf(actor.accountId, now),
        now,
        reapplyWaitDays: config.get('group.reapplyWaitDays'),
        maxPending: config.get('group.maxPendingApplications'),
      });
      if (block?.code === 'JOIN_REQUEST_TOO_SOON') {
        throw new TooManyRequestsError(
          `Bạn gửi lại đơn được từ ${formatTimeVN(block.retryAt)} ngày ${formatDateVN(block.retryAt)}`,
          'JOIN_REQUEST_TOO_SOON',
        );
      }
      const limit = (): ConflictError =>
        new ConflictError(
          `Bạn đang có ${config.get('group.maxPendingApplications')} đơn chờ duyệt — chờ bớt một đơn rồi gửi tiếp`,
          'JOIN_REQUEST_LIMIT',
        );
      if (block?.code === 'JOIN_REQUEST_LIMIT') throw limit();
      const request = await repository.createJoinRequest({
        groupId,
        accountId: actor.accountId,
        at: now,
        expiresAt: daysFrom(now, config.get('group.applicationExpiresDays')),
        maxPending: config.get('group.maxPendingApplications'),
      });
      if (request === 'limit') throw limit();
      if (request === 'duplicate') throw new ConflictError('Bạn đã có một đơn đang chờ ở nhóm này');
      if (typeof request === 'string') throw memberFailure(request);
      const names = await displayNames([actor.accountId]);
      return {
        result: 'request',
        request: toRequestDto(request, names.get(actor.accountId) ?? ''),
      };
    },

    async withdrawRequest(actor, groupId) {
      const pending = await repository.findPendingRequest(groupId, actor.accountId, clock());
      const withdrawn =
        pending &&
        (await repository.withdrawJoinRequest({
          requestId: pending.id,
          accountId: actor.accountId,
          at: clock(),
        }));
      if (!withdrawn) throw new NotFoundError('Bạn không có đơn nào đang chờ ở nhóm này');
    },

    async leave(actor, groupId) {
      const group = await loadGroup(groupId);
      const member = await repository.findMember(groupId, actor.accountId);
      if (!member || group.state === 'closed') throw new NotFoundError('Bạn không ở nhóm này');
      if (member.role === 'owner') {
        throw new ConflictError(
          'Chủ nhóm phải chuyển quyền chủ nhóm cho người khác rồi mới rời được',
          'GROUP_OWNER_MUST_TRANSFER',
        );
      }
      await repository.removeMember({
        groupId,
        accountId: actor.accountId,
        reason: 'left',
        by: actor.accountId,
        at: clock(),
      });
      if (member.role === 'moderator' && group.state === 'ownerless') {
        await reevaluateOwnerless(groupId);
      }
    },

    async myGroups(actor) {
      const memberships = await repository.myMemberships(actor.accountId);
      const summaries = await summariesOf(memberships.map((row) => row.group));
      return memberships.map((row, index) => {
        const summary = summaries[index];
        if (!summary) throw new Error('Thiếu tóm tắt nhóm');
        return { ...summary, membership: toMembership(row, row.group) };
      });
    },

    async myBadges(actor) {
      const memberships = await repository.myMemberships(actor.accountId);
      return memberships
        .filter((row) => badgeEligible(row, row.group))
        .map((row) => ({ groupId: row.groupId, groupName: row.group.name }));
    },

    async myInvitations(actor) {
      const now = clock();
      const invitations = await repository.myInvitations(actor.accountId, now);
      const emailHash = await identity.accountEmailHash(actor.accountId);
      const rosterRows = emailHash ? await repository.myRosterGroups(emailHash) : [];
      const memberships = new Set(
        (await repository.myMemberships(actor.accountId)).map((row) => row.groupId),
      );
      const open = rosterRows.filter((row) => !memberships.has(row.group.id));
      const bannedFlags = await Promise.all(
        open.map((row) => repository.isBanned(row.group.id, actor.accountId)),
      );
      const rosters = open
        .filter((_row, index) => !bannedFlags[index])
        .map((row) => ({ groupId: row.group.id, groupName: row.group.name, unitId: row.unitId }));
      return {
        invitations: invitations.map((row) => ({
          id: row.id,
          groupId: row.groupId,
          groupName: row.group.name,
          unitId: row.unitId,
          expiresAt: row.expiresAt.toISOString(),
        })),
        rosters,
      };
    },

    async myOwnerOffers(actor) {
      const offers = await repository.myOwnerOffers(actor.accountId, clock());
      return offers.map((row) => ({
        id: row.id,
        groupId: row.groupId,
        groupName: row.group.name,
        kind: row.kind,
        expiresAt: row.expiresAt.toISOString(),
      }));
    },

    async acceptInvitation(actor, invitationId) {
      notMaster(actor);
      const invitation = await repository.findInvitation(invitationId);
      if (!invitation || invitation.accountId !== actor.accountId) {
        throw new NotFoundError('Không có lời mời này');
      }
      const now = clock();
      const expired =
        invitation.status === 'expired' ||
        (invitation.status === 'pending' && invitation.expiresAt <= now);
      if (expired) throw new ConflictError('Lời mời đã hết hạn', 'INVITATION_EXPIRED');
      if (invitation.status !== 'pending') throw groupStateConflict('Lời mời không còn hiệu lực');
      const result = await repository.acceptInvitation({
        invitationId,
        accountId: actor.accountId,
        at: now,
      });
      if (typeof result === 'string') {
        if (result === 'gone') {
          const latest = await repository.findInvitation(invitationId);
          if (latest?.status === 'expired')
            throw new ConflictError('Lời mời đã hết hạn', 'INVITATION_EXPIRED');
          throw groupStateConflict('Lời mời không còn hiệu lực');
        }
        throw memberFailure(result);
      }
      return myGroupOf(await loadGroup(invitation.groupId), result);
    },

    async declineInvitation(actor, invitationId) {
      const invitation = await repository.findInvitation(invitationId);
      if (!invitation || invitation.accountId !== actor.accountId) {
        throw new NotFoundError('Không có lời mời này');
      }
      const closed = await repository.closeInvitation({
        invitationId,
        status: 'declined',
        at: clock(),
      });
      if (!closed) throw groupStateConflict('Lời mời không còn hiệu lực');
    },

    // ── QUẢN TRỊ NHÓM ───────────────────────────────────────────────────────────────────────────

    async listMembers(actor, groupId, { unitId, skip, take }) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, true);
      if (ctx.group.state === 'closed') throw groupStateConflict();
      const { items, total } = await repository.listMembers(groupId, {
        ...(unitId ? { unitId } : {}),
        skip,
        take,
      });
      const names = await displayNames(items.map((row) => row.accountId));
      return { items: items.map((row) => toMember(row, names.get(row.accountId) ?? '')), total };
    },

    async setMemberUnit(actor, groupId, accountId, unitId) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, false);
      requireState(ctx.group, ALLOWS_MODERATION);
      const target = await repository.findMember(groupId, accountId);
      if (!target)
        throw new ConflictError('Người này không phải thành viên của nhóm', 'NOT_GROUP_MEMBER');
      if (!ctx.isMaster && !isOwner(ctx)) requireCanManageMember(ctx, target);
      if (unitId) await requireUnitOf(groupId, unitId);
      const member = await repository.setMemberUnit({
        groupId,
        accountId,
        unitId,
        audit: masterAudit(ctx, 'group.member.set_unit', groupId, { accountId, unitId }),
      });
      if (!member)
        throw new ConflictError('Người này không phải thành viên của nhóm', 'NOT_GROUP_MEMBER');
      const names = await displayNames([accountId]);
      return toMember(member, names.get(accountId) ?? '');
    },

    async removeMember(actor, groupId, accountId) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, true);
      requireState(ctx.group, ALLOWS_MODERATION);
      const target = await repository.findMember(groupId, accountId);
      if (!target) throw new NotFoundError('Người này không ở nhóm');
      requireCanManageMember(ctx, target);
      const result = await repository.removeMember({
        groupId,
        accountId,
        reason: 'removed',
        by: actor.accountId,
        at: clock(),
        audit: masterAudit(ctx, 'group.member.remove', groupId, { accountId }),
      });
      if (result === 'owner') throw forbidden('Không xử được chủ nhóm');
      if (target.role === 'moderator' && ctx.group.state === 'ownerless') {
        await reevaluateOwnerless(groupId);
      }
    },

    async ban(actor, groupId, accountId) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, true);
      requireState(ctx.group, ALLOWS_MODERATION);
      if (accountId === actor.accountId) throw new ConflictError('Không tự cấm mình được');
      const target = await repository.findMember(groupId, accountId);
      if (target) {
        requireCanManageMember(ctx, target);
      } else {
        // Người chưa từng vào nhóm không thuộc đơn vị nào: chỉ chủ, điều hành viên cả nhóm, master cấm được.
        requireManager(ctx, false);
        const exists = (await identity.accountSummaries([accountId])).get(accountId);
        if (!exists || exists.status === 'deleted')
          throw new NotFoundError('Không có tài khoản này');
      }
      const result = await repository.removeMember({
        groupId,
        accountId,
        reason: 'banned',
        by: actor.accountId,
        at: clock(),
        audit: masterAudit(ctx, 'group.member.ban', groupId, { accountId }),
      });
      if (result === 'owner') throw forbidden('Không xử được chủ nhóm');
      if (target?.role === 'moderator' && ctx.group.state === 'ownerless') {
        await reevaluateOwnerless(groupId);
      }
    },

    async banFromReport({ groupId, accountId, by, byMaster }) {
      const group = await repository.findGroup(groupId);
      if (!group || !ALLOWS_MODERATION.has(group.state)) return;
      if (await repository.isBanned(groupId, accountId)) return;
      const target = await repository.findMember(groupId, accountId);
      const result = await repository.removeMember({
        groupId,
        accountId,
        reason: 'banned',
        by,
        at: clock(),
        // Như `masterAudit`: nhật ký chỉ ghi khi người quyết là master.
        audit: byMaster
          ? {
              actorId: by,
              actorRole: 'master',
              action: 'group.member.ban',
              targetType: 'group',
              targetId: groupId,
              details: { accountId, cause: 'report' },
            }
          : undefined,
      });
      if (result !== 'owner' && target?.role === 'moderator' && group.state === 'ownerless') {
        await reevaluateOwnerless(groupId);
      }
    },

    async unban(actor, groupId, accountId) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, false);
      requireState(ctx.group, ALLOWS_MODERATION);
      const lifted = await repository.unban({
        groupId,
        accountId,
        audit: masterAudit(ctx, 'group.member.unban', groupId, { accountId }),
      });
      if (!lifted) throw new NotFoundError('Người này không bị cấm ở nhóm');
    },

    async listJoinRequests(actor, groupId, { skip, take }) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, false);
      if (ctx.group.state === 'closed') throw groupStateConflict();
      const { items, total } = await repository.listPendingRequests(groupId, clock(), {
        skip,
        take,
      });
      const names = await displayNames(items.map((row) => row.accountId));
      return {
        items: items.map((row) => toRequestDto(row, names.get(row.accountId) ?? '')),
        total,
      };
    },

    async decideJoinRequest(actor, requestId, approve) {
      const request = await repository.findJoinRequest(requestId);
      if (!request) throw new NotFoundError('Không có đơn này');
      const ctx = await context(actor, request.groupId);
      requireManager(ctx, false);
      requireState(ctx.group, ALLOWS_MODERATION);
      const now = clock();
      const expired =
        request.status === 'expired' || (request.status === 'pending' && request.expiresAt <= now);
      if (expired) throw new ConflictError('Đơn đã quá hạn và tự huỷ', 'JOIN_REQUEST_EXPIRED');
      if (request.status !== 'pending') throw new ConflictError('Đơn đã được xử');
      const result = await repository.decideJoinRequest({
        requestId,
        approve,
        decidedBy: actor.accountId,
        at: now,
        reapplyAt: daysFrom(now, config.get('group.reapplyWaitDays')),
        audit: masterAudit(
          ctx,
          approve ? 'group.request.approve' : 'group.request.reject',
          request.groupId,
          {
            accountId: request.accountId,
          },
        ),
      });
      if (result === 'gone') {
        const latest = await repository.findJoinRequest(requestId);
        if (latest?.status === 'expired') {
          throw new ConflictError('Đơn đã quá hạn và tự huỷ', 'JOIN_REQUEST_EXPIRED');
        }
        throw new ConflictError('Đơn đã được xử');
      }
      if (typeof result === 'string') throw memberFailure(result);
      const names = await displayNames([request.accountId]);
      return toRequestDto(result, names.get(request.accountId) ?? '');
    },

    async invite(actor, groupId, email, unitId) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, true);
      requireState(ctx.group, ALLOWS_MODERATION);
      const unit = scopedUnit(ctx, unitId);
      if (unit) await requireUnitOf(groupId, unit);
      // Lời mời "mù" (fix-audit-group): mời email nào cũng một dòng như nhau, chỉ dòng có người nhận được mới nhận lời
      // được — trả lời và danh sách lời mời giống hệt dù email có tài khoản, đã ở nhóm hay không (TK 10).
      const accountId = await inviteeOf(actor, groupId, email);
      const now = clock();
      await repository.createInvitation({
        groupId,
        accountId,
        emailHash: identity.emailHashOf(email),
        emailHint: identity.emailHintOf(email),
        unitId: unit,
        invitedBy: actor.accountId,
        at: now,
        expiresAt: daysFrom(now, config.get('group.inviteExpiresDays')),
        audit: masterAudit(ctx, 'group.invitation.create', groupId, accountId ? { accountId } : {}),
      });
    },

    async listInvitations(actor, groupId, { skip, take }) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, true);
      const { items, total } = await repository.listGroupInvitations(groupId, clock(), {
        unitId: scopedUnit(ctx, undefined),
        skip,
        take,
      });
      return {
        items: items.map((row) => ({
          id: row.id,
          emailHint: row.emailHint,
          unitId: row.unitId,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        })),
        total,
      };
    },

    async listBans(actor, groupId, { skip, take }) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, false);
      const { items, total } = await repository.listBans(groupId, { skip, take });
      const names = await displayNames(items.map((row) => row.accountId));
      return {
        items: items.map((row) => ({
          accountId: row.accountId,
          displayName: names.get(row.accountId) ?? '',
          bannedAt: row.bannedAt.toISOString(),
          bannedBy: row.bannedBy,
        })),
        total,
      };
    },

    async revokeInvitation(actor, groupId, invitationId) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, true);
      const invitation = await repository.findInvitation(invitationId);
      if (!invitation || invitation.groupId !== groupId)
        throw new NotFoundError('Không có lời mời này');
      if (invitation.unitId !== scopedUnit(ctx, invitation.unitId ?? undefined)) {
        throw forbidden('Bạn chỉ làm việc trong đơn vị mình phụ trách');
      }
      const closed = await repository.closeInvitation({
        invitationId,
        status: 'revoked',
        at: clock(),
        audit: masterAudit(ctx, 'group.invitation.revoke', groupId, { invitationId }),
      });
      if (!closed) throw new NotFoundError('Không có lời mời nào đang chờ');
    },

    async addRoster(actor, groupId, entries) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, false);
      requireState(ctx.group, ALLOWS_MODERATION);
      const unitIds = new Set(entries.flatMap((entry) => (entry.unitId ? [entry.unitId] : [])));
      await Promise.all([...unitIds].map((unitId) => requireUnitOf(groupId, unitId)));
      const hashed = entries.map((entry) => ({
        emailHash: identity.emailHashOf(entry.email),
        unitId: entry.unitId ?? null,
      }));
      const accountIdsByHash = await identity.accountIdsByEmailHashes(
        hashed.map((row) => row.emailHash),
      );
      // Người đã ở nhóm hay đã bị cấm không cần lời "có tên trong danh sách" — bỏ khỏi bảng khớp, vẫn lưu dòng.
      const settled = await Promise.all(
        [...accountIdsByHash].map(async ([hash, accountId]) => ({
          hash,
          skip:
            (await repository.findMember(groupId, accountId)) !== null ||
            (await repository.isBanned(groupId, accountId)),
        })),
      );
      for (const { hash, skip } of settled) if (skip) accountIdsByHash.delete(hash);
      const added = await repository.addRosterEntries({
        groupId,
        entries: hashed,
        addedBy: actor.accountId,
        at: clock(),
        accountIdsByHash,
        audit: masterAudit(ctx, 'group.roster.add', groupId, { count: entries.length }),
      });
      return { added: added.length };
    },

    async removeRosterEntry(actor, groupId, email) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, false);
      requireState(ctx.group, ALLOWS_MODERATION);
      const removed = await repository.removeRosterEntry(
        groupId,
        identity.emailHashOf(email),
        masterAudit(ctx, 'group.roster.remove', groupId),
      );
      if (!removed) throw new NotFoundError('Email này không có trong danh sách lớp');
    },

    async postAnnouncement(actor, groupId, { body, unitId }) {
      const ctx = await context(actor, groupId);
      requireManager(ctx, true);
      requireState(ctx.group, ALLOWS_MODERATION);
      if ([...body].length > config.get('group.announcementMaxLength')) {
        throw new BadRequestError(
          `Thông báo dài tối đa ${config.get('group.announcementMaxLength')} ký tự`,
          'VALIDATION_ERROR',
        );
      }
      const unit = scopedUnit(ctx, unitId);
      if (unit) await requireUnitOf(groupId, unit);
      const now = clock();
      const announcement = await repository.createAnnouncement({
        groupId,
        authorId: actor.accountId,
        unitId: unit,
        body,
        at: now,
        since: startOfDayVN(now),
        maxPerDay: config.get('group.announcementsPerDay'),
      });
      if (announcement === 'state') throw groupStateConflict();
      if (announcement === 'limit') {
        throw new TooManyRequestsError(
          `Mỗi nhóm gửi tối đa ${config.get('group.announcementsPerDay')} thông báo mỗi ngày`,
          'ANNOUNCEMENT_LIMIT',
        );
      }
      return {
        id: announcement.id,
        groupId,
        unitId: announcement.unitId,
        body: announcement.body,
        createdAt: announcement.createdAt.toISOString(),
      };
    },

    async listAnnouncements(actor, groupId, { skip, take }) {
      const ctx = await context(actor, groupId);
      if (!ctx.isMaster && !ctx.member)
        throw forbidden('Chỉ thành viên xem được thông báo của nhóm');
      const seesAll = ctx.isMaster || isOwner(ctx) || isWholeModerator(ctx);
      const unit = ctx.member?.moderatorUnitId ?? ctx.member?.unitId ?? null;
      const { items, total } = await repository.listAnnouncements(groupId, {
        unitId: seesAll ? 'all' : unit,
        skip,
        take,
      });
      return {
        items: items.map((row) => ({
          id: row.id,
          groupId,
          unitId: row.unitId,
          body: row.body,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
      };
    },
  };
}
