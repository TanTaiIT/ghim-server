import { createQueueService, type ReviewQueueService } from './queue/queue.service.js';
import { createReviewShared, type ReviewServiceDeps } from './review.shared.js';

export type { ReviewServiceDeps } from './review.shared.js';

export type ReviewService = ReviewQueueService;

/**
 * Người duyệt (design add-review-queues): hàng chờ (`queue/`) — việc sinh, gộp, huỷ theo chuyện xảy ra với tin và nhóm,
 * việc theo lịch — và bàn xử việc (`desk/`) — xem, nhận, quyết; `stats/` cho master.
 */
export function createReviewService(deps: ReviewServiceDeps): ReviewService {
  const shared = createReviewShared(deps);
  return {
    ...createQueueService(shared),
  };
}
