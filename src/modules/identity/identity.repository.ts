import type {
  Account,
  AccountFlag,
  AccountStatus,
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

/**
 * Dấu thay email của tài khoản đã ẩn danh: duy nhất theo mã tài khoản, và không bao giờ trùng một email thật vì mọi
 * đường vào đều đòi email có `@` (C9).
 */
const DELETED_EMAIL_PREFIX = 'deleted:';
const DELETED_DISPLAY_NAME = 'Tài khoản đã xoá';

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
> &
  Partial<Pick<Account, 'googlePictureUrl' | 'avatarFromGoogle'>> & { at: Date };

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
    | 'googlePictureUrl'
    | 'avatarImageId'
    | 'avatarFromGoogle'
    | 'phone'
    | 'emailChangedAt'
    | 'passwordChangedAt'
    | 'showActivity'
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
  'accountId' | 'refreshTokenHash' | 'deviceName' | 'ip' | 'userAgent' | 'expiresAt'
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
  >
>;

/** Phiên kèm đúng những cột của tài khoản mà `resolveActor` cần. */
export interface ActorSession {
  sessionId: string;
  accountId: string;
  revokedAt: Date | null;
  expiresAt: Date;
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
> & {
  /** Chỉ đánh dấu "dùng máy của tài khoản có gậy" (add-strikes) — gậy hết hiệu lực thì đóng theo. */
  relatedStrikeId?: string | null;
};

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
  ): Promise<Pick<Account, 'id' | 'role' | 'status' | 'displayName' | 'createdAt'>[]>;
  /** Mốc "lần cuối hoạt động" — tài khoản đã xoá không ghi: kết nối của nó đóng ngay sau lượt xoá (add-activity-status). */
  recordSeen(accountId: string, at: Date): Promise<void>;
  findActivity(ids: string[]): Promise<Pick<Account, 'id' | 'showActivity' | 'lastSeenAt'>[]>;
  /** Chỉ tài khoản chưa xoá. */
  findAvatarSources(
    ids: string[],
  ): Promise<Pick<Account, 'id' | 'avatarFromGoogle' | 'googlePictureUrl' | 'avatarImageId'>[]>;
  /** Chỉ tài khoản chưa xoá. */
  findAccountIdsByEmailHashes(hashes: string[]): Promise<Pick<Account, 'id' | 'emailHash'>[]>;
  findAccountByGoogleSub(googleSub: string): Promise<Account | null>;
  createAccount(data: NewAccount): Promise<Account>;
  updateAccount(id: string, patch: AccountPatch): Promise<Account>;
  /** Như `updateAccount`, kèm việc của module khác trong cùng transaction (gỡ nhãn ảnh đại diện) — việc đó ném thì không gì được ghi. */
  updateAccountWith(
    id: string,
    patch: AccountPatch,
    alongside: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<Account>;
  /**
   * `false` khi mã trong `consumeCodeId` không còn sống — một lượt khác vừa tiêu nó, hoặc lượt đoán
   * sai thứ N vừa huỷ nó. Khi đó KHÔNG gì được ghi: tiêu mã là lượt ghi có điều kiện đứng đầu
   * transaction, nên hai lượt nhập đúng cùng lúc chỉ một lượt đổi được tài khoản.
   */
  applyAccountChange(input: AccountChangeInput): Promise<boolean>;
  /** Xoá HẲN — chỉ cho đăng ký dở dang quá hạn; cascade kéo theo mã, phiên, dấu thiết bị. */
  deleteUnverifiedAccountsBefore(createdBefore: Date): Promise<number>;
  /** Xoá HẲN một đăng ký dở khi chủ email vào bằng Google; `false` = dòng vừa được xác nhận nên không xoá. */
  deleteUnverifiedAccount(id: string): Promise<boolean>;
  /**
   * Tài khoản đã xoá qua hết thời gian chờ: bỏ email, tên, ảnh, mật khẩu, mã Google, số điện thoại để email
   * và mã Google tự do; giữ dòng, dấu băm email và mọi dòng con (lịch sử chống gian lận — C9). Xoá thật là việc của
   * `add-data-retention`. `false` = dòng không còn ở trạng thái đó (đã ẩn danh, hay chưa hết thời gian chờ).
   */
  anonymizeDeletedAccount(input: { id: string; deletedBefore: Date }): Promise<boolean>;
  // ── HẠN LƯU (add-data-retention) ──
  /** Tài khoản đã xoá trước `deletedBefore` mà `ops` chưa dọn, theo trang con trỏ `id` (tài khoản đang tạm giữ bị bỏ qua). */
  deletedAccountsDue(deletedBefore: Date, after: string | null, limit: number): Promise<string[]>;
  /** Lượt dọn xong: ghi `purged_at`, xoá hồ sơ xác minh giấy tờ (số giấy tờ là dữ liệu cá nhân, không giữ mãi). */
  markAccountPurged(id: string, at: Date): Promise<void>;
  /** Dữ liệu thiết bị quá hạn lưu (TK 8): lượt ghi dấu máy, đánh dấu đã gỡ, địa chỉ mạng của phiên mở trước mốc. */
  purgeDeviceData(
    before: Date,
  ): Promise<{ posts: number; logins: number; flags: number; sessionIps: number }>;
  /**
   * Khoá dòng tài khoản rồi mới đọc trạng thái, ghi trạng thái đó vào `statusBeforeLock` (fix-audit-identity-low,
   * L1). `false` = không có tài khoản, hoặc nó không còn `active` / `pending_verification` (lượt khoá khác vừa chạy)
   * — không ghi gì.
   */
  lockAccount(input: LockAccountInput): Promise<boolean>;
  /**
   * Trả tài khoản về `statusBeforeLock` và gỡ các đánh dấu "dùng máy của tài khoản bị khoá" trỏ tới nó, mỗi đánh dấu
   * một `identity.device.flag_cleared` (L12). `false` = tài khoản không còn bị khoá.
   */
  unlockAccount(input: UnlockAccountInput): Promise<boolean>;
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
  /**
   * Mở phiên dưới trần: khoá theo tài khoản, đẩy phiên còn sống ít hoạt động nhất ra cho đủ chỗ rồi tạo phiên — một
   * transaction, nên đăng nhập cùng lúc không vượt trần (fix-audit-identity-low, L3). Phiên đã hết hạn trượt không
   * chiếm chỗ. `evictedIds` để ngắt realtime sau commit.
   */
  openSessionCapped(
    data: NewSession & { cap: number },
  ): Promise<{ session: Session; evictedIds: string[] }>;
  findSessionById(id: string): Promise<Session | null>;
  /**
   * Chạy ở mọi request có đăng nhập. JOIN tay vì Prisma 7 chạy `include` thành hai câu (đo 11/10/2026);
   * `hot-paths.db.test.ts` đếm số câu SQL.
   */
  findActorSession(sessionId: string): Promise<ActorSession | null>;
  lockAccountStatus(tx: Prisma.TransactionClient, accountId: string): Promise<AccountStatus | null>;
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
  /** Token đẩy gắn phiên (add-notifications): một token một phiên — đang ở phiên khác thì chuyển sang. */
  setPushToken(sessionId: string, token: string): Promise<void>;
  clearPushToken(sessionId: string): Promise<void>;
  /** Expo báo máy đã gỡ app: bỏ token ở phiên nào đang giữ. */
  forgetPushToken(token: string): Promise<void>;
  /** Token của phiên còn sống (chưa thu hồi, chưa hết hạn) của những người này. */
  pushTargets(
    accountIds: string[],
    now: Date,
  ): Promise<{ accountId: string; sessionId: string; token: string }[]>;
  revokeSessions(input: RevokeSessionsInput): Promise<number>;
  deleteSessionsInactiveBefore(before: Date): Promise<number>;

  findDevicePosts(deviceHash: string): Promise<DevicePost[]>;
  upsertDevicePost(input: { deviceHash: string; accountId: string; at: Date }): Promise<DevicePost>;
  /** Dấu đăng nhập (add-login-device-marks): lần đầu giữ nguyên, lần gần nhất = `at`. */
  upsertDeviceLogin(input: { deviceHash: string; accountId: string; at: Date }): Promise<void>;
  findLockedAccountsOnDevice(deviceHash: string): Promise<LockedOnDevice[]>;
  /** Tài khoản khác đã đăng tin từ một máy mà `accountId` cũng đăng tin từ đó, cả hai lượt kể từ `since`. */
  accountsSharingDevice(accountId: string, since: Date): Promise<string[]>;
  activeMasterIds(): Promise<string[]>;
  findDeviceClearances(deviceHash: string): Promise<DeviceClearance[]>;
  createDeviceClearance(data: NewClearance): Promise<DeviceClearance>;
  findOpenFlags(accountId: string): Promise<AccountFlag[]>;
  findFlagByLookupCode(lookupCode: string): Promise<AccountFlag | null>;
  applyFlagChanges(input: FlagChanges): Promise<void>;
  /** Gậy hết hiệu lực: đóng mọi đánh dấu "dùng máy của tài khoản có gậy" trỏ tới nó, mỗi cái một `flag_cleared` (add-strikes). */
  clearFlagsByStrike(strikeId: string, at: Date, reason: string): Promise<number>;

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
  /**
   * Ghi kết quả duyệt có điều kiện "hồ sơ còn chờ" (fix-audit-identity-low, L2): hai người cùng duyệt thì đúng một
   * người thắng. `null` = hồ sơ không còn chờ — không ghi nhật ký.
   */
  decidePendingIdVerification(
    id: string,
    patch: IdVerificationPatch,
    audit: AuditEntry,
  ): Promise<IdVerification | null>;
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

/**
 * Xoá HẲN đăng ký dở dang và báo `identity.account.purged`: gậy đã kế thừa không còn khoá ngoại sang tài khoản
 * (add-data-retention) nên `trust` nghe mà dọn. Chỉ những dòng còn `pending_verification` lúc xoá mới vào sự kiện.
 */
async function purgeUnverifiedIn(tx: Prisma.TransactionClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const purged = await tx.$queryRaw<{ id: string }[]>`
    DELETE FROM accounts WHERE id = ANY(${ids}::uuid[]) AND status = 'pending_verification' RETURNING id::text`;
  if (purged.length > 0) {
    await appendEvents(tx, [
      { type: 'identity.account.purged', payload: { accountIds: purged.map((row) => row.id) } },
    ]);
  }
  return purged.length;
}

export function createIdentityRepository(prisma: PrismaClient): IdentityRepository {
  return {
    findAccountById: (id) => prisma.account.findUnique({ where: { id } }),
    async lockAccountStatus(tx, accountId) {
      const [row] = await tx.$queryRaw<{ status: AccountStatus }[]>`
        SELECT status FROM accounts WHERE id = ${accountId}::uuid FOR SHARE`;
      return row?.status ?? null;
    },
    findAccountByEmail: (emailNormalized) =>
      prisma.account.findUnique({ where: { emailNormalized } }),
    findAccountSummaries: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.account.findMany({
            where: { id: { in: ids } },
            select: { id: true, role: true, status: true, displayName: true, createdAt: true },
          }),
    async recordSeen(accountId, at) {
      await prisma.account.updateMany({
        where: { id: accountId, status: { not: 'deleted' } },
        data: { lastSeenAt: at },
      });
    },
    findActivity: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.account.findMany({
            where: { id: { in: ids }, status: { not: 'deleted' } },
            select: { id: true, showActivity: true, lastSeenAt: true },
          }),
    findAvatarSources: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.account.findMany({
            where: { id: { in: ids }, status: { not: 'deleted' } },
            select: {
              id: true,
              avatarFromGoogle: true,
              googlePictureUrl: true,
              avatarImageId: true,
            },
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
    updateAccountWith: (id, patch, alongside) =>
      prisma.$transaction(async (tx) => {
        await alongside(tx);
        return tx.account.update({ where: { id }, data: patch });
      }),
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
    deleteUnverifiedAccountsBefore: (createdBefore) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.account.findMany({
          where: { status: 'pending_verification', createdAt: { lt: createdBefore } },
          select: { id: true },
        });
        return purgeUnverifiedIn(
          tx,
          rows.map((row) => row.id),
        );
      }),
    deleteUnverifiedAccount: (id) =>
      prisma.$transaction(async (tx) => (await purgeUnverifiedIn(tx, [id])) === 1),
    anonymizeDeletedAccount: ({ id, deletedBefore }) =>
      prisma.$transaction(async (tx) => {
        const tombstone = `${DELETED_EMAIL_PREFIX}${id}`;
        const { count } = await tx.account.updateMany({
          where: {
            id,
            status: 'deleted',
            deletedAt: { lte: deletedBefore },
            emailNormalized: { not: tombstone },
          },
          data: {
            email: tombstone,
            emailNormalized: tombstone,
            displayName: DELETED_DISPLAY_NAME,
            passwordHash: null,
            googleSub: null,
            googlePictureUrl: null,
            avatarImageId: null,
            avatarFromGoogle: false,
            phone: null,
          },
        });
        if (count === 0) return false;
        await tx.verificationCode.deleteMany({ where: { accountId: id } });
        return true;
      }),
    deletedAccountsDue: async (deletedBefore, after, limit) =>
      (
        await prisma.account.findMany({
          where: {
            status: 'deleted',
            deletedAt: { lt: deletedBefore },
            purgedAt: null,
            ...(after ? { id: { gt: after } } : {}),
          },
          orderBy: { id: 'asc' },
          take: limit,
          select: { id: true },
        })
      ).map((row) => row.id),
    markAccountPurged: (id, at) =>
      prisma.$transaction(async (tx) => {
        await tx.idVerification.deleteMany({ where: { accountId: id } });
        await tx.account.update({ where: { id }, data: { purgedAt: at } });
      }),
    async purgeDeviceData(before) {
      const [posts, logins, flags, sessions] = await Promise.all([
        prisma.devicePost.deleteMany({ where: { lastPostedAt: { lt: before } } }),
        prisma.deviceLogin.deleteMany({ where: { lastSeenAt: { lt: before } } }),
        prisma.accountFlag.deleteMany({ where: { clearedAt: { lt: before } } }),
        prisma.session.updateMany({
          where: { createdAt: { lt: before }, ip: { not: null } },
          data: { ip: null },
        }),
      ]);
      return {
        posts: posts.count,
        logins: logins.count,
        flags: flags.count,
        sessionIps: sessions.count,
      };
    },
    lockAccount: ({ accountId, reason, lockedBy, at, events, audit }) =>
      prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ status: AccountStatus }[]>`
          SELECT status FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
        if (row?.status !== 'active' && row?.status !== 'pending_verification') return false;
        await tx.account.update({
          where: { id: accountId },
          data: {
            status: 'locked',
            statusBeforeLock: row.status,
            lockedAt: at,
            lockedReason: reason,
            lockedBy,
          },
        });
        await revokeSessionsIn(tx, { accountId, reason: 'account_locked', at });
        await appendEvents(tx, events);
        await appendAudit(tx, audit);
        return true;
      }),
    unlockAccount: ({ accountId, unlockedBy, at, events, audit }) =>
      prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<
          { status: AccountStatus; status_before_lock: AccountStatus | null }[]
        >`SELECT status, status_before_lock FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
        if (row?.status !== 'locked') return false;
        await tx.account.update({
          where: { id: accountId },
          data: {
            status: row.status_before_lock ?? 'active',
            statusBeforeLock: null,
            lockedAt: null,
            lockedReason: null,
            lockedBy: null,
          },
        });
        const cleared = await tx.accountFlag.updateManyAndReturn({
          where: { kind: 'device_of_locked_account', relatedAccountId: accountId, clearedAt: null },
          data: {
            clearedAt: at,
            clearedBy: unlockedBy,
            clearedReason: FLAG_CLEARED_REASONS.unlocked,
          },
          select: { accountId: true, kind: true },
        });
        await appendEvents(tx, [
          ...events,
          ...cleared.map((flag) => ({
            type: 'identity.device.flag_cleared' as const,
            payload: { accountId: flag.accountId, kind: flag.kind },
          })),
        ]);
        await appendAudit(tx, audit);
        return true;
      }),
    softDeleteAccount: ({ accountId, at, events }) =>
      prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: accountId },
          // Mốc hoạt động là dữ liệu cá nhân không còn việc gì để dùng (cam kết 31).
          data: { status: 'deleted', deletedAt: at, lastSeenAt: null },
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
    openSessionCapped: ({ cap, at, ...data }) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sessions:${data.accountId}`}, 0))`;
        const alive = await tx.session.findMany({
          where: { accountId: data.accountId, revokedAt: null, expiresAt: { gt: at } },
          orderBy: { lastActiveAt: 'desc' },
          select: { id: true },
        });
        // Xếp mới hoạt động trước, nên cuối danh sách là ít hoạt động nhất.
        const evictedIds = alive.slice(Math.max(cap - 1, 0)).map((session) => session.id);
        if (evictedIds.length > 0) {
          await tx.session.updateMany({
            where: { id: { in: evictedIds } },
            data: { revokedAt: at, revokeReason: 'evicted' },
          });
        }
        const session = await tx.session.create({
          data: { ...data, createdAt: at, lastActiveAt: at },
        });
        return { session, evictedIds };
      }),
    findSessionById: (id) => prisma.session.findUnique({ where: { id } }),
    async findActorSession(sessionId) {
      const rows = await prisma.$queryRaw<ActorSession[]>`
        SELECT s.id AS "sessionId", s.account_id AS "accountId", s.revoked_at AS "revokedAt",
               s.expires_at AS "expiresAt", a.role::text AS role, a.status::text AS status, a.locked_reason AS "lockedReason"
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

    setPushToken: (sessionId, token) =>
      prisma.$transaction(async (tx) => {
        await tx.session.updateMany({
          where: { pushToken: token, id: { not: sessionId } },
          data: { pushToken: null },
        });
        await tx.session.update({ where: { id: sessionId }, data: { pushToken: token } });
      }),

    async clearPushToken(sessionId) {
      await prisma.session.update({ where: { id: sessionId }, data: { pushToken: null } });
    },

    async forgetPushToken(token) {
      await prisma.session.updateMany({ where: { pushToken: token }, data: { pushToken: null } });
    },

    async pushTargets(accountIds, now) {
      if (accountIds.length === 0) return [];
      const rows = await prisma.session.findMany({
        where: {
          accountId: { in: accountIds },
          revokedAt: null,
          expiresAt: { gt: now },
          pushToken: { not: null },
        },
        select: { accountId: true, id: true, pushToken: true },
      });
      return rows.flatMap((row) =>
        row.pushToken
          ? [{ accountId: row.accountId, sessionId: row.id, token: row.pushToken }]
          : [],
      );
    },
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
    async upsertDeviceLogin({ deviceHash, accountId, at }) {
      await prisma.deviceLogin.upsert({
        where: { deviceHash_accountId: { deviceHash, accountId } },
        create: { deviceHash, accountId, firstSeenAt: at, lastSeenAt: at },
        update: { lastSeenAt: at },
      });
    },
    // Hai nguồn dấu máy (đăng tin, đăng nhập) hợp lại rồi tự nối theo máy: A đăng tin, B chỉ đăng nhập cùng máy vẫn là
    // một cặp (add-login-device-marks). Mỗi nguồn lọc cửa sổ riêng trước khi nối.
    async accountsSharingDevice(accountId, since) {
      const rows = await prisma.$queryRaw<{ account_id: string }[]>`
        WITH marks AS (
          SELECT device_hash, account_id FROM device_posts WHERE last_posted_at >= ${since}
          UNION ALL
          SELECT device_hash, account_id FROM device_logins WHERE last_seen_at >= ${since}
        )
        SELECT DISTINCT other.account_id::text AS account_id
          FROM marks mine
          JOIN marks other ON other.device_hash = mine.device_hash AND other.account_id <> mine.account_id
         WHERE mine.account_id = ${accountId}::uuid`;
      return rows.map((row) => row.account_id);
    },

    async activeMasterIds() {
      const rows = await prisma.account.findMany({
        where: { role: 'master', status: 'active' },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },

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
    clearFlagsByStrike: (strikeId, at, reason) =>
      prisma.$transaction(async (tx) => {
        const open = await tx.accountFlag.findMany({
          where: { kind: 'device_of_struck_account', relatedStrikeId: strikeId, clearedAt: null },
        });
        if (open.length === 0) return 0;
        await tx.accountFlag.updateMany({
          where: { id: { in: open.map((flag) => flag.id) } },
          data: { clearedAt: at, clearedBy: null, clearedReason: reason },
        });
        await appendEvents(
          tx,
          open.map((flag) => ({
            type: 'identity.device.flag_cleared' as const,
            payload: { accountId: flag.accountId, kind: flag.kind },
          })),
        );
        return open.length;
      }),

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
    decidePendingIdVerification: (id, patch, audit) =>
      prisma.$transaction(async (tx) => {
        const [row] = await tx.idVerification.updateManyAndReturn({
          where: { id, status: 'pending' },
          data: patch,
        });
        if (!row) return null;
        await appendAudit(tx, audit);
        return row;
      }),
    findMaster: () => prisma.account.findFirst({ where: { role: 'master' } }),
  };
}
