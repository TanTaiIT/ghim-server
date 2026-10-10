import { Prisma } from '@prisma/client';

/**
 * Đúng lớp lỗi Prisma ném khi DB chặn một unique: `errorHandler` nhận ra và trả 409 `CONFLICT` như ở
 * production. Lớp lỗi tự chế mang `code = 'P2002'` thì service vẫn rẽ đúng nhánh, nhưng qua HTTP lại
 * thành 500 — test xanh ở chỗ production trả khác (rà soát 10/10/2026).
 */
export function uniqueViolation(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on ${target}`, {
    code: 'P2002',
    clientVersion: 'fake',
    meta: { target },
  });
}
