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
  | 'titles'
  | 'pendingInGroup'
  | 'reviewBacklog'
  | 'review'
  | 'confirmLive'
  | 'detachByGroup'
  | 'lockForReview'
  | 'reportTarget'
>;
export type ReviewScreeningPort = Pick<ScreeningService, 'runOf' | 'duplicateMatches'>;
export type ReviewIdentityPort = Pick<
  IdentityService,
  'sharedDeviceAccounts' | 'masterIds' | 'accountSummaries' | 'deviceToken' | 'lockFromReport'
>;
export type ReviewTrustPort = Pick<TrustService, 'tierOf' | 'cleanCount' | 'voidByReport'>;
export type ReviewGroupPort = Pick<
  GroupService,
  'reviewersOf' | 'isMember' | 'isBanned' | 'banFromReport'
>;
export type ReviewPlatformPort = Pick<
  PlatformService,
  'activeStaffByCategory' | 'activeStaffWithScope'
>;
export type ReviewCategoryPort = Pick<CategoryService, 'settingsOf'>;
export type ReviewMediaPort = Pick<MediaService, 'ownersOf'>;
