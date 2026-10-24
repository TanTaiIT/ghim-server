import { SHOP_TIME_ZONE } from '../../common/time/time.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { ListingService } from '../listing/listing.service.js';
import type { ReviewService } from '../review/review.service.js';
import type { ScreeningService } from '../screening/screening.service.js';
import { dayKeys, mergeDaily, rangeFor } from './calc/daily-stats.calc.js';
import type { DailyStatsDto, DailyStatsQuery } from './ops.schema.js';

/** Cổng đếm theo ngày của bốn module (design add-ops-daily-stats mục 1) — `ops` không đọc bảng của ai. */
export interface DailyStatsDeps {
  identity: Pick<IdentityService, 'newAccountsByDay'>;
  listings: Pick<ListingService, 'firstLiveByDay'>;
  screening: Pick<ScreeningService, 'runsByDay'>;
  review: Pick<ReviewService, 'decisionsByDay'>;
  clock: () => Date;
}

export interface DailyStatsService {
  /** Bảng số N ngày gần nhất theo giờ Việt Nam, hôm nay trước — tính lúc hỏi, không lưu (spec ops/daily-stats). */
  dailyStats(query: DailyStatsQuery): Promise<DailyStatsDto>;
}

export function createDailyStatsService(deps: DailyStatsDeps): DailyStatsService {
  return {
    async dailyStats({ days }) {
      const now = deps.clock();
      const { from, to } = rangeFor(now, days);
      const [accounts, firstLive, runs, decisions] = await Promise.all([
        deps.identity.newAccountsByDay(from, to),
        deps.listings.firstLiveByDay(from, to),
        deps.screening.runsByDay(from, to),
        deps.review.decisionsByDay(from, to),
      ]);
      return {
        timeZone: SHOP_TIME_ZONE,
        days: mergeDaily(dayKeys(now, days), { accounts, firstLive, runs, decisions }),
      };
    },
  };
}
