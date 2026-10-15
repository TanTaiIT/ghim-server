import { createDecisionService, type ReviewDecisionService } from './desk/decision.service.js';
import { createDeskService, type ReviewDeskService } from './desk/desk.service.js';
import { createQueueService, type ReviewQueueService } from './queue/queue.service.js';
import { createReviewShared, type ReviewServiceDeps } from './review.shared.js';
import { createScheduleService, type ReviewScheduleService } from './schedule/schedule.service.js';

export type { ReviewServiceDeps } from './review.shared.js';

export type ReviewService = ReviewQueueService &
  ReviewDeskService &
  ReviewDecisionService &
  ReviewScheduleService;

/**
 * Người duyệt (design add-review-queues): hàng chờ (`queue/`) — việc sinh, gộp, huỷ theo chuyện xảy ra với tin và nhóm;
 * việc theo lịch (`schedule/`); bàn xử việc (`desk/`) — xem, nhận, quyết; `stats/` cho master.
 */
export function createReviewService(deps: ReviewServiceDeps): ReviewService {
  const shared = createReviewShared(deps);
  const queue = createQueueService(shared);
  return {
    ...queue,
    ...createDeskService(shared),
    ...createDecisionService(shared, queue),
    ...createScheduleService(shared, queue),
  };
}
