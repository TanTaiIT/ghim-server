import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { errorHandler } from '../src/common/errors/error-handler.js';
import { priceSchema } from '../src/common/schemas/money.js';
import { ok, toOk } from '../src/common/schemas/response.js';

/**
 * Giá đi qua đúng đường thật: request number → handler nhận bigint → response lại là number.
 * Kiểm qua HTTP chứ không gọi `parse` trần, vì chiều ENCODE chỉ chạy trong serializer của Fastify.
 */
const app = Fastify().withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
app.setErrorHandler(errorHandler);

const body = z.object({ price: priceSchema });
let received: unknown;

app.post('/echo', {
  schema: { body, response: { 200: ok(body) } },
  handler: async (request) => {
    received = request.body.price;
    return toOk({ price: request.body.price });
  },
});

app.get('/too-big', {
  schema: { response: { 200: ok(body) } },
  handler: async () => toOk({ price: 2n ** 60n }),
});

afterAll(() => app.close());

describe('priceSchema', () => {
  it('number vào, bigint trong handler, number ra', async () => {
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { price: 2_500_000 } });

    expect(res.statusCode).toBe(200);
    expect(received).toBe(2_500_000n);
    expect(res.json()).toEqual({ success: true, data: { price: 2_500_000 } });
  });

  it('0 hợp lệ — nghĩa là cho tặng', async () => {
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { price: 0 } });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ['âm', -1],
    ['số lẻ', 1500.5],
    ['chuỗi', '1500000'],
  ])('giá %s → 400', async (_label, price) => {
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { price } });
    expect(res.statusCode).toBe(400);
  });

  it('giá vượt số nguyên an toàn ở response → 500, không trả một số đã bị làm tròn', async () => {
    const res = await app.inject({ method: 'GET', url: '/too-big' });
    expect(res.statusCode).toBe(500);
  });
});
