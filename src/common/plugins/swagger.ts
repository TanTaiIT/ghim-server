import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

import { env, isProduction } from '../../config/env.js';

/**
 * Tài liệu API sinh TỪ CHÍNH schema Zod đang validate request — `jsonSchemaTransform` là chỗ
 * nối hai thứ đó.
 *
 * Giá trị nằm ở chỗ tài liệu không thể lệch với thực tế: sửa schema là sửa cả validate, type và
 * tài liệu trong một lượt. Tài liệu viết tay thì luôn đúng đúng một ngày.
 *
 * MẶC ĐỊNH TẮT ở production: `/docs` là bản đồ đầy đủ của API, gồm cả endpoint quản trị. Bật
 * lại có ý thức bằng `SWAGGER_ENABLED` nếu API là public.
 */
export async function registerSwagger(app: FastifyInstance): Promise<void> {
  if (isProduction) return;

  await app.register(swagger, {
    openapi: {
      info: { title: `${env.APP_NAME} API`, version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });
}
