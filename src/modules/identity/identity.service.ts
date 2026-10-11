import type { Actor, ActorResolver } from '../../common/auth/actor.js';
import type { PrivilegeSource } from '../../common/auth/privilege-source.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import type { SecretBox } from '../../common/crypto/secrets.js';
import type { PaginationQuery, toPage } from '../../common/schemas/pagination.js';
import type { Jobs } from '../../lib/jobs.js';
import type {
  Account,
  AccountFlag,
  DisposableDomain,
  IdentityRepository,
  IdVerification,
} from './identity.repository.js';
import type { GoogleTokenVerifier } from './google.verifier.js';
import { createIdentityAccountService } from './identity.account.service.js';
import { createIdentityAuthService } from './identity.auth.service.js';
import { createIdentityOpsService } from './identity.ops.service.js';
import { createIdentityShared } from './identity.shared.js';

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
  /** `group` trả lời "đang là chủ nhóm nào không" — chủ nhóm phải chuyển chủ rồi mới xoá được tài khoản. */
  ownership?: GroupOwnership;
  /** Báo kênh realtime cắt kết nối của phiên vừa bị thu hồi — sau khi ghi xong, trong tiến trình (kênh chỉ báo hiệu). */
  sessionsRevoked?: SessionRevocationListener;
}

export interface SessionRevocationListener {
  session(sessionId: string): void;
  /** Thu hồi hàng loạt (đổi, đặt lại mật khẩu, khoá, xoá): cắt mọi kết nối — máy còn phiên tự nối lại. */
  account(accountId: string): void;
}

export interface GroupOwnership {
  ownsAnyGroup(accountId: string): Promise<boolean>;
}

/** Thứ module khác cần về một tài khoản — không email, không dấu băm. */
export interface AccountSummary {
  id: string;
  role: Account['role'];
  status: Account['status'];
  displayName: string;
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
  addDisposableDomain(actor: Actor, domain: string): Promise<DisposableDomainDto>;
  removeDisposableDomain(actor: Actor, domain: string): Promise<void>;
  /** Nạp hạt giống trong repo khi bảng rỗng — chạy lúc khởi động, idempotent. Trả số dòng thêm. */
  seedDisposableDomainsIfEmpty(): Promise<number>;

  /** `platform` hỏi trước khi gắn quyền staff: tài khoản có thật không, vai gì, trạng thái gì. */
  accountState(accountId: string): Promise<AccountState | null>;
  /** Theo lô, bỏ qua mã không có; `group` đếm điều hành viên dùng được, `notification` lấy tên hiển thị. */
  accountSummaries(ids: string[]): Promise<Map<string, AccountSummary>>;
  /** Tài khoản chưa xoá mang email này (so sau chuẩn hoá) — lời mời vào nhóm theo email. */
  accountIdByEmail(email: string): Promise<string | null>;
  /** Dấu băm HMAC của email đã chuẩn hoá, cùng khoá với `accounts.email_hash` — danh sách lớp của nhóm. */
  emailHashOf(email: string): string;
  /** Dấu băm email của một tài khoản chưa xoá — để biết người đó có tên trong danh sách lớp nào. */
  accountEmailHash(accountId: string): Promise<string | null>;
  /** Dấu băm → tài khoản chưa xoá mang dấu băm đó. */
  accountIdsByEmailHashes(hashes: string[]): Promise<Map<string, string>>;
  /** Chỉ CLI gọi (spec master-accounts): đúng một master, email chưa có tài khoản, xác nhận sẵn. */
  createMaster(input: RegisterInput): Promise<{ accountId: string }>;
  /** Chỉ CLI gọi: gỡ lớp thứ hai và thu hồi mọi phiên — thiết lập lại trước khi dùng bàn vận hành. */
  resetTwoFactor(input: { email: string }): Promise<void>;
}

export interface AccountState {
  role: Account['role'];
  status: Account['status'];
}

/**
 * Ghép bằng factory, không class: deps là tham số nên test dựng service với đồng hồ cố định, không
 * mock module. Service không thấy `request`/`reply` và không import Prisma.
 * Ba mặt (khách, người đã đăng nhập, bàn vận hành) nằm ở ba file riêng, dùng chung `identity.shared.ts`;
 * interface `IdentityService` mà route và module khác thấy không đổi.
 */
export function createIdentityService(deps: IdentityServiceDeps): IdentityService {
  const shared = createIdentityShared(deps);
  return {
    resolveActor: shared.resolveActor,
    isDisposableEmail: shared.isDisposableEmail,
    ...createIdentityAuthService(deps, shared),
    ...createIdentityAccountService(deps, shared),
    ...createIdentityOpsService(deps, shared),
  };
}
