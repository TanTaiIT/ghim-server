import type { AppModule } from '../../common/module/app-module.js';
import { registerTrustListeners } from './trust.events.js';
import { registerTrustJobs } from './trust.jobs.js';
import { trustRoutes } from './trust.routes.js';
import { createTrustService, type TrustService, type TrustServiceDeps } from './trust.service.js';

export function createTrustModule(deps: TrustServiceDeps): {
  service: TrustService;
  module: AppModule;
} {
  const service = createTrustService(deps);
  return {
    service,
    module: {
      name: 'trust',
      routes: async (app) => {
        await app.register(trustRoutes, { trust: service });
      },
      listeners: (dispatcher) => registerTrustListeners(dispatcher, service),
      jobs: (jobs) => registerTrustJobs(jobs, service),
      startup: () => service.ensureRuleArticles(),
    },
  };
}
