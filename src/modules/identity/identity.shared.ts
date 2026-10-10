import { randomInt, timingSafeEqual } from 'node:crypto';
import { verify as verifyTotp } from 'otplib';
import type { Actor } from '../../common/auth/actor.js';
import { hmacHex, randomToken, sha256Hex } from '../../common/crypto/secrets.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../common/errors/app-error.js';
import { formatDateVN, formatTimeVN } from '../../common/time/time.js';
import { domainSuffixes } from './email.calc.js';
import { IDENTITY_JOBS, type SendMailJob } from './identity.jobs.js';
import type {
  Account,
  AccountFlag,
  DisposableDomain,
  IdVerification,
  Session,
  VerificationCode,
} from './identity.repository.js';
import type { CodePurpose } from './identity.schema.js';
import { checkPassword, type PasswordIssue } from './password.calc.js';
import { isReservedName } from './reserved-names.js';
import type { RequiredFlag } from './device.calc.js';
import type {
  IdentityServiceDeps,
  PublicProfileDto,
  MeDto,
  FlagDto,
  IdVerificationDto,
  LoginInput,
  SessionOpened,
  SessionDto,
  DisposableDomainDto,
} from './identity.service.js';

export const MINUTE_MS = 60_000;
export const SECOND_MS = 1_000;
export const DAY_MS = 86_400_000;
export const CODE_DIGITS = 6;
export const TOTP_ISSUER = 'Ghim';
/** Một bước 30 giây mỗi phía: đồng hồ điện thoại lệch vài giây là chuyện thường, không phải tấn công. */
export const TOTP_EPOCH_TOLERANCE = 1;

export const PASSWORD_MESSAGES: Record<PasswordIssue, (min: number, max: number) => string> = {
  too_short: (min) => `Mật khẩu cần ít nhất ${min} ký tự`,
  too_long: (_min, max) => `Mật khẩu tối đa ${max} ký tự`,
  common: () => 'Mật khẩu này quá phổ biến, dễ bị đoán — chọn mật khẩu khác',
};

export function toDisposableDomainDto(row: DisposableDomain): DisposableDomainDto {
  return {
    domain: row.domain,
    source: row.source,
    addedAt: row.addedAt.toISOString(),
    removedAt: row.removedAt?.toISOString() ?? null,
  };
}

export function toFlagDto(flag: AccountFlag): FlagDto {
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

export function toIdVerificationDto(row: IdVerification): IdVerificationDto {
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
export function oneFlagPerKind(required: RequiredFlag[]): RequiredFlag[] {
  const byKind = new Map<RequiredFlag['kind'], RequiredFlag>();
  for (const flag of required) if (!byKind.has(flag.kind)) byKind.set(flag.kind, flag);
  return [...byKind.values()];
}

export function toSessionDto(session: Session, currentId: string): SessionDto {
  return {
    id: session.id,
    deviceName: session.deviceName,
    createdAt: session.createdAt.toISOString(),
    lastActiveAt: session.lastActiveAt.toISOString(),
    current: session.id === currentId,
  };
}

export function toPublicProfile(account: Account): PublicProfileDto {
  return {
    id: account.id,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    joinedAt: account.createdAt.toISOString(),
    phone: account.phone === null ? null : { number: account.phone, verified: false },
  };
}

export function toMe(account: Account): MeDto {
  return {
    ...toPublicProfile(account),
    email: account.email,
    emailVerified: account.status === 'active',
    role: account.role,
    twoFactorEnabled: account.totpEnabledAt !== null,
  };
}

/** Tên lấy từ Google có thể trùng tên dành riêng; khi đó dùng phần trước `@` — vẫn là của chính người đó. */
export function displayNameFromGoogle(name: string | null, email: string): string {
  const candidate = name?.trim() || email.slice(0, email.indexOf('@'));
  return isReservedName(candidate) ? email.slice(0, email.indexOf('@')) : candidate;
}

export function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const codeInvalid = (message = 'Mã không đúng'): BadRequestError =>
  new BadRequestError(message, 'CODE_INVALID');

export const codeExpired = (): BadRequestError =>
  new BadRequestError('Mã đã hết hiệu lực, xin gửi lại mã mới', 'CODE_EXPIRED');

/**
 * Mã đúng nhưng lượt tiêu thua một lượt khác (lượt nhập đúng song song, hay lượt đoán sai thứ N
 * vừa huỷ mã): với người dùng đó là "không còn mã sống" — cùng câu trả lời như khi nhập lại mã đã dùng.
 */
export const assertConsumed = (applied: boolean): void => {
  if (!applied) throw codeExpired();
};

/** Sai email và sai mật khẩu nói CÙNG một câu: không để lộ email nào đã có tài khoản (spec sessions). */
export const invalidCredentials = (message = 'Email hoặc mật khẩu không đúng'): UnauthorizedError =>
  new UnauthorizedError(message, 'INVALID_CREDENTIALS');

export const sessionRevoked = (): UnauthorizedError =>
  new UnauthorizedError('Phiên đã bị thu hồi, đăng nhập lại', 'SESSION_REVOKED');

/** 409 chứ không 401: phiên vẫn sống, lượt này chỉ đến sau — client chờ lượt kia, không đăng nhập lại. */
export const refreshConflict = (): ConflictError =>
  new ConflictError(
    'Phiên vừa được làm mới bởi một lượt khác của thiết bị này — dùng kết quả của lượt đó',
    'REFRESH_CONFLICT',
  );

export const sessionExpired = (): UnauthorizedError =>
  new UnauthorizedError('Phiên đã hết hạn vì lâu không dùng, đăng nhập lại', 'SESSION_EXPIRED');

export const accountLocked = (account: Account): ForbiddenError =>
  new ForbiddenError(
    `Tài khoản đang bị khoá: ${account.lockedReason ?? 'liên hệ hỗ trợ'}`,
    'ACCOUNT_LOCKED',
  );

export const emailTaken = (): ConflictError =>
  new ConflictError(
    'Email này đã có tài khoản — đăng nhập hoặc dùng "quên mật khẩu"',
    'EMAIL_TAKEN',
  );

export const assertDisplayNameAllowed = (displayName: string): void => {
  if (isReservedName(displayName)) {
    throw new BadRequestError(
      'Tên này dành cho bộ phận quản lý Ghim, chọn tên khác',
      'DISPLAY_NAME_RESERVED',
    );
  }
};

/**
 * Phần dùng chung của ba mặt service `identity` (khách, người đã đăng nhập, bàn vận hành): phát và
 * so mã, mở phiên, luật "mỗi email một tài khoản", tra người đang gọi. Tách khỏi `identity.service.ts`
 * (rà soát 10/10/2026, change harden-module-infra) để mỗi mặt ở dưới 500 dòng mà không lặp luật nào.
 */
export function createIdentityShared(deps: IdentityServiceDeps) {
  const { repository, jobs, privilegeSource, config, clock, hashKey, secrets } = deps;

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

    const max = config.get('identity.codeMaxAttempts');
    const { cancelled } = await repository.recordWrongCode({ id: live.id, maxAttempts: max, at });
    if (cancelled) throw codeInvalid(`Sai mã ${max} lần, mã đã bị huỷ — xin gửi lại mã mới`);
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
    isPrivileged,
    idleExpiry,
    passwordIssue,
    issueAndSendCode,
    assertResendAllowed,
    matchLiveCode,
    totpMatches,
    openSession,
    isDisposableEmail,
    accountOf,
    claimEmail,
    assertNotDisposable,
    softDelete,
    resolveActor,
  };
}

export type IdentityShared = ReturnType<typeof createIdentityShared>;
