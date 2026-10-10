import { randomInt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';

import type { Actor, ActorResolver } from '../../common/auth/actor.js';
import type { PrivilegeSource } from '../../common/auth/privilege-source.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import { hmacHex, randomToken, sha256Hex, type SecretBox } from '../../common/crypto/secrets.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../common/errors/app-error.js';
import { toPage, type PaginationQuery, toSkipTake } from '../../common/schemas/pagination.js';
import { formatDateVN, formatTimeVN } from '../../common/time/time.js';
import type { Jobs } from '../../lib/jobs.js';
import { domainSuffixes, hashEmail, normalizeEmail } from './email.calc.js';
import { IDENTITY_JOBS, parseDomainList, type SendMailJob } from './identity.jobs.js';
import type {
  Account,
  AccountFlag,
  DisposableDomain,
  IdentityRepository,
  IdVerification,
  OutboxEventInput,
  Session,
  VerificationCode,
} from './identity.repository.js';
import type { CodePurpose } from './identity.schema.js';
import {
  checkPassword,
  hashPassword,
  type PasswordIssue,
  verifyPassword,
} from './password.calc.js';
import { isReservedName } from './reserved-names.js';
import type { GoogleTokenVerifier } from './google.verifier.js';
import { hashDeviceId, requiredDeviceFlags, type RequiredFlag } from './device.calc.js';
import { generateLookupCode, normalizeLookupCode } from './lookup-code.calc.js';
import { FLAG_CLEARED_REASONS } from './identity.schema.js';

export interface IdentityServiceDeps {
  repository: IdentityRepository;
  /** Gửi thư đi qua việc `identity.send-mail`, không gửi trong request — SMTP chậm không làm đăng ký trả 500. */
  jobs: Jobs;
  privilegeSource: PrivilegeSource;
  config: RuntimeConfig;
  /** Đồng hồ tiêm được: test tạo "30 ngày sau" mà không chờ. */
  clock: () => Date;
  /** `IDENTITY_HASH_KEY` — băm email, mã thiết bị và mã xác nhận. */
  hashKey: string;
  /** Mã hoá bí mật TOTP, số giấy tờ, và mã xác nhận trên đường tới việc gửi thư. */
  secrets: SecretBox;
  googleVerifier: GoogleTokenVerifier;
}

export interface GoogleLoginInput {
  idToken: string;
  deviceName: string;
  ip: string | null;
  userAgent: string | null;
}

export interface PublicProfileDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  phone: { number: string; verified: false } | null;
}

export interface MeDto extends PublicProfileDto {
  email: string;
  emailVerified: boolean;
  role: Account['role'];
  twoFactorEnabled: boolean;
}

export interface FlagDto {
  lookupCode: string;
  kind: AccountFlag['kind'];
  accountId: string;
  relatedAccountId: string | null;
  createdAt: string;
  clearedAt: string | null;
  clearedReason: string | null;
}

export interface IdVerificationInput {
  documentType: string;
  documentNumber: string;
  fullName: string;
}

export interface IdVerificationDecision {
  status: 'verified' | 'rejected';
  reason?: string | undefined;
}

export interface IdVerificationDto {
  id: string;
  accountId: string;
  documentType: string;
  fullName: string;
  status: IdVerification['status'];
  createdAt: string;
  reviewedAt: string | null;
  reason: string | null;
}

export interface PatchMeInput {
  displayName?: string | undefined;
  phone?: string | null | undefined;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginInput {
  email: string;
  password: string;
  totpCode?: string | undefined;
  deviceName: string;
  ip: string | null;
  userAgent: string | null;
}

/** Phiên vừa mở: route ký access token từ `sessionId` và quyết định refresh token đi body hay cookie. */
export interface SessionOpened {
  sessionId: string;
  refreshToken: string;
}

/** Không bao giờ mang `refreshTokenHash` hay `ip` — danh sách thiết bị chỉ để người dùng nhận ra máy của mình. */
export interface SessionDto {
  id: string;
  deviceName: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export interface DisposableDomainDto {
  domain: string;
  source: DisposableDomain['source'];
  addedAt: string;
  removedAt: string | null;
}

export interface IdentityService extends ActorResolver {
  register(input: RegisterInput): Promise<{ accountId: string }>;
  verifyEmail(input: { email: string; code: string }): Promise<void>;
  resendCode(input: { email: string }): Promise<void>;

  login(input: LoginInput): Promise<SessionOpened>;
  refresh(refreshToken: string): Promise<SessionOpened>;
  logout(actor: Actor): Promise<void>;
  listSessions(actor: Actor): Promise<SessionDto[]>;
  revokeSession(actor: Actor, sessionId: string): Promise<void>;
  revokeOtherSessions(actor: Actor): Promise<void>;

  forgotPassword(input: { email: string }): Promise<void>;
  resetPassword(input: { email: string; code: string; password: string }): Promise<void>;
  changePassword(
    actor: Actor,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void>;

  setupTwoFactor(actor: Actor): Promise<{ otpauthUri: string }>;
  confirmTwoFactor(actor: Actor, input: { code: string }): Promise<void>;

  loginWithGoogle(input: GoogleLoginInput): Promise<SessionOpened>;

  getPublicProfile(accountId: string): Promise<PublicProfileDto>;
  getMe(actor: Actor): Promise<MeDto>;
  updateMe(actor: Actor, input: PatchMeInput): Promise<MeDto>;
  requestEmailChange(actor: Actor, input: { email: string }): Promise<void>;
  confirmEmailChange(actor: Actor, input: { code: string }): Promise<void>;

  lockAccount(actor: Actor, accountId: string, reason: string): Promise<void>;
  unlockAccount(actor: Actor, accountId: string): Promise<void>;
  deleteMyAccount(actor: Actor): Promise<void>;
  requestDeletion(input: { email: string; password: string }): Promise<void>;

  /** `add-listings` gọi khi gửi tin; change này chưa có route nào gọi. */
  recordListingSubmission(accountId: string, deviceId: string): Promise<void>;
  getFlag(lookupCode: string): Promise<FlagDto>;
  clearFlag(actor: Actor, lookupCode: string, reason: string): Promise<void>;

  submitIdVerification(actor: Actor, input: IdVerificationInput): Promise<IdVerificationDto>;
  listIdVerifications(
    query: PaginationQuery & { status?: IdVerification['status'] | undefined },
  ): Promise<ReturnType<typeof toPage<IdVerificationDto>>>;
  decideIdVerification(
    actor: Actor,
    id: string,
    decision: IdVerificationDecision,
  ): Promise<IdVerificationDto>;

  isDisposableEmail(email: string): Promise<boolean>;
  listDisposableDomains(
    query: PaginationQuery,
  ): Promise<ReturnType<typeof toPage<DisposableDomainDto>>>;
  addDisposableDomain(domain: string): Promise<DisposableDomainDto>;
  removeDisposableDomain(domain: string, actorId: string): Promise<void>;
  /** Nạp hạt giống trong repo khi bảng rỗng — chạy lúc khởi động, idempotent. Trả số dòng thêm. */
  seedDisposableDomainsIfEmpty(): Promise<number>;
}

const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;
const DAY_MS = 86_400_000;
const CODE_DIGITS = 6;
const TOTP_ISSUER = 'Ghim';
/** Một bước 30 giây mỗi phía: đồng hồ điện thoại lệch vài giây là chuyện thường, không phải tấn công. */
const TOTP_EPOCH_TOLERANCE = 1;

const PASSWORD_MESSAGES: Record<PasswordIssue, (min: number, max: number) => string> = {
  too_short: (min) => `Mật khẩu cần ít nhất ${min} ký tự`,
  too_long: (_min, max) => `Mật khẩu tối đa ${max} ký tự`,
  common: () => 'Mật khẩu này quá phổ biến, dễ bị đoán — chọn mật khẩu khác',
};

function toDisposableDomainDto(row: DisposableDomain): DisposableDomainDto {
  return {
    domain: row.domain,
    source: row.source,
    addedAt: row.addedAt.toISOString(),
    removedAt: row.removedAt?.toISOString() ?? null,
  };
}

function toFlagDto(flag: AccountFlag): FlagDto {
  return {
    lookupCode: flag.lookupCode,
    kind: flag.kind,
    accountId: flag.accountId,
    relatedAccountId: flag.relatedAccountId,
    createdAt: flag.createdAt.toISOString(),
    clearedAt: flag.clearedAt?.toISOString() ?? null,
    clearedReason: flag.clearedReason,
  };
}

function toIdVerificationDto(row: IdVerification): IdVerificationDto {
  return {
    id: row.id,
    accountId: row.accountId,
    documentType: row.documentType,
    fullName: row.fullName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reason: row.reason,
  };
}

/** Partial unique là (tài khoản, loại, máy): hai tài khoản bị khoá trên cùng máy chỉ cho ra MỘT đánh dấu. */
function oneFlagPerKind(required: RequiredFlag[]): RequiredFlag[] {
  const byKind = new Map<RequiredFlag['kind'], RequiredFlag>();
  for (const flag of required) if (!byKind.has(flag.kind)) byKind.set(flag.kind, flag);
  return [...byKind.values()];
}

function toSessionDto(session: Session, currentId: string): SessionDto {
  return {
    id: session.id,
    deviceName: session.deviceName,
    createdAt: session.createdAt.toISOString(),
    lastActiveAt: session.lastActiveAt.toISOString(),
    current: session.id === currentId,
  };
}

function toPublicProfile(account: Account): PublicProfileDto {
  return {
    id: account.id,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    joinedAt: account.createdAt.toISOString(),
    phone: account.phone === null ? null : { number: account.phone, verified: false },
  };
}

function toMe(account: Account): MeDto {
  return {
    ...toPublicProfile(account),
    email: account.email,
    emailVerified: account.status === 'active',
    role: account.role,
    twoFactorEnabled: account.totpEnabledAt !== null,
  };
}

/** Tên lấy từ Google có thể trùng tên dành riêng; khi đó dùng phần trước `@` — vẫn là của chính người đó. */
function displayNameFromGoogle(name: string | null, email: string): string {
  const candidate = name?.trim() || email.slice(0, email.indexOf('@'));
  return isReservedName(candidate) ? email.slice(0, email.indexOf('@')) : candidate;
}

function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const codeInvalid = (message = 'Mã không đúng'): BadRequestError =>
  new BadRequestError(message, 'CODE_INVALID');

const codeExpired = (): BadRequestError =>
  new BadRequestError('Mã đã hết hiệu lực, xin gửi lại mã mới', 'CODE_EXPIRED');

/** Sai email và sai mật khẩu nói CÙNG một câu: không để lộ email nào đã có tài khoản (spec sessions). */
const invalidCredentials = (message = 'Email hoặc mật khẩu không đúng'): UnauthorizedError =>
  new UnauthorizedError(message, 'INVALID_CREDENTIALS');

const sessionRevoked = (): UnauthorizedError =>
  new UnauthorizedError('Phiên đã bị thu hồi, đăng nhập lại', 'SESSION_REVOKED');

const sessionExpired = (): UnauthorizedError =>
  new UnauthorizedError('Phiên đã hết hạn vì lâu không dùng, đăng nhập lại', 'SESSION_EXPIRED');

const accountLocked = (account: Account): ForbiddenError =>
  new ForbiddenError(
    `Tài khoản đang bị khoá: ${account.lockedReason ?? 'liên hệ hỗ trợ'}`,
    'ACCOUNT_LOCKED',
  );

const emailTaken = (): ConflictError =>
  new ConflictError(
    'Email này đã có tài khoản — đăng nhập hoặc dùng "quên mật khẩu"',
    'EMAIL_TAKEN',
  );

const assertDisplayNameAllowed = (displayName: string): void => {
  if (isReservedName(displayName)) {
    throw new BadRequestError(
      'Tên này dành cho bộ phận quản lý Ghim, chọn tên khác',
      'DISPLAY_NAME_RESERVED',
    );
  }
};

/**
 * Ghép bằng factory, không class: deps là tham số nên test dựng service với repository giả và
 * đồng hồ giả, không mock module. Service không thấy `request`/`reply` và không import Prisma.
 */
export function createIdentityService(deps: IdentityServiceDeps): IdentityService {
  const { repository, jobs, privilegeSource, config, clock, hashKey, secrets, googleVerifier } =
    deps;

  const hashCode = (code: string): string => hmacHex(hashKey, 'code', code);

  const isPrivileged = async (account: Account): Promise<boolean> =>
    account.role === 'master' || privilegeSource.isStaff(account.id);

  const idleExpiry = (at: Date): Date =>
    new Date(at.getTime() + config.get('identity.sessionIdleDays') * DAY_MS);

  const passwordIssue = (password: string): BadRequestError | null => {
    const min = config.get('identity.passwordMinLength');
    const max = config.get('identity.passwordMaxLength');
    const issue = checkPassword(password, { min, max });
    return issue ? new BadRequestError(PASSWORD_MESSAGES[issue](min, max), 'PASSWORD_WEAK') : null;
  };

  /** Tiêu mã sống cùng mục đích, tạo mã mới, xếp việc gửi thư. Mã thô chỉ sống trong hàm này. */
  const issueAndSendCode = async (
    account: Account,
    purpose: CodePurpose,
    to: string,
    at: Date,
    targetEmail: string | null = null,
  ): Promise<void> => {
    const code = randomInt(0, 10 ** CODE_DIGITS)
      .toString()
      .padStart(CODE_DIGITS, '0');
    const ttlMinutes = config.get('identity.codeTtlMinutes');
    await repository.issueCode({
      accountId: account.id,
      purpose,
      codeHash: hashCode(code),
      targetEmail,
      expiresAt: new Date(at.getTime() + ttlMinutes * MINUTE_MS),
      at,
    });
    await jobs.send<SendMailJob>(IDENTITY_JOBS.sendMail, {
      to,
      purpose,
      sealedCode: secrets.seal(code),
      ttlMinutes,
    });
  };

  /** Cùng luật cho ba mục đích: cách lần gửi trước ít nhất 60 giây (giá trị khởi đầu). */
  const assertResendAllowed = async (
    accountId: string,
    purpose: CodePurpose,
    at: Date,
  ): Promise<void> => {
    const live = await repository.findLiveCode(accountId, purpose);
    if (!live) return;
    const readyAt = new Date(
      live.createdAt.getTime() + config.get('identity.resendCooldownSeconds') * SECOND_MS,
    );
    if (readyAt > at) {
      const seconds = Math.ceil((readyAt.getTime() - at.getTime()) / SECOND_MS);
      throw new TooManyRequestsError(
        `Xin gửi lại mã sau ${seconds} giây (lúc ${formatTimeVN(readyAt)})`,
        'RESEND_TOO_SOON',
      );
    }
  };

  /**
   * Kiểm mã: hết hạn / không có mã sống → CODE_EXPIRED; sai → đếm lần, lần thứ 5 huỷ mã; đúng thì
   * trả mã để người gọi tiêu nó cùng hệ quả trong một transaction.
   */
  const matchLiveCode = async (
    accountId: string,
    purpose: CodePurpose,
    code: string,
    at: Date,
  ): Promise<VerificationCode> => {
    const live = await repository.findLiveCode(accountId, purpose);
    if (!live || live.expiresAt <= at) throw codeExpired();
    if (sameHash(live.codeHash, hashCode(code))) return live;

    const attempts = live.attempts + 1;
    const max = config.get('identity.codeMaxAttempts');
    if (attempts >= max) {
      await repository.updateCode(live.id, { attempts, consumedAt: at });
      throw codeInvalid(`Sai mã ${max} lần, mã đã bị huỷ — xin gửi lại mã mới`);
    }
    await repository.updateCode(live.id, { attempts });
    throw codeInvalid();
  };

  const totpMatches = async (secretEnc: string, token: string): Promise<boolean> => {
    const result = await verifyTotp({
      secret: secrets.open(secretEnc),
      token,
      epochTolerance: TOTP_EPOCH_TOLERANCE,
    });
    return result.valid;
  };

  /**
   * Mở phiên: đủ trần thì đẩy phiên ít hoạt động nhất ra chứ không từ chối (spec sessions) —
   * người thật hiếm khi nhớ mình còn phiên ở đâu. Phiên đã hết hạn trượt không chiếm chỗ.
   */
  const openSession = async (
    account: Account,
    input: Pick<LoginInput, 'deviceName' | 'ip' | 'userAgent'> & { secondFactorAt: Date | null },
    at: Date,
  ): Promise<SessionOpened> => {
    const cap = (await isPrivileged(account))
      ? config.get('identity.sessionCapPrivileged')
      : config.get('identity.sessionCapUser');
    const alive = (await repository.listActiveSessions(account.id)).filter(
      (session) => session.expiresAt > at,
    );
    const overflow = alive.length + 1 - cap;
    if (overflow > 0) {
      // listActiveSessions xếp mới hoạt động trước, nên cuối danh sách là ít hoạt động nhất.
      await Promise.all(
        alive
          .slice(-overflow)
          .map((session) =>
            repository.updateSession(session.id, { revokedAt: at, revokeReason: 'evicted' }),
          ),
      );
    }

    const refreshToken = randomToken();
    const session = await repository.createSession({
      accountId: account.id,
      refreshTokenHash: sha256Hex(refreshToken),
      deviceName: input.deviceName,
      ip: input.ip,
      userAgent: input.userAgent,
      secondFactorAt: input.secondFactorAt,
      expiresAt: idleExpiry(at),
      at,
    });
    return { sessionId: session.id, refreshToken };
  };

  const isDisposableEmail = async (email: string): Promise<boolean> => {
    const blocked = await repository.findBlockedDomains(domainSuffixes(email));
    return blocked.length > 0;
  };

  const accountOf = async (actor: Actor): Promise<Account> => {
    const account = await repository.findAccountById(actor.accountId);
    if (!account) throw sessionRevoked();
    return account;
  };

  /**
   * Luật "mỗi email một tài khoản" chung cho đăng ký, Google và đổi email: tài khoản còn sống →
   * EMAIL_TAKEN; đã xoá trong 90 ngày chờ → EMAIL_PENDING_DELETION kèm ngày; qua 90 ngày → xoá
   * hẳn dòng cũ để email tự do. Trả về dòng đang sống nếu có, để người gọi quyết nối hay từ chối.
   */
  const claimEmail = async (
    emailNormalized: string,
    at: Date,
    { ignoreAccountId }: { ignoreAccountId?: string } = {},
  ): Promise<Account | null> => {
    const existing = await repository.findAccountByEmail(emailNormalized);
    if (!existing || existing.id === ignoreAccountId) return null;
    if (existing.status !== 'deleted' || !existing.deletedAt) return existing;
    const reopenAt = new Date(
      existing.deletedAt.getTime() + config.get('identity.deletedEmailHoldDays') * DAY_MS,
    );
    if (reopenAt > at) {
      throw new ConflictError(
        `Email này thuộc một tài khoản vừa xoá, đăng ký lại được từ ${formatDateVN(reopenAt)}`,
        'EMAIL_PENDING_DELETION',
      );
    }
    // Hết hạn chờ: dòng cũ chỉ còn giữ chỗ email. Xoá hẳn ở đây là việc `add-data-retention`
    // sẽ làm theo lịch; làm ngay để email đăng ký lại được như email mới (spec).
    await repository.purgeAccount(existing.id);
    return null;
  };

  const assertNotDisposable = async (email: string): Promise<void> => {
    if (await isDisposableEmail(email)) {
      throw new BadRequestError(
        'Email dùng một lần không đăng ký được — dùng email thường của bạn',
        'EMAIL_DISPOSABLE',
      );
    }
  };

  /** Xoá là xoá mềm: giữ dòng 90 ngày (email chưa dùng lại được, báo cáo còn xử được), xoá hẳn là việc của `add-data-retention`. */
  const softDelete = async (account: Account): Promise<void> => {
    if (account.status === 'locked') {
      throw new ConflictError(
        `Tài khoản đang bị khoá (${account.lockedReason ?? 'liên hệ hỗ trợ'}) nên chưa xoá được`,
        'ACCOUNT_DELETE_BLOCKED',
      );
    }
    await repository.softDeleteAccount({
      accountId: account.id,
      at: clock(),
      events: [{ type: 'identity.account.deleted', payload: { accountId: account.id } }],
    });
  };

  const resolveActor = async (sessionId: string): Promise<Actor> => {
    const now = clock();
    const session = await repository.findSessionById(sessionId);
    if (!session || session.revokedAt) throw sessionRevoked();
    if (session.expiresAt <= now) throw sessionExpired();

    const account = await repository.findAccountById(session.accountId);
    // Tài khoản đã xoá thì phiên đã bị thu hồi lúc xoá; nhánh này chỉ bắt dữ liệu lệch.
    if (!account || account.status === 'deleted') throw sessionRevoked();
    if (account.status === 'locked') throw accountLocked(account);

    return {
      accountId: account.id,
      role: account.role,
      sessionId: session.id,
      secondFactorAt: session.secondFactorAt,
      emailVerified: account.status === 'active',
    };
  };

  return {
    resolveActor,

    // ── ĐĂNG KÝ ─────────────────────────────────────────────────────────────────────────────────

    async register({ email, password, displayName }) {
      const now = clock();
      const weak = passwordIssue(password);
      if (weak) throw weak;
      assertDisplayNameAllowed(displayName);
      await assertNotDisposable(email);

      const emailNormalized = normalizeEmail(email);
      if (await claimEmail(emailNormalized, now)) throw emailTaken();

      const account = await repository.createAccount({
        email: email.trim(),
        emailNormalized,
        emailHash: hashEmail(emailNormalized, hashKey),
        passwordHash: await hashPassword(password),
        googleSub: null,
        status: 'pending_verification',
        displayName: displayName.trim(),
        at: now,
      });
      await issueAndSendCode(account, 'email_verify', account.email, now);
      return { accountId: account.id };
    },

    async verifyEmail({ email, code }) {
      const now = clock();
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      if (!account) throw codeInvalid();
      // Nhập lại mã sau khi đã xác nhận (app gửi hai lần) không phải lỗi.
      if (account.status === 'active') return;
      if (account.status !== 'pending_verification') throw codeInvalid();

      const live = await matchLiveCode(account.id, 'email_verify', code, now);
      await repository.applyAccountChange({
        accountId: account.id,
        consumeCodeId: live.id,
        patch: { status: 'active' },
        at: now,
        events: [{ type: 'identity.account.verified', payload: { accountId: account.id } }],
      });
    },

    async resendCode({ email }) {
      const now = clock();
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      // Không có tài khoản hay đã xác nhận rồi: trả 200 như thường, không lộ email nào đã đăng ký.
      if (!account || account.status !== 'pending_verification') return;
      await assertResendAllowed(account.id, 'email_verify', now);
      await issueAndSendCode(account, 'email_verify', account.email, now);
    },

    // ── PHIÊN ───────────────────────────────────────────────────────────────────────────────────

    async login({ email, password, totpCode, deviceName, ip, userAgent }) {
      const now = clock();
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      // Tài khoản chỉ có Google không có mật khẩu: với người gõ mật khẩu, nó như không tồn tại.
      if (!account || !account.passwordHash || account.status === 'deleted') {
        throw invalidCredentials();
      }
      if (!(await verifyPassword(account.passwordHash, password))) throw invalidCredentials();
      // Sai mật khẩu đã bị chặn ở trên: chỉ chủ tài khoản mới được biết lý do khoá.
      if (account.status === 'locked') throw accountLocked(account);

      let secondFactorAt: Date | null = null;
      if (account.totpEnabledAt && account.totpSecretEnc && (await isPrivileged(account))) {
        if (!totpCode) throw invalidCredentials('Tài khoản này cần mã từ ứng dụng tạo mã');
        if (!(await totpMatches(account.totpSecretEnc, totpCode))) throw invalidCredentials();
        secondFactorAt = now;
      }

      return openSession(account, { deviceName, ip, userAgent, secondFactorAt }, now);
    },

    async refresh(refreshToken) {
      const now = clock();
      const hash = sha256Hex(refreshToken);
      const session = await repository.findSessionByRefreshHash(hash);
      if (!session) {
        // Token đã bị xoay mà còn được gửi lên: hoặc client lỗi, hoặc token đã lộ. Cả hai đều
        // không đáng giữ phiên — thu hồi, người dùng thật chỉ cần đăng nhập lại.
        const reused = await repository.findSessionByPreviousRefreshHash(hash);
        if (reused && !reused.revokedAt) {
          await repository.updateSession(reused.id, {
            revokedAt: now,
            revokeReason: 'refresh_reuse',
          });
        }
        throw sessionRevoked();
      }
      if (session.revokedAt) throw sessionRevoked();
      if (session.expiresAt <= now) throw sessionExpired();

      const account = await repository.findAccountById(session.accountId);
      if (!account || account.status === 'deleted') throw sessionRevoked();
      if (account.status === 'locked') throw accountLocked(account);

      const next = randomToken();
      await repository.updateSession(session.id, {
        refreshTokenHash: sha256Hex(next),
        prevRefreshTokenHash: session.refreshTokenHash,
        lastActiveAt: now,
        expiresAt: idleExpiry(now),
      });
      return { sessionId: session.id, refreshToken: next };
    },

    async logout(actor) {
      await repository.updateSession(actor.sessionId, {
        revokedAt: clock(),
        revokeReason: 'logout',
      });
    },

    async listSessions(actor) {
      const now = clock();
      const sessions = await repository.listActiveSessions(actor.accountId);
      return sessions
        .filter((session) => session.expiresAt > now)
        .map((session) => toSessionDto(session, actor.sessionId));
    },

    async revokeSession(actor, sessionId) {
      const session = await repository.findSessionById(sessionId);
      // Phiên của người khác trả 404 như phiên không tồn tại: không xác nhận mã phiên nào có thật.
      if (!session || session.accountId !== actor.accountId || session.revokedAt) {
        throw new NotFoundError('Không có phiên này');
      }
      await repository.updateSession(sessionId, {
        revokedAt: clock(),
        revokeReason: 'revoked_by_user',
      });
    },

    async revokeOtherSessions(actor) {
      await repository.revokeSessions({
        accountId: actor.accountId,
        reason: 'revoked_by_user',
        at: clock(),
        exceptId: actor.sessionId,
      });
    },

    async loginWithGoogle({ idToken, deviceName, ip, userAgent }) {
      const now = clock();
      const google = await googleVerifier.verify(idToken);
      if (!google) throw invalidCredentials('Không xác thực được với Google, thử đăng nhập lại');

      let account = await repository.findAccountByGoogleSub(google.sub);
      if (!account) {
        const emailNormalized = normalizeEmail(google.email);
        const existing = await claimEmail(emailNormalized, now);
        if (existing) {
          // Google xác thực email đó là của người này → vào đúng tài khoản cũ, không sinh tài khoản thứ hai.
          if (!google.emailVerified)
            throw invalidCredentials('Email Google này chưa được xác thực');
          account = await repository.updateAccount(existing.id, {
            googleSub: google.sub,
            ...(existing.status === 'pending_verification' ? { status: 'active' as const } : {}),
          });
        } else {
          if (!google.emailVerified)
            throw invalidCredentials('Email Google này chưa được xác thực');
          await assertNotDisposable(google.email);
          account = await repository.createAccount({
            email: google.email,
            emailNormalized,
            emailHash: hashEmail(emailNormalized, hashKey),
            passwordHash: null,
            googleSub: google.sub,
            status: 'active',
            displayName: displayNameFromGoogle(google.name, google.email),
            at: now,
          });
          await repository.applyAccountChange({
            accountId: account.id,
            patch: {},
            at: now,
            events: [{ type: 'identity.account.verified', payload: { accountId: account.id } }],
          });
        }
      }

      if (account.status === 'deleted') throw invalidCredentials();
      if (account.status === 'locked') throw accountLocked(account);
      // Lớp thứ hai áp cùng luật với mật khẩu, nhưng Google không có chỗ nhập mã trong cùng request:
      // tài khoản có quyền đã bật hai lớp phải đăng nhập bằng mật khẩu.
      if (account.totpEnabledAt && (await isPrivileged(account))) {
        throw invalidCredentials('Tài khoản có lớp thứ hai đăng nhập bằng email và mật khẩu');
      }
      return openSession(account, { deviceName, ip, userAgent, secondFactorAt: null }, now);
    },

    // ── HỒ SƠ ───────────────────────────────────────────────────────────────────────────────────

    async getPublicProfile(accountId) {
      const account = await repository.findAccountById(accountId);
      // Đã xoá thì không còn hồ sơ; bị khoá vẫn có hồ sơ — TK chỉ ẩn tin, không ẩn người.
      if (!account || account.status === 'deleted')
        throw new NotFoundError('Không có người dùng này');
      return toPublicProfile(account);
    },

    async getMe(actor) {
      return toMe(await accountOf(actor));
    },

    async updateMe(actor, { displayName, phone }) {
      if (displayName !== undefined) assertDisplayNameAllowed(displayName);
      const patch = {
        ...(displayName === undefined ? {} : { displayName: displayName.trim() }),
        ...(phone === undefined ? {} : { phone }),
      };
      return toMe(await repository.updateAccount(actor.accountId, patch));
    },

    async requestEmailChange(actor, { email }) {
      const now = clock();
      const account = await accountOf(actor);
      if (account.emailChangedAt) {
        const nextAt = new Date(
          account.emailChangedAt.getTime() +
            config.get('identity.emailChangeIntervalDays') * DAY_MS,
        );
        if (nextAt > now) {
          throw new TooManyRequestsError(
            `Mỗi tài khoản đổi email tối đa một lần mỗi 30 ngày — đổi lại được từ ${formatDateVN(nextAt)}`,
            'EMAIL_CHANGE_TOO_SOON',
          );
        }
      }
      await assertNotDisposable(email);
      const emailNormalized = normalizeEmail(email);
      if (emailNormalized === account.emailNormalized) {
        throw new BadRequestError('Đây đang là email đăng nhập của bạn');
      }
      if (await claimEmail(emailNormalized, now, { ignoreAccountId: account.id }))
        throw emailTaken();
      await assertResendAllowed(account.id, 'email_change', now);
      await issueAndSendCode(account, 'email_change', email.trim(), now, email.trim());
    },

    async confirmEmailChange(actor, { code }) {
      const now = clock();
      const account = await accountOf(actor);
      const live = await matchLiveCode(account.id, 'email_change', code, now);
      if (!live.targetEmail) throw codeInvalid();
      const emailNormalized = normalizeEmail(live.targetEmail);
      // Ai đó có thể đã lấy email này trong lúc mã còn sống: kiểm lại ngay trước khi ghi.
      if (await claimEmail(emailNormalized, now, { ignoreAccountId: account.id }))
        throw emailTaken();
      await repository.applyAccountChange({
        accountId: account.id,
        consumeCodeId: live.id,
        patch: {
          email: live.targetEmail,
          emailNormalized,
          emailHash: hashEmail(emailNormalized, hashKey),
          emailChangedAt: now,
        },
        at: now,
        events: [],
      });
    },

    // ── MẬT KHẨU ────────────────────────────────────────────────────────────────────────────────

    async forgotPassword({ email }) {
      const now = clock();
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      // Email lạ: trả 200 như email có tài khoản, không gửi gì (spec sessions).
      if (!account || account.status === 'deleted') return;
      await assertResendAllowed(account.id, 'password_reset', now);
      await issueAndSendCode(account, 'password_reset', account.email, now);
    },

    async resetPassword({ email, code, password }) {
      const now = clock();
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      if (!account || account.status === 'deleted') throw codeInvalid();
      // Kiểm mật khẩu TRƯỚC khi so mã: mật khẩu yếu không được tiêu mã hay cộng lần sai (spec).
      const weak = passwordIssue(password);
      if (weak) throw weak;

      const live = await matchLiveCode(account.id, 'password_reset', code, now);
      await repository.applyAccountChange({
        accountId: account.id,
        consumeCodeId: live.id,
        patch: { passwordHash: await hashPassword(password), passwordChangedAt: now },
        revokeSessions: { reason: 'password_reset' },
        at: now,
        events: [],
      });
    },

    async changePassword(actor, { currentPassword, newPassword }) {
      const now = clock();
      const account = await accountOf(actor);
      // Chỉ có Google thì chưa có mật khẩu để "đổi": đặt mật khẩu đầu tiên đi qua quên mật khẩu.
      if (!account.passwordHash || !(await verifyPassword(account.passwordHash, currentPassword))) {
        throw invalidCredentials('Mật khẩu hiện tại không đúng');
      }
      const weak = passwordIssue(newPassword);
      if (weak) throw weak;

      await repository.applyAccountChange({
        accountId: account.id,
        patch: { passwordHash: await hashPassword(newPassword), passwordChangedAt: now },
        revokeSessions: { reason: 'password_changed', exceptId: actor.sessionId },
        at: now,
        events: [],
      });
    },

    // ── HAI LỚP ─────────────────────────────────────────────────────────────────────────────────

    async setupTwoFactor(actor) {
      const account = await accountOf(actor);
      if (!(await isPrivileged(account))) {
        throw new ForbiddenError('Lớp thứ hai chỉ dành cho master và staff');
      }
      // Thiết lập lại = bí mật mới, chưa bật: tới khi xác nhận bằng mã đầu tiên thì bàn vận hành đóng.
      const secret = generateSecret();
      await repository.updateAccount(account.id, {
        totpSecretEnc: secrets.seal(secret),
        totpEnabledAt: null,
      });
      return { otpauthUri: generateURI({ issuer: TOTP_ISSUER, label: account.email, secret }) };
    },

    async confirmTwoFactor(actor, { code }) {
      const now = clock();
      const account = await accountOf(actor);
      if (!account.totpSecretEnc) throw codeInvalid('Chưa bắt đầu thiết lập lớp thứ hai');
      if (!(await totpMatches(account.totpSecretEnc, code))) throw codeInvalid();

      await repository.updateAccount(account.id, { totpEnabledAt: now });
      // Phiên đang thiết lập vừa chứng minh có ứng dụng tạo mã: mở bàn vận hành ngay, không bắt đăng nhập lại.
      await repository.updateSession(actor.sessionId, { secondFactorAt: now });
    },

    // ── KHOÁ / MỞ KHOÁ / XOÁ ────────────────────────────────────────────────────────────────────

    async lockAccount(actor, accountId, reason) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
      if (target.status === 'locked') throw new ConflictError('Tài khoản đang bị khoá rồi');
      await repository.lockAccount({
        accountId,
        reason,
        lockedBy: actor.accountId,
        at: clock(),
        events: [
          {
            type: 'identity.account.locked',
            payload: { accountId, reason, lockedBy: actor.accountId },
          },
        ],
      });
    },

    async unlockAccount(actor, accountId) {
      const target = await repository.findAccountById(accountId);
      if (!target || target.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
      if (target.status !== 'locked') throw new ConflictError('Tài khoản không bị khoá');
      await repository.unlockAccount({
        accountId,
        unlockedBy: actor.accountId,
        at: clock(),
        events: [
          {
            type: 'identity.account.unlocked',
            payload: { accountId, unlockedBy: actor.accountId },
          },
        ],
      });
    },

    async deleteMyAccount(actor) {
      await softDelete(await accountOf(actor));
    },

    async requestDeletion({ email, password }) {
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      if (!account || !account.passwordHash || account.status === 'deleted') {
        throw invalidCredentials();
      }
      if (!(await verifyPassword(account.passwordHash, password))) throw invalidCredentials();
      await softDelete(account);
    },

    // ── DẤU THIẾT BỊ ────────────────────────────────────────────────────────────────────────────

    async recordListingSubmission(accountId, deviceId) {
      const now = clock();
      const deviceHash = hashDeviceId(deviceId, hashKey);
      await repository.upsertDevicePost({ deviceHash, accountId, at: now });

      const [posts, lockedAccounts, clearances, open] = await Promise.all([
        repository.findDevicePosts(deviceHash),
        repository.findLockedAccountsOnDevice(deviceHash),
        repository.findDeviceClearances(deviceHash),
        repository.findOpenFlags(accountId),
      ]);
      const required = oneFlagPerKind(
        requiredDeviceFlags({
          accountId,
          now,
          windowDays: config.get('identity.deviceWindowDays'),
          slots: config.get('identity.deviceSlots'),
          posts,
          lockedAccounts,
          clearances,
        }),
      );
      const openHere = open.filter((flag) => flag.deviceHash === deviceHash);
      const create = required
        .filter((flag) => !openHere.some((existing) => existing.kind === flag.kind))
        .map((flag) => ({
          accountId,
          kind: flag.kind,
          deviceHash,
          relatedAccountId: flag.relatedAccountId,
          lookupCode: generateLookupCode(),
        }));
      const toClear = openHere.filter((flag) => !required.some((item) => item.kind === flag.kind));
      if (create.length === 0 && toClear.length === 0) return;

      const events: OutboxEventInput[] = [
        ...create.map((flag) => ({
          type: 'identity.device.flagged' as const,
          payload: { accountId, kind: flag.kind, lookupCode: flag.lookupCode },
        })),
        ...toClear.map((flag) => ({
          type: 'identity.device.flag_cleared' as const,
          payload: { accountId, kind: flag.kind },
        })),
      ];
      await repository.applyFlagChanges({
        create,
        clear: {
          ids: toClear.map((flag) => flag.id),
          clearedBy: null,
          clearedReason: FLAG_CLEARED_REASONS.recomputed,
        },
        at: now,
        events,
      });
    },

    async getFlag(lookupCode) {
      const flag = await repository.findFlagByLookupCode(normalizeLookupCode(lookupCode));
      if (!flag) throw new NotFoundError('Không có mã tra cứu này');
      return toFlagDto(flag);
    },

    async clearFlag(actor, lookupCode, reason) {
      const now = clock();
      const flag = await repository.findFlagByLookupCode(normalizeLookupCode(lookupCode));
      if (!flag) throw new NotFoundError('Không có mã tra cứu này');
      if (flag.clearedAt) throw new ConflictError('Đánh dấu này đã được gỡ');

      // Miễn trừ gắn với (máy, tài khoản): lượt gửi tin sau không bị đánh dấu lại vì chủ cũ của máy.
      const clearances = await repository.findDeviceClearances(flag.deviceHash);
      if (!clearances.some((row) => row.accountId === flag.accountId)) {
        await repository.createDeviceClearance({
          deviceHash: flag.deviceHash,
          accountId: flag.accountId,
          clearedBy: actor.accountId,
          reason,
          at: now,
        });
      }
      await repository.applyFlagChanges({
        create: [],
        clear: { ids: [flag.id], clearedBy: actor.accountId, clearedReason: reason },
        at: now,
        events: [
          {
            type: 'identity.device.flag_cleared',
            payload: { accountId: flag.accountId, kind: flag.kind },
          },
        ],
      });
    },

    // ── XÁC MINH GIẤY TỜ ────────────────────────────────────────────────────────────────────────

    async submitIdVerification(actor, { documentType, documentNumber, fullName }) {
      if (await repository.findPendingIdVerification(actor.accountId)) {
        throw new ConflictError('Bạn đang có một hồ sơ chờ duyệt');
      }
      const row = await repository.createIdVerification({
        accountId: actor.accountId,
        documentType,
        documentNumberEnc: secrets.seal(documentNumber),
        fullName,
        at: clock(),
      });
      return toIdVerificationDto(row);
    },

    async listIdVerifications({ status, ...page }) {
      const { items, total } = await repository.listIdVerifications({
        ...toSkipTake(page),
        ...(status === undefined ? {} : { status }),
      });
      return toPage(items.map(toIdVerificationDto), total, page);
    },

    async decideIdVerification(actor, id, { status, reason }) {
      const row = await repository.findIdVerificationById(id);
      if (!row) throw new NotFoundError('Không có hồ sơ này');
      if (row.status !== 'pending') throw new ConflictError('Hồ sơ này đã được duyệt');
      return toIdVerificationDto(
        await repository.updateIdVerification(id, {
          status,
          reviewedBy: actor.accountId,
          reviewedAt: clock(),
          reason: reason ?? null,
        }),
      );
    },

    // ── MIỀN DÙNG MỘT LẦN ───────────────────────────────────────────────────────────────────────

    isDisposableEmail,

    async listDisposableDomains(query) {
      const { items, total } = await repository.listDisposableDomains(toSkipTake(query));
      return toPage(items.map(toDisposableDomainDto), total, query);
    },

    async addDisposableDomain(domain) {
      return toDisposableDomainDto(await repository.addManualDomain({ domain, at: clock() }));
    },

    async removeDisposableDomain(domain, actorId) {
      const row = await repository.removeDisposableDomain({
        domain,
        removedBy: actorId,
        at: clock(),
      });
      if (!row) throw new NotFoundError('Miền này không có trong danh sách đang chặn');
    },

    async seedDisposableDomainsIfEmpty() {
      if ((await repository.countDisposableDomains()) > 0) return 0;
      const seed = parseDomainList(
        readFileSync(new URL('./data/disposable-domains.seed.txt', import.meta.url), 'utf8'),
      );
      return repository.seedDisposableDomains(seed, clock());
    },
  };
}
