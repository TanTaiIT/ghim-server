import { createListingFactsService, type ListingFactsService } from './listing.facts.service.js';
import {
  createListingReactionService,
  type ListingReactionService,
} from './listing.reaction.service.js';
import { createListingReadService, type ListingReadService } from './listing.read.service.js';
import { createListingShared, type ListingServiceDeps } from './listing.shared.js';
import { createListingSystemService, type ListingSystemService } from './listing.system.service.js';
import {
  createListingPostingService,
  type ListingPostingService,
} from './posting/posting.service.js';

export type { ListingServiceDeps } from './listing.shared.js';

export type ListingService = ListingPostingService &
  ListingReadService &
  ListingSystemService &
  ListingReactionService &
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
    ...createListingSystemService(shared),
    ...createListingReactionService(shared),
    ...createListingFactsService(shared),
  };
}
