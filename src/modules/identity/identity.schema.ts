import { z } from 'zod';

import { paginationQuerySchema } from '../../common/schemas/pagination.js';

/*
 * Tuple khai lại enum của schema.prisma cho tầng HTTP và hàm thuần (CLAUDE.md luật 5): hàm thuần
 * không import Prisma, còn Zod cần tuple để sinh OpenAPI. Đổi enum thì đổi đây.
 */
export const ACCOUNT_FLAG_KINDS = ['many_accounts_on_device', 'device_of_locked_account'] as const;
export type AccountFlagKind = (typeof ACCOUNT_FLAG_KINDS)[number];

export const CODE_PURPOSES = ['email_verify', 'password_reset', 'email_change'] as const;
export type CodePurpose = (typeof CODE_PURPOSES)[number];

export const DISPOSABLE_DOMAIN_SOURCES = ['seed', 'manual'] as const;

/** Lý do hệ thống đóng một đánh dấu (cột `cleared_reason` bắt buộc khi đóng). Hỗ trợ gỡ tay thì tự ghi lý do. */
export const FLAG_CLEARED_REASONS = {
  unlocked: 'Tài khoản liên quan đã được mở khoá',
  recomputed: 'Không còn thoả điều kiện ở lượt gửi tin mới',
} as const;

/**
 * App giữ refresh token trong kho an toàn của hệ điều hành và gửi trong body; bàn vận hành web
 * nhận nó qua cookie httpOnly (design 4). Client tự khai mình là ai để server biết trả về đâu.
 */
export const CLIENTS = ['app', 'web'] as const;
export const REFRESH_COOKIE = 'ghim_refresh';
/** Cookie chỉ đi kèm request tới `/auth/*`: mọi route khác không bao giờ thấy refresh token. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
/** Chốt Open Question của design: app không gửi tên thì rút từ user-agent, không có nữa thì tên chung. */
export const DEFAULT_DEVICE_NAME = 'Thiết bị không tên';
export const DEVICE_NAME_MAX = 80;

// ── SCHEMA DÙNG CHUNG ───────────────────────────────────────────────────────────────────────────

export const emailSchema = z.email({ error: 'Email không hợp lệ' }).max(254);
/** 6 chữ số: đủ cho 10 phút sống + 5 lần thử, và gõ được từ màn hình khoá điện thoại. */
export const codeSchema = z.string().regex(/^\d{6}$/, 'Mã gồm 6 chữ số');
/** Trần 1024 chỉ chặn body quá cỡ; luật 8–128 (TK 28) nằm ở service qua `RuntimeConfig`. */
export const passwordSchema = z.string().min(1).max(1024);
export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Tên hiển thị tối thiểu 2 ký tự')
  .max(40, 'Tên hiển thị tối đa 40 ký tự');
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Miền không hợp lệ');

/** Trả lời rỗng nhưng có vỏ: `{ success: true, data: null }` — client không phải xử lý 204 riêng. */
export const emptySchema = z.null();

// ── ĐĂNG KÝ ─────────────────────────────────────────────────────────────────────────────────────

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const registeredSchema = z.object({ accountId: z.uuid() });

export const verifyEmailBodySchema = z.object({ email: emailSchema, code: codeSchema });

export const resendCodeBodySchema = z.object({ email: emailSchema });

// ── PHIÊN ───────────────────────────────────────────────────────────────────────────────────────

export const loginBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  /** Bắt buộc với master và staff đã bật hai lớp; người khác bỏ trống. */
  totpCode: codeSchema.optional(),
  deviceName: z.string().trim().min(1).max(DEVICE_NAME_MAX).optional(),
  client: z.enum(CLIENTS).default('app'),
});

export const tokensSchema = z.object({
  accessToken: z.string(),
  /** `null` với client web — refresh token nằm trong cookie httpOnly. */
  refreshToken: z.string().nullable(),
  /** Giây sống của access token; app refresh trước mốc này. */
  expiresIn: z.number().int(),
});

export const refreshBodySchema = z.object({ refreshToken: z.string().min(1).optional() });

export const sessionSchema = z.object({
  id: z.uuid(),
  deviceName: z.string(),
  createdAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
  current: z.boolean(),
});

export const sessionParamsSchema = z.object({ id: z.uuid() });

export const googleBodySchema = z.object({
  idToken: z.string().min(1),
  deviceName: z.string().trim().min(1).max(DEVICE_NAME_MAX).optional(),
  client: z.enum(CLIENTS).default('app'),
});

// ── HỒ SƠ ───────────────────────────────────────────────────────────────────────────────────────

export const userParamsSchema = z.object({ id: z.uuid() });

/** Số không được xác thực (TK 7): mọi nơi hiện số đều kèm `verified: false`, không có đường nào thành true ở đây. */
export const phoneSchema = z.object({ number: z.string(), verified: z.literal(false) });

export const publicProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  joinedAt: z.iso.datetime(),
  phone: phoneSchema.nullable(),
});

/** Chính chủ xem mình: có email, trạng thái xác nhận — KHÔNG có đánh dấu hay thiết bị (TK 8, TK 13). */
export const meSchema = publicProfileSchema.extend({
  email: z.string(),
  emailVerified: z.boolean(),
  role: z.enum(['user', 'master']),
  twoFactorEnabled: z.boolean(),
  /** Tên trúng cụm từ cấm mức chắc: người khác thấy "Người dùng Ghim" — app nhắc đổi tên. */
  nameHidden: z.boolean(),
});

const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{9,15}$/, 'Số điện thoại gồm 9–15 chữ số, có thể bắt đầu bằng +');

/**
 * Ảnh trong kho của mình, hoặc ảnh Google. `imageId` nhận chuỗi bất kỳ: đường link ngoài kho phải tới service để
 * nhận đúng `IMAGE_NOT_IN_STORAGE` (spec media/image-storage), không dừng ở `VALIDATION_ERROR`.
 */
export const avatarBodySchema = z.union([
  z.object({ imageId: z.string().trim().min(1).max(2048) }).strict(),
  z.object({ source: z.literal('google') }).strict(),
]);
export type AvatarInput = z.infer<typeof avatarBodySchema>;

export const patchMeBodySchema = z.object({
  displayName: displayNameSchema.optional(),
  /** `null` để xoá số; bỏ qua để giữ nguyên. */
  phone: phoneNumberSchema.nullable().optional(),
});

export const emailChangeBodySchema = z.object({ email: emailSchema });

export const emailChangeConfirmBodySchema = z.object({ code: codeSchema });

// ── MẬT KHẨU ────────────────────────────────────────────────────────────────────────────────────

export const forgotPasswordBodySchema = z.object({ email: emailSchema });

export const resetPasswordBodySchema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: passwordSchema,
});

export const changePasswordBodySchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

// ── HAI LỚP ─────────────────────────────────────────────────────────────────────────────────────

export const twoFactorSetupSchema = z.object({ otpauthUri: z.string() });

export const twoFactorConfirmBodySchema = z.object({ code: codeSchema });

// ── KHOÁ / XOÁ TÀI KHOẢN ────────────────────────────────────────────────────────────────────────

export const accountParamsSchema = z.object({ id: z.uuid() });

export const lockBodySchema = z.object({
  reason: z.string().trim().min(1, 'Khoá phải kèm lý do').max(500),
});

/** Kênh không cần đăng nhập: người bị khoá cũng gọi được, và nhận đúng câu "đang bị khoá". */
export const deletionRequestBodySchema = z.object({ email: emailSchema, password: passwordSchema });

// ── ĐÁNH DẤU THIẾT BỊ ───────────────────────────────────────────────────────────────────────────

export const lookupCodeParamsSchema = z.object({ lookupCode: z.string().trim().min(1).max(16) });

/** Cho hỗ trợ: loại đánh dấu và tài khoản — KHÔNG BAO GIỜ có mã thiết bị (TK 8). */
export const flagSchema = z.object({
  lookupCode: z.string(),
  kind: z.enum(ACCOUNT_FLAG_KINDS),
  accountId: z.uuid(),
  relatedAccountId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  clearedAt: z.iso.datetime().nullable(),
  clearedReason: z.string().nullable(),
});

export const clearFlagBodySchema = z.object({
  reason: z.string().trim().min(1, 'Gỡ đánh dấu phải kèm lý do').max(500),
});

// ── XÁC MINH GIẤY TỜ ────────────────────────────────────────────────────────────────────────────

export const ID_VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'] as const;

export const idVerificationBodySchema = z.object({
  documentType: z.string().trim().min(1).max(40),
  documentNumber: z.string().trim().min(4).max(40),
  fullName: z.string().trim().min(2).max(100),
});

/** Số giấy tờ không có ở đây và không có ở bất kỳ schema response nào (TK 27 cam kết 32). */
export const idVerificationSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  documentType: z.string(),
  fullName: z.string(),
  status: z.enum(ID_VERIFICATION_STATUSES),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  reason: z.string().nullable(),
});

export const idVerificationParamsSchema = z.object({ id: z.uuid() });

export const idVerificationListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ID_VERIFICATION_STATUSES).optional(),
});

export const idVerificationDecisionBodySchema = z
  .object({
    status: z.enum(['verified', 'rejected']),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => value.status !== 'rejected' || value.reason !== undefined, {
    message: 'Từ chối phải kèm lý do',
    path: ['reason'],
  });

// ── MIỀN DÙNG MỘT LẦN ───────────────────────────────────────────────────────────────────────────

export const disposableDomainSchema = z.object({
  domain: z.string(),
  source: z.enum(DISPOSABLE_DOMAIN_SOURCES),
  addedAt: z.iso.datetime(),
  removedAt: z.iso.datetime().nullable(),
});

export const disposableDomainBodySchema = z.object({ domain: domainSchema });

export const disposableDomainParamsSchema = z.object({ domain: domainSchema });
