import type { PrismaClient } from '@prisma/client';

import type { AppModule } from '../../common/module/app-module.js';
import { registerOpsJobs } from './ops.jobs.js';
import { opsRoutes } from './ops.routes.js';
import { createOpsService, type OpsService, type OpsServiceDeps } from './ops.service.js';

export interface OpsModuleDeps extends OpsServiceDeps {
  /** Việc dọn `outbox_events` đã phát — bảng hạ tầng không module nào sở hữu, `ops` nhận lại (CLAUDE.md luật 12). */
  prisma: PrismaClient;
}

/** Dựng sau cùng: `ops` gọi cổng hạn lưu của mọi module, không module nào gọi ngược lại. */
export function createOpsModule(deps: OpsModuleDeps): { service: OpsService; module: AppModule } {
  const service = createOpsService(deps);
  return {
    service,
    module: {
      name: 'ops',
      routes: async (app) => {
        await app.register(opsRoutes, { ops: service });
      },
      jobs: (jobs) =>
        registerOpsJobs(jobs, service, {
          prisma: deps.prisma,
          runLog: deps.repository,
          clock: deps.clock,
        }),
    },
  };
}
