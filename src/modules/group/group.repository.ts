import type {
  Group,
  GroupAnnouncement,
  GroupBan,
  GroupInvitation,
  GroupJoinPath,
  GroupJoinRequest,
  GroupKind,
  GroupLockCause,
  GroupMember,
  GroupMode,
  GroupOwnerOffer,
  GroupOwnerOfferKind,
  GroupState,
  GroupUnit,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import { appendAudit, type AuditEntry } from '../../common/audit/audit.js';
import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';
import { ACCEPTS_MEMBERS, ALLOWS_MODERATION, SYSTEM_LOCK_CAUSES } from './calc/group-state.calc.js';
import { GROUP_EVENTS, groupEvent } from './group.outbox.js';

type Tx = Prisma.TransactionClient;
type Events = OutboxEventInput[];

export type MemberWithGroup = GroupMember & { group: Group };

/** Lý do một lượt thêm thành viên không thành — service dịch thành mã lỗi. */
export type AddMemberFailure = 'state' | 'banned' | 'member' | 'gone';

export interface Page<T> {
  items: T[];
  total: number;
}

export interface SkipTake {
  skip: number;
  take: number;
}

/** Một lượt ghi vào dòng nhóm: cột, sự kiện, có huỷ đơn đang chờ không. */
export interface GroupWrite {
  data: Prisma.GroupUpdateManyMutationInput;
  events: Events;
  cancelPendingRequests?: { at: Date };
}

/**
 * Nhóm như một lượt đăng tin thấy nó, đọc dưới khoá (design add-listings mục 10): đổi chế độ, cấm, rời nhóm phải chờ
 * lượt đăng xong, nên luật nơi đăng của `listing` chạy trên đúng ảnh chụp này.
 */
export interface GroupPostingSnapshot {
  state: GroupState;
  mode: GroupMode;
  allowOutsiders: boolean;
  member: { unitId: string | null } | null;
  banned: boolean;
}

export interface NewGroup {
  name: string;
  nameFolded: string;
  description: string | null;
  kind: GroupKind;
  mode: GroupMode;
  code: string | null;
  createdBy: string;
  at: Date;
  audit: AuditEntry;
}

export interface GroupRepository {
  // ── ĐỌC ──
  findGroup(id: string): Promise<Group | null>;
  findGroupByCode(code: string): Promise<Group | null>;
  searchPublic(query: { folded: string } & SkipTake): Promise<Page<Group>>;
  listGroups(query: { states?: GroupState[] } & SkipTake): Promise<Page<Group>>;
  countMembers(groupIds: string[]): Promise<Map<string, number>>;
  findMember(groupId: string, accountId: string): Promise<GroupMember | null>;
  listMembers(groupId: string, query: { unitId?: string } & SkipTake): Promise<Page<GroupMember>>;
  myMemberships(accountId: string): Promise<MemberWithGroup[]>;
  listModerators(groupId: string): Promise<GroupMember[]>;
  findOwner(groupId: string): Promise<GroupMember | null>;
  ownsAnyGroup(accountId: string): Promise<boolean>;
  /** Nhóm chưa đóng mà người này là chủ, hoặc là điều hành viên của một nhóm đang thiếu chủ. */
  groupsAffectedByLock(
    accountId: string,
  ): Promise<{ owned: Group[]; moderatingOwnerless: Group[] }>;
  /** Nhóm đang thiếu chủ hay khoá do hệ thống mà chủ trên giấy là người này. */
  groupsAwaitingOwner(accountId: string): Promise<Group[]>;
  /** Chủ nhóm và điều hành viên cả nhóm. */
  managerIds(groupId: string): Promise<string[]>;
  /** Thành viên theo khoá `account_id`, trang sau bắt đầu sau `after`. `unitId` = chỉ đơn vị đó. */
  memberIds(
    groupId: string,
    query: { unitId?: string; after?: string; take: number },
  ): Promise<string[]>;
  isBanned(groupId: string, accountId: string): Promise<boolean>;
  lastRejectedAt(groupId: string, accountId: string): Promise<Date | null>;
  countPendingRequestsOf(accountId: string, now: Date): Promise<number>;
  findJoinRequest(id: string): Promise<GroupJoinRequest | null>;
  findPendingRequest(
    groupId: string,
    accountId: string,
    now: Date,
  ): Promise<GroupJoinRequest | null>;
  listPendingRequests(groupId: string, now: Date, page: SkipTake): Promise<Page<GroupJoinRequest>>;
  countPendingRequests(groupId: string, now: Date): Promise<number>;
  findInvitation(id: string): Promise<GroupInvitation | null>;
  findLiveInvitation(
    groupId: string,
    accountId: string,
    now: Date,
  ): Promise<GroupInvitation | null>;
  /** Lời mời đang chờ của nhóm, mới trước; `unitId` có thì chỉ lời mời vào đơn vị đó (điều hành viên đơn vị). */
  listGroupInvitations(
    groupId: string,
    now: Date,
    query: { unitId: string | null } & SkipTake,
  ): Promise<Page<GroupInvitation>>;
  /** Người đang bị cấm khỏi nhóm, mới cấm trước. */
  listBans(groupId: string, page: SkipTake): Promise<Page<GroupBan>>;
  myInvitations(accountId: string, now: Date): Promise<(GroupInvitation & { group: Group })[]>;
  findRosterUnit(groupId: string, emailHash: string): Promise<{ unitId: string | null } | null>;
  myRosterGroups(emailHash: string): Promise<{ group: Group; unitId: string | null }[]>;
  findOwnerOffer(id: string): Promise<GroupOwnerOffer | null>;
  findPendingOffer(groupId: string): Promise<GroupOwnerOffer | null>;
  myOwnerOffers(accountId: string, now: Date): Promise<(GroupOwnerOffer & { group: Group })[]>;
  listUnits(groupId: string): Promise<GroupUnit[]>;
  findUnit(groupId: string, unitId: string): Promise<GroupUnit | null>;
  findAnnouncement(id: string): Promise<GroupAnnouncement | null>;
  listAnnouncements(
    groupId: string,
    query: { unitId: string | null | 'all' } & SkipTake,
  ): Promise<Page<GroupAnnouncement>>;

  // ── GHI: VÒNG ĐỜI, CÀI ĐẶT ──
  createGroup(data: NewGroup): Promise<Group>;
  /** Đổi có điều kiện trạng thái; `null` = nhóm không còn ở trạng thái mong đợi. */
  updateGroup(
    input: {
      id: string;
      expectStates: ReadonlySet<GroupState>;
      audit?: AuditEntry | undefined;
    } & (
      | GroupWrite
      | {
          /**
           * Quyết lượt ghi SAU khi đã khoá dòng nhóm `FOR UPDATE`: đổi chế độ phải đếm tin "nhóm công khai" trong khoá,
           * không thì một lượt đăng chen giữa lúc đếm và lúc ghi (cam kết 22).
           */
          prepare: (tx: Tx, current: { state: GroupState; mode: GroupMode }) => Promise<GroupWrite>;
        }
    ),
  ): Promise<{ group: Group; cancelledRequestAccountIds: string[] } | null>;
  closeGroup(input: {
    id: string;
    expectStates: ReadonlySet<GroupState>;
    closedBy: string;
    at: Date;
    audit?: AuditEntry | undefined;
  }): Promise<Group | null>;

  // ── GHI: THÀNH VIÊN ──
  joinDirect(input: {
    groupId: string;
    accountId: string;
    via: GroupJoinPath;
    unitId: string | null;
    at: Date;
  }): Promise<GroupMember | AddMemberFailure>;
  acceptInvitation(input: {
    invitationId: string;
    accountId: string;
    at: Date;
  }): Promise<GroupMember | AddMemberFailure>;
  createJoinRequest(input: {
    groupId: string;
    accountId: string;
    at: Date;
    expiresAt: Date;
    maxPending: number;
  }): Promise<GroupJoinRequest | 'limit' | 'duplicate' | Exclude<AddMemberFailure, 'gone'>>;
  decideJoinRequest(input: {
    requestId: string;
    approve: boolean;
    decidedBy: string;
    at: Date;
    reapplyAt: Date;
    audit?: AuditEntry | undefined;
  }): Promise<GroupJoinRequest | AddMemberFailure>;
  withdrawJoinRequest(input: { requestId: string; accountId: string; at: Date }): Promise<boolean>;
  /**
   * Lời mời "mù" (fix-audit-group): mời email nào cũng một dòng; `accountId` trống = không ai nhận được. Email đang có
   * lời mời chờ thì lời mời đó lấy đơn vị của lượt mới (giữ hạn cũ), và có người nhận nếu email đã có tài khoản.
   */
  createInvitation(input: {
    groupId: string;
    accountId: string | null;
    emailHash: string;
    emailHint: string;
    unitId: string | null;
    invitedBy: string;
    at: Date;
    expiresAt: Date;
    audit?: AuditEntry | undefined;
  }): Promise<GroupInvitation>;
  closeInvitation(input: {
    invitationId: string;
    status: 'declined' | 'revoked';
    at: Date;
    audit?: AuditEntry | undefined;
  }): Promise<boolean>;
  addRosterEntries(input: {
    groupId: string;
    entries: { emailHash: string; unitId: string | null }[];
    addedBy: string;
    at: Date;
    audit?: AuditEntry | undefined;
    /** Dấu băm → tài khoản đã có; chỉ dấu băm vừa thêm mới phát sự kiện. */
    accountIdsByHash: Map<string, string>;
  }): Promise<string[]>;
  removeRosterEntry(
    groupId: string,
    emailHash: string,
    audit?: AuditEntry | undefined,
  ): Promise<boolean>;
  /** Gỡ hay cấm; chủ nhóm không bao giờ bị gỡ. Trả dòng thành viên vừa gỡ (nếu có). */
  removeMember(input: {
    groupId: string;
    accountId: string;
    reason: 'left' | 'removed' | 'banned' | 'account_deleted';
    by: string;
    at: Date;
    audit?: AuditEntry | undefined;
  }): Promise<{ removed: GroupMember | null } | 'owner'>;
  unban(input: {
    groupId: string;
    accountId: string;
    audit?: AuditEntry | undefined;
  }): Promise<boolean>;
  setMemberUnit(input: {
    groupId: string;
    accountId: string;
    unitId: string | null;
    audit?: AuditEntry | undefined;
  }): Promise<GroupMember | null>;
  setModerator(input: {
    groupId: string;
    accountId: string;
    moderator: { unitId: string | null } | null;
    at: Date;
    audit?: AuditEntry | undefined;
  }): Promise<GroupMember | null>;
  createUnit(groupId: string, name: string, audit?: AuditEntry | undefined): Promise<GroupUnit>;
  renameUnit(
    groupId: string,
    unitId: string,
    name: string,
    audit?: AuditEntry | undefined,
  ): Promise<GroupUnit | null>;
  deleteUnit(
    groupId: string,
    unitId: string,
    audit?: AuditEntry | undefined,
  ): Promise<'deleted' | 'not_found' | 'not_empty'>;

  // ── GHI: CHỦ NHÓM ──
  createOwnerOffer(input: {
    groupId: string;
    kind: GroupOwnerOfferKind;
    fromAccountId: string | null;
    toAccountId: string;
    at: Date;
    expiresAt: Date;
    audit?: AuditEntry | undefined;
  }): Promise<GroupOwnerOffer | 'duplicate'>;
  closeOwnerOffer(input: {
    offerId: string;
    status: 'declined' | 'cancelled';
    at: Date;
    audit?: AuditEntry | undefined;
  }): Promise<GroupOwnerOffer | null>;
  acceptOwnerOffer(input: {
    offerId: string;
    accountId: string;
    at: Date;
  }): Promise<
    | { offer: GroupOwnerOffer; group: Group; previousOwnerId: string | null }
    | 'gone'
    | 'state'
    | 'not_member'
  >;
  /** Chỉ nhóm đang hoạt động; `null` = nhóm đã thiếu chủ, đã khoá, hay đang chuyển sang riêng tư (chờ chuyển xong, L4). */
  markOwnerless(input: { groupId: string; nomineeId: string; at: Date }): Promise<Group | null>;
  setNominee(groupId: string, nomineeId: string | null): Promise<void>;
  lockBySystem(input: {
    groupId: string;
    cause: GroupLockCause;
    expectStates: ReadonlySet<GroupState>;
    at: Date;
  }): Promise<Group | null>;
  restoreOwner(input: { groupId: string; at: Date }): Promise<Group | null>;

  // ── GHI: THÔNG BÁO CỦA NHÓM ──
  createAnnouncement(input: {
    groupId: string;
    authorId: string;
    unitId: string | null;
    body: string;
    at: Date;
    since: Date;
    maxPerDay: number;
  }): Promise<GroupAnnouncement | 'limit' | 'state'>;

  /** Tài khoản bị xoá: huỷ mọi đơn, lời mời, lời giao chủ đang chờ của nó — không báo ai. */
  cancelPendingFor(accountId: string, at: Date): Promise<void>;

  // ── CỬA CHO TIN ĐĂNG ──
  /**
   * Trong transaction của `listing`: khoá cặp (nhóm, người) như mọi thay đổi tư cách, rồi `FOR SHARE` dòng nhóm tới
   * khi lượt đăng commit. `null` = không có nhóm.
   */
  lockForPosting(tx: Tx, groupId: string, accountId: string): Promise<GroupPostingSnapshot | null>;
  membersAmong(
    groupId: string,
    accountIds: string[],
  ): Promise<{ accountId: string; joinedVia: GroupJoinPath; unitId: string | null }[]>;
  memberGroupIds(accountId: string): Promise<string[]>;
  findGroups(ids: string[]): Promise<Group[]>;

  // ── VIỆC THEO LỊCH ──
  expireDue(now: Date): Promise<{ requests: number; invitations: number; offers: number }>;
  lockOwnerlessTimedOut(now: Date, maxDays: number): Promise<string[]>;
}

const DAY_MS = 86_400_000;

/*
 * LOCK_ORDER — mọi transaction của module lấy khoá theo một thứ tự, để hai lượt chen nhau chỉ chờ nhau chứ không khoá
 * vòng (deadlock → 500, rà soát T18, change fix-audit-group):
 *
 *   khoá người xin (`lockRequester`) → khoá cặp (`lockPair`) → dòng nhóm (`groupStateFor`) → lời mời → đơn xin
 *   → lời giao chủ → thành viên, lệnh cấm
 *
 * Duyệt đơn, nhận lời mời, nhận lời giao chủ đọc dòng đó KHÔNG khoá để biết nhóm và người, lấy khoá cặp và dòng nhóm,
 * rồi mới nhận có điều kiện (`updateMany … status = 'pending'`). Lấy lại khoá đã giữ không phải chờ, nên `insertMember`
 * gọi lại `lockPair`, `groupStateFor` vẫn đúng thứ tự. Còn sót (lượt quét theo hạn khoá nhiều dòng một lúc) thì
 * `error-handler` trả 409 "thử lại".
 */

/** Mọi thay đổi tư cách của một người trong một nhóm đi qua khoá này: vào, gỡ, cấm, nhận lời không đua nhau. */
const lockPair = (tx: Tx, groupId: string, accountId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`group-member:${groupId}:${accountId}`}, 0))`;

/** Trần 3 đơn chờ tính trên mọi nhóm: hai đơn gửi cùng lúc vào hai nhóm phải xếp hàng trước khi đếm. */
const lockRequester = (tx: Tx, accountId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`group-requests:${accountId}`}, 0))`;

/**
 * Đường vào đọc nhóm `FOR SHARE`, đóng / khoá / đổi chế độ `FOR UPDATE` (design mục 9): không ai vào được một
 * nhóm vừa đóng trong cùng khoảnh khắc.
 */
async function groupStateFor(
  tx: Tx,
  groupId: string,
  lock: 'share' | 'update',
): Promise<{ state: GroupState; mode: GroupMode } | null> {
  const rows =
    lock === 'share'
      ? await tx.$queryRaw<{ state: GroupState; mode: GroupMode }[]>`
          SELECT state::text AS state, mode::text AS mode FROM groups WHERE id = ${groupId}::uuid FOR SHARE`
      : await tx.$queryRaw<{ state: GroupState; mode: GroupMode }[]>`
          SELECT state::text AS state, mode::text AS mode FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Mọi lượt huỷ đơn, lời mời, lời giao chủ phát sự kiện như lượt huỷ do người dùng — bộ đếm đơn chờ của quản trị và
 * thông báo đọc theo sự kiện (rà soát L5, change fix-audit-group-low). `reason` cho bên nghe biết vì sao huỷ.
 */
type CancelReason = 'joined' | 'banned' | 'account_deleted';

const requestsCancelled = (
  groupId: string,
  accountId: string,
  rows: { id: string }[],
  reason: CancelReason,
): Events =>
  rows.map((row) =>
    groupEvent(GROUP_EVENTS.joinRequestDecided, {
      groupId,
      requestId: row.id,
      accountId,
      outcome: 'cancelled',
      reason,
    }),
  );

const invitationsCancelled = (
  groupId: string,
  accountId: string,
  rows: { id: string }[],
  reason: CancelReason,
): Events =>
  rows.map((row) =>
    groupEvent(GROUP_EVENTS.invitationDecided, {
      groupId,
      invitationId: row.id,
      accountId,
      outcome: 'cancelled',
      reason,
    }),
  );

const OFFER_EVENT_FIELDS = {
  id: true,
  groupId: true,
  kind: true,
  toAccountId: true,
  fromAccountId: true,
} as const;

const offersCancelled = (
  rows: Pick<GroupOwnerOffer, 'id' | 'groupId' | 'kind' | 'toAccountId' | 'fromAccountId'>[],
): Events =>
  rows.map((offer) =>
    groupEvent(GROUP_EVENTS.ownerOfferDecided, {
      groupId: offer.groupId,
      offerId: offer.id,
      kind: offer.kind,
      toAccountId: offer.toAccountId,
      fromAccountId: offer.fromAccountId,
      outcome: 'cancelled',
    }),
  );

/** Lời mời rồi đơn còn chờ của một người trong một nhóm (`LOCK_ORDER`), huỷ kèm sự kiện. */
async function cancelPendingIn(
  tx: Tx,
  input: { groupId: string; accountId: string; at: Date; reason: CancelReason },
): Promise<Events> {
  const where = { groupId: input.groupId, accountId: input.accountId, status: 'pending' } as const;
  const data = { status: 'cancelled', decidedAt: input.at } as const;
  const invitations = await tx.groupInvitation.updateManyAndReturn({
    where,
    data,
    select: { id: true },
  });
  const requests = await tx.groupJoinRequest.updateManyAndReturn({
    where,
    data,
    select: { id: true },
  });
  return [
    ...invitationsCancelled(input.groupId, input.accountId, invitations, input.reason),
    ...requestsCancelled(input.groupId, input.accountId, requests, input.reason),
  ];
}

/** Kiểm lại mọi điều kiện của việc thêm thành viên ngay trong transaction đã khoá — service chỉ kiểm trước cho câu lỗi. */
async function insertMember(
  tx: Tx,
  input: {
    groupId: string;
    accountId: string;
    via: GroupJoinPath;
    unitId: string | null;
    at: Date;
  },
): Promise<GroupMember | AddMemberFailure> {
  await lockPair(tx, input.groupId, input.accountId);
  const group = await groupStateFor(tx, input.groupId, 'share');
  if (!group || !ACCEPTS_MEMBERS.has(group.state)) return 'state';
  const banned = await tx.groupBan.findUnique({
    where: { groupId_accountId: { groupId: input.groupId, accountId: input.accountId } },
    select: { groupId: true },
  });
  if (banned) return 'banned';
  const existing = await tx.groupMember.findUnique({
    where: { groupId_accountId: { groupId: input.groupId, accountId: input.accountId } },
    select: { groupId: true },
  });
  if (existing) return 'member';
  // Huỷ đơn còn chờ của chính người đó: đã vào bằng đường khác thì đơn không còn nghĩa. Đơn trước thành viên — thứ tự khoá
  // của module (`LOCK_ORDER`).
  const cancelled = await tx.groupJoinRequest.updateManyAndReturn({
    where: { groupId: input.groupId, accountId: input.accountId, status: 'pending' },
    data: { status: 'cancelled', decidedAt: input.at },
    select: { id: true },
  });
  const member = await tx.groupMember.create({
    data: {
      groupId: input.groupId,
      accountId: input.accountId,
      joinedVia: input.via,
      joinedAt: input.at,
      unitId: input.unitId,
    },
  });
  await appendEvents(tx, [
    ...requestsCancelled(input.groupId, input.accountId, cancelled, 'joined'),
    groupEvent(GROUP_EVENTS.memberJoined, {
      groupId: input.groupId,
      accountId: input.accountId,
      via: input.via,
    }),
  ]);
  return member;
}

const page = async <T>(items: Promise<T[]>, total: Promise<number>): Promise<Page<T>> => {
  const [rows, count] = await Promise.all([items, total]);
  return { items: rows, total: count };
};

export function createGroupRepository(prisma: PrismaClient): GroupRepository {
  return {
    // ── ĐỌC ──────────────────────────────────────────────────────────────────────────────────────

    findGroup: (id) => prisma.group.findUnique({ where: { id } }),
    findGroupByCode: (code) =>
      prisma.group.findFirst({ where: { code, state: { not: 'closed' } } }),
    searchPublic: ({ folded, skip, take }) => {
      const where: Prisma.GroupWhereInput = {
        mode: { in: ['public_open', 'public_review'] },
        state: { in: ['active', 'ownerless'] },
        ...(folded ? { nameFolded: { contains: folded } } : {}),
      };
      return page(
        prisma.group.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take }),
        prisma.group.count({ where }),
      );
    },
    listGroups: ({ states, skip, take }) => {
      const where: Prisma.GroupWhereInput = states ? { state: { in: states } } : {};
      return page(
        prisma.group.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.group.count({ where }),
      );
    },
    async countMembers(groupIds) {
      if (groupIds.length === 0) return new Map();
      const rows = await prisma.$queryRaw<{ group_id: string; members: number }[]>`
        SELECT group_id::text, count(*)::int AS members FROM group_members
        WHERE group_id = ANY(${groupIds}::uuid[]) GROUP BY group_id`;
      return new Map(rows.map((row) => [row.group_id, row.members]));
    },
    findMember: (groupId, accountId) =>
      prisma.groupMember.findUnique({ where: { groupId_accountId: { groupId, accountId } } }),
    listMembers: (groupId, { unitId, skip, take }) => {
      const where: Prisma.GroupMemberWhereInput = { groupId, ...(unitId ? { unitId } : {}) };
      return page(
        prisma.groupMember.findMany({
          where,
          orderBy: [{ joinedAt: 'asc' }, { accountId: 'asc' }],
          skip,
          take,
        }),
        prisma.groupMember.count({ where }),
      );
    },
    myMemberships: (accountId) =>
      prisma.groupMember.findMany({
        where: { accountId, group: { state: { not: 'closed' } } },
        include: { group: true },
        orderBy: { joinedAt: 'desc' },
      }),
    listModerators: (groupId) =>
      prisma.groupMember.findMany({ where: { groupId, role: 'moderator' } }),
    findOwner: (groupId) => prisma.groupMember.findFirst({ where: { groupId, role: 'owner' } }),
    async ownsAnyGroup(accountId) {
      const row = await prisma.groupMember.findFirst({
        where: { accountId, role: 'owner', group: { state: { not: 'closed' } } },
        select: { groupId: true },
      });
      return row !== null;
    },
    async groupsAffectedByLock(accountId) {
      const rows = await prisma.groupMember.findMany({
        where: {
          accountId,
          OR: [
            { role: 'owner', group: { state: { in: ['active', 'going_private', 'ownerless'] } } },
            { role: 'moderator', group: { state: 'ownerless' } },
          ],
        },
        include: { group: true },
      });
      return {
        owned: rows.filter((row) => row.role === 'owner').map((row) => row.group),
        moderatingOwnerless: rows.filter((row) => row.role === 'moderator').map((row) => row.group),
      };
    },
    async groupsAwaitingOwner(accountId) {
      const rows = await prisma.groupMember.findMany({
        where: {
          accountId,
          role: 'owner',
          group: {
            OR: [
              { state: 'ownerless' },
              { state: 'locked', lockCause: { in: [...SYSTEM_LOCK_CAUSES] } },
            ],
          },
        },
        include: { group: true },
      });
      return rows.map((row) => row.group);
    },
    async managerIds(groupId) {
      const rows = await prisma.groupMember.findMany({
        where: {
          groupId,
          OR: [{ role: 'owner' }, { role: 'moderator', moderatorUnitId: null }],
        },
        select: { accountId: true },
      });
      return rows.map((row) => row.accountId);
    },
    async memberIds(groupId, { unitId, after, take }) {
      const rows = await prisma.groupMember.findMany({
        where: {
          groupId,
          ...(unitId ? { unitId } : {}),
          ...(after ? { accountId: { gt: after } } : {}),
        },
        orderBy: { accountId: 'asc' },
        take,
        select: { accountId: true },
      });
      return rows.map((row) => row.accountId);
    },
    async isBanned(groupId, accountId) {
      const row = await prisma.groupBan.findUnique({
        where: { groupId_accountId: { groupId, accountId } },
        select: { groupId: true },
      });
      return row !== null;
    },
    async lastRejectedAt(groupId, accountId) {
      const row = await prisma.groupJoinRequest.findFirst({
        where: { groupId, accountId, status: 'rejected' },
        orderBy: { decidedAt: 'desc' },
        select: { decidedAt: true },
      });
      return row?.decidedAt ?? null;
    },
    countPendingRequestsOf: (accountId, now) =>
      prisma.groupJoinRequest.count({
        where: { accountId, status: 'pending', expiresAt: { gt: now } },
      }),
    findJoinRequest: (id) => prisma.groupJoinRequest.findUnique({ where: { id } }),
    findPendingRequest: (groupId, accountId, now) =>
      prisma.groupJoinRequest.findFirst({
        where: { groupId, accountId, status: 'pending', expiresAt: { gt: now } },
      }),
    listPendingRequests: (groupId, now, { skip, take }) => {
      const where: Prisma.GroupJoinRequestWhereInput = {
        groupId,
        status: 'pending',
        expiresAt: { gt: now },
      };
      return page(
        prisma.groupJoinRequest.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take }),
        prisma.groupJoinRequest.count({ where }),
      );
    },
    countPendingRequests: (groupId, now) =>
      prisma.groupJoinRequest.count({
        where: { groupId, status: 'pending', expiresAt: { gt: now } },
      }),
    findInvitation: (id) => prisma.groupInvitation.findUnique({ where: { id } }),
    findLiveInvitation: (groupId, accountId, now) =>
      prisma.groupInvitation.findFirst({
        where: { groupId, accountId, status: 'pending', expiresAt: { gt: now } },
      }),
    listGroupInvitations: (groupId, now, { unitId, skip, take }) => {
      const where: Prisma.GroupInvitationWhereInput = {
        groupId,
        status: 'pending',
        expiresAt: { gt: now },
        ...(unitId ? { unitId } : {}),
      };
      return page(
        prisma.groupInvitation.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.groupInvitation.count({ where }),
      );
    },
    listBans: (groupId, { skip, take }) =>
      page(
        prisma.groupBan.findMany({
          where: { groupId },
          orderBy: [{ bannedAt: 'desc' }, { accountId: 'asc' }],
          skip,
          take,
        }),
        prisma.groupBan.count({ where: { groupId } }),
      ),

    myInvitations: (accountId, now) =>
      prisma.groupInvitation.findMany({
        where: {
          accountId,
          status: 'pending',
          expiresAt: { gt: now },
          group: { state: { not: 'closed' } },
        },
        include: { group: true },
        orderBy: { createdAt: 'desc' },
      }),
    findRosterUnit: (groupId, emailHash) =>
      prisma.groupRosterEntry.findUnique({
        where: { groupId_emailHash: { groupId, emailHash } },
        select: { unitId: true },
      }),
    async myRosterGroups(emailHash) {
      const rows = await prisma.groupRosterEntry.findMany({
        where: { emailHash, group: { state: { in: [...ACCEPTS_MEMBERS] } } },
        include: { group: true },
      });
      return rows.map((row) => ({ group: row.group, unitId: row.unitId }));
    },
    findOwnerOffer: (id) => prisma.groupOwnerOffer.findUnique({ where: { id } }),
    findPendingOffer: (groupId) =>
      prisma.groupOwnerOffer.findFirst({ where: { groupId, status: 'pending' } }),
    myOwnerOffers: (accountId, now) =>
      prisma.groupOwnerOffer.findMany({
        where: { toAccountId: accountId, status: 'pending', expiresAt: { gt: now } },
        include: { group: true },
        orderBy: { createdAt: 'desc' },
      }),
    listUnits: (groupId) =>
      prisma.groupUnit.findMany({ where: { groupId }, orderBy: { name: 'asc' } }),
    findAnnouncement: (id) => prisma.groupAnnouncement.findUnique({ where: { id } }),
    findUnit: (groupId, unitId) =>
      prisma.groupUnit.findUnique({ where: { groupId_id: { groupId, id: unitId } } }),
    listAnnouncements: (groupId, { unitId, skip, take }) => {
      const where: Prisma.GroupAnnouncementWhereInput = {
        groupId,
        ...(unitId === 'all' ? {} : { OR: [{ unitId: null }, ...(unitId ? [{ unitId }] : [])] }),
      };
      return page(
        prisma.groupAnnouncement.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        }),
        prisma.groupAnnouncement.count({ where }),
      );
    },

    // ── GHI: VÒNG ĐỜI, CÀI ĐẶT ───────────────────────────────────────────────────────────────────

    createGroup: ({ at, audit, ...data }) =>
      prisma.$transaction(async (tx) => {
        const group = await tx.group.create({ data: { ...data, createdAt: at } });
        await appendAudit(tx, { ...audit, targetId: group.id });
        return group;
      }),

    updateGroup: (input) =>
      prisma.$transaction(async (tx) => {
        const { id, expectStates, audit } = input;
        const current = await groupStateFor(tx, id, 'update');
        if (!current || !expectStates.has(current.state)) return null;
        const { data, events, cancelPendingRequests } =
          'prepare' in input ? await input.prepare(tx, current) : input;
        await tx.group.update({ where: { id }, data });
        let cancelledRequestAccountIds: string[] = [];
        if (cancelPendingRequests) {
          const cancelled = await tx.$queryRaw<{ account_id: string }[]>`
            UPDATE group_join_requests SET status = 'cancelled', decided_at = ${cancelPendingRequests.at}
            WHERE group_id = ${id}::uuid AND status = 'pending'
            RETURNING account_id::text`;
          cancelledRequestAccountIds = cancelled.map((row) => row.account_id);
        }
        await appendEvents(tx, events);
        if (cancelledRequestAccountIds.length > 0) {
          await appendEvents(
            tx,
            cancelledRequestAccountIds.map((accountId) =>
              groupEvent(GROUP_EVENTS.joinRequestDecided, {
                groupId: id,
                accountId,
                outcome: 'cancelled',
                reason: 'mode_open',
              }),
            ),
          );
        }
        if (audit) await appendAudit(tx, audit);
        const group = await tx.group.findUniqueOrThrow({ where: { id } });
        return { group, cancelledRequestAccountIds };
      }),

    closeGroup: ({ id, expectStates, closedBy, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const current = await groupStateFor(tx, id, 'update');
        if (!current || !expectStates.has(current.state)) return null;
        // Lời mời → đơn xin → lời giao chủ (`LOCK_ORDER`).
        const invitations = await tx.$queryRaw<{ account_id: string | null }[]>`
          UPDATE group_invitations SET status = 'cancelled', decided_at = ${at}
          WHERE group_id = ${id}::uuid AND status = 'pending' AND expires_at > ${at}
          RETURNING account_id::text`;
        // Đơn, lời mời đã quá hạn mà job chưa quét: huỷ luôn, nhưng không báo — người đó đã được báo hết hạn.
        await tx.groupInvitation.updateMany({
          where: { groupId: id, status: 'pending' },
          data: { status: 'cancelled', decidedAt: at },
        });
        const requests = await tx.$queryRaw<{ account_id: string }[]>`
          UPDATE group_join_requests SET status = 'cancelled', decided_at = ${at}
          WHERE group_id = ${id}::uuid AND status = 'pending' AND expires_at > ${at}
          RETURNING account_id::text`;
        await tx.groupJoinRequest.updateMany({
          where: { groupId: id, status: 'pending' },
          data: { status: 'cancelled', decidedAt: at },
        });
        const offers = await tx.groupOwnerOffer.updateManyAndReturn({
          where: { groupId: id, status: 'pending' },
          data: { status: 'cancelled', decidedAt: at },
          select: { toAccountId: true },
        });
        const group = await tx.group.update({
          where: { id },
          data: {
            state: 'closed',
            closedAt: at,
            closedBy,
            code: null,
            targetMode: null,
            lockedAt: null,
            lockCause: null,
            lockedReason: null,
            lockedBy: null,
            ownerlessSince: null,
            nomineeId: null,
          },
        });
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.closed, {
            groupId: id,
            closedBy,
            cancelledRequestAccountIds: requests.map((row) => row.account_id),
            // Lời mời mù (không người nhận) không báo ai.
            cancelledInviteeIds: invitations.flatMap((row) => row.account_id ?? []),
            cancelledOfferAccountIds: offers.map((row) => row.toAccountId),
          }),
          groupEvent(GROUP_EVENTS.badgeRightsChanged, { groupId: id, accountId: null }),
        ]);
        if (audit) await appendAudit(tx, audit);
        return group;
      }),

    // ── GHI: THÀNH VIÊN ──────────────────────────────────────────────────────────────────────────

    joinDirect: (input) => prisma.$transaction((tx) => insertMember(tx, input)),

    acceptInvitation: ({ invitationId, accountId, at }) =>
      prisma
        .$transaction(async (tx) => {
          // Đọc không khoá để biết nhóm; khoá cặp và dòng nhóm trước, nhận lời sau (`LOCK_ORDER`).
          const invitation = await tx.groupInvitation.findUnique({ where: { id: invitationId } });
          if (!invitation || invitation.accountId !== accountId) return 'gone';
          await lockPair(tx, invitation.groupId, accountId);
          await groupStateFor(tx, invitation.groupId, 'share');
          const taken = await tx.groupInvitation.updateMany({
            where: { id: invitationId, status: 'pending', expiresAt: { gt: at } },
            data: { status: 'accepted', decidedAt: at },
          });
          if (taken.count === 0) return 'gone';
          const result = await insertMember(tx, {
            groupId: invitation.groupId,
            accountId,
            via: 'invited',
            unitId: invitation.unitId,
            at,
          });
          // Không vào được thì lời mời phải còn nguyên: ném để transaction cuộn lại cả lượt nhận lời.
          if (typeof result === 'string') throw new MemberRollback(result);
          await appendEvents(tx, [
            groupEvent(GROUP_EVENTS.invitationDecided, {
              groupId: invitation.groupId,
              invitationId,
              accountId,
              outcome: 'accepted',
            }),
          ]);
          return result;
        })
        .catch(rollbackReason),

    createJoinRequest: ({ groupId, accountId, at, expiresAt, maxPending }) =>
      prisma.$transaction(async (tx) => {
        await lockRequester(tx, accountId);
        await lockPair(tx, groupId, accountId);
        const group = await groupStateFor(tx, groupId, 'share');
        if (!group || !ACCEPTS_MEMBERS.has(group.state)) return 'state';
        const banned = await tx.groupBan.findUnique({
          where: { groupId_accountId: { groupId, accountId } },
          select: { groupId: true },
        });
        if (banned) return 'banned';
        const member = await tx.groupMember.findUnique({
          where: { groupId_accountId: { groupId, accountId } },
          select: { groupId: true },
        });
        if (member) return 'member';
        // Đơn quá hạn mà job chưa quét không được giữ chỗ của đơn mới, cũng không tính vào trần.
        await tx.groupJoinRequest.updateMany({
          where: { accountId, status: 'pending', expiresAt: { lte: at } },
          data: { status: 'expired', decidedAt: at },
        });
        const duplicate = await tx.groupJoinRequest.findFirst({
          where: { groupId, accountId, status: 'pending' },
          select: { id: true },
        });
        if (duplicate) return 'duplicate';
        const pending = await tx.groupJoinRequest.count({
          where: { accountId, status: 'pending' },
        });
        if (pending >= maxPending) return 'limit';
        const request = await tx.groupJoinRequest.create({
          data: { groupId, accountId, createdAt: at, expiresAt },
        });
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.joinRequested, { groupId, requestId: request.id, accountId }),
        ]);
        return request;
      }),

    decideJoinRequest: ({ requestId, approve, decidedBy, at, reapplyAt, audit }) =>
      prisma
        .$transaction(async (tx) => {
          // Đọc không khoá để biết nhóm và người xin; khoá cặp và dòng nhóm trước, nhận đơn sau (`LOCK_ORDER`).
          const request = await tx.groupJoinRequest.findUnique({ where: { id: requestId } });
          if (!request) return 'gone';
          await lockPair(tx, request.groupId, request.accountId);
          const group = await groupStateFor(tx, request.groupId, 'share');
          const taken = await tx.groupJoinRequest.updateMany({
            where: { id: requestId, status: 'pending', expiresAt: { gt: at } },
            data: { status: approve ? 'approved' : 'rejected', decidedAt: at, decidedBy },
          });
          if (taken.count === 0) return 'gone';
          if (approve) {
            const result = await insertMember(tx, {
              groupId: request.groupId,
              accountId: request.accountId,
              via: 'approved',
              unitId: null,
              at,
            });
            if (typeof result === 'string') throw new MemberRollback(result);
          } else if (!group || !ALLOWS_MODERATION.has(group.state)) {
            throw new MemberRollback('state');
          }
          await appendEvents(tx, [
            groupEvent(GROUP_EVENTS.joinRequestDecided, {
              groupId: request.groupId,
              requestId,
              accountId: request.accountId,
              outcome: approve ? 'approved' : 'rejected',
              reapplyAt: approve ? null : reapplyAt.toISOString(),
            }),
          ]);
          if (audit) await appendAudit(tx, audit);
          return tx.groupJoinRequest.findUniqueOrThrow({ where: { id: requestId } });
        })
        .catch(rollbackReason),

    withdrawJoinRequest: ({ requestId, accountId, at }) =>
      prisma.$transaction(async (tx) => {
        const taken = await tx.groupJoinRequest.updateManyAndReturn({
          where: { id: requestId, accountId, status: 'pending' },
          data: { status: 'withdrawn', decidedAt: at },
        });
        const request = taken[0];
        if (!request) return false;
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.joinRequestDecided, {
            groupId: request.groupId,
            requestId,
            accountId,
            outcome: 'withdrawn',
          }),
        ]);
        return true;
      }),

    createInvitation: (input) =>
      prisma.$transaction(async (tx) => {
        const { groupId, accountId, emailHash, emailHint, unitId, invitedBy, at, expiresAt } =
          input;
        // Khoá cặp → dòng nhóm → lời mời (`LOCK_ORDER`). Không có người nhận thì khoá theo dấu băm email: hai lượt mời
        // cùng email vẫn xếp hàng.
        await lockPair(tx, groupId, accountId ?? `email:${emailHash}`);
        await groupStateFor(tx, groupId, 'share');
        // Lời mời cũ đã quá hạn không được giữ chỗ của lời mời mới.
        await tx.groupInvitation.updateMany({
          where: { groupId, emailHash, status: 'pending', expiresAt: { lte: at } },
          data: { status: 'expired', decidedAt: at },
        });
        const existing = await tx.groupInvitation.findFirst({
          where: { groupId, emailHash, status: 'pending' },
        });
        // Mời lại: đổi đơn vị theo lượt mới, giữ hạn cũ; email vừa có tài khoản thì lời mời có người nhận từ giờ.
        const gainsInvitee = existing !== null && existing.accountId === null && accountId !== null;
        const invitation = existing
          ? await tx.groupInvitation.update({
              where: { id: existing.id },
              data: { unitId, ...(gainsInvitee ? { accountId } : {}) },
            })
          : await tx.groupInvitation.create({
              data: {
                groupId,
                accountId,
                emailHash,
                emailHint,
                unitId,
                invitedBy,
                createdAt: at,
                expiresAt,
              },
            });
        // Chỉ báo khi có người nhận mới: lời mời mù không ai thấy, mời lại người đã được báo thì không báo lần nữa.
        if (invitation.accountId && (existing === null || gainsInvitee)) {
          await appendEvents(tx, [
            groupEvent(GROUP_EVENTS.invited, {
              groupId,
              invitationId: invitation.id,
              accountId: invitation.accountId,
              unitId: invitation.unitId,
              expiresAt: invitation.expiresAt.toISOString(),
            }),
          ]);
        }
        if (input.audit) await appendAudit(tx, input.audit);
        return invitation;
      }),

    closeInvitation: ({ invitationId, status, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.groupInvitation.updateManyAndReturn({
          where: { id: invitationId, status: 'pending' },
          data: { status, decidedAt: at },
        });
        const invitation = rows[0];
        if (!invitation) return false;
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.invitationDecided, {
            groupId: invitation.groupId,
            invitationId,
            accountId: invitation.accountId,
            outcome: status,
          }),
        ]);
        if (audit) await appendAudit(tx, audit);
        return true;
      }),

    addRosterEntries: ({ groupId, entries, addedBy, at, audit, accountIdsByHash }) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.groupRosterEntry.createManyAndReturn({
          data: entries.map((entry) => ({ groupId, ...entry, addedBy, addedAt: at })),
          skipDuplicates: true,
          select: { emailHash: true },
        });
        if (audit) await appendAudit(tx, audit);
        const matched = rows.flatMap((row) => accountIdsByHash.get(row.emailHash) ?? []);
        if (matched.length > 0) {
          await appendEvents(tx, [
            groupEvent(GROUP_EVENTS.rosterMatched, { groupId, accountIds: matched }),
          ]);
        }
        return rows.map((row) => row.emailHash);
      }),

    removeRosterEntry: (groupId, emailHash, audit) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.groupRosterEntry.deleteMany({ where: { groupId, emailHash } });
        if (count > 0 && audit) await appendAudit(tx, audit);
        return count > 0;
      }),

    removeMember: ({ groupId, accountId, reason, by, at, audit }) =>
      prisma.$transaction(async (tx) => {
        await lockPair(tx, groupId, accountId);
        // Công tắc đúng lúc rời đi vào sự kiện: bên nghe của `listing` chạy sau vài giây, đọc lại lúc đó là sai nếu chủ
        // nhóm vừa bật / tắt (proposal add-listings, Impact).
        const settings = await tx.$queryRaw<{ allow_outsiders: boolean }[]>`
          SELECT allow_outsiders FROM groups WHERE id = ${groupId}::uuid FOR SHARE`;
        const member = await tx.groupMember.findUnique({
          where: { groupId_accountId: { groupId, accountId } },
        });
        if (member?.role === 'owner') return 'owner';
        // Bị cấm thì lời mời và đơn đang chờ của người đó không còn nghĩa. Lời mời → đơn → thành viên, lệnh cấm
        // (`LOCK_ORDER`).
        const events: Events =
          reason === 'banned'
            ? await cancelPendingIn(tx, { groupId, accountId, at, reason: 'banned' })
            : [];
        if (member) {
          await tx.groupMember.delete({ where: { groupId_accountId: { groupId, accountId } } });
        }
        if (reason === 'banned') {
          await tx.groupBan.upsert({
            where: { groupId_accountId: { groupId, accountId } },
            create: { groupId, accountId, bannedBy: by, bannedAt: at },
            update: {},
          });
        }
        if (member) {
          events.push(
            groupEvent(GROUP_EVENTS.memberLeft, {
              groupId,
              accountId,
              reason,
              role: member.role,
              allowOutsiders: settings[0]?.allow_outsiders ?? false,
            }),
            groupEvent(GROUP_EVENTS.badgeRightsChanged, { groupId, accountId }),
          );
        }
        if (reason === 'banned')
          events.push(groupEvent(GROUP_EVENTS.banned, { groupId, accountId }));
        await appendEvents(tx, events);
        if (audit) await appendAudit(tx, audit);
        return { removed: member };
      }),

    unban: ({ groupId, accountId, audit }) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.groupBan.deleteMany({ where: { groupId, accountId } });
        if (count === 0) return false;
        await appendEvents(tx, [groupEvent(GROUP_EVENTS.unbanned, { groupId, accountId })]);
        if (audit) await appendAudit(tx, audit);
        return true;
      }),

    setMemberUnit: ({ groupId, accountId, unitId, audit }) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.groupMember.updateManyAndReturn({
          where: { groupId, accountId },
          data: { unitId },
        });
        const member = rows[0];
        if (!member) return null;
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.memberUnitChanged, { groupId, accountId, unitId }),
        ]);
        if (audit) await appendAudit(tx, audit);
        return member;
      }),

    setModerator: ({ groupId, accountId, moderator, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const before = await tx.groupMember.findUnique({
          where: { groupId_accountId: { groupId, accountId } },
        });
        if (!before || before.role === 'owner') return null;
        const member = await tx.groupMember.update({
          where: { groupId_accountId: { groupId, accountId } },
          data: moderator
            ? {
                role: 'moderator',
                moderatorUnitId: moderator.unitId,
                roleSince: before.role === 'moderator' ? before.roleSince : at,
              }
            : { role: 'member', moderatorUnitId: null, roleSince: null },
        });
        const change = !moderator
          ? 'dismissed'
          : before.role === 'moderator'
            ? 'scope'
            : 'appointed';
        if (!(change === 'dismissed' && before.role === 'member')) {
          await appendEvents(tx, [
            groupEvent(GROUP_EVENTS.moderatorChanged, {
              groupId,
              accountId,
              change,
              unitId: moderator?.unitId ?? null,
            }),
          ]);
        }
        if (audit) await appendAudit(tx, audit);
        return member;
      }),

    createUnit: (groupId, name, audit) =>
      prisma.$transaction(async (tx) => {
        const unit = await tx.groupUnit.create({ data: { groupId, name } });
        if (audit) await appendAudit(tx, audit);
        return unit;
      }),

    renameUnit: (groupId, unitId, name, audit) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.groupUnit.updateManyAndReturn({
          where: { groupId, id: unitId },
          data: { name },
        });
        if (rows[0] && audit) await appendAudit(tx, audit);
        return rows[0] ?? null;
      }),

    deleteUnit: (groupId, unitId, audit) =>
      prisma.$transaction(async (tx) => {
        const unit = await tx.groupUnit.findUnique({
          where: { groupId_id: { groupId, id: unitId } },
        });
        if (!unit) return 'not_found';
        const used = await tx.groupMember.count({
          where: { groupId, OR: [{ unitId }, { moderatorUnitId: unitId }] },
        });
        if (used > 0) return 'not_empty';
        await tx.groupInvitation.updateMany({ where: { groupId, unitId }, data: { unitId: null } });
        await tx.groupRosterEntry.updateMany({
          where: { groupId, unitId },
          data: { unitId: null },
        });
        await tx.groupUnit.delete({ where: { id: unitId } });
        if (audit) await appendAudit(tx, audit);
        return 'deleted';
      }),

    // ── GHI: CHỦ NHÓM ────────────────────────────────────────────────────────────────────────────

    createOwnerOffer: ({ groupId, kind, fromAccountId, toAccountId, at, expiresAt, audit }) =>
      prisma.$transaction(async (tx) => {
        // Khoá dòng nhóm: hai lời giao cùng lúc xếp hàng, lời sau thấy lời trước và trả 'duplicate'.
        await groupStateFor(tx, groupId, 'update');
        await tx.groupOwnerOffer.updateMany({
          where: { groupId, status: 'pending', expiresAt: { lte: at } },
          data: { status: 'expired', decidedAt: at },
        });
        const existing = await tx.groupOwnerOffer.findFirst({
          where: { groupId, status: 'pending' },
          select: { id: true },
        });
        if (existing) return 'duplicate';
        const offer = await tx.groupOwnerOffer.create({
          data: { groupId, kind, fromAccountId, toAccountId, createdAt: at, expiresAt },
        });
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.ownerOffered, {
            groupId,
            offerId: offer.id,
            kind,
            toAccountId,
            fromAccountId,
            expiresAt: expiresAt.toISOString(),
          }),
        ]);
        if (audit) await appendAudit(tx, audit);
        return offer;
      }),

    closeOwnerOffer: ({ offerId, status, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.groupOwnerOffer.updateManyAndReturn({
          where: { id: offerId, status: 'pending' },
          data: { status, decidedAt: at },
        });
        const offer = rows[0];
        if (!offer) return null;
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.ownerOfferDecided, {
            groupId: offer.groupId,
            offerId,
            kind: offer.kind,
            toAccountId: offer.toAccountId,
            fromAccountId: offer.fromAccountId,
            outcome: status,
          }),
        ]);
        if (audit) await appendAudit(tx, audit);
        return offer;
      }),

    acceptOwnerOffer: ({ offerId, accountId, at }) =>
      prisma
        .$transaction(async (tx) => {
          // Đọc không khoá để biết nhóm; khoá cặp rồi dòng nhóm, nhận lời sau (`LOCK_ORDER`).
          const offer = await tx.groupOwnerOffer.findUnique({ where: { id: offerId } });
          if (!offer || offer.toAccountId !== accountId) return 'gone';
          await lockPair(tx, offer.groupId, accountId);
          const group = await groupStateFor(tx, offer.groupId, 'update');
          const acceptable =
            offer.kind === 'transfer'
              ? group?.state === 'active'
              : group !== null &&
                ['pending_owner', 'active', 'ownerless', 'locked'].includes(group.state);
          if (!acceptable) return 'state';
          // Khoá cặp đang giữ nên tư cách không đổi tới hết transaction.
          const self = await tx.groupMember.findUnique({
            where: { groupId_accountId: { groupId: offer.groupId, accountId } },
          });
          // Vào nhóm bằng vai chủ thì lời mời, đơn còn chờ của người đó mất nghĩa (L5). Lời mời → đơn → lời giao chủ
          // (`LOCK_ORDER`), nên huỷ trước khi nhận lời; nhận thua thì cuộn lại cả lượt huỷ.
          const cancelled =
            self || offer.kind === 'transfer'
              ? []
              : await cancelPendingIn(tx, {
                  groupId: offer.groupId,
                  accountId,
                  at,
                  reason: 'joined',
                });
          const taken = await tx.groupOwnerOffer.updateMany({
            where: { id: offerId, status: 'pending', expiresAt: { gt: at } },
            data: { status: 'accepted', decidedAt: at },
          });
          if (taken.count === 0) throw new MemberRollback('gone');
          if (!self && offer.kind === 'transfer') throw new MemberRollback('not_member');
          const previous = await tx.groupMember.findFirst({
            where: { groupId: offer.groupId, role: 'owner' },
          });
          if (previous && previous.accountId !== accountId) {
            await tx.groupMember.update({
              where: {
                groupId_accountId: { groupId: offer.groupId, accountId: previous.accountId },
              },
              data: { role: 'member', moderatorUnitId: null, roleSince: null },
            });
          }
          if (self) {
            await tx.groupMember.update({
              where: { groupId_accountId: { groupId: offer.groupId, accountId } },
              data: { role: 'owner', moderatorUnitId: null, roleSince: at },
            });
          }
          // Người nhận đang bị cấm: lệnh cấm được gỡ như gỡ cấm, có sự kiện để tin của họ hết lý do "bị cấm" (T17).
          const unbanned = self
            ? 0
            : (await tx.groupBan.deleteMany({ where: { groupId: offer.groupId, accountId } }))
                .count;
          if (!self) {
            await tx.groupMember.create({
              data: {
                groupId: offer.groupId,
                accountId,
                role: 'owner',
                joinedVia: 'assigned',
                joinedAt: at,
                roleSince: at,
              },
            });
          }
          const before = await tx.group.findUniqueOrThrow({ where: { id: offer.groupId } });
          const reopen =
            before.state === 'pending_owner' ||
            before.state === 'ownerless' ||
            (before.state === 'locked' &&
              before.lockCause !== null &&
              SYSTEM_LOCK_CAUSES.has(before.lockCause));
          const updated = await tx.group.update({
            where: { id: offer.groupId },
            data: {
              ownerlessSince: null,
              nomineeId: null,
              ...(reopen
                ? {
                    state: 'active',
                    lockedAt: null,
                    lockCause: null,
                    lockedReason: null,
                    lockedBy: null,
                  }
                : {}),
            },
          });
          const events: Events = [
            ...cancelled,
            groupEvent(GROUP_EVENTS.ownerOfferDecided, {
              groupId: offer.groupId,
              offerId,
              kind: offer.kind,
              toAccountId: accountId,
              fromAccountId: offer.fromAccountId,
              outcome: 'accepted',
            }),
            groupEvent(GROUP_EVENTS.ownerChanged, {
              groupId: offer.groupId,
              previousOwnerId: previous?.accountId ?? null,
              newOwnerId: accountId,
              cause: before.state === 'ownerless' ? 'ownerless_confirmed' : offer.kind,
            }),
          ];
          if (unbanned > 0) {
            events.push(groupEvent(GROUP_EVENTS.unbanned, { groupId: offer.groupId, accountId }));
          }
          if (!self) {
            events.push(
              groupEvent(GROUP_EVENTS.memberJoined, {
                groupId: offer.groupId,
                accountId,
                via: 'assigned',
              }),
            );
          }
          if (before.state === 'ownerless') {
            events.push(
              groupEvent(GROUP_EVENTS.ownerlessResolved, {
                groupId: offer.groupId,
                outcome: 'new_owner',
              }),
            );
          }
          if (reopen && before.state === 'locked') {
            events.push(
              groupEvent(GROUP_EVENTS.unlocked, { groupId: offer.groupId, cause: 'new_owner' }),
            );
          }
          await appendEvents(tx, events);
          return { offer, group: updated, previousOwnerId: previous?.accountId ?? null };
        })
        .catch(offerRollbackReason),

    markOwnerless: ({ groupId, nomineeId, at }) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.group.updateManyAndReturn({
          // Nhóm đang chuyển sang riêng tư chuyển xong rồi mới thiếu chủ (L4) — `completePrivatization` gọi lại.
          where: { id: groupId, state: 'active' },
          data: { state: 'ownerless', ownerlessSince: at, nomineeId },
        });
        const group = rows[0];
        if (!group) return null;
        await appendEvents(tx, [groupEvent(GROUP_EVENTS.ownerlessStarted, { groupId, nomineeId })]);
        return group;
      }),

    async setNominee(groupId, nomineeId) {
      await prisma.group.updateMany({
        where: { id: groupId, state: 'ownerless' },
        data: { nomineeId },
      });
    },

    lockBySystem: ({ groupId, cause, expectStates, at }) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.group.updateManyAndReturn({
          where: { id: groupId, state: { in: [...expectStates] } },
          data: {
            state: 'locked',
            lockCause: cause,
            lockedAt: at,
            lockedBy: null,
            lockedReason: null,
            targetMode: null,
          },
        });
        const group = rows[0];
        if (!group) return null;
        const offers = await tx.groupOwnerOffer.updateManyAndReturn({
          where: { groupId, status: 'pending', kind: 'transfer' },
          data: { status: 'cancelled', decidedAt: at },
          select: OFFER_EVENT_FIELDS,
        });
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.locked, { groupId, cause }),
          ...offersCancelled(offers),
        ]);
        return group;
      }),

    restoreOwner: ({ groupId, at }) =>
      prisma.$transaction(async (tx) => {
        await groupStateFor(tx, groupId, 'update');
        const before = await tx.group.findUnique({ where: { id: groupId } });
        if (!before) return null;
        const systemLocked =
          before.state === 'locked' &&
          before.lockCause !== null &&
          SYSTEM_LOCK_CAUSES.has(before.lockCause);
        if (before.state !== 'ownerless' && !systemLocked) return null;
        const group = await tx.group.update({
          where: { id: groupId },
          data: {
            state: 'active',
            ownerlessSince: null,
            nomineeId: null,
            lockedAt: null,
            lockCause: null,
            lockedReason: null,
            lockedBy: null,
          },
        });
        // Đề cử và lời giao của master cho nhóm đang chờ chủ không còn nghĩa khi chủ cũ đã về (spec group-roles).
        const cancelled = await tx.groupOwnerOffer.updateManyAndReturn({
          where: { groupId, status: 'pending', kind: 'assignment' },
          data: { status: 'cancelled', decidedAt: at },
          select: OFFER_EVENT_FIELDS,
        });
        const events: Events = [
          groupEvent(GROUP_EVENTS.ownerlessResolved, { groupId, outcome: 'owner_returned' }),
          ...offersCancelled(cancelled),
        ];
        if (systemLocked)
          events.push(groupEvent(GROUP_EVENTS.unlocked, { groupId, cause: 'owner_returned' }));
        await appendEvents(tx, events);
        return group;
      }),

    // ── GHI: THÔNG BÁO CỦA NHÓM ──────────────────────────────────────────────────────────────────

    createAnnouncement: ({ groupId, authorId, unitId, body, at, since, maxPerDay }) =>
      prisma.$transaction(async (tx) => {
        // Khoá dòng nhóm: hai thông báo gửi cùng lúc không cùng thấy "còn 1 lượt".
        const group = await groupStateFor(tx, groupId, 'update');
        if (!group || !ALLOWS_MODERATION.has(group.state)) return 'state';
        const sent = await tx.groupAnnouncement.count({
          where: { groupId, createdAt: { gte: since } },
        });
        if (sent >= maxPerDay) return 'limit';
        const announcement = await tx.groupAnnouncement.create({
          data: { groupId, authorId, unitId, body, createdAt: at },
        });
        await appendEvents(tx, [
          groupEvent(GROUP_EVENTS.announcementPosted, {
            groupId,
            announcementId: announcement.id,
            unitId,
            authorId,
          }),
        ]);
        return announcement;
      }),

    cancelPendingFor: (accountId, at) =>
      prisma.$transaction(async (tx) => {
        // Lời mời → đơn → lời giao chủ (`LOCK_ORDER`).
        const invitations = await tx.groupInvitation.updateManyAndReturn({
          where: { accountId, status: 'pending' },
          data: { status: 'cancelled', decidedAt: at },
          select: { id: true, groupId: true },
        });
        const requests = await tx.groupJoinRequest.updateManyAndReturn({
          where: { accountId, status: 'pending' },
          data: { status: 'cancelled', decidedAt: at },
          select: { id: true, groupId: true },
        });
        const offers = await tx.groupOwnerOffer.updateManyAndReturn({
          where: { toAccountId: accountId, status: 'pending' },
          data: { status: 'cancelled', decidedAt: at },
          select: OFFER_EVENT_FIELDS,
        });
        await appendEvents(tx, [
          ...invitations.flatMap((row) =>
            invitationsCancelled(row.groupId, accountId, [row], 'account_deleted'),
          ),
          ...requests.flatMap((row) =>
            requestsCancelled(row.groupId, accountId, [row], 'account_deleted'),
          ),
          ...offersCancelled(offers),
        ]);
      }),

    // ── CỬA CHO TIN ĐĂNG ─────────────────────────────────────────────────────────────────────────

    async lockForPosting(tx, groupId, accountId) {
      await lockPair(tx, groupId, accountId);
      const rows = await tx.$queryRaw<
        { state: GroupState; mode: GroupMode; allow_outsiders: boolean }[]
      >`
        SELECT state::text AS state, mode::text AS mode, allow_outsiders
        FROM groups WHERE id = ${groupId}::uuid FOR SHARE`;
      const group = rows[0];
      if (!group) return null;
      const pair = { groupId_accountId: { groupId, accountId } };
      const member = await tx.groupMember.findUnique({ where: pair, select: { unitId: true } });
      const ban = await tx.groupBan.findUnique({ where: pair, select: { groupId: true } });
      return {
        state: group.state,
        mode: group.mode,
        allowOutsiders: group.allow_outsiders,
        member,
        banned: ban !== null,
      };
    },

    membersAmong: (groupId, accountIds) =>
      prisma.groupMember.findMany({
        where: { groupId, accountId: { in: accountIds } },
        select: { accountId: true, joinedVia: true, unitId: true },
      }),

    async memberGroupIds(accountId) {
      const rows = await prisma.groupMember.findMany({
        where: { accountId },
        select: { groupId: true },
      });
      return rows.map((row) => row.groupId);
    },

    findGroups: (ids) => prisma.group.findMany({ where: { id: { in: ids } } }),

    // ── VIỆC THEO LỊCH ───────────────────────────────────────────────────────────────────────────

    expireDue: (now) =>
      prisma.$transaction(async (tx) => {
        // Lời mời → đơn → lời giao chủ (`LOCK_ORDER`).
        const invitations = await tx.$queryRaw<
          { id: string; group_id: string; account_id: string | null }[]
        >`
          UPDATE group_invitations SET status = 'expired', decided_at = ${now}
          WHERE status = 'pending' AND expires_at <= ${now}
          RETURNING id::text, group_id::text, account_id::text`;
        const requests = await tx.$queryRaw<{ id: string; group_id: string; account_id: string }[]>`
          UPDATE group_join_requests SET status = 'expired', decided_at = ${now}
          WHERE status = 'pending' AND expires_at <= ${now}
          RETURNING id::text, group_id::text, account_id::text`;
        const offers = await tx.groupOwnerOffer.updateManyAndReturn({
          where: { status: 'pending', expiresAt: { lte: now } },
          data: { status: 'expired', decidedAt: now },
        });
        await appendEvents(tx, [
          ...requests.map((row) =>
            groupEvent(GROUP_EVENTS.joinRequestDecided, {
              groupId: row.group_id,
              requestId: row.id,
              accountId: row.account_id,
              outcome: 'expired',
            }),
          ),
          // Lời mời mù không có người nhận để báo.
          ...invitations.flatMap((row) =>
            row.account_id
              ? [
                  groupEvent(GROUP_EVENTS.invitationDecided, {
                    groupId: row.group_id,
                    invitationId: row.id,
                    accountId: row.account_id,
                    outcome: 'expired',
                  }),
                ]
              : [],
          ),
          ...offers.map((offer) =>
            groupEvent(GROUP_EVENTS.ownerOfferDecided, {
              groupId: offer.groupId,
              offerId: offer.id,
              kind: offer.kind,
              toAccountId: offer.toAccountId,
              fromAccountId: offer.fromAccountId,
              outcome: 'expired',
            }),
          ),
        ]);
        return {
          requests: requests.length,
          invitations: invitations.length,
          offers: offers.length,
        };
      }),

    lockOwnerlessTimedOut: (now, maxDays) =>
      prisma.$transaction(async (tx) => {
        const cutoff = new Date(now.getTime() - maxDays * DAY_MS);
        const rows = await tx.group.updateManyAndReturn({
          where: { state: 'ownerless', ownerlessSince: { lt: cutoff } },
          data: { state: 'locked', lockCause: 'ownerless_timeout', lockedAt: now },
          select: { id: true },
        });
        const offers = await tx.groupOwnerOffer.updateManyAndReturn({
          where: {
            groupId: { in: rows.map((row) => row.id) },
            status: 'pending',
            kind: 'transfer',
          },
          data: { status: 'cancelled', decidedAt: now },
          select: OFFER_EVENT_FIELDS,
        });
        await appendEvents(tx, [
          ...rows.map((row) =>
            groupEvent(GROUP_EVENTS.locked, { groupId: row.id, cause: 'ownerless_timeout' }),
          ),
          ...offersCancelled(offers),
        ]);
        return rows.map((row) => row.id);
      }),
  };
}

/** Lỗi nội bộ để cuộn lại một transaction đã ghi nửa chừng (vd lời mời đã đánh dấu nhận mà người đó bị cấm). */
class MemberRollback extends Error {
  constructor(readonly reason: AddMemberFailure | 'not_member') {
    super(reason);
  }
}

function rollbackReason(error: unknown): AddMemberFailure {
  if (error instanceof MemberRollback && error.reason !== 'not_member') return error.reason;
  throw error;
}

function offerRollbackReason(error: unknown): 'gone' | 'state' | 'not_member' {
  if (
    error instanceof MemberRollback &&
    (error.reason === 'not_member' || error.reason === 'state' || error.reason === 'gone')
  ) {
    return error.reason;
  }
  throw error;
}
