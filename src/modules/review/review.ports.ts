import type { CategoryService } from '../category/category.service.js';
import type { GroupService } from '../group/group.service.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { ListingService } from '../listing/listing.service.js';
import type { MediaService } from '../media/media.service.js';
import type { PlatformService } from '../platform/platform.service.js';
import type { ScreeningService } from '../screening/screening.service.js';
import type { TrustService } from '../trust/trust.service.js';

/*
 * Điều `review` hỏi và gọi ở module khác (design add-review-queues mục 8) — chỉ qua cổng, không đọc bảng của ai. Chiều
 * ngược lại (`OpenWork` cho `listing`) khai ở `listing.ports.ts`.
 */

export type ReviewListingPort = Pick<
  ListingService,
  | 'reviewSubject'
  | 'forReviewer'
  | 'pendingInGroup'
  | 'reviewBacklog'
  | 'review'
  | 'confirmLive'
  | 'detachByGroup'
>;
export type ReviewScreeningPort = Pick<ScreeningService, 'runOf' | 'duplicateMatches'>;
export type ReviewIdentityPort = Pick<
  IdentityService,
  'sharedDeviceAccounts' | 'masterIds' | 'accountSummaries'
>;
export type ReviewTrustPort = Pick<TrustService, 'tierOf' | 'cleanCount'>;
export type ReviewGroupPort = Pick<GroupService, 'reviewersOf'>;
export type ReviewPlatformPort = Pick<PlatformService, 'activeStaffByCategory'>;
export type ReviewCategoryPort = Pick<CategoryService, 'settingsOf'>;
export type ReviewMediaPort = Pick<MediaService, 'ownersOf'>;
