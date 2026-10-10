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
}

export interface UnlockAccountInput {
  accountId: string;
  unlockedBy: string;
  at: Date;
  events: OutboxEventInput[];
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
  findAccountByGoogleSub(googleSub: string): Promise<Account | null>;
  createAccount(data: NewAccount): Promise<Account>;
  updateAccount(id: string, patch: AccountPatch): Promise<Account>;
  applyAccountChange(input: AccountChangeInput): Promise<void>;
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
  deleteCodesExpiredBefore(before: Date): Promise<number>;

  createSession(data: NewSession): Promise<Session>;
  findSessionById(id: string): Promise<Session | null>;
  findSessionByRefreshHash(refreshTokenHash: string): Promise<Session | null>;
  findSessionByPreviousRefreshHash(prevRefreshTokenHash: string): Promise<Session | null>;
  updateSession(id: string, patch: SessionPatch): Promise<Session>;
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
  addManualDomain(input: { domain: string; at: Date }): Promise<DisposableDomain>;
  removeDisposableDomain(input: {
    domain: string;
    removedBy: string;
    at: Date;
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
  updateIdVerification(id: string, patch: IdVerificationPatch): Promise<IdVerification>;
}

// ── PRISMA ──────────────────────────────────────────────────────────────────────────────────────

/** 3 tham số mỗi dòng → 15000 tham số mỗi lô, dưới xa trần 65535 của Postgres. */
const SEED_BATCH_SIZE = 5_000;

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
    findAccountByGoogleSub: (googleSub) => prisma.account.findUnique({ where: { googleSub } }),
    createAccount: ({ at, ...data }) => prisma.account.create({ data: { ...data, createdAt: at } }),
    updateAccount: (id, patch) => prisma.account.update({ where: { id }, data: patch }),
    applyAccountChange: ({ accountId, patch, consumeCodeId, revokeSessions, at, events }) =>
      prisma.$transaction(async (tx) => {
        if (consumeCodeId) {
          await tx.verificationCode.update({
            where: { id: consumeCodeId },
            data: { consumedAt: at },
          });
        }
        await tx.account.update({ where: { id: accountId }, data: patch });
        if (revokeSessions) await revokeSessionsIn(tx, { ...revokeSessions, accountId, at });
        await appendEvents(tx, events);
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
    lockAccount: ({ accountId, reason, lockedBy, at, events }) =>
      prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: accountId },
          data: { status: 'locked', lockedAt: at, lockedReason: reason, lockedBy },
        });
        await revokeSessionsIn(tx, { accountId, reason: 'account_locked', at });
        await appendEvents(tx, events);
      }),
    unlockAccount: ({ accountId, unlockedBy, at, events }) =>
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
    async deleteCodesExpiredBefore(before) {
      const { count } = await prisma.verificationCode.deleteMany({
        where: { OR: [{ expiresAt: { lt: before } }, { consumedAt: { lt: before } }] },
      });
      return count;
    },

    createSession: ({ at, ...data }) =>
      prisma.session.create({ data: { ...data, createdAt: at, lastActiveAt: at } }),
    findSessionById: (id) => prisma.session.findUnique({ where: { id } }),
    findSessionByRefreshHash: (refreshTokenHash) =>
      prisma.session.findUnique({ where: { refreshTokenHash } }),
    findSessionByPreviousRefreshHash: (prevRefreshTokenHash) =>
      prisma.session.findFirst({ where: { prevRefreshTokenHash } }),
    updateSession: (id, patch) => prisma.session.update({ where: { id }, data: patch }),
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
    applyFlagChanges: ({ create, clear, at, events }) =>
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
    addManualDomain: ({ domain, at }) =>
      prisma.disposableDomain.upsert({
        where: { domain },
        create: { domain, source: 'manual', addedAt: at },
        update: { source: 'manual', removedAt: null, removedBy: null },
      }),
    async removeDisposableDomain({ domain, removedBy, at }) {
      const { count } = await prisma.disposableDomain.updateMany({
        where: { domain, removedAt: null },
        data: { removedAt: at, removedBy },
      });
      return count === 0 ? null : prisma.disposableDomain.findUnique({ where: { domain } });
    },
    async seedDisposableDomains(domains, at) {
      // Hạt giống ~100k dòng: chia lô để không vượt trần 65535 tham số của một câu lệnh Postgres.
      const batches: string[][] = [];
      for (let start = 0; start < domains.length; start += SEED_BATCH_SIZE) {
        batches.push(domains.slice(start, start + SEED_BATCH_SIZE));
      }
      const results = await Promise.all(
        batches.map((batch) =>
          prisma.disposableDomain.createMany({
            data: batch.map((domain) => ({ domain, source: 'seed', addedAt: at })),
            skipDuplicates: true,
          }),
        ),
      );
      return results.reduce((sum, { count }) => sum + count, 0);
    },
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
    updateIdVerification: (id, patch) =>
      prisma.idVerification.update({ where: { id }, data: patch }),
  };
}
