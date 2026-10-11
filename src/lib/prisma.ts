import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';

/**
 * Prisma client dùng chung cho cả tiến trình. MỘT instance là bắt buộc: mỗi `new PrismaClient()` mở
 * một pool riêng, tạo trong từng request là vét sạch `max_connections` của Postgres sau vài chục lượt.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    // Mặc định của `pg` là chờ vô hạn: vài truy vấn treo đủ giữ chặt pool và cả app đứng không báo lỗi.
    // Migration chạy bằng Prisma CLI với kết nối riêng nên không chịu trần câu SQL này.
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  }),
  // Dev cần thấy câu query để bắt N+1; test và production chỉ giữ cảnh báo và lỗi.
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

export type { PrismaClient };
