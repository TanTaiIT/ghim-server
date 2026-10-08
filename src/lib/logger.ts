import type { FastifyBaseLogger } from 'fastify';
import { pino } from 'pino';

import { env, isProduction, isTest } from '../config/env.js';

/**
 * MỘT logger cho cả tiến trình — Fastify nhận chính instance này qua `loggerInstance`, còn
 * script chạy ngoài HTTP (seed, job) import thẳng.
 *
 * Hai logger song song là cách nhanh nhất để nửa số dòng log mất `requestId` mà không ai nhận
 * ra: dòng nào đi qua `request.log` thì có, dòng nào gọi logger riêng thì không.
 *
 * `pino-pretty` CHỈ ở dev. Production ghi JSON một dòng vì đó là thứ máy đọc được — bật pretty
 * ở đó là vừa chậm vừa làm hỏng mọi bộ gom log.
 */
/*
 * Kiểu khai là `FastifyBaseLogger` chứ không phải `pino.Logger`, và đó không phải chuyện thẩm mỹ:
 * Fastify suy generic của cả instance từ kiểu của `loggerInstance`, nên để nguyên kiểu pino sẽ
 * sinh ra một `FastifyInstance` KHÁC kiểu mặc định — và mọi hàm nhận `FastifyInstance` (plugin,
 * route) lập tức không nhận nó nữa.
 */
export const logger: FastifyBaseLogger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { app: env.APP_NAME },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname,app' },
        },
      }),
});
