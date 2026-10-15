import { createDecisionService, type ReviewDecisionService } from './desk/decision.service.js';
import { createDeskService, type ReviewDeskService } from './desk/desk.service.js';
import { createQueueService, type ReviewQueueService } from './queue/queue.service.js';
import { createReviewShared, type ReviewServiceDeps } from './review.shared.js';

export type { ReviewServiceDeps } from './review.shared.js';

export type ReviewService = ReviewQueueService & ReviewDeskService & ReviewDecisionService;

/**
 * Người duyệt (design add-review-queues): hàng chờ (`queue/`) — việc sinh, gộp, huỷ theo chuyện xảy ra với tin và nhóm,
 * việc theo lịch — và bàn xử việc (`desk/`) — xem, nhận, quyết; `stats/` cho master.
 */
export function createReviewService(deps: ReviewServiceDeps): ReviewService {
  const shared = createReviewShared(deps);
  const queue = createQueueService(shared);
  return {
    ...queue,
    ...createDeskService(shared),
    ...createDecisionService(shared, queue),
  };
}
