import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from './fakes/app.js';

/**
 * Test HTTP qua `app.inject()` — chạy đúng app thật (plugin, schema, error handler) nhưng
 * KHÔNG mở cổng nào, nên nhiều file test chạy song song không giẫm chân nhau.
 *
 * Các ca ở đây chỉ chạm những đường KHÔNG cần DB: chúng kiểm phần hạ tầng — vỏ response, mã
 * truy vết, header bảo mật — thứ hỏng là hỏng toàn bộ API.
 */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.get('/__test/ip', async (request) => ({ ip: request.ip }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

  it('x-request-id quá dài hay có ký tự lạ thì bị thay bằng UUID mới', async () => {
    const tooLong = 'a'.repeat(129);
    const atLimit = 'b'.repeat(128);
    const [long, odd, limit] = await Promise.all(
      [tooLong, 'abc<script>', atLimit].map((id) =>
        app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': id } }),
      ),
    );
    expect(long?.headers['x-request-id']).toMatch(UUID);
    expect(odd?.headers['x-request-id']).toMatch(UUID);
    expect(limit?.headers['x-request-id']).toBe(atLimit);
  });

  it('không có proxy tin được: X-Forwarded-For giả không đổi được IP của request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/__test/ip',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(res.json()).toEqual({ ip: '127.0.0.1' });
  });

  it('helmet đang bật', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Tài liệu API', () => {
  it('ngoài production: /docs mở được', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBe(200);
  });

  /*
   * `isProduction` chốt lúc nạp `env.ts`, nên phải nạp lại cả cây module với env production —
   * không có cách nào bật nó cho riêng một app đã dựng.
   */
  it('production: /docs không tồn tại', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://ghim:ghim@localhost:5432/ghim');
    vi.stubEnv('LOG_LEVEL', 'error');
    // Production bắt buộc hai biến này (env.ts); các khoá còn lại đã có từ vitest.config.ts.
    vi.stubEnv('SMTP_URL', 'smtps://user:pass@smtp.example.com:465');
    vi.stubEnv('GOOGLE_CLIENT_IDS', 'ios-id.apps.googleusercontent.com');
    vi.stubEnv('CORS_ORIGIN', 'https://ops.ghim.vn');
    vi.stubEnv('TRUST_PROXY', 'uniquelocal');
    try {
      // Qua bản giả để không chạm DB; `fakes/app.js` nạp lại `src/app.js` dưới env production.
      const { buildTestApp: buildProductionApp } = await import('./fakes/app.js');
      const production = await buildProductionApp();
      const res = await production.inject({ method: 'GET', url: '/docs' });
      await production.close();

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
