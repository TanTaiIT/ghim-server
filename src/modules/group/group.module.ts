import type { AppModule } from '../../common/module/app-module.js';
import { registerGroupListeners } from './group.events.js';
import { registerGroupJobs } from './group.jobs.js';
import { groupManageRoutes } from './group.manage.routes.js';
import { groupOpsRoutes } from './group.ops.routes.js';
import { groupRoutes } from './group.routes.js';
import { createGroupService, type GroupService, type GroupServiceDeps } from './group.service.js';

export function createGroupModule(deps: GroupServiceDeps): {
  service: GroupService;
  module: AppModule;
} {
  const service = createGroupService(deps);
  return {
    service,
    module: {
      name: 'group',
      routes: async (app) => {
        await app.register(groupRoutes, { group: service });
        await app.register(groupManageRoutes, { group: service });
        await app.register(groupOpsRoutes, { group: service });
      },
      listeners: (dispatcher) => registerGroupListeners(dispatcher, service),
      jobs: (jobs) => registerGroupJobs(jobs, service),
    },
  };
}
