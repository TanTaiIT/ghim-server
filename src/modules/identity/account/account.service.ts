import { generateSecret, generateURI } from 'otplib';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '../../../common/errors/app-error.js';
import { formatDateVN } from '../../../common/time/time.js';
import { imageNotInStorage } from '../../media/media.service.js';
import { hashEmail, normalizeEmail } from '../email.calc.js';
import { hashPassword, verifyPassword } from '../password.calc.js';
import type { Account } from '../identity.repository.js';
import {
  type IdentityService,
  type IdentityServiceDeps,
  SCREENED_DISPLAY_NAME,
} from '../identity.service.js';
import {
  DAY_MS,
  hiddenNames,
  TOTP_ISSUER,
  toIdVerificationDto,
  toSessionDto,
  toPublicProfile,
  toMe,
  codeInvalid,
  assertConsumed,
  invalidCredentials,
  emailTaken,
  assertDisplayNameAllowed,
  type IdentityShared,
} from '../identity.shared.js';

export type IdentityAccountService = Pick<
  IdentityService,
  | 'listSessions'
  | 'revokeSession'
  | 'revokeOtherSessions'
  | 'getPublicProfile'
  | 'getMe'
  | 'updateMe'
  | 'setAvatar'
  | 'clearAvatar'
  | 'requestEmailChange'
  | 'confirmEmailChange'
  | 'changePassword'
  | 'setupTwoFactor'
  | 'confirmTwoFactor'
  | 'deleteMyAccount'
  | 'submitIdVerification'
>;

/**
 * Mặt người đã đăng nhập: hồ sơ, đổi email và mật khẩu, thiết bị đang đăng nhập, hai lớp, xoá tài
 * khoản, nộp giấy tờ.
 */
export function createIdentityAccountService(
  deps: IdentityServiceDeps,
  shared: IdentityShared,
): IdentityAccountService {
  const { repository, config, clock, hashKey, secrets } = deps;
  const {
    isPrivileged,
    passwordIssue,
    issueAndSendCode,
    assertResendAllowed,
    matchLiveCode,
    totpMatches,
    accountOf,
    claimEmail,
    assertNotDisposable,
    softDelete,
  } = shared;

  const imagesOrFail = () => {
    if (!deps.images) throw new Error('identity dựng thiếu cổng ảnh (media)');
    return deps.images;
  };

  /** Ảnh trong kho → đường xem có ký, có hạn; ảnh Google → link Google; không đặt → null. */
  const avatarUrlOf = async (account: Account): Promise<string | null> => {
    if (account.avatarFromGoogle) return account.googlePictureUrl;
    if (account.avatarImageId && deps.images) return deps.images.viewUrl(account.avatarImageId);
    return null;
  };

  const nameHidden = async (account: Account): Promise<boolean> =>
    (await hiddenNames(deps, [account.displayName])).has(account.displayName);

  const me = async (account: Account) =>
    toMe(account, await avatarUrlOf(account), await nameHidden(account));

  return {
    // ── PHIÊN ───────────────────────────────────────────────────────────────────────────────────

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
      deps.sessionsRevoked?.session(sessionId);
    },

    async revokeOtherSessions(actor) {
      await repository.revokeSessions({
        accountId: actor.accountId,
        reason: 'revoked_by_user',
        at: clock(),
        exceptId: actor.sessionId,
      });
      deps.sessionsRevoked?.account(actor.accountId);
    },

    // ── HỒ SƠ ───────────────────────────────────────────────────────────────────────────────────

    async getPublicProfile(accountId) {
      const account = await repository.findAccountById(accountId);
      // Đã xoá thì không còn hồ sơ; bị khoá vẫn có hồ sơ — TK chỉ ẩn tin, không ẩn người.
      if (!account || account.status === 'deleted')
        throw new NotFoundError('Không có người dùng này');
      return toPublicProfile(
        account,
        await avatarUrlOf(account),
        (await nameHidden(account)) ? SCREENED_DISPLAY_NAME : account.displayName,
      );
    },

    async getMe(actor) {
      return me(await accountOf(actor));
    },

    async updateMe(actor, { displayName, phone }) {
      if (displayName !== undefined) assertDisplayNameAllowed(displayName);
      const patch = {
        ...(displayName === undefined ? {} : { displayName: displayName.trim() }),
        ...(phone === undefined ? {} : { phone }),
      };
      return me(await repository.updateAccount(actor.accountId, patch));
    },

    async setAvatar(actor, input) {
      const owner = { kind: 'profile' as const, id: actor.accountId };
      const ports = imagesOrFail();
      if ('source' in input) {
        const account = await accountOf(actor);
        // Ngoại lệ duy nhất ngoài kho (TK 25): chỉ ảnh của chính tài khoản Google đã nối.
        if (!account.googlePictureUrl) throw imageNotInStorage();
        return me(
          await repository.updateAccountWith(
            actor.accountId,
            { avatarFromGoogle: true, avatarImageId: null },
            (tx) => ports.attach(tx, { owner, imageIds: [] }),
          ),
        );
      }
      await ports.resolve({ owner, uploaderId: actor.accountId, imageIds: [input.imageId] });
      return me(
        await repository.updateAccountWith(
          actor.accountId,
          { avatarImageId: input.imageId, avatarFromGoogle: false },
          (tx) => ports.attach(tx, { owner, imageIds: [input.imageId] }),
        ),
      );
    },

    async clearAvatar(actor) {
      const owner = { kind: 'profile' as const, id: actor.accountId };
      const ports = imagesOrFail();
      return me(
        await repository.updateAccountWith(
          actor.accountId,
          { avatarImageId: null, avatarFromGoogle: false },
          (tx) => ports.attach(tx, { owner, imageIds: [] }),
        ),
      );
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
      const applied = await repository.applyAccountChange({
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
      assertConsumed(applied);
    },

    // ── MẬT KHẨU ────────────────────────────────────────────────────────────────────────────────

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
      deps.sessionsRevoked?.account(account.id);
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

    async deleteMyAccount(actor) {
      await softDelete(await accountOf(actor));
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
  };
}
