import { randomToken, sha256Hex } from '../../../common/crypto/secrets.js';
import { hashEmail, normalizeEmail } from '../calc/email.calc.js';
import { hashPassword, verifyPassword } from '../calc/password.calc.js';
import type { IdentityService, IdentityServiceDeps } from '../identity.service.js';
import {
  displayNameFromGoogle,
  codeInvalid,
  assertConsumed,
  invalidCredentials,
  sessionRevoked,
  refreshConflict,
  sessionExpired,
  accountLocked,
  emailTaken,
  assertDisplayNameAllowed,
  type IdentityShared,
} from '../identity.shared.js';

export type IdentityAuthService = Pick<
  IdentityService,
  | 'register'
  | 'verifyEmail'
  | 'resendCode'
  | 'login'
  | 'refresh'
  | 'logout'
  | 'loginWithGoogle'
  | 'forgotPassword'
  | 'resetPassword'
  | 'requestDeletion'
>;

/**
 * Mặt khách của `identity`: đăng ký, xác nhận email, đăng nhập (mật khẩu, Google), làm mới và đăng
 * xuất phiên, quên mật khẩu, yêu cầu xoá khi không đăng nhập được.
 */
export function createIdentityAuthService(
  deps: IdentityServiceDeps,
  shared: IdentityShared,
): IdentityAuthService {
  const { repository, config, clock, hashKey, googleVerifier } = deps;
  const {
    assertNotBanned,
    accountCreated,
    isPrivileged,
    idleExpiry,
    passwordIssue,
    issueAndSendCode,
    assertResendAllowed,
    matchLiveCode,
    openSession,
    claimEmail,
    releaseDeleted,
    assertNotDisposable,
    softDelete,
  } = shared;

  return {
    // ── ĐĂNG KÝ ─────────────────────────────────────────────────────────────────────────────────

    async register({ email, password, displayName }) {
      const now = clock();
      const weak = passwordIssue(password);
      if (weak) throw weak;
      assertDisplayNameAllowed(displayName);
      await assertNotDisposable(email);

      const emailNormalized = normalizeEmail(email);
      if (await claimEmail(emailNormalized, now)) throw emailTaken();
      await assertNotBanned(emailNormalized);

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
      await repository.applyAccountChange({
        accountId: account.id,
        patch: {},
        at: now,
        events: [accountCreated(account)],
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
      const applied = await repository.applyAccountChange({
        accountId: account.id,
        consumeCodeId: live.id,
        patch: { status: 'active' },
        at: now,
        events: [{ type: 'identity.account.verified', payload: { accountId: account.id } }],
      });
      // App gửi hai lần cùng lúc: lượt thua thấy tài khoản đã được lượt kia xác nhận — vẫn không phải lỗi.
      if (!applied && (await repository.findAccountById(account.id))?.status === 'active') return;
      assertConsumed(applied);
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

    async login({ email, password, deviceName, ip, userAgent }) {
      const now = clock();
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      // Tài khoản chỉ có Google không có mật khẩu: với người gõ mật khẩu, nó như không tồn tại.
      if (!account || !account.passwordHash || account.status === 'deleted') {
        throw invalidCredentials();
      }
      if (!(await verifyPassword(account.passwordHash, password))) throw invalidCredentials();
      // Sai mật khẩu đã bị chặn ở trên: chỉ chủ tài khoản mới được biết lý do khoá.
      if (account.status === 'locked') throw accountLocked(account);

      const privileged = await isPrivileged(account);
      return openSession(account, { deviceName, ip, userAgent, privileged }, now);
    },

    async refresh(refreshToken) {
      const now = clock();
      const hash = sha256Hex(refreshToken);
      const session = await repository.findSessionByRefreshHash(hash);
      if (!session) {
        // Token đã bị xoay mà còn được gửi lên: hoặc client lỗi, hoặc token đã lộ. Cả hai đều
        // không đáng giữ phiên — thu hồi, người dùng thật chỉ cần đăng nhập lại.
        const reused = await repository.findSessionByPreviousRefreshHash(hash);
        // `last_active_at` chỉ được ghi lúc mở phiên và lúc xoay token: nó là mốc của lượt thay gần nhất. Trong ân
        // hạn không cấp gì — người cầm token cũ không được thêm gì, chỉ chưa bị coi là kẻ trộm (T11).
        const graceMs = config.get('identity.refreshGraceSeconds') * 1000;
        if (
          reused &&
          !reused.revokedAt &&
          reused.lastActiveAt.getTime() + graceMs > now.getTime()
        ) {
          throw refreshConflict();
        }
        if (reused && !reused.revokedAt) {
          await repository.updateSession(reused.id, {
            revokedAt: now,
            revokeReason: 'refresh_reuse',
          });
          deps.sessionsRevoked?.session(reused.id);
        }
        throw sessionRevoked();
      }
      if (session.revokedAt) throw sessionRevoked();
      if (session.expiresAt <= now) throw sessionExpired();

      const account = await repository.findAccountById(session.accountId);
      if (!account || account.status === 'deleted') throw sessionRevoked();
      if (account.status === 'locked') throw accountLocked(account);

      const next = randomToken();
      const rotated = await repository.rotateRefreshToken({
        sessionId: session.id,
        expectedHash: hash,
        nextHash: sha256Hex(next),
        at: now,
        expiresAt: idleExpiry(now),
      });
      // Thua cuộc đua với một lượt làm mới khác: không đi nhánh "dùng lại token" — đó là lượt hợp lệ.
      if (!rotated) throw refreshConflict();
      return { sessionId: session.id, refreshToken: next };
    },

    async logout(actor) {
      await repository.updateSession(actor.sessionId, {
        revokedAt: clock(),
        revokeReason: 'logout',
      });
      deps.sessionsRevoked?.session(actor.sessionId);
    },

    async loginWithGoogle({ idToken, deviceName, ip, userAgent }) {
      const now = clock();
      const google = await googleVerifier.verify(idToken);
      if (!google) throw invalidCredentials('Không xác thực được với Google, thử đăng nhập lại');

      let account = await repository.findAccountByGoogleSub(google.sub);
      // Người dùng Google đã xoá tài khoản: như đăng ký lại cùng email — trong thời gian chờ thì 409 kèm ngày, sau đó
      // dòng cũ được ẩn danh, nhả mã Google, và Google tạo tài khoản mới (spec account-deletion, T13).
      if (account?.status === 'deleted' && account.deletedAt) {
        await releaseDeleted({ ...account, deletedAt: account.deletedAt }, now);
        account = null;
      }
      if (!account) {
        const emailNormalized = normalizeEmail(google.email);
        let existing = await claimEmail(emailNormalized, now);
        // Đăng ký dở chưa chứng minh được email là của ai. Nối Google vào đó thì mật khẩu và phiên của người đăng ký
        // trước dùng chung được tài khoản của chủ email, nên xoá hẳn nó (spec registration, chốt 15/10/2026).
        if (existing?.status === 'pending_verification' && google.emailVerified) {
          const removed = await repository.deleteUnverifiedAccount(existing.id);
          if (removed) deps.sessionsRevoked?.account(existing.id);
          // Không xoá được = dòng vừa được xác nhận bằng mã: đọc lại, nó là tài khoản đã có như mọi email khác.
          existing = removed ? null : await claimEmail(emailNormalized, now);
        }
        if (existing) {
          // Google xác thực email đó là của người này → vào đúng tài khoản cũ, không sinh tài khoản thứ hai.
          if (!google.emailVerified)
            throw invalidCredentials('Email Google này chưa được xác thực');
          account = await repository.updateAccount(existing.id, {
            googleSub: google.sub,
            googlePictureUrl: google.picture,
          });
        } else {
          if (!google.emailVerified)
            throw invalidCredentials('Email Google này chưa được xác thực');
          await assertNotDisposable(google.email);
          await assertNotBanned(emailNormalized);
          account = await repository.createAccount({
            email: google.email,
            emailNormalized,
            emailHash: hashEmail(emailNormalized, hashKey),
            passwordHash: null,
            googleSub: google.sub,
            status: 'active',
            displayName: displayNameFromGoogle(google.name, google.email),
            // Tài khoản sinh từ Google mặc định dùng ảnh Google (spec identity/profile).
            googlePictureUrl: google.picture,
            avatarFromGoogle: google.picture !== null,
            at: now,
          });
          await repository.applyAccountChange({
            accountId: account.id,
            patch: {},
            at: now,
            events: [
              accountCreated(account),
              { type: 'identity.account.verified', payload: { accountId: account.id } },
            ],
          });
        }
      }

      if (account.status === 'deleted') throw invalidCredentials();
      if (account.status === 'locked') throw accountLocked(account);
      // Ảnh Google đổi thì lấy lại; người đang dùng ảnh Google mà Google bỏ ảnh thì về không có ảnh (CHECK của bảng).
      if (account.googlePictureUrl !== google.picture) {
        account = await repository.updateAccount(account.id, {
          googlePictureUrl: google.picture,
          ...(google.picture === null ? { avatarFromGoogle: false } : {}),
        });
      }
      const privileged = await isPrivileged(account);
      return openSession(account, { deviceName, ip, userAgent, privileged }, now);
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
      const applied = await repository.applyAccountChange({
        accountId: account.id,
        consumeCodeId: live.id,
        patch: { passwordHash: await hashPassword(password), passwordChangedAt: now },
        revokeSessions: { reason: 'password_reset' },
        at: now,
        events: [],
      });
      assertConsumed(applied);
      deps.sessionsRevoked?.account(account.id);
    },

    // ── KHOÁ / MỞ KHOÁ / XOÁ ────────────────────────────────────────────────────────────────────

    async requestDeletion({ email, password }) {
      const account = await repository.findAccountByEmail(normalizeEmail(email));
      if (!account || !account.passwordHash || account.status === 'deleted') {
        throw invalidCredentials();
      }
      if (!(await verifyPassword(account.passwordHash, password))) throw invalidCredentials();
      await softDelete(account);
    },
  };
}
