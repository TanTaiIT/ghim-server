import { afterAll, describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { createJobs } from '../src/lib/jobs.js';
import { prisma } from './db-helpers.js';

/*
 * pg-boss sống ở schema `pgboss`, ngoài tầm `truncateAll` (chỉ quét `public`): dọn lịch bằng tay
 * để lượt chạy sau bắt đầu sạch. Bảng của pg-boss thì giữ — nó tự quản.
 */
afterAll(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM pgboss.schedule');
  await prisma.$disconnect();
});

const noop = async (): Promise<void> => {};

describe('createJobs', () => {
  it('khai trước start được xếp chờ; start dựng schema pgboss riêng; stop đóng sạch', async () => {
    const jobs = createJobs(env.DATABASE_URL);

    // Khai trước khi nối DB — đúng thứ tự buildApp rồi server.ts start.
    await jobs.schedule('identity.thu', '0 9 * * *', noop);
    await jobs.work('identity.thu-viec', noop);
    await expect(jobs.send('identity.thu-viec', {})).rejects.toThrow(/chưa start/);

    await jobs.start();
    const [tables] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'pgboss'`;
    expect(Number(tables?.n)).toBeGreaterThan(0);
    await expect(
      prisma.$queryRaw`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'pgboss%'`,
    ).resolves.toEqual([]);

    const schedules = await prisma.$queryRaw<{ name: string; cron: string; timezone: string }[]>`
      SELECT name, cron, timezone FROM pgboss.schedule WHERE name = 'identity.thu'`;
    expect(schedules).toEqual([
      { name: 'identity.thu', cron: '0 9 * * *', timezone: 'Asia/Ho_Chi_Minh' },
    ]);

    // Khai sau start áp ngay; khai lại cùng tên không ném — tiến trình khởi động lần hai là thường.
    await jobs.schedule('identity.thu', '0 9 * * *', noop);
    await jobs.send('identity.thu-viec', { ok: true });
    const [queued] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pgboss.job WHERE name = 'identity.thu-viec'`;
    expect(Number(queued?.n)).toBeGreaterThan(0);

    // `startAfter` tới đúng cột hẹn giờ của pg-boss (quét cụm từ lần hai — fix-audit-image-checks).
    const startAfter = new Date(Date.now() + 15 * 60_000);
    await jobs.send('identity.thu-viec', { hen: true }, { startAfter });
    const [delayed] = await prisma.$queryRaw<{ start_after: Date }[]>`
      SELECT start_after FROM pgboss.job
       WHERE name = 'identity.thu-viec' AND data->>'hen' = 'true'`;
    expect(delayed?.start_after.getTime()).toBe(startAfter.getTime());

    await jobs.stop();
    await expect(jobs.send('identity.thu-viec', {})).rejects.toThrow(/chưa start/);
    // stop lần hai là no-op, không ném — shutdown có thể bị gọi từ hai tín hiệu.
    await jobs.stop();
  });
});
