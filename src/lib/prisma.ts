import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { env, isProduction } from '../config/env.js';

/**
 * Prisma client dùng chung cho cả tiến trình.
 *
 * MỘT instance là bắt buộc, không phải để cho gọn: mỗi `new PrismaClient()` mở một connection
 * pool riêng, nên tạo client trong từng request sẽ vét sạch `max_connections` của Postgres sau
 * vài chục lượt gọi — và triệu chứng là "DB chậm", không phải "code sai".
 *
 * Từ Prisma 7, chuỗi kết nối đi qua DRIVER ADAPTER chứ không còn nằm trong `schema.prisma`.
 * Đổi lại: driver là `pg` thật, nên timeout/SSL/pool cấu hình được bằng option của `pg`.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  // Dev cần thấy câu query để bắt N+1; production chỉ giữ cảnh báo và lỗi.
  log: isProduction ? ['warn', 'error'] : ['query', 'warn', 'error'],
});

export type { PrismaClient };
