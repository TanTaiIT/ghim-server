import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

/**
 * Test HTTP qua `app.inject()` — chạy đúng app thật (plugin, schema, error handler) nhưng
 * KHÔNG mở cổng nào, nên nhiều file test chạy song song không giẫm chân nhau.
 *
 * Các ca ở đây chỉ chạm những đường KHÔNG cần DB: chúng kiểm phần hạ tầng — vỏ response, mã
 * truy vết, header bảo mật — thứ hỏng là hỏng toàn bộ API.
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Hạ tầng HTTP', () => {
  it('GET /health trả 200 trong vỏ chuẩn', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('route không tồn tại trả 404 CŨNG trong vỏ chuẩn', async () => {
    const res = await app.inject({ method: 'GET', url: '/khong-co-duong-nay' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('giữ nguyên x-request-id từ ngoài để ghép được dòng thời gian xuyên service', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'dau-vet-tu-ngoai' },
    });

    expect(res.headers['x-request-id']).toBe('dau-vet-tu-ngoai');
  });

  it('không có x-request-id thì tự sinh, và vẫn trả ra header', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('helmet đang bật', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
