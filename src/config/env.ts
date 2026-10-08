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
  })
  .superRefine((value, ctx) => {
    const databaseIssue = databaseEnvironmentIssue(value.NODE_ENV, value.DATABASE_URL);
    if (databaseIssue) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: databaseIssue });
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
