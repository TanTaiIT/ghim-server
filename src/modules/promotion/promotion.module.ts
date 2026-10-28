import type { AppModule } from '../../common/module/app-module.js';
import { registerPromotionListeners } from './promotion.events.js';
import { registerPromotionJobs } from './promotion.jobs.js';
import { promotionRoutes } from './promotion.routes.js';
import {
  createPromotionService,
  type PromotionService,
  type PromotionServiceDeps,
} from './promotion.service.js';

/** Gói đẩy tin trả Xu (change add-promotions): dựng sau `wallet`, trước `notification`. */
export function createPromotionModule(deps: PromotionServiceDeps): {
  service: PromotionService;
  module: AppModule;
} {
  const service = createPromotionService(deps);
  return {
    service,
    module: {
      name: 'promotion',
      routes: async (app) => {
        await app.register(promotionRoutes, { promotion: service });
      },
      listeners: (dispatcher) => registerPromotionListeners(dispatcher, service),
      jobs: (jobs) => registerPromotionJobs(jobs, service),
      startup: () => service.ensureProducts(),
    },
  };
}
