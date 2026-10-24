import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import {
  dailyStatsQuerySchema,
  dailyStatsSchema,
  jobRunSchema,
  jobRunsQuerySchema,
} from './ops.schema.js';
import type { OpsService } from './ops.service.js';

export interface OpsRoutesOptions {
  ops: OpsService;
}

const TAGS = ['Ops · Jobs'];
const TAGS_STATS = ['Ops · Stats'];
const bearer = [{ bearerAuth: [] }];

/** Sổ việc nền là của master (TK 26 luật 2 "làm dở thì phải nói ra" — nói ở đây). */
export const opsRoutes: FastifyPluginAsyncZod<OpsRoutesOptions> = async (app, { ops }) => {
  app.get('/ops/jobs/runs', {
    preHandler: [app.authenticate, app.requireMaster],
    schema: {
      tags: TAGS,
      summary: 'Kết quả các lượt việc theo lịch gần nhất: xong, mới làm được một phần, hay hỏng',
      security: bearer,
      querystring: jobRunsQuerySchema,
      response: { 200: ok(z.array(jobRunSchema)), 403: errorResponse },
    },
    handler: async (request) => toOk(await ops.listRuns(request.query)),
  });

  app.get('/ops/stats/daily', {
    preHandler: [app.authenticate, app.requireMaster],
    schema: {
      tags: TAGS_STATS,
      summary:
        'Số theo ngày Việt Nam, hôm nay trước: tài khoản mới, lượt gửi máy, tin lên bảng, kết quả máy, quyết định của người (master)',
      security: bearer,
      querystring: dailyStatsQuerySchema,
      response: { 200: ok(dailyStatsSchema), 400: errorResponse, 403: errorResponse },
    },
    handler: async (request) => toOk(await ops.dailyStats(request.query)),
  });
};
