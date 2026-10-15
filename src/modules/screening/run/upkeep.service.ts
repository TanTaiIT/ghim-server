import type { LiveListingFacts } from '../../listing/listing.ports.js';
import { buildPhraseMatcher } from '../calc/phrase.calc.js';
import { priceRange } from '../calc/price-stats.calc.js';
import { SCREENING_EVENTS, screeningEvent } from '../screening.outbox.js';
import { DAY_MS, MINUTE_MS, type ScreeningShared } from '../screening.shared.js';
import type { Conclusion } from './conclusion.js';

/** Lô đọc tin đang hiển thị: đủ lớn để ít lượt, đủ nhỏ để một lượt không giữ nhiều bộ nhớ. */
const LIVE_BATCH = 500;

export interface ScreeningUpkeepService {
  /** Lưới an toàn mỗi 5 phút (design mục 10). */
  safetyNet(): Promise<{ timedOut: number; restricted: number }>;
  /** Khoảng giá thường thấy của mọi danh mục, lượt đêm (câu 7); trả số danh mục đã tính. */
  refreshPriceStats(): Promise<number>;
  /** Bật thật cụm mức chắc: rút tin đang hiển thị chứa cụm về chờ duyệt (design mục 7); trả số tin đã rút. */
  rescanPhrase(phraseId: string): Promise<number>;
}

export function createUpkeepService(
  shared: ScreeningShared,
  conclusion: Conclusion,
): ScreeningUpkeepService {
  const { repository, listings, categories, config, clock } = shared;

  /** Mọi tin đang hiển thị theo lô, lô sau chờ lô trước — con trỏ là mã tin cuối của lô vừa xử. */
  const eachLiveBatch = async (
    handle: (batch: LiveListingFacts[]) => Promise<number>,
    after: string | null = null,
  ): Promise<number> => {
    const batch = await listings.liveListings(after, LIVE_BATCH);
    const handled = batch.length === 0 ? 0 : await handle(batch);
    const last = batch.at(-1);
    if (batch.length < LIVE_BATCH || !last) return handled;
    return handled + (await eachLiveBatch(handle, last.id));
  };

  /** Tin đang hiện có ảnh chưa có kết quả (`pending` hay chưa có dòng) → hạn chế "máy" (câu 14). */
  const restrictUnchecked = async (batch: LiveListingFacts[]): Promise<number> => {
    const checks = await repository.imageChecks(batch.flatMap((listing) => listing.imageIds));
    const settled = new Set(
      checks.filter((check) => check.status !== 'pending').map((check) => check.imageId),
    );
    const missing = batch.filter((listing) => listing.imageIds.some((id) => !settled.has(id)));
    await repository.emit(
      missing.map((listing) =>
        screeningEvent(SCREENING_EVENTS.listingRestricted, { listingId: listing.id }),
      ),
    );
    return missing.length;
  };

  return {
    async safetyNet() {
      const now = clock();
      const stale = await repository.staleOpenRuns(
        new Date(now.getTime() - config.get('screening.imageResultTimeoutMinutes') * MINUTE_MS),
      );
      const concluded = await Promise.all(
        stale.map((run) => repository.inTransaction((tx) => conclusion.conclude(tx, run, true))),
      );
      return {
        timedOut: concluded.filter(Boolean).length,
        restricted: await eachLiveBatch(restrictUnchecked),
      };
    },

    async refreshPriceStats() {
      const now = clock();
      const since = new Date(now.getTime() - config.get('screening.priceWindowDays') * DAY_MS);
      const all = await categories.listAdmin();
      await Promise.all(
        all.map(async (category) => {
          const samples = await listings.priceSamples(category.id, since);
          const range = priceRange(
            samples,
            config.get('screening.abnormalPricePercentile'),
            config.get('screening.abnormalPriceFactor'),
          );
          await repository.savePriceStat(category.id, range, now);
        }),
      );
      return all.length;
    },

    async rescanPhrase(phraseId) {
      const phrase = await repository.findPhrase(phraseId);
      // Cụm mơ hồ không quét (câu 3); cụm đã bị tắt lại trước khi việc chạy thì thôi.
      if (phrase?.level !== 'certain' || phrase.mode !== 'on') return 0;
      const rules = await shared.rules.current();
      const matcher = buildPhraseMatcher([phrase]);
      return eachLiveBatch(async (batch) => {
        const hits = batch.filter((listing) => matcher.match(listing.text).length > 0);
        const recalled = await Promise.all(
          hits.map((listing) => conclusion.recall(listing, phrase.id, rules.version)),
        );
        return recalled.filter(Boolean).length;
      });
    },
  };
}
