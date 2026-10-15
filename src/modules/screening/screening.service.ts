import { createListsService, type ScreeningListsService } from './ops/lists.service.js';
import { createLookupService, type ScreeningLookupService } from './ops/lookup.service.js';
import { createPhrasesService, type ScreeningPhrasesService } from './ops/phrases.service.js';
import { createRulesService, type ScreeningRulesService } from './ops/rules.service.js';
import { createConclusion } from './run/conclusion.js';
import { createFactsService, type ScreeningFactsService } from './run/facts.service.js';
import { createImageService, type ScreeningImageService } from './run/image.service.js';
import { createNoticeService, type ScreeningNoticeService } from './run/notice.service.js';
import { createRunService, type ScreeningRunService } from './run/run.service.js';
import { createUpkeepService, type ScreeningUpkeepService } from './run/upkeep.service.js';
import { createScreeningShared, type ScreeningServiceDeps } from './screening.shared.js';

export type { ScreeningServiceDeps } from './screening.shared.js';

/**
 * Máy duyệt (design add-screening): lượt qua máy (`run/`) — chấm chữ trong lượt gửi, kiểm ảnh qua hàng việc, lưới an toàn,
 * câu báo cho module khác — và bàn vận hành (`ops/`) — luật, cụm từ, danh sách trắng, từ khoá, tra mã; dữ kiện lượt máy cho người duyệt (`run/facts`).
 */
export interface ScreeningService
  extends
    ScreeningRunService,
    ScreeningImageService,
    ScreeningUpkeepService,
    ScreeningNoticeService,
    ScreeningRulesService,
    ScreeningPhrasesService,
    ScreeningListsService,
    ScreeningLookupService,
    ScreeningFactsService {}

export function createScreeningService(deps: ScreeningServiceDeps): ScreeningService {
  const shared = createScreeningShared(deps);
  const conclusion = createConclusion(shared);
  return {
    ...createRunService(shared, conclusion),
    ...createImageService(shared, conclusion),
    ...createUpkeepService(shared, conclusion),
    ...createNoticeService(shared),
    ...createRulesService(shared),
    ...createPhrasesService(shared),
    ...createListsService(shared),
    ...createLookupService(shared),
    ...createFactsService(shared),
  };
}
