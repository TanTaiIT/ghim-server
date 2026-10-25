import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
} from '../../../common/errors/app-error.js';
import { formatDateVN } from '../../../common/time/time.js';
import { imageNotInStorage } from '../../media/media.service.js';
import { hashEmail, maskEmail, normalizeEmail } from '../calc/email.calc.js';
import { hashPassword, verifyPassword } from '../calc/password.calc.js';
import { IDENTITY_JOBS, type SendNoticeJob } from '../identity.jobs.js';
import type { Account } from '../identity.repository.js';
import {
  type IdentityService,
  type IdentityServiceDeps,
  SCREENED_DISPLAY_NAME,
} from '../identity.service.js';
import {
  avatarUrlOf as signedAvatarUrl,
  DAY_MS,
  hiddenNames,
  toIdVerificationDto,
  toSessionDto,
  toPublicProfile,
  toMe,
  codeInvalid,
  assertConsumed,
  invalidCredentials,
  emailTaken,
  passwordNotSet,
  assertDisplayNameAllowed,
  type IdentityShared,
} from '../identity.shared.js';

export type IdentityAccountService = Pick<
  IdentityService,
  | 'listSessions'
  | 'revokeSession'
  | 'revokeOtherSessions'
  | 'setPushToken'
  | 'clearPushToken'
  | 'pushTargets'
  | 'forgetPushToken'
  | 'getPublicProfile'
  | 'getMe'
  | 'updateMe'
  | 'setAvatar'
  | 'clearAvatar'
  | 'requestEmailChange'
  | 'confirmEmailChange'
  | 'changePassword'
  | 'deleteMyAccount'
  | 'submitIdVerification'
  | 'myIdVerification'
>;

/**
 * Mặt người đã đăng nhập: hồ sơ, đổi email và mật khẩu, thiết bị đang đăng nhập, xoá tài khoản,
 * nộp giấy tờ.
 */
export function createIdentityAccountService(
  deps: IdentityServiceDeps,
  shared: IdentityShared,
): IdentityAccountService {
  const { repository, config, clock, hashKey, secrets, jobs, privilegeSource } = deps;
  const {
    passwordIssue,
    issueAndSendCode,
    assertResendAllowed,
    matchLiveCode,
    accountOf,
    claimEmail,
    assertNotDisposable,
    softDelete,
  } = shared;

  const imagesOrFail = () => {
    if (!deps.images) throw new Error('identity dựng thiếu cổng ảnh (media)');
    return deps.images;
  };

  const avatarUrlOf = (account: Account): Promise<string | null> =>
    signedAvatarUrl(account, deps.images);

  const nameHidden = async (account: Account): Promise<boolean> =>
    (await hiddenNames(deps, [account.displayName])).has(account.displayName);

  // Quyền treo không làm được gì ở bàn vận hành: cờ trả lời "có lối vào không", không phải "còn mang quyền" (design mục 2).
  const activeStaff = async (account: Account): Promise<boolean> =>
    (await privilegeSource.staffGrant(account.id))?.status === 'active';

  const me = async (account: Account) =>
    toMe(
      account,
      await avatarUrlOf(account),
      await nameHidden(account),
      await activeStaff(account),
    );

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

    setPushToken: (actor, token) => repository.setPushToken(actor.sessionId, token),
    clearPushToken: (actor) => repository.clearPushToken(actor.sessionId),
    pushTargets: (accountIds) => repository.pushTargets(accountIds, clock()),
    forgetPushToken: (token) => repository.forgetPushToken(token),

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

    async updateMe(actor, { displayName, phone, showActivity, homeProvinceCode }) {
      if (displayName !== undefined) assertDisplayNameAllowed(displayName);
      if (homeProvinceCode != null && deps.regions) {
        const issue = await deps.regions.validateRegion(homeProvinceCode, null);
        if (issue) throw new BadRequestError(issue, 'VALIDATION_ERROR');
      }
      const patch = {
        ...(displayName === undefined ? {} : { displayName: displayName.trim() }),
        ...(phone === undefined ? {} : { phone }),
        ...(showActivity === undefined ? {} : { showActivity }),
        ...(homeProvinceCode === undefined ? {} : { homeProvinceCode }),
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

    async requestEmailChange(actor, { email, currentPassword }) {
      const now = clock();
      const account = await accountOf(actor);
      // Xác thực lại trước mọi luật khác: token lộ không gửi được mã, không dò được email nào đã có tài khoản (T12).
      if (!account.passwordHash) throw passwordNotSet();
      if (!(await verifyPassword(account.passwordHash, currentPassword))) {
        throw invalidCredentials('Mật khẩu hiện tại không đúng');
      }
      if (account.emailChangedAt) {
        const intervalDays = config.get('identity.emailChangeIntervalDays');
        const nextAt = new Date(account.emailChangedAt.getTime() + intervalDays * DAY_MS);
        if (nextAt > now) {
          throw new TooManyRequestsError(
            `Mỗi tài khoản đổi email tối đa một lần mỗi ${intervalDays} ngày — đổi lại được từ ${formatDateVN(nextAt)}`,
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
        revokeSessions: { reason: 'email_changed', exceptId: actor.sessionId },
        at: now,
        // Gậy đang hiệu lực theo cả email mới (add-strikes, spec email-change).
        events: [
          {
            type: 'identity.account.email_changed',
            payload: { accountId: account.id, emailHash: hashEmail(emailNormalized, hashKey) },
          },
        ],
      });
      assertConsumed(applied);
      deps.sessionsRevoked?.account(account.id);
      await jobs.send<SendNoticeJob>(IDENTITY_JOBS.sendNotice, {
        to: account.email,
        kind: 'email_changed',
        newEmail: maskEmail(live.targetEmail),
      });
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

    // ── KHOÁ / MỞ KHOÁ / XOÁ ────────────────────────────────────────────────────────────────────

    async deleteMyAccount(actor) {
      await softDelete(await accountOf(actor));
    },

    // ── XÁC MINH GIẤY TỜ ────────────────────────────────────────────────────────────────────────

    async submitIdVerification(actor, { documentType, documentNumber, fullName }) {
      if ((await repository.findLatestIdVerification(actor.accountId))?.status === 'pending') {
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

    async myIdVerification(actor) {
      const row = await repository.findLatestIdVerification(actor.accountId);
      return row ? toIdVerificationDto(row) : null;
    },
  };
}
