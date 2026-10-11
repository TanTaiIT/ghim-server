import { prisma } from '../src/lib/prisma.js';

/**
 * Tiện ích cho `*.db.test.ts`. Ghi thẳng bằng Prisma, không qua repository: thứ đang kiểm là DB có
 * TỪ CHỐI dữ liệu sai hay không, nên phải ghi được cả những dòng mà repository không bao giờ tạo ra.
 */

/** Xoá sạch dữ liệu, giữ bảng và lịch sử migration — mỗi ca bắt đầu từ DB rỗng. */
export async function truncateAll(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/** Sự kiện outbox theo thứ tự ghi; `id` là uuidv7 nên phân thứ tự được các dòng ghi cùng một mốc giờ. */
export const outboxEvents = () =>
  prisma.outboxEvent.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

export const lastOutboxEvent = async () => (await outboxEvents()).at(-1);

/** Nhật ký của một đối tượng theo thứ tự ghi. */
export const auditOf = (targetId: string) =>
  prisma.auditLog.findMany({ where: { targetId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

/** Mã lỗi Prisma (`P2002`…) của một lượt ghi bị DB từ chối; ghi được thì trả `null`. */
export async function prismaErrorCode(write: Promise<unknown>): Promise<string | null> {
  try {
    await write;
    return null;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
    throw error;
  }
}

/**
 * SQLSTATE Postgres của một lượt ghi bị từ chối. Lỗi không có mã Prisma riêng (exclusion 23P01,
 * CHECK 23514) đến dưới dạng P2039, mã thật nằm trong `meta` — đúng chỗ `errorHandler` đọc.
 */
export async function sqlStateOf(write: Promise<unknown>): Promise<string | null> {
  try {
    await write;
    return null;
  } catch (error) {
    const meta = (error as { meta?: { driverAdapterError?: { cause?: { code?: unknown } } } }).meta;
    const code = meta?.driverAdapterError?.cause?.code;
    if (typeof code === 'string') return code;
    throw error;
  }
}

export { prisma };
