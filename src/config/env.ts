import { z } from 'zod';

import { databaseEnvironmentIssue } from './database-guard.js';

/**
 * Schema cho biến môi trường. Thêm biến mới tại đây để được validate và có type ngay khi app
 * khởi động (fail fast thay vì lỗi lúc runtime, khi request đầu tiên đã chạy được nửa đường).
 *
 * Chỉ khai biến mà code ĐANG dùng. Khoá JWT, khoá HMAC băm email, cấu hình gửi email, kho ảnh…
 * vào đây cùng module cần chúng — khai trước thì mọi môi trường phải điền một giá trị chưa ai đọc.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // 3100 chứ không 3000: booking đã giữ 3000, chạy hai backend cùng máy thì không giẫm cổng.
    PORT: z.coerce.number().int().positive().max(65535).default(3100),
    APP_NAME: z.string().min(1).default('calendar-ghim'),

    DATABASE_URL: z.string().url(),

    /**
     * Danh sách origin, phân tách bằng dấu phẩy. `*` = mở cho mọi nguồn (chỉ nên ở dev). Bàn vận
     * hành chạy trên web và dùng cookie thì bắt buộc danh sách cụ thể: trình duyệt không gửi cookie
     * kèm CORS `*`.
     */
    CORS_ORIGIN: z.string().default('*'),

    /** Trần rate-limit chung, tính trên mỗi IP mỗi phút. */
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

    // ── identity ──
    /**
     * Ký access token (HS256). Đổi khoá thì mọi access token đang sống hết hiệu lực tức thì, còn
     * phiên trong DB vẫn nguyên — app chỉ cần refresh.
     */
    JWT_SECRET: z.string().min(32),
    /**
     * Khoá HMAC băm email và mã thiết bị — cố ý nằm ngoài DB (CLAUDE.md luật 20). Đổi khoá là
     * mọi dấu băm cũ thành vô nghĩa: không nối được gậy qua lần đăng ký lại, không đếm được
     * tài khoản trên máy. Vì vậy phải KHÁC `JWT_SECRET`, để xoay khoá ký không kéo theo khoá này.
     */
    IDENTITY_HASH_KEY: z.string().min(32),
    /** AES-256-GCM cho bí mật TOTP và số giấy tờ: đúng 32 byte, base64 (`openssl rand -base64 32`). */
    SECRETS_ENCRYPTION_KEY: z
      .base64()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'phải là 32 byte base64 (openssl rand -base64 32)',
      }),
    /**
     * `smtp(s)://user:pass@host:port`. Chỉ test được bỏ trống (mailer giả); dev dùng Mailpit vì
     * mã xác nhận không bao giờ được ghi vào log — không có SMTP thì không có cách nào đọc mã.
     */
    SMTP_URL: z.string().url().optional(),
    MAIL_FROM: z.string().min(3),
    /**
     * Client id Google (iOS, Android…) phân tách bằng dấu phẩy — ID token phải phát cho một trong
     * số này. Trống = đăng nhập Google tắt; production bắt buộc có.
     */
    GOOGLE_CLIENT_IDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    /** Danh sách miền email dùng một lần do cộng đồng duy trì; job hằng tuần tải và chỉ thêm. */
    DISPOSABLE_DOMAINS_URL: z
      .string()
      .url()
      .default('https://disposable.github.io/disposable-email-domains/domains.txt'),
  })
  .superRefine((value, ctx) => {
    const databaseIssue = databaseEnvironmentIssue(value.NODE_ENV, value.DATABASE_URL);
    if (databaseIssue) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: databaseIssue });
    }
    if (value.JWT_SECRET === value.IDENTITY_HASH_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['IDENTITY_HASH_KEY'],
        message: 'phải khác JWT_SECRET — hai khoá, hai vòng đời xoay khác nhau',
      });
    }
    if (value.NODE_ENV !== 'test' && !value.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message:
          'bắt buộc ngoài test — dev dùng Mailpit (pnpm mail:up, smtp://ghim:ghim@localhost:1025)',
      });
    }
    if (value.NODE_ENV === 'production' && value.GOOGLE_CLIENT_IDS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_IDS'],
        message: 'production phải có ít nhất một client id',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Biến môi trường không hợp lệ:\n${issues}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** `*` giữ nguyên cho `@fastify/cors`; còn lại tách thành mảng để khai báo nhiều origin. */
export const corsOrigin: string | string[] =
  env.CORS_ORIGIN === '*'
    ? '*'
    : env.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

export { envSchema, loadEnv };
