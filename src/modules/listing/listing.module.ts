import type { AppModule } from '../../common/module/app-module.js';
import { type DevMachineReview, registerListingListeners } from './listing.events.js';
import { registerListingJobs } from './listing.jobs.js';
import { listingRoutes } from './listing.routes.js';
import {
  createListingService,
  type ListingService,
  type ListingServiceDeps,
} from './listing.service.js';

export function createListingModule(
  deps: ListingServiceDeps & { devMachineReview: DevMachineReview },
): { service: ListingService; module: AppModule } {
  const { devMachineReview, ...serviceDeps } = deps;
  const service = createListingService(serviceDeps);
  return {
    service,
    module: {
      name: 'listing',
      routes: async (app) => {
        await app.register(listingRoutes, { listing: service });
      },
      listeners: (dispatcher) =>
        registerListingListeners(dispatcher, service, { devMachineReview }),
      jobs: (jobs) => registerListingJobs(jobs, service),
    },
  };
}
