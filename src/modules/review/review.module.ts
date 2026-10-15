import type { AppModule } from '../../common/module/app-module.js';
import { registerReviewListeners } from './review.events.js';
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
      listeners: (dispatcher) => registerReviewListeners(dispatcher, service),
      startup: () => service.backfill(),
    },
  };
}
