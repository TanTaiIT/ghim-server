import { Prisma } from '@prisma/client';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ForbiddenError } from '../src/common/errors/app-error.js';
import { errorHandler } from '../src/common/errors/error-handler.js';
import { ok } from '../src/common/schemas/response.js';
import { StorageUnavailableError } from '../src/lib/storage/storage.js';

/**
 * Mọi lỗi ra ngoài qua MỘT cửa (`errorHandler`). Dựng một app tối giản với đúng handler đó và các
 * route ném lỗi giả — không cần DB để biết lỗi nào ra status nào.
 */
const app = Fastify().withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
app.setErrorHandler(errorHandler);

app.get('/prisma/:code', async (request) => {
  const { code } = request.params as { code: string };
  throw new Prisma.PrismaClientKnownRequestError('lỗi giả', { code, clientVersion: 'test' });
});

// Hình dạng thật của lỗi Postgres qua driver adapter (bắt được trên Postgres 18 ở dự án booking).
app.get('/postgres/:sqlState', async (request) => {
  const { sqlState } = request.params as { sqlState: string };
  throw new Prisma.PrismaClientKnownRequestError('lỗi giả', {
    code: 'P2039',
    clientVersion: 'test',
    meta: { driverAdapterError: { name: 'DriverAdapterError', cause: { code: sqlState } } },
  });
});

app.get('/forbidden', async () => {
  throw new ForbiddenError('Tài khoản đang bị khoá.', 'ACCOUNT_LOCKED');
});

app.get('/unexpected', async () => {
  throw new Error('SELECT * FROM users WHERE email = ...');
});

app.get('/storage-unavailable', async () => {
  throw new StorageUnavailableError('đọc thông tin ảnh', new Error('Cloudinary 420 Rate Limit'));
});

app.post('/validate', {
  schema: { body: z.object({ title: z.string().min(1) }) },
  handler: async () => ({ ok: true }),
});

app.get('/wrong-shape', {
  schema: { response: { 200: ok(z.object({ id: z.string() })) } },
  // Cố ý trả sai hình dạng đã khai: serializer phải chặn lại, không để lọt ra client.
  handler: async () => ({ success: true, data: { id: 123 } }) as never,
});

afterAll(() => app.close());

describe('errorHandler — lỗi nghiệp vụ (AppError)', () => {
  it('giữ nguyên status và code riêng để client rẽ nhánh theo lý do', async () => {
    const res = await app.inject({ method: 'GET', url: '/forbidden' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      success: false,
      error: { code: 'ACCOUNT_LOCKED', message: 'Tài khoản đang bị khoá.' },
    });
  });
});

describe('errorHandler — lỗi Prisma', () => {
  it.each([
    ['P2002', 409, 'CONFLICT'],
    ['P2025', 404, 'NOT_FOUND'],
    ['P2003', 409, 'CONFLICT'],
    // Deadlock (40P01) hay không xếp được thứ tự (40001) qua adapter-pg — thử lại là qua (fix-audit-group).
    ['P2034', 409, 'CONFLICT'],
  ])('%s → %i %s, câu báo tiếng Việt', async (code, status, errorCode) => {
    const res = await app.inject({ method: 'GET', url: `/prisma/${code}` });
    expect(res.statusCode).toBe(status);
    expect(res.json()).toMatchObject({ success: false, error: { code: errorCode } });
    // Không lộ câu lỗi gốc của Prisma (có thể mang tên bảng, tên cột) ra ngoài.
    expect(res.json().error.message).not.toContain('lỗi giả');
  });

  it('mã Prisma chưa lường trước → 500, không lộ chi tiết', async () => {
    const res = await app.inject({ method: 'GET', url: '/prisma/P2011' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống' },
    });
  });
});

describe('errorHandler — lỗi Postgres qua driver adapter (P2039)', () => {
  it.each([
    ['23P01', 'exclusion'],
    ['23514', 'vi phạm CHECK'],
  ])('%s — %s → 409 CONFLICT', async (sqlState) => {
    const res = await app.inject({ method: 'GET', url: `/postgres/${sqlState}` });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'CONFLICT' } });
  });

  it('P2039 mang SQLSTATE chưa lường trước → 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/postgres/57014' });
    expect(res.statusCode).toBe(500);
  });
});

describe('errorHandler — kho ảnh không trả lời', () => {
  it('503 STORAGE_UNAVAILABLE kèm câu thử lại, không lộ lỗi gốc của kho', async () => {
    const res = await app.inject({ method: 'GET', url: '/storage-unavailable' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(res.body).not.toContain('Cloudinary');
  });
});

describe('errorHandler — validate và serialize', () => {
  it('body sai schema → 400 VALIDATION_ERROR kèm chi tiết từng field', async () => {
    const res = await app.inject({ method: 'POST', url: '/validate', payload: { title: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(res.json().error.details).toBeDefined();
  });

  it('server trả sai hình dạng đã khai → 500, KHÔNG phải 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/wrong-shape' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL_ERROR');
  });

  it('lỗi không lường trước → 500 và nuốt chi tiết (có thể mang câu SQL)', async () => {
    const res = await app.inject({ method: 'GET', url: '/unexpected' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('SELECT');
  });
});
