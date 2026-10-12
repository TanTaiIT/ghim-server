import type { AppModule } from '../../common/module/app-module.js';
import { registerListingListeners } from './listing.events.js';
import { registerListingJobs } from './listing.jobs.js';
import { listingRoutes } from './listing.routes.js';
import {
  createListingService,
  type ListingService,
  type ListingServiceDeps,
} from './listing.service.js';

export function createListingModule(deps: ListingServiceDeps): {
  service: ListingService;
  module: AppModule;
} {
  const service = createListingService(deps);
  return {
    service,
    module: {
      name: 'listing',
      routes: async (app) => {
        await app.register(listingRoutes, { listing: service });
      },
      listeners: (dispatcher) => registerListingListeners(dispatcher, service),
      jobs: (jobs) => registerListingJobs(jobs, service),
    },
  };
}
