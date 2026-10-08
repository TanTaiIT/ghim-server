import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

export interface HealthStatus {
  name: string;
  status: 'ok';
  env: string;
  uptime: number;
  timestamp: string;
}

/** Liveness: tiến trình còn sống không. KHÔNG chạm DB — xem `getReadiness`. */
export function getHealthStatus(): HealthStatus {
  return {
    name: env.APP_NAME,
    status: 'ok',
    env: env.NODE_ENV,
    uptime: Math.round(process.uptime() * 1000) / 1000,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness: nhận request được chưa — tức phụ thuộc bên ngoài đã sẵn sàng chưa.
 *
 * Tách khỏi liveness vì hai câu hỏi dẫn tới hai hành động trái ngược nhau. Orchestrator GIẾT
 * container khi liveness hỏng, nhưng chỉ NGỪNG ĐẨY TRAFFIC khi readiness hỏng. Gộp làm một thì
 * một lần Postgres khởi động lại sẽ kéo theo cả đàn app bị restart vòng quanh.
 */
export async function getReadiness(): Promise<{ database: 'up' | 'down' }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { database: 'up' };
  } catch {
    return { database: 'down' };
  }
}
