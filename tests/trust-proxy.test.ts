import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { parseTrustProxy } from '../src/config/trust-proxy.js';

describe('parseTrustProxy', () => {
  it('không proxy, danh sách IP / CIDR, dải đặt tên', () => {
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy(' 10.0.0.0/8, 192.168.1.10 ,::1/128, uniquelocal')).toEqual([
      '10.0.0.0/8',
      '192.168.1.10',
      '::1/128',
      'uniquelocal',
    ]);
  });

  it('tin mọi proxy, số hop và giá trị lạ → null', () => {
    for (const raw of ['true', '1', '0', 'abc', '10.0.0.0/33', '10.0.0.1/8/1', '10.0.0.0/x', '']) {
      expect(parseTrustProxy(raw)).toBeNull();
    }
  });
});

/** Fastify thật với `trustProxy` từ `parseTrustProxy`; `inject` nối từ 127.0.0.1. */
async function ipSeenWith(raw: string): Promise<string> {
  const app = Fastify({ trustProxy: parseTrustProxy(raw) ?? false });
  app.get('/ip', async (request) => ({ ip: request.ip }));
  const res = await app.inject({
    method: 'GET',
    url: '/ip',
    headers: { 'x-forwarded-for': '203.0.113.9' },
  });
  await app.close();
  return res.json().ip as string;
}

describe('IP của request theo TRUST_PROXY', () => {
  it('người nối vào là proxy được khai → lấy IP client từ X-Forwarded-For', async () => {
    expect(await ipSeenWith('loopback')).toBe('203.0.113.9');
  });

  it('người nối vào không nằm trong danh sách proxy → X-Forwarded-For bị bỏ qua', async () => {
    expect(await ipSeenWith('10.0.0.0/8')).toBe('127.0.0.1');
    expect(await ipSeenWith('false')).toBe('127.0.0.1');
  });
});
