import type {
  Account,
  AccountFlag,
  CodePurpose,
  DeviceClearance,
  DevicePost,
  DisposableDomain,
  IdVerification,
  IdVerificationStatus,
  Prisma,
  PrismaClient,
  Session,
  SessionRevokeReason,
  VerificationCode,
} from '@prisma/client';

import { appendAudit, type AuditEntry } from '../../common/audit/audit.js';
import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';
import { FLAG_CLEARED_REASONS } from './identity.schema.js';

export type {
  Account,
  AccountFlag,
  DeviceClearance,
  DevicePost,
  DisposableDomain,
  IdVerification,
  OutboxEventInput,
  Session,
  VerificationCode,
};

// ── KIỂU VÀO ────────────────────────────────────────────────────────────────────────────────────

export type NewAccount = Pick<
  Account,
  | 'email'
  | 'emailNormalized'
  | 'emailHash'
  | 'passwordHash'
  | 'googleSub'
  | 'status'
  | 'displayName'
> & { at: Date };

export type AccountPatch = Partial<
  Pick<
    Account,
    | 'email'
    | 'emailNormalized'
    | 'emailHash'
    | 'passwordHash'
    | 'googleSub'
    | 'status'
    | 'role'
    | 'displayName'
    | 'avatarUrl'
    | 'phone'
    | 'totpSecretEnc'
    | 'totpEnabledAt'
    | 'emailChangedAt'
    | 'passwordChangedAt'
  >
>;

export interface LockAccountInput {
  accountId: string;
  reason: string;
  lockedBy: string;
  at: Date;
  events: OutboxEventInput[];
  /** Spec audit-log: không ghi được nhật ký thì khoá không xảy ra — cùng transaction. */
  audit: AuditEntry;
}

export interface UnlockAccountInput {
  accountId: string;
  unlockedBy: string;
  at: Date;
  events: OutboxEventInput[];
  audit: AuditEntry;
}

export interface SoftDeleteAccountInput {
  accountId: string;
  at: Date;
  events: OutboxEventInput[];
}

export type NewCode = Pick<
  VerificationCode,
  'accountId' | 'purpose' | 'codeHash' | 'targetEmail'
> & {
  expiresAt: Date;
  at: Date;
};

export type CodePatch = Partial<Pick<VerificationCode, 'attempts' | 'consumedAt'>>;

export interface RevokeSessionsInput {
  accountId: string;
  reason: SessionRevokeReason;
  at: Date;
  /** Giữ lại phiên đang thao tác (đổi mật khẩu, "đăng xuất mọi thiết bị khác"). */
  exceptId?: string;
}

/**
 * Một thay đổi trên tài khoản cùng mọi hệ quả của nó trong CÙNG transaction: tiêu mã (nếu có),
 * thu hồi phiên (nếu có), ghi outbox. Xác nhận email, đặt lại / đổi mật khẩu, đổi email đều là
 * một lượt gọi này.
 */
export interface AccountChangeInput {
  accountId: string;
  patch: AccountPatch;
  consumeCodeId?: string;
  revokeSessions?: Omit<RevokeSessionsInput, 'accountId' | 'at'>;
  at: Date;
  events: OutboxEventInput[];
}

export type NewSession = Pick<
  Session,
  | 'accountId'
  | 'refreshTokenHash'
  | 'deviceName'
  | 'ip'
  | 'userAgent'
  | 'secondFactorAt'
  | 'expiresAt'
> & { at: Date };

export type SessionPatch = Partial<
  Pick<
    Session,
    | 'refreshTokenHash'
    | 'prevRefreshTokenHash'
    | 'lastActiveAt'
    | 'expiresAt'
    | 'revokedAt'
    | 'revokeReason'
    | 'secondFactorAt'
  >
>;

/** Phiên kèm đúng những cột của tài khoản mà `resolveActor` cần. */
export interface ActorSession {
  sessionId: string;
  accountId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  secondFactorAt: Date | null;
  role: Account['role'];
  status: Account['status'];
  lockedReason: string | null;
}

export interface RotateRefreshInput {
  sessionId: string;
  /** Băm của token client gửi lên — lượt ghi chỉ khớp khi nó vẫn là token đang dùng. */
  expectedHash: string;
  nextHash: string;
  at: Date;
  expiresAt: Date;
}

export interface LockedOnDevice {
  accountId: string;
  lockedAt: Date;
}

export type NewClearance = Pick<
  DeviceClearance,
  'deviceHash' | 'accountId' | 'clearedBy' | 'reason'
> & {
  at: Date;
};

export type NewFlag = Pick<
  AccountFlag,
  'accountId' | 'kind' | 'deviceHash' | 'relatedAccountId' | 'lookupCode'
>;

export interface FlagChanges {
  create: NewFlag[];
  clear: { ids: string[]; clearedBy: string | null; clearedReason: string };
  at: Date;
  events: OutboxEventInput[];
  /** `null` khi hệ thống tự tính lại đánh dấu; người gỡ thì bắt buộc. */
  audit: AuditEntry | null;
}

export interface PageQuery {
  skip: number;
  take: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export type NewIdVerification = Pick<
  IdVerification,
  'accountId' | 'documentType' | 'documentNumberEnc' | 'fullName'
> & { at: Date };

export type IdVerificationPatch = Pick<
  IdVerification,
  'status' | 'reviewedBy' | 'reviewedAt' | 'reason'
>;

// ── INTERFACE ───────────────────────────────────────────────────────────────────────────────────

/**
 * Toàn bộ truy vấn của `identity`, kể cả transaction. Mọi method nhận `at` thay vì gọi `new
 * Date()`: service giữ đồng hồ, nên test với đồng hồ giả tạo được "30 ngày sau" mà không chờ.
 * Đơn vị công việc nhiều bước (khoá, xoá, tiêu mã, đổi đánh dấu) là MỘT method và ghi outbox
 * trong cùng transaction — service đưa `events` vào, không bao giờ thấy `tx`.
 */
export interface IdentityRepository {
  findAccountById(id: string): Promise<Account | null>;
  findAccountByEmail(emailNormalized: string): Promise<Account | null>;
  findAccountSummaries(
    ids: string[],
  ): Promise<Pick<Account, 'id' | 'role' | 'status' | 'displayName'>[]>;
  /** Chỉ tài khoản chưa xoá. */
  findAccountIdsByEmailHashes(hashes: string[]): Promise<Pick<Account, 'id' | 'emailHash'>[]>;
  findAccountByGoogleSub(googleSub: string): Promise<Account | null>;
  createAccount(data: NewAccount): Promise<Account>;
  updateAccount(id: string, patch: AccountPatch): Promise<Account>;
  /**
   * `false` khi mã trong `consumeCodeId` không còn sống — một lượt khác vừa tiêu nó, hoặc lượt đoán
   * sai thứ N vừa huỷ nó. Khi đó KHÔNG gì được ghi: tiêu mã là lượt ghi có điều kiện đứng đầu
   * transaction, nên hai lượt nhập đúng cùng lúc chỉ một lượt đổi được tài khoản.
   */
  applyAccountChange(input: AccountChangeInput): Promise<boolean>;
  /** Xoá HẲN — chỉ cho đăng ký dở dang quá hạn; cascade kéo theo mã, phiên, dấu thiết bị. */
  deleteUnverifiedAccountsBefore(createdBefore: Date): Promise<number>;
  /** Xoá HẲN một tài khoản đã qua 90 ngày chờ — giải phóng email cho lượt đăng ký mới. */
  purgeAccount(id: string): Promise<void>;
  lockAccount(input: LockAccountInput): Promise<void>;
  unlockAccount(input: UnlockAccountInput): Promise<void>;
  softDeleteAccount(input: SoftDeleteAccountInput): Promise<void>;

  findLiveCode(accountId: string, purpose: CodePurpose): Promise<VerificationCode | null>;
  /** Tiêu mã sống cùng mục đích (nếu có) rồi tạo mã mới — một mã sống mỗi mục đích. */
  issueCode(data: NewCode): Promise<VerificationCode>;
  updateCode(id: string, patch: CodePatch): Promise<VerificationCode>;
  /**
   * Cộng một lần sai bằng phép tăng của DB rồi huỷ mã khi chạm trần, cùng transaction. Đọc số lần
   * sai rồi ghi lại thì các lượt đoán song song cùng đọc ra một số cũ và vượt trần (rà soát
   * 10/10/2026); phép tăng giữ khoá dòng nên mỗi lượt thấy đúng số của mình.
   */
  recordWrongCode(input: {
    id: string;
    maxAttempts: number;
    at: Date;
  }): Promise<{ attempts: number; cancelled: boolean }>;
  deleteCodesExpiredBefore(before: Date): Promise<number>;

  createSession(data: NewSession): Promise<Session>;
  findSessionById(id: string): Promise<Session | null>;
  /**
   * Chạy ở mọi request có đăng nhập. JOIN tay vì Prisma 7 chạy `include` thành hai câu (đo 11/10/2026);
   * `hot-paths.db.test.ts` đếm số câu SQL.
   */
  findActorSession(sessionId: string): Promise<ActorSession | null>;
  findSessionByRefreshHash(refreshTokenHash: string): Promise<Session | null>;
  findSessionByPreviousRefreshHash(prevRefreshTokenHash: string): Promise<Session | null>;
  updateSession(id: string, patch: SessionPatch): Promise<Session>;
  /**
   * Xoay token làm mới bằng lượt ghi có điều kiện (token đang dùng vẫn là `expectedHash`, phiên chưa
   * thu hồi). Đọc rồi ghi đè thì hai lượt làm mới cùng lúc đều "thắng" và một client cầm token hỏng
   * (change fix-session-refresh-race). `false` = lượt khác vừa xoay trước, hoặc phiên vừa bị thu hồi.
   */
  rotateRefreshToken(input: RotateRefreshInput): Promise<boolean>;
  /** Phiên chưa thu hồi, mới hoạt động trước. */
  listActiveSessions(accountId: string): Promise<Session[]>;
  revokeSessions(input: RevokeSessionsInput): Promise<number>;
  deleteSessionsInactiveBefore(before: Date): Promise<number>;

  findDevicePosts(deviceHash: string): Promise<DevicePost[]>;
  upsertDevicePost(input: { deviceHash: string; accountId: string; at: Date }): Promise<DevicePost>;
  findLockedAccountsOnDevice(deviceHash: string): Promise<LockedOnDevice[]>;
  findDeviceClearances(deviceHash: string): Promise<DeviceClearance[]>;
  createDeviceClearance(data: NewClearance): Promise<DeviceClearance>;
  findOpenFlags(accountId: string): Promise<AccountFlag[]>;
  findFlagByLookupCode(lookupCode: string): Promise<AccountFlag | null>;
  applyFlagChanges(input: FlagChanges): Promise<void>;

  /** Trong các miền đưa vào, miền nào đang bị chặn (không tính bia mộ). */
  findBlockedDomains(domains: string[]): Promise<string[]>;
  listDisposableDomains(query: PageQuery): Promise<Page<DisposableDomain>>;
  /** Thêm tay; miền đã là bia mộ thì sống lại dưới dạng `manual`. */
  addManualDomain(input: {
    domain: string;
    at: Date;
    audit: AuditEntry;
  }): Promise<DisposableDomain>;
  removeDisposableDomain(input: {
    domain: string;
    removedBy: string;
    at: Date;
    audit: AuditEntry;
  }): Promise<DisposableDomain | null>;
  /** Chỉ thêm miền chưa có dòng — không đụng miền master đã thêm hay đã bỏ. Trả số dòng mới. */
  seedDisposableDomains(domains: string[], at: Date): Promise<number>;
  countDisposableDomains(): Promise<number>;

  createIdVerification(data: NewIdVerification): Promise<IdVerification>;
  findIdVerificationById(id: string): Promise<IdVerification | null>;
  findPendingIdVerification(accountId: string): Promise<IdVerification | null>;
  listIdVerifications(
    query: PageQuery & { status?: IdVerificationStatus },
  ): Promise<Page<IdVerification>>;
  updateIdVerification(
    id: string,
    patch: IdVerificationPatch,
    audit: AuditEntry,
  ): Promise<IdVerification>;
  /** Tài khoản master — tối đa một (spec master-accounts). */
  findMaster(): Promise<Account | null>;
}

// ── PRISMA ──────────────────────────────────────────────────────────────────────────────────────

async function revokeSessionsIn(
  tx: Prisma.TransactionClient,
  input: RevokeSessionsInput,
): Promise<number> {
  const { count } = await tx.session.updateMany({
    where: {
      accountId: input.accountId,
      revokedAt: null,
      ...(input.exceptId === undefined ? {} : { id: { not: input.exceptId } }),
    },
    data: { revokedAt: input.at, revokeReason: input.reason },
  });
  return count;
}

export function createIdentityRepository(prisma: PrismaClient): IdentityRepository {
  return {
    findAccountById: (id) => prisma.account.findUnique({ where: { id } }),
    findAccountByEmail: (emailNormalized) =>
      prisma.account.findUnique({ where: { emailNormalized } }),
    findAccountSummaries: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.account.findMany({
            where: { id: { in: ids } },
            select: { id: true, role: true, status: true, displayName: true },
          }),
    findAccountIdsByEmailHashes: (hashes) =>
      hashes.length === 0
        ? Promise.resolve([])
        : prisma.account.findMany({
            where: { emailHash: { in: hashes }, status: { not: 'deleted' } },
            select: { id: true, emailHash: true },
          }),
    findAccountByGoogleSub: (googleSub) => prisma.account.findUnique({ where: { googleSub } }),
    createAccount: ({ at, ...data }) => prisma.account.create({ data: { ...data, createdAt: at } }),
    updateAccount: (id, patch) => prisma.account.update({ where: { id }, data: patch }),
    applyAccountChange: ({ accountId, patch, consumeCodeId, revokeSessions, at, events }) =>
      prisma.$transaction(async (tx) => {
        if (consumeCodeId) {
          const { count } = await tx.verificationCode.updateMany({
            where: { id: consumeCodeId, consumedAt: null },
            data: { consumedAt: at },
          });
          if (count === 0) return false;
        }
        await tx.account.update({ where: { id: accountId }, data: patch });
        if (revokeSessions) await revokeSessionsIn(tx, { ...revokeSessions, accountId, at });
        await appendEvents(tx, events);
        return true;
      }),
    async deleteUnverifiedAccountsBefore(createdBefore) {
      const { count } = await prisma.account.deleteMany({
        where: { status: 'pending_verification', createdAt: { lt: createdBefore } },
      });
      return count;
    },
    async purgeAccount(id) {
      await prisma.account.delete({ where: { id } });
    },
    lockAccount: ({ accountId, reason, lockedBy, at, events, audit }) =>
      prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: accountId },
          data: { status: 'locked', lockedAt: at, lockedReason: reason, lockedBy },
        });
        await revokeSessionsIn(tx, { accountId, reason: 'account_locked', at });
        await appendEvents(tx, events);
        await appendAudit(tx, audit);
      }),
    unlockAccount: ({ accountId, unlockedBy, at, events, audit }) =>
      prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: accountId },
          data: { status: 'active', lockedAt: null, lockedReason: null, lockedBy: null },
        });
        await tx.accountFlag.updateMany({
          where: { kind: 'device_of_locked_account', relatedAccountId: accountId, clearedAt: null },
          data: {
            clearedAt: at,
            clearedBy: unlockedBy,
            clearedReason: FLAG_CLEARED_REASONS.unlocked,
          },
        });
        await appendEvents(tx, events);
        await appendAudit(tx, audit);
      }),
    softDeleteAccount: ({ accountId, at, events }) =>
      prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: accountId },
          data: { status: 'deleted', deletedAt: at },
        });
        await revokeSessionsIn(tx, { accountId, reason: 'account_deleted', at });
        await appendEvents(tx, events);
      }),

    findLiveCode: (accountId, purpose) =>
      prisma.verificationCode.findFirst({ where: { accountId, purpose, consumedAt: null } }),
    issueCode: ({ at, ...data }) =>
      prisma.$transaction(async (tx) => {
        await tx.verificationCode.updateMany({
          where: { accountId: data.accountId, purpose: data.purpose, consumedAt: null },
          data: { consumedAt: at },
        });
        return tx.verificationCode.create({ data: { ...data, createdAt: at } });
      }),
    updateCode: (id, patch) => prisma.verificationCode.update({ where: { id }, data: patch }),
    recordWrongCode: ({ id, maxAttempts, at }) =>
      prisma.$transaction(async (tx) => {
        const { attempts, consumedAt } = await tx.verificationCode.update({
          where: { id },
          data: { attempts: { increment: 1 } },
          select: { attempts: true, consumedAt: true },
        });
        if (attempts < maxAttempts) return { attempts, cancelled: false };
        if (consumedAt === null) {
          await tx.verificationCode.update({ where: { id }, data: { consumedAt: at } });
        }
        return { attempts, cancelled: true };
      }),
    async deleteCodesExpiredBefore(before) {
      const { count } = await prisma.verificationCode.deleteMany({
        where: { OR: [{ expiresAt: { lt: before } }, { consumedAt: { lt: before } }] },
      });
      return count;
    },

    createSession: ({ at, ...data }) =>
      prisma.session.create({ data: { ...data, createdAt: at, lastActiveAt: at } }),
    findSessionById: (id) => prisma.session.findUnique({ where: { id } }),
    async findActorSession(sessionId) {
      const rows = await prisma.$queryRaw<ActorSession[]>`
        SELECT s.id AS "sessionId", s.account_id AS "accountId", s.revoked_at AS "revokedAt",
               s.expires_at AS "expiresAt", s.second_factor_at AS "secondFactorAt",
               a.role::text AS role, a.status::text AS status, a.locked_reason AS "lockedReason"
          FROM sessions s
          JOIN accounts a ON a.id = s.account_id
         WHERE s.id = ${sessionId}::uuid`;
      return rows[0] ?? null;
    },
    findSessionByRefreshHash: (refreshTokenHash) =>
      prisma.session.findUnique({ where: { refreshTokenHash } }),
    findSessionByPreviousRefreshHash: (prevRefreshTokenHash) =>
      prisma.session.findFirst({ where: { prevRefreshTokenHash } }),
    updateSession: (id, patch) => prisma.session.update({ where: { id }, data: patch }),
    async rotateRefreshToken({ sessionId, expectedHash, nextHash, at, expiresAt }) {
      const { count } = await prisma.session.updateMany({
        where: { id: sessionId, refreshTokenHash: expectedHash, revokedAt: null },
        data: {
          refreshTokenHash: nextHash,
          prevRefreshTokenHash: expectedHash,
          lastActiveAt: at,
          expiresAt,
        },
      });
      return count === 1;
    },
    listActiveSessions: (accountId) =>
      prisma.session.findMany({
        where: { accountId, revokedAt: null },
        orderBy: { lastActiveAt: 'desc' },
      }),
    revokeSessions: (input) => prisma.$transaction((tx) => revokeSessionsIn(tx, input)),
    async deleteSessionsInactiveBefore(before) {
      const { count } = await prisma.session.deleteMany({
        where: { OR: [{ revokedAt: { lt: before } }, { expiresAt: { lt: before } }] },
      });
      return count;
    },

    findDevicePosts: (deviceHash) => prisma.devicePost.findMany({ where: { deviceHash } }),
    upsertDevicePost: ({ deviceHash, accountId, at }) =>
      prisma.devicePost.upsert({
        where: { deviceHash_accountId: { deviceHash, accountId } },
        create: { deviceHash, accountId, firstPostedAt: at, lastPostedAt: at },
        update: { lastPostedAt: at },
      }),
    async findLockedAccountsOnDevice(deviceHash) {
      const rows = await prisma.devicePost.findMany({
        where: { deviceHash, account: { status: 'locked' } },
        select: { accountId: true, account: { select: { lockedAt: true } } },
      });
      return rows.flatMap(({ accountId, account }) =>
        account.lockedAt ? [{ accountId, lockedAt: account.lockedAt }] : [],
      );
    },
    findDeviceClearances: (deviceHash) =>
      prisma.deviceClearance.findMany({ where: { deviceHash } }),
    createDeviceClearance: ({ at, ...data }) =>
      prisma.deviceClearance.create({ data: { ...data, clearedAt: at } }),
    findOpenFlags: (accountId) =>
      prisma.accountFlag.findMany({ where: { accountId, clearedAt: null } }),
    findFlagByLookupCode: (lookupCode) => prisma.accountFlag.findUnique({ where: { lookupCode } }),
    applyFlagChanges: ({ create, clear, at, events, audit }) =>
      prisma.$transaction(async (tx) => {
        if (create.length > 0) {
          await tx.accountFlag.createMany({
            data: create.map((flag) => ({ ...flag, createdAt: at })),
          });
        }
        if (clear.ids.length > 0) {
          await tx.accountFlag.updateMany({
            where: { id: { in: clear.ids }, clearedAt: null },
            data: { clearedAt: at, clearedBy: clear.clearedBy, clearedReason: clear.clearedReason },
          });
        }
        await appendEvents(tx, events);
        if (audit) await appendAudit(tx, audit);
      }),

    async findBlockedDomains(domains) {
      if (domains.length === 0) return [];
      const rows = await prisma.disposableDomain.findMany({
        where: { domain: { in: domains }, removedAt: null },
        select: { domain: true },
      });
      return rows.map((row) => row.domain);
    },
    async listDisposableDomains({ skip, take }) {
      const [items, total] = await Promise.all([
        prisma.disposableDomain.findMany({ orderBy: { domain: 'asc' }, skip, take }),
        prisma.disposableDomain.count(),
      ]);
      return { items, total };
    },
    addManualDomain: ({ domain, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const row = await tx.disposableDomain.upsert({
          where: { domain },
          create: { domain, source: 'manual', addedAt: at },
          update: { source: 'manual', removedAt: null, removedBy: null },
        });
        await appendAudit(tx, audit);
        return row;
      }),
    removeDisposableDomain: ({ domain, removedBy, at, audit }) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.disposableDomain.updateMany({
          where: { domain, removedAt: null },
          data: { removedAt: at, removedBy },
        });
        if (count === 0) return null;
        await appendAudit(tx, audit);
        return tx.disposableDomain.findUnique({ where: { domain } });
      }),
    // ~100k miền trong MỘT câu lệnh (một tham số mảng): nguyên tử — nạp hỏng thì không để lại bảng "có
    // dòng" khiến lần khởi động sau bỏ qua — và một kết nối. Đo 11/10/2026: 0,6 giây, chia lô createMany 11 giây.
    seedDisposableDomains: (domains, at) =>
      prisma.$executeRaw`
        INSERT INTO disposable_domains (domain, source, added_at)
        SELECT unnest(${domains}::text[]), 'seed'::disposable_domain_source, ${at}::timestamptz
        ON CONFLICT (domain) DO NOTHING`,
    countDisposableDomains: () => prisma.disposableDomain.count(),

    createIdVerification: ({ at, ...data }) =>
      prisma.idVerification.create({ data: { ...data, createdAt: at } }),
    findIdVerificationById: (id) => prisma.idVerification.findUnique({ where: { id } }),
    findPendingIdVerification: (accountId) =>
      prisma.idVerification.findFirst({ where: { accountId, status: 'pending' } }),
    async listIdVerifications({ status, skip, take }) {
      const where = status === undefined ? {} : { status };
      const [items, total] = await Promise.all([
        prisma.idVerification.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take }),
        prisma.idVerification.count({ where }),
      ]);
      return { items, total };
    },
    updateIdVerification: (id, patch, audit) =>
      prisma.$transaction(async (tx) => {
        const row = await tx.idVerification.update({ where: { id }, data: patch });
        await appendAudit(tx, audit);
        return row;
      }),
    findMaster: () => prisma.account.findFirst({ where: { role: 'master' } }),
  };
}
