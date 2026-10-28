import type { Group, GroupMember, GroupState, GroupUnit, Prisma } from '@prisma/client';

import type { AuditAction, AuditDetails, AuditEntry } from '../../common/audit/audit.js';
import type { Actor } from '../../common/auth/actor.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import type { AccountSummary } from '../identity/identity.service.js';
import { badgeEligible } from './calc/badges.calc.js';
import { type ModeratorCandidate, pickNominee, roleIneligibility } from './calc/membership.calc.js';
import type { GroupRepository } from './group.repository.js';
import type { GroupProfileDto, GroupSummaryDto, MemberDto, MembershipDto } from './group.schema.js';

export const DAY_MS = 86_400_000;

const ACTIVE: ReadonlySet<GroupState> = new Set(['active']);

/** `identity` trả lời "người này là ai" (TK 30) — `group` không đọc bảng `accounts`. */
export interface GroupIdentityPort {
  accountSummaries(ids: string[]): Promise<Map<string, AccountSummary>>;
  accountIdByEmail(email: string): Promise<string | null>;
  emailHashOf(email: string): string;
  emailHintOf(email: string): string;
  accountIdsByEmailHashes(hashes: string[]): Promise<Map<string, string>>;
  accountEmailHash(accountId: string): Promise<string | null>;
}

/**
 * `listing` đếm tin mức "nhóm công khai" để biết nhóm phải qua trạng thái chuyển sang riêng tư không. Nhận `tx` của
 * lượt đổi chế độ: đếm phải nằm trong cùng transaction đã khoá dòng nhóm (cam kết 22).
 */
export interface PublicListingCounter {
  countInGroup(tx: Prisma.TransactionClient, groupId: string): Promise<number>;
}

/** Mức tin cậy của `trust` — nhận vai chủ nhóm / điều hành viên cần T1 trở lên (TK 5, spec group-roles). */
export interface GroupTrustPort {
  tierOf(accountId: string): Promise<'T0' | 'T1' | 'T2' | 'T3'>;
  /** Gậy nặng đang hiệu lực làm tạm mất vai chủ nhóm / điều hành viên (spec group-roles, add-strikes). */
  hasSevereStrike(accountId: string): Promise<boolean>;
}

export interface GroupServiceDeps {
  repository: GroupRepository;
  identity: GroupIdentityPort;
  config: RuntimeConfig;
  clock: () => Date;
  publicListings?: PublicListingCounter;
  trust?: GroupTrustPort;
}

/** Người gọi trong một nhóm: dòng thành viên (nếu có) và có phải master không — master đứng ngoài mọi luật (nguyên tắc 3). */
export interface GroupContext {
  actor: Actor;
  group: Group;
  member: GroupMember | null;
  isMaster: boolean;
  /** Có vai nhưng đang có gậy nặng: mọi thao tác của vai bị từ chối (add-strikes). */
  roleSuspended: boolean;
}

export const groupStateConflict = (
  message = 'Nhóm không ở trạng thái làm được việc này',
): ConflictError => new ConflictError(message, 'GROUP_STATE_CONFLICT');

export const forbidden = (message = 'Bạn không có quyền làm việc này trong nhóm'): ForbiddenError =>
  new ForbiddenError(message);

export const isOwner = (ctx: GroupContext): boolean =>
  ctx.member?.role === 'owner' && !ctx.roleSuspended;
export const isModerator = (ctx: GroupContext): boolean =>
  ctx.member?.role === 'moderator' && !ctx.roleSuspended;

/** Chủ nhóm, điều hành viên đang có gậy nặng: nói đúng chuyện thay vì 403 chung (spec group-roles). */
const roleSuspended = (): ForbiddenError =>
  new ForbiddenError('Bạn đang tạm mất vai trong nhóm vì có cảnh cáo nặng', 'GROUP_ROLE_SUSPENDED');
export const isWholeModerator = (ctx: GroupContext): boolean =>
  isModerator(ctx) && ctx.member?.moderatorUnitId === null;

/** Quyền riêng của chủ nhóm: cài đặt, chế độ, đơn vị, mã, vai, đóng nhóm. */
const requireOwner = (ctx: GroupContext): void => {
  if (ctx.isMaster || isOwner(ctx)) return;
  if (ctx.roleSuspended && ctx.member?.role === 'owner') throw roleSuspended();
  throw forbidden('Chỉ chủ nhóm làm được việc này');
};

/** Việc hằng ngày: chủ nhóm, điều hành viên (cả nhóm, hoặc đơn vị con khi `allowUnit`), master. */
const requireManager = (ctx: GroupContext, allowUnit: boolean): void => {
  if (ctx.isMaster || isOwner(ctx) || isWholeModerator(ctx)) return;
  if (allowUnit && isModerator(ctx)) return;
  if (ctx.roleSuspended && ctx.member && ctx.member.role !== 'member') throw roleSuspended();
  throw forbidden();
};

/**
 * Ai xử được một thành viên (gỡ, cấm, xếp đơn vị): chủ nhóm và master xử mọi người trừ chủ nhóm; điều hành viên
 * không xử điều hành viên khác hay chủ nhóm; điều hành viên đơn vị con chỉ xử thành viên đơn vị mình (chốt 11/10).
 */
const requireCanManageMember = (ctx: GroupContext, target: GroupMember | null): void => {
  if (target?.role === 'owner') throw forbidden('Không xử được chủ nhóm');
  if (ctx.isMaster || isOwner(ctx)) return;
  if (ctx.roleSuspended && ctx.member && ctx.member.role !== 'member') throw roleSuspended();
  if (!isModerator(ctx)) throw forbidden();
  if (target && target.role !== 'member')
    throw forbidden('Điều hành viên không xử điều hành viên khác');
  const scope = ctx.member?.moderatorUnitId ?? null;
  if (scope !== null && target?.unitId !== scope) {
    throw forbidden('Bạn chỉ quản lý thành viên của đơn vị mình phụ trách');
  }
};

const requireState = (group: Group, allowed: ReadonlySet<GroupState>): void => {
  if (!allowed.has(group.state)) throw groupStateConflict();
};

/** Nhật ký chỉ cho thao tác của master (TK 27 cam kết 3); chủ nhóm và điều hành viên ghi trong chính dòng dữ liệu. */
const masterAudit = (
  ctx: Pick<GroupContext, 'actor' | 'isMaster'>,
  action: AuditAction,
  groupId: string,
  details?: AuditDetails,
  reason?: string | null,
): AuditEntry | undefined =>
  ctx.isMaster
    ? {
        actorId: ctx.actor.accountId,
        actorRole: 'master',
        action,
        targetType: 'group',
        targetId: groupId,
        reason: reason ?? null,
        ...(details ? { details } : {}),
      }
    : undefined;

const daysFrom = (at: Date, days: number): Date => new Date(at.getTime() + days * DAY_MS);

const toSummary = (group: Group, memberCount: number): GroupSummaryDto => ({
  id: group.id,
  name: group.name,
  kind: group.kind,
  mode: group.mode,
  state: group.state,
  description: group.description,
  memberCount,
});

const toMembership = (member: GroupMember, group: Group): MembershipDto => ({
  role: member.role,
  unitId: member.unitId,
  moderatorUnitId: member.moderatorUnitId,
  joinedVia: member.joinedVia,
  joinedAt: member.joinedAt.toISOString(),
  badgeEligible: badgeEligible(member, group),
});

const toProfile = (
  ctx: { group: Group; member: GroupMember | null; isMaster: boolean },
  memberCount: number,
  units: GroupUnit[],
): GroupProfileDto => {
  const manager = ctx.isMaster || ctx.member?.role === 'owner' || ctx.member?.role === 'moderator';
  return {
    ...toSummary(ctx.group, memberCount),
    visibility: 'full',
    boardStyle: ctx.group.boardStyle,
    allowOutsiders: ctx.group.allowOutsiders,
    showNameOnMarketplace: ctx.group.showNameOnMarketplace,
    manualReview: ctx.group.manualReview,
    allowPromotions: ctx.group.allowPromotions,
    code: manager ? ctx.group.code : null,
    lockedReason: manager ? ctx.group.lockedReason : null,
    units: units.map((unit) => ({ id: unit.id, name: unit.name })),
    membership: ctx.member ? toMembership(ctx.member, ctx.group) : null,
  };
};

const toMember = (member: GroupMember, displayName: string): MemberDto => ({
  accountId: member.accountId,
  displayName,
  role: member.role,
  unitId: member.unitId,
  moderatorUnitId: member.moderatorUnitId,
  joinedVia: member.joinedVia,
  joinedAt: member.joinedAt.toISOString(),
});

export function createGroupShared(deps: GroupServiceDeps) {
  const { repository, identity, config, clock } = deps;

  const loadGroup = async (groupId: string): Promise<Group> => {
    const group = await repository.findGroup(groupId);
    if (!group) throw new NotFoundError('Không có nhóm này');
    return group;
  };

  const context = async (actor: Actor, groupId: string): Promise<GroupContext> => {
    const isMaster = actor.role === 'master';
    const group = await loadGroup(groupId);
    const member = isMaster ? null : await repository.findMember(groupId, actor.accountId);
    const suspended =
      member !== null &&
      member.role !== 'member' &&
      ((await deps.trust?.hasSevereStrike(actor.accountId)) ?? false);
    return { actor, group, member, isMaster, roleSuspended: suspended };
  };

  /** Tài khoản nhận được vai (chủ, điều hành viên); không có thì 404, không đủ điều kiện thì 409 kèm lý do. */
  const requireEligible = async (accountId: string): Promise<AccountSummary> => {
    const summary = (await identity.accountSummaries([accountId])).get(accountId);
    const reason = roleIneligibility(summary);
    if (!summary || summary.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
    if (reason) {
      throw new ConflictError(`Không giao vai được: ${reason}`, 'GROUP_ROLE_INELIGIBLE');
    }
    return summary;
  };

  /**
   * Mức xét đúng lúc người nhận thật sự nhận vai — bấm đồng ý lời giao chủ, được bổ nhiệm điều hành viên — không lúc
   * được giao: tụt về T0 giữa hai lúc đó thì lượt nhận bị từ chối (spec group-roles). Tụt mức sau khi đã nhận không bãi
   * vai (design add-trust-tiers câu 7), nên không chỗ nào khác hỏi mức.
   */
  const requireTrustedForRole = async (accountId: string): Promise<void> => {
    const tier = await deps.trust?.tierOf(accountId);
    if (tier === 'T0') {
      throw new ConflictError('Cần mức tin cậy T1 trở lên để nhận vai này', 'TRUST_TIER_TOO_LOW');
    }
  };

  /** Điều hành viên còn dùng được (tài khoản đang hoạt động), trừ người được loại — để đề cử và để biết nhóm còn ai giữ. */
  const usableModerators = async (
    groupId: string,
    exclude?: string,
  ): Promise<ModeratorCandidate[]> => {
    const moderators = (await repository.listModerators(groupId)).filter(
      (row) => row.accountId !== exclude,
    );
    const summaries = await identity.accountSummaries(moderators.map((row) => row.accountId));
    // Điều hành viên đang có gậy nặng tạm mất vai (add-strikes).
    const suspended = new Set(
      (
        await Promise.all(
          moderators.map(async (row) =>
            ((await deps.trust?.hasSevereStrike(row.accountId)) ?? false) ? [row.accountId] : [],
          ),
        )
      ).flat(),
    );
    return moderators
      .filter((row) => summaries.get(row.accountId)?.status === 'active')
      .filter((row) => !suspended.has(row.accountId))
      .map((row) => ({
        accountId: row.accountId,
        moderatorUnitId: row.moderatorUnitId,
        roleSince: row.roleSince ?? row.joinedAt,
        joinedAt: row.joinedAt,
      }));
  };

  /**
   * Chủ nhóm không còn dùng được (bị khoá, đã xoá): còn điều hành viên dùng được thì thiếu chủ kèm đề cử, không thì tạm
   * khoá. Chỉ nhóm đang hoạt động: nhóm đang chuyển sang riêng tư chuyển xong rồi mới thiếu chủ — `completePrivatization`
   * gọi lại (rà soát L4, change fix-audit-group-low); nhóm đã thiếu chủ hay đã khoá thì không đổi gì.
   */
  const loseOwner = async (groupId: string, ownerId: string, at: Date): Promise<void> => {
    const nominee = pickNominee(await usableModerators(groupId, ownerId));
    if (nominee) {
      await repository.markOwnerless({ groupId, nomineeId: nominee, at });
      return;
    }
    await repository.lockBySystem({ groupId, cause: 'no_moderators', expectStates: ACTIVE, at });
  };

  const displayNames = async (ids: string[]): Promise<Map<string, string>> => {
    const summaries = await identity.accountSummaries(ids);
    return new Map([...summaries].map(([id, summary]) => [id, summary.displayName]));
  };

  return {
    repository,
    identity,
    config,
    clock,
    publicListings: deps.publicListings,
    loadGroup,
    context,
    requireOwner,
    requireManager,
    requireCanManageMember,
    requireState,
    masterAudit,
    requireEligible,
    requireTrustedForRole,
    usableModerators,
    loseOwner,
    daysFrom,
    toSummary,
    toMembership,
    toProfile,
    toMember,
    displayNames,
  };
}

export type GroupShared = ReturnType<typeof createGroupShared>;
