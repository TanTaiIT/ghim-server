import { createListingBoostService, type ListingBoostService } from './boost/boost.service.js';
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
  createListingSuggestionService,
  type ListingSuggestionService,
} from './read/suggestion.service.js';
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
  ListingSuggestionService &
  ListingSystemService &
  ListingCascadeService &
  ListingRetentionService &
  ListingFactsService &
  ListingBoostService;

/**
 * Ghép bốn mặt của `listing` (người đăng, người xem, hệ thống, phản ứng với module khác) trên một phần dùng chung — như `group`, để mỗi file
 * dưới 500 dòng mà không lặp luật nào.
 */
export function createListingService(deps: ListingServiceDeps): ListingService {
  const shared = createListingShared(deps);
  const read = createListingReadService(shared);
  const suggestion = createListingSuggestionService(shared);
  return {
    ...createListingPostingService(shared),
    ...read,
    // Lịch sử thao tác ghi ở đường đọc, sau khi đã có kết quả (design add-home-suggestions mục 3).
    async get(actor, id) {
      const dto = await read.get(actor, id);
      await suggestion.recordView(actor, dto);
      return dto;
    },
    async feed(actor, query) {
      const page = await read.feed(actor, query);
      await suggestion.recordSearch(actor, query);
      return page;
    },
    ...createListingSavedSearchService(shared),
    ...suggestion,
    ...createListingSystemService(shared),
    ...createListingCascadeService(shared),
    ...createListingRetentionService(shared),
    ...createListingFactsService(shared),
    ...createListingBoostService(shared),
  };
}
