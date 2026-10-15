import type { AppModule } from '../../common/module/app-module.js';
import { registerReviewListeners } from './review.events.js';
import { registerReviewJobs } from './review.jobs.js';
import { reviewRoutes } from './review.routes.js';
import {
  createReviewService,
  type ReviewService,
  type ReviewServiceDeps,
} from './review.service.js';

export function createReviewModule(deps: ReviewServiceDeps): {
  service: ReviewService;
  module: AppModule;
} {
  const service = createReviewService(deps);
  return {
    service,
    module: {
      name: 'review',
      routes: async (app) => {
        await app.register(reviewRoutes, { review: service });
      },
      listeners: (dispatcher) => registerReviewListeners(dispatcher, service),
      jobs: (jobs) => registerReviewJobs(jobs, service),
      startup: async () => ({
        ...(await service.ensureReasonTemplates()),
        ...(await service.backfill()),
      }),
    },
  };
}
