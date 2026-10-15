import type { AppModule } from '../../common/module/app-module.js';
import { registerScreeningListeners } from './screening.events.js';
import { registerScreeningJobs } from './screening.jobs.js';
import { screeningRoutes } from './screening.routes.js';
import {
  createScreeningService,
  type ScreeningService,
  type ScreeningServiceDeps,
} from './screening.service.js';

export function createScreeningModule(deps: ScreeningServiceDeps): {
  service: ScreeningService;
  module: AppModule;
} {
  const service = createScreeningService(deps);
  return {
    service,
    module: {
      name: 'screening',
      routes: async (app) => {
        await app.register(screeningRoutes, { screening: service });
      },
      listeners: (dispatcher) => registerScreeningListeners(dispatcher, service),
      jobs: (jobs) => registerScreeningJobs(jobs, service),
      startup: () => service.ensureRules(),
    },
  };
}
