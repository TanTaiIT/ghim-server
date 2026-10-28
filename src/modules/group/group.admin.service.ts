import {
  Prisma,
  type Group,
  type GroupMode,
  type GroupOwnerOffer,
  type GroupState,
} from '@prisma/client';

import type { Actor } from '../../common/auth/actor.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { fold } from '../../common/text/fold.js';
import {
  ASSIGNABLE,
  allowsSettings,
  closable,
  isPublicMode,
  LOCKABLE,
  planModeChange,
} from './calc/group-state.calc.js';
import { generateGroupCode } from './calc/membership.calc.js';
import type { Page } from './group.repository.js';
import type { OutboxEventInput } from '../../common/outbox/outbox.js';
import { GROUP_EVENTS, groupEvent } from './group.outbox.js';
import type {
  CreateGroupInput,
  GroupProfileDto,
  GroupSettingsInput,
  GroupSummaryDto,
  MemberDto,
  MyGroupDto,
  OwnerOfferDto,
  UnitDto,
} from './group.schema.js';
import {
  type GroupContext,
  type GroupShared,
  forbidden,
  groupStateConflict,
  isOwner,
} from './group.shared.js';

const ALL_BUT_CLOSED: ReadonlySet<GroupState> = new Set([
  'pending_owner',
  'active',
  'going_private',
  'ownerless',
  'locked',
]);
const OWNER_CLOSABLE: ReadonlySet<GroupState> = new Set(['active', 'locked', 'going_private']);
const UNIT_KINDS: ReadonlySet<Group['kind']> = new Set(['school', 'company']);
const CODE_ATTEMPTS = 5;

const isCodeCollision = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Mã nhóm ngẫu nhiên có thể trùng nhóm khác — thử lại với mã mới, như mã tra cứu của `identity`. */
async function withFreshCode<T>(
  length: number,
  write: (code: string) => Promise<T>,
  attempt = 1,
): Promise<T> {
  try {
    return await write(generateGroupCode(length));
  } catch (error) {
    if (attempt >= CODE_ATTEMPTS || !isCodeCollision(error)) throw error;
    return withFreshCode(length, write, attempt + 1);
  }
}

export interface GroupAdminService {
  create(actor: Actor, input: CreateGroupInput): Promise<GroupSummaryDto>;
  listForOps(query: {
    state?: GroupState;
    skip: number;
    take: number;
  }): Promise<Page<GroupSummaryDto>>;
  getForOps(groupId: string): Promise<
    GroupProfileDto & {
      ownerId: string | null;
      nomineeId: string | null;
      ownerlessSince: string | null;
    }
  >;
  offerOwner(actor: Actor, groupId: string, accountId: string): Promise<OwnerOfferDto>;
  transferOwnership(actor: Actor, groupId: string, accountId: string): Promise<OwnerOfferDto>;
  cancelOwnerOffer(actor: Actor, groupId: string): Promise<void>;
  acceptOwnerOffer(actor: Actor, offerId: string): Promise<MyGroupDto>;
  declineOwnerOffer(actor: Actor, offerId: string): Promise<void>;
  lock(actor: Actor, groupId: string, reason: string): Promise<void>;
  unlock(actor: Actor, groupId: string): Promise<void>;
  close(actor: Actor, groupId: string): Promise<void>;
  /**
   * Đợt 2: `listing` gọi khi mọi tin "nhóm công khai" của nhóm đang chuyển đã hạ xong — nhóm mới thật sự thành
   * riêng tư (TK 9, cam kết 22). Đợt 1 chưa có tin nên nhóm thành riêng tư ngay, không qua bước này.
   */
  completePrivatization(groupId: string): Promise<void>;
  updateSettings(
    actor: Actor,
    groupId: string,
    input: GroupSettingsInput,
  ): Promise<GroupProfileDto>;
  rotateCode(actor: Actor, groupId: string): Promise<{ code: string }>;
  createUnit(actor: Actor, groupId: string, name: string): Promise<UnitDto>;
  renameUnit(actor: Actor, groupId: string, unitId: string, name: string): Promise<UnitDto>;
  deleteUnit(actor: Actor, groupId: string, unitId: string): Promise<void>;
  setModerator(
    actor: Actor,
    groupId: string,
    accountId: string,
    unitId: string | null,
  ): Promise<MemberDto>;
  dismissModerator(actor: Actor, groupId: string, accountId: string): Promise<void>;
}

/**
 * Mặt quản trị của `group`: master lập, giao chủ, khoá; chủ nhóm (và master) chuyển chủ, đổi chế độ và cài đặt, đơn
 * vị, điều hành viên, đóng nhóm. Lúc thiếu chủ quyền riêng của chủ nhóm không chuyển sang ai trong nhóm — master thì
 * vẫn làm được (TK 10, chốt 11/10/2026).
 */
const toOfferDto = (offer: GroupOwnerOffer, group: Group): OwnerOfferDto => ({
  id: offer.id,
  groupId: group.id,
  groupName: group.name,
  kind: offer.kind,
  expiresAt: offer.expiresAt.toISOString(),
});

/** Lời giao không nhận được nữa: nói đúng lý do — hết hạn, đã bị huỷ hay đã trả lời. */
const offerGone = (offer: GroupOwnerOffer, now: Date): ConflictError =>
  offer.status === 'pending' && offer.expiresAt <= now
    ? new ConflictError('Lời giao chủ nhóm đã hết hạn', 'INVITATION_EXPIRED')
    : offer.status === 'expired'
      ? new ConflictError('Lời giao chủ nhóm đã hết hạn', 'INVITATION_EXPIRED')
      : groupStateConflict('Lời giao chủ nhóm không còn hiệu lực');

export function createGroupAdminService(
  shared: GroupShared,
  reevaluateOwnerless: (groupId: string, exclude?: string) => Promise<void>,
): GroupAdminService {
  const {
    repository,
    config,
    clock,
    context,
    loadGroup,
    requireOwner,
    requireEligible,
    requireTrustedForRole,
    masterAudit,
    daysFrom,
    toSummary,
    toProfile,
    toMembership,
    toMember,
    displayNames,
  } = shared;

  const requireSettings = (ctx: GroupContext): void => {
    requireOwner(ctx);
    if (!allowsSettings(ctx.group.state, ctx.isMaster)) throw groupStateConflict();
  };

  const profile = async (ctx: GroupContext, group: Group): Promise<GroupProfileDto> => {
    const [counts, units] = await Promise.all([
      repository.countMembers([group.id]),
      repository.listUnits(group.id),
    ]);
    return toProfile({ ...ctx, group }, counts.get(group.id) ?? 0, units);
  };

  const offerExpiry = (at: Date) => daysFrom(at, config.get('group.ownershipTransferExpiresDays'));

  const unitOf = async (groupId: string, unitId: string) => {
    const unit = await repository.findUnit(groupId, unitId);
    if (!unit) throw new NotFoundError('Không có đơn vị này trong nhóm');
    return unit;
  };

  const offerOwner = async (
    actor: Actor,
    groupId: string,
    accountId: string,
  ): Promise<OwnerOfferDto> => {
    const ctx = await context(actor, groupId);
    if (!ASSIGNABLE.has(ctx.group.state)) throw groupStateConflict();
    await requireEligible(accountId);
    const owner = await repository.findOwner(groupId);
    if (owner?.accountId === accountId && ctx.group.state === 'active') {
      throw new ConflictError('Người này đang là chủ nhóm');
    }
    const at = clock();
    // Master giao đè: lời giao (hay lời chuyển nhượng) đang chờ nhường chỗ cho lời của master (nguyên tắc 3).
    const pending = await repository.findPendingOffer(groupId);
    if (pending) await repository.closeOwnerOffer({ offerId: pending.id, status: 'cancelled', at });
    const offer = await repository.createOwnerOffer({
      groupId,
      kind: 'assignment',
      fromAccountId: null,
      toAccountId: accountId,
      at,
      expiresAt: offerExpiry(at),
      audit: masterAudit(ctx, 'group.owner.offer', groupId, { toAccountId: accountId }),
    });
    if (offer === 'duplicate') throw new ConflictError('Nhóm đang có một lời giao chủ chờ trả lời');
    return toOfferDto(offer, ctx.group);
  };

  return {
    // ── MASTER: LẬP, GIAO CHỦ, KHOÁ ─────────────────────────────────────────────────────────────

    async create(actor, { name, kind, mode, description }) {
      const at = clock();
      const write = (code: string | null) =>
        repository.createGroup({
          name,
          nameFolded: fold(name),
          description: description || null,
          kind,
          mode,
          code,
          createdBy: actor.accountId,
          at,
          audit: {
            actorId: actor.accountId,
            actorRole: 'master',
            action: 'group.group.create',
            targetType: 'group',
            targetId: '',
            details: { kind, mode },
          },
        });
      // Nhóm riêng tư · có mã phải có mã ngay lúc lập (CHECK groups_code_check).
      const group =
        mode === 'private_code'
          ? await withFreshCode(config.get('group.codeLength'), write)
          : await write(null);
      return toSummary(group, 0);
    },

    async listForOps({ state, skip, take }) {
      const { items, total } = await repository.listGroups({
        ...(state ? { states: [state] } : {}),
        skip,
        take,
      });
      const counts = await repository.countMembers(items.map((group) => group.id));
      return { items: items.map((group) => toSummary(group, counts.get(group.id) ?? 0)), total };
    },

    async getForOps(groupId) {
      const group = await loadGroup(groupId);
      const owner = await repository.findOwner(groupId);
      const [counts, units] = await Promise.all([
        repository.countMembers([groupId]),
        repository.listUnits(groupId),
      ]);
      return {
        ...toProfile({ group, member: null, isMaster: true }, counts.get(groupId) ?? 0, units),
        ownerId: owner?.accountId ?? null,
        nomineeId: group.nomineeId,
        ownerlessSince: group.ownerlessSince?.toISOString() ?? null,
      };
    },

    offerOwner,

    async transferOwnership(actor, groupId, accountId) {
      const ctx = await context(actor, groupId);
      if (ctx.isMaster) return offerOwner(actor, groupId, accountId);
      if (!isOwner(ctx)) throw forbidden('Chỉ chủ nhóm chuyển được quyền chủ nhóm');
      if (ctx.group.state !== 'active') throw groupStateConflict();
      if (accountId === actor.accountId) throw new ConflictError('Bạn đang là chủ nhóm');
      const target = await repository.findMember(groupId, accountId);
      if (!target)
        throw new ConflictError('Người nhận phải là thành viên của nhóm', 'NOT_GROUP_MEMBER');
      await requireEligible(accountId);
      const at = clock();
      const offer = await repository.createOwnerOffer({
        groupId,
        kind: 'transfer',
        fromAccountId: actor.accountId,
        toAccountId: accountId,
        at,
        expiresAt: offerExpiry(at),
      });
      if (offer === 'duplicate') {
        throw new ConflictError('Đang có một lời chuyển chủ chờ trả lời — huỷ lời cũ trước');
      }
      return toOfferDto(offer, ctx.group);
    },

    async cancelOwnerOffer(actor, groupId) {
      const ctx = await context(actor, groupId);
      requireOwner(ctx);
      const pending = await repository.findPendingOffer(groupId);
      // Chủ nhóm chỉ huỷ lời chuyển của chính mình; lời giao của master chỉ master huỷ.
      if (!pending || (!ctx.isMaster && pending.kind !== 'transfer')) {
        throw new NotFoundError('Không có lời chuyển chủ nào đang chờ');
      }
      await repository.closeOwnerOffer({
        offerId: pending.id,
        status: 'cancelled',
        at: clock(),
        audit: masterAudit(ctx, 'group.owner.cancel_offer', groupId),
      });
    },

    async acceptOwnerOffer(actor, offerId) {
      const offer = await repository.findOwnerOffer(offerId);
      if (!offer || offer.toAccountId !== actor.accountId) {
        throw new NotFoundError('Không có lời giao chủ nhóm này');
      }
      const now = clock();
      if (offer.status !== 'pending' || offer.expiresAt <= now) throw offerGone(offer, now);
      await requireEligible(actor.accountId);
      await requireTrustedForRole(actor.accountId);
      const result = await repository.acceptOwnerOffer({
        offerId,
        accountId: actor.accountId,
        at: now,
      });
      if (result === 'state') throw groupStateConflict();
      if (result === 'not_member') {
        throw new ConflictError('Bạn không còn là thành viên của nhóm', 'NOT_GROUP_MEMBER');
      }
      if (result === 'gone') {
        throw offerGone((await repository.findOwnerOffer(offerId)) ?? offer, now);
      }
      const member = await repository.findMember(result.group.id, actor.accountId);
      if (!member) throw new Error('Nhận lời giao chủ xong mà không có dòng thành viên');
      const counts = await repository.countMembers([result.group.id]);
      return {
        ...toSummary(result.group, counts.get(result.group.id) ?? 0),
        membership: toMembership(member, result.group),
      };
    },

    async declineOwnerOffer(actor, offerId) {
      const offer = await repository.findOwnerOffer(offerId);
      if (!offer || offer.toAccountId !== actor.accountId) {
        throw new NotFoundError('Không có lời giao chủ nhóm này');
      }
      const closed = await repository.closeOwnerOffer({ offerId, status: 'declined', at: clock() });
      if (!closed) throw offerGone(offer, clock());
    },

    async lock(actor, groupId, reason) {
      const ctx = await context(actor, groupId);
      const at = clock();
      const result = await repository.updateGroup({
        id: groupId,
        expectStates: LOCKABLE,
        data: {
          state: 'locked',
          lockCause: 'master',
          lockedAt: at,
          lockedReason: reason,
          lockedBy: actor.accountId,
          targetMode: null,
        },
        events: [groupEvent(GROUP_EVENTS.locked, { groupId, cause: 'master', reason })],
        audit: masterAudit(ctx, 'group.group.lock', groupId, undefined, reason),
      });
      if (!result) throw groupStateConflict();
    },

    async unlock(actor, groupId) {
      const ctx = await context(actor, groupId);
      if (ctx.group.state !== 'locked')
        throw groupStateConflict('Nhóm không ở trạng thái tạm khoá');
      const owner = await repository.findOwner(groupId);
      const ownerState = owner
        ? (await shared.identity.accountSummaries([owner.accountId])).get(owner.accountId)
        : undefined;
      if (ownerState?.status !== 'active') {
        throw new ConflictError(
          'Nhóm chưa có chủ nhóm dùng được — giao chủ cho nhóm trước khi mở khoá',
          'GROUP_OWNER_REQUIRED',
        );
      }
      const result = await repository.updateGroup({
        id: groupId,
        expectStates: new Set(['locked']),
        data: {
          state: 'active',
          lockCause: null,
          lockedAt: null,
          lockedReason: null,
          lockedBy: null,
          ownerlessSince: null,
          nomineeId: null,
        },
        events: [groupEvent(GROUP_EVENTS.unlocked, { groupId, cause: 'master' })],
        audit: masterAudit(ctx, 'group.group.unlock', groupId),
      });
      if (!result) throw groupStateConflict();
    },

    async close(actor, groupId) {
      const ctx = await context(actor, groupId);
      requireOwner(ctx);
      if (!closable(ctx.group.state, ctx.isMaster)) throw groupStateConflict();
      const group = await repository.closeGroup({
        id: groupId,
        expectStates: ctx.isMaster ? ALL_BUT_CLOSED : OWNER_CLOSABLE,
        closedBy: actor.accountId,
        at: clock(),
        audit: masterAudit(ctx, 'group.group.close', groupId),
      });
      if (!group) throw groupStateConflict();
    },

    async completePrivatization(groupId) {
      const group = await loadGroup(groupId);
      const target = group.targetMode;
      if (group.state !== 'going_private' || !target) throw groupStateConflict();
      const write = (code?: string) =>
        repository.updateGroup({
          id: groupId,
          expectStates: new Set<GroupState>(['going_private']),
          prepare: async (tx, current) => {
            // Đếm lại trong khoá: còn tin "nhóm công khai" thì chưa được thành riêng tư (cam kết 22) — bên nghe của
            // `listing` chạy lại và hạ nốt.
            if (((await shared.publicListings?.countInGroup(tx, groupId)) ?? 0) > 0) {
              throw groupStateConflict('Nhóm còn tin "nhóm công khai" chưa hạ — thử lại sau');
            }
            return {
              data: {
                state: 'active',
                mode: target,
                targetMode: null,
                allowOutsiders: false,
                showNameOnMarketplace: false,
                ...(code ? { code } : {}),
              },
              events: [
                groupEvent(GROUP_EVENTS.privatizationCompleted, { groupId, mode: target }),
                groupEvent(GROUP_EVENTS.modeChanged, {
                  groupId,
                  from: current.mode,
                  to: target,
                  actorId: null,
                }),
                groupEvent(GROUP_EVENTS.badgeRightsChanged, { groupId, accountId: null }),
              ],
            };
          },
        });
      const result =
        target === 'private_code'
          ? await withFreshCode(config.get('group.codeLength'), (code) => write(code))
          : await write();
      if (!result) throw groupStateConflict();
      // Chủ bị khoá hay xoá lúc nhóm đang chuyển: chuyển xong rồi mới thiếu chủ, yêu cầu riêng tư không bị bỏ dở (L4).
      // Đọc sau commit: lượt khoá commit sau lúc này thì bên nghe `onAccountLocked` thấy nhóm đã đang hoạt động.
      const owner = await repository.findOwner(groupId);
      if (!owner) return;
      const summary = (await shared.identity.accountSummaries([owner.accountId])).get(
        owner.accountId,
      );
      if (summary?.status !== 'active') await shared.loseOwner(groupId, owner.accountId, clock());
    },

    // ── CHỦ NHÓM: CÀI ĐẶT ───────────────────────────────────────────────────────────────────────

    async updateSettings(actor, groupId, input) {
      const ctx = await context(actor, groupId);
      requireSettings(ctx);
      const { group } = ctx;

      /**
       * Chạy sau khi dòng nhóm đã khoá `FOR UPDATE`: lượt đăng tin "nhóm công khai" giữ `FOR SHARE` tới khi commit, nên
       * lượt đếm ở đây thấy đủ — đếm trước khi khoá thì một tin chen vào sẽ nằm dưới nhóm riêng tư (cam kết 22).
       */
      const prepare = async (
        tx: Prisma.TransactionClient,
        current: { state: GroupState; mode: GroupMode },
        code?: string,
      ) => {
        const listings = input.mode
          ? ((await shared.publicListings?.countInGroup(tx, groupId)) ?? 0)
          : 0;
        const plan = input.mode ? planModeChange(current.mode, input.mode, listings > 0) : null;
        // Thiếu chủ và đang chuyển riêng tư loại trừ nhau ở mọi chỗ khác (job 30 ngày, trả chủ, nhận chủ); riêng tư hoá lại
        // đẩy tin người ngoài rời nhóm vĩnh viễn — việc đó chờ có chủ (spec group-roles, C10).
        if (plan?.kind === 'going_private' && current.state === 'ownerless') {
          throw new ConflictError(
            'Nhóm đang thiếu chủ — giao chủ xong rồi mới chuyển sang riêng tư',
            'GROUP_OWNER_REQUIRED',
          );
        }
        const finalMode = plan?.kind === 'immediate' ? plan.mode : current.mode;
        const sideChanged = plan?.kind === 'immediate' && plan.resetSideSwitches;

        if (
          input.allowOutsiders === true &&
          !isPublicMode(plan?.kind === 'going_private' ? plan.targetMode : finalMode)
        ) {
          throw new ConflictError(
            'Chỉ nhóm công khai mới nhận tin người ngoài',
            'GROUP_MODE_CONFLICT',
          );
        }
        // Đang chuyển sang riêng tư thì nhóm vẫn ở chế độ công khai tới lúc chuyển xong — xét theo chế độ hiện hành, không
        // theo đích; xét theo đích thì CHECK của bảng chặn và trả 409 chung (rà soát L6).
        if (input.showNameOnMarketplace === true && isPublicMode(finalMode)) {
          throw new ConflictError(
            'Công tắc hiện tên nhóm trên tin sàn chỉ có ở nhóm riêng tư',
            'GROUP_MODE_CONFLICT',
          );
        }

        const data: Prisma.GroupUpdateManyMutationInput = {
          ...(input.name ? { name: input.name, nameFolded: fold(input.name) } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.boardStyle ? { boardStyle: input.boardStyle } : {}),
          ...(input.allowOutsiders !== undefined ? { allowOutsiders: input.allowOutsiders } : {}),
          ...(input.showNameOnMarketplace !== undefined
            ? { showNameOnMarketplace: input.showNameOnMarketplace }
            : {}),
          ...(input.manualReview !== undefined ? { manualReview: input.manualReview } : {}),
          ...(input.allowPromotions !== undefined
            ? { allowPromotions: input.allowPromotions }
            : {}),
        };
        const events: OutboxEventInput[] = [];
        if (plan?.kind === 'immediate') {
          data.mode = plan.mode;
          if (plan.code === 'clear') data.code = null;
          if (plan.code === 'generate') {
            if (!code) throw new Error('Đổi sang nhóm có mã mà chưa sinh mã');
            data.code = code;
          }
          // Đổi phía thì công tắc của phía cũ mất nghĩa (CHECK của bảng); công tắc của phía mới mặc định tắt (TK 9).
          if (sideChanged) {
            if (isPublicMode(plan.mode)) {
              data.showNameOnMarketplace = false;
              data.allowOutsiders = input.allowOutsiders ?? false;
            } else {
              data.allowOutsiders = false;
              data.showNameOnMarketplace = input.showNameOnMarketplace ?? false;
            }
          }
          events.push(
            groupEvent(GROUP_EVENTS.modeChanged, {
              groupId,
              from: current.mode,
              to: plan.mode,
              actorId: actor.accountId,
            }),
            groupEvent(GROUP_EVENTS.badgeRightsChanged, { groupId, accountId: null }),
          );
        } else if (plan?.kind === 'going_private') {
          data.state = 'going_private';
          data.targetMode = plan.targetMode;
          data.allowOutsiders = false;
          events.push(
            groupEvent(GROUP_EVENTS.privatizationStarted, { groupId, targetMode: plan.targetMode }),
          );
        } else if (
          input.showNameOnMarketplace !== undefined &&
          input.showNameOnMarketplace !== group.showNameOnMarketplace
        ) {
          events.push(groupEvent(GROUP_EVENTS.badgeRightsChanged, { groupId, accountId: null }));
        }
        return {
          data,
          events,
          ...(plan?.kind === 'immediate' && plan.cancelPendingRequests
            ? { cancelPendingRequests: { at: clock() } }
            : {}),
        };
      };

      const write = (code?: string) =>
        repository.updateGroup({
          id: groupId,
          expectStates: ctx.isMaster
            ? new Set<GroupState>(['active', 'ownerless'])
            : new Set<GroupState>(['active']),
          prepare: (tx, current) => prepare(tx, current, code),
          audit: masterAudit(ctx, 'group.settings.update', groupId, {
            fields: Object.keys(input).join(','),
          }),
        });
      // Chỉ đích "riêng tư · có mã" mới có thể cần mã mới; có cần thật không thì chỉ biết sau khi đếm trong khoá.
      const result =
        input.mode === 'private_code'
          ? await withFreshCode(config.get('group.codeLength'), (code) => write(code))
          : await write();
      if (!result) throw groupStateConflict();
      return profile(ctx, result.group);
    },

    async rotateCode(actor, groupId) {
      const ctx = await context(actor, groupId);
      requireSettings(ctx);
      if (ctx.group.mode !== 'private_code') {
        throw new ConflictError('Chỉ nhóm riêng tư · có mã mới có mã nhóm', 'GROUP_MODE_CONFLICT');
      }
      const result = await withFreshCode(config.get('group.codeLength'), (code) =>
        repository.updateGroup({
          id: groupId,
          expectStates: new Set(['active', 'ownerless']),
          data: { code },
          events: [],
          audit: masterAudit(ctx, 'group.code.rotate', groupId),
        }),
      );
      if (!result?.group.code) throw groupStateConflict();
      return { code: result.group.code };
    },

    async createUnit(actor, groupId, name) {
      const ctx = await context(actor, groupId);
      requireSettings(ctx);
      if (!UNIT_KINDS.has(ctx.group.kind)) {
        throw new ConflictError(
          'Chỉ nhóm trường học và công ty có đơn vị con',
          'GROUP_KIND_CONFLICT',
        );
      }
      const unit = await repository.createUnit(
        groupId,
        name,
        masterAudit(ctx, 'group.unit.create', groupId, { name }),
      );
      return { id: unit.id, name: unit.name };
    },

    async renameUnit(actor, groupId, unitId, name) {
      const ctx = await context(actor, groupId);
      requireSettings(ctx);
      const unit = await repository.renameUnit(
        groupId,
        unitId,
        name,
        masterAudit(ctx, 'group.unit.rename', groupId, { unitId, name }),
      );
      if (!unit) throw new NotFoundError('Không có đơn vị này trong nhóm');
      return { id: unit.id, name: unit.name };
    },

    async deleteUnit(actor, groupId, unitId) {
      const ctx = await context(actor, groupId);
      requireSettings(ctx);
      const result = await repository.deleteUnit(
        groupId,
        unitId,
        masterAudit(ctx, 'group.unit.delete', groupId, { unitId }),
      );
      if (result === 'not_found') throw new NotFoundError('Không có đơn vị này trong nhóm');
      if (result === 'not_empty') {
        throw new ConflictError(
          'Đơn vị còn thành viên hay điều hành viên — chuyển họ sang đơn vị khác trước',
          'GROUP_UNIT_NOT_EMPTY',
        );
      }
    },

    // ── CHỦ NHÓM: ĐIỀU HÀNH VIÊN ────────────────────────────────────────────────────────────────

    async setModerator(actor, groupId, accountId, unitId) {
      const ctx = await context(actor, groupId);
      requireSettings(ctx);
      const target = await repository.findMember(groupId, accountId);
      if (!target)
        throw new ConflictError('Người này không phải thành viên của nhóm', 'NOT_GROUP_MEMBER');
      if (target.role === 'owner')
        throw new ConflictError('Chủ nhóm không nhận vai điều hành viên');
      if (unitId) await unitOf(groupId, unitId);
      await requireEligible(accountId);
      await requireTrustedForRole(accountId);
      const member = await repository.setModerator({
        groupId,
        accountId,
        moderator: { unitId },
        at: clock(),
        audit: masterAudit(ctx, 'group.moderator.set', groupId, { accountId, unitId }),
      });
      if (!member)
        throw new ConflictError('Người này không phải thành viên của nhóm', 'NOT_GROUP_MEMBER');
      const names = await displayNames([accountId]);
      return toMember(member, names.get(accountId) ?? '');
    },

    async dismissModerator(actor, groupId, accountId) {
      const ctx = await context(actor, groupId);
      requireSettings(ctx);
      const target = await repository.findMember(groupId, accountId);
      if (target?.role !== 'moderator')
        throw new NotFoundError('Người này không phải điều hành viên');
      await repository.setModerator({
        groupId,
        accountId,
        moderator: null,
        at: clock(),
        audit: masterAudit(ctx, 'group.moderator.dismiss', groupId, { accountId }),
      });
      if (ctx.group.state === 'ownerless') await reevaluateOwnerless(groupId);
    },
  };
}
