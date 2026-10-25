import type { ListingFactsService } from './listing.ports.js';
import { createListingShared, type ListingServiceDeps } from './listing.shared.js';
import {
  createListingPostingService,
  type ListingPostingService,
} from './posting/posting.service.js';
import { createListingFactsService } from './read/facts.service.js';
import { createListingReadService, type ListingReadService } from './read/read.service.js';
import {
  createListingSavedSearchService,
  type ListingSavedSearchService,
} from './read/saved-search.service.js';
import {
  createListingRetentionService,
  type ListingRetentionService,
} from './system/retention.service.js';
import {
  createListingCascadeService,
  type ListingCascadeService,
} from './system/cascade.service.js';
import { createListingSystemService, type ListingSystemService } from './system/system.service.js';

export type { ListingServiceDeps } from './listing.shared.js';

export type ListingService = ListingPostingService &
  ListingReadService &
  ListingSavedSearchService &
  ListingSystemService &
  ListingCascadeService &
  ListingRetentionService &
  ListingFactsService;

/**
 * Ghép bốn mặt của `listing` (người đăng, người xem, hệ thống, phản ứng với module khác) trên một phần dùng chung — như `group`, để mỗi file
 * dưới 500 dòng mà không lặp luật nào.
 */
export function createListingService(deps: ListingServiceDeps): ListingService {
  const shared = createListingShared(deps);
  return {
    ...createListingPostingService(shared),
    ...createListingReadService(shared),
    ...createListingSavedSearchService(shared),
    ...createListingSystemService(shared),
    ...createListingCascadeService(shared),
    ...createListingRetentionService(shared),
    ...createListingFactsService(shared),
  };
}
