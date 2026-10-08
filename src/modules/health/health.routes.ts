import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { ok, toOk } from '../../common/schemas/response.js';
import { getHealthStatus, getReadiness } from './health.service.js';

const TAGS = ['Health'];

const healthSchema = z.object({
  name: z.string(),
  status: z.literal('ok'),
  env: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});

const readinessSchema = z.object({ database: z.enum(['up', 'down']) });

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', {
    schema: { tags: TAGS, summary: 'Liveness', response: { 200: ok(healthSchema) } },
    handler: async () => toOk(getHealthStatus()),
  });

  app.get('/health/ready', {
    schema: {
      tags: TAGS,
      summary: 'Readiness (có chạm DB)',
      response: { 200: ok(readinessSchema), 503: ok(readinessSchema) },
    },
    handler: async (_request, reply) => {
      const result = await getReadiness();
      // 503 khi DB chết: đây là con số orchestrator đọc để ngừng đẩy traffic. Trả 200 kèm
      // `database: 'down'` là thứ không ai đọc, và traffic vẫn chảy vào một app không phục vụ được.
      return reply.status(result.database === 'up' ? 200 : 503).send(toOk(result));
    },
  });
};
