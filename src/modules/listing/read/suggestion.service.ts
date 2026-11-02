import type { Listing, Prisma } from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import { fold } from '../../../common/text/fold.js';
import { DAY_MS } from '../../../common/time/time.js';
import { logger } from '../../../lib/logger.js';
import type { SearchEntry } from '../activity/activity.repository.js';
import {
  buildProfile,
  type InterestProfile,
  rankPopular,
  rankSuggestions,
  RECENT_VIEW_DAYS,
} from '../calc/suggestion.calc.js';
import { visibleWhere } from '../calc/visibility.calc.js';
import type { FeedQuery, HomeSuggestionsDto, HomeSuggestionsQuery } from '../listing.schema.js';
import type { ListingShared } from '../listing.shared.js';

export interface ListingSuggestionService {
  /**
   * "Gợi ý cho bạn" trang chủ (spec listing/suggestions): theo hồ sơ quan tâm, bù bằng "được quan tâm nhiều gần bạn";
   * khách, người chưa có tín hiệu, người tắt công tắc chỉ có phần sau.
   */
  homeSuggestions(actor: Actor | null, query: HomeSuggestionsQuery): Promise<HomeSuggestionsDto>;
  /** Sau `get` (spec listing/activity-history): lỗi ghi chỉ log, lượt mở tin không bao giờ hỏng vì lịch sử. */
  recordView(actor: Actor | null, listing: { id: string; ownerId: string }): Promise<void>;
  /** Sau `feed`: chỉ trang đầu có từ khoá hay bộ lọc. */
  recordSearch(actor: Actor | null, query: FeedQuery): Promise<void>;
  clearActivity(actor: Actor): Promise<void>;
  /** Bên nghe `identity.account.deleted`: lịch sử chỉ phục vụ chính người đó, xoá ngay. */
  forgetActivity(accountId: string): Promise<void>;
  /** Bước dọn của `ops`: lượt xem, lượt tìm cũ hơn `before`; trả số dòng đã xoá. */
  purgeActivity(before: Date): Promise<number>;
}

const PAGE_SIZE = 20;
/** Trần ứng viên mỗi nhánh (design mục 5, 6): câu truy vấn có trần, trang kế tính lại trên cùng trần. */
const CANDIDATE_LIMIT = 300;
/** Mỗi nguồn tin đã lưu / đã hỏi chỉ góp chừng này tin mới nhất vào hồ sơ. */
const PROFILE_SOURCE_LIMIT = 100;
const SEARCH_DEDUPE_MS = 10 * 60_000;

const hasFilter = (query: FeedQuery): boolean =>
  Boolean(query.q?.trim()) ||
  query.categoryId !== undefined ||
  query.provinceCode !== undefined ||
  query.priceMin !== undefined ||
  query.priceMax !== undefined;

const toBig = (value: number | undefined): bigint | null =>
  value === undefined ? null : BigInt(value);

async function guarded(what: string, accountId: string, write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (err) {
    logger.warn({ err, accountId }, `listing.activity.${what} failed`);
  }
}

export function createListingSuggestionService(shared: ListingShared): ListingSuggestionService {
  const { repository, activity, buyerInterest, identity, config, clock, toDtos } = shared;

  const daysAgo = (days: number): Date => new Date(clock().getTime() - days * DAY_MS);

  const profileOf = async (
    accountId: string,
    known: { saved: string[]; asked: string[] },
    homeProvinceCode: number | null,
  ): Promise<{ profile: InterestProfile; recentlyViewed: Set<string> } | null> => {
    const since = daysAgo(config.get('retention.activityDays'));
    const [views, searches, savedSearches] = await Promise.all([
      activity.recentViews(accountId, since),
      activity.recentSearches(accountId, since),
      repository.savedSearches(accountId),
    ]);
    const saved = known.saved.slice(0, PROFILE_SOURCE_LIMIT);
    const asked = known.asked.slice(0, PROFILE_SOURCE_LIMIT);
    const facts = new Map(
      (
        await repository.findByIds([
          ...new Set([...saved, ...asked, ...views.map((view) => view.listingId)]),
        ])
      ).map((row) => [row.id, row]),
    );
    const factsOf = (ids: string[]) => ids.flatMap((id) => facts.get(id) ?? []);
    const profile = buildProfile({
      asked: factsOf(asked),
      saved: factsOf(saved),
      viewed: views.flatMap((view) => {
        const row = facts.get(view.listingId);
        return row ? [{ ...row, viewCount: view.viewCount }] : [];
      }),
      searches,
      savedSearches: savedSearches.map((row): SearchEntry => ({
        qFolded: row.qFolded,
        categoryId: row.categoryId,
        provinceCode: row.provinceCode,
        priceMin: row.priceMin,
        priceMax: row.priceMax,
      })),
      homeProvinceCode,
    });
    if (!profile) return null;
    const viewedSince = daysAgo(RECENT_VIEW_DAYS);
    const recentlyViewed = new Set(
      views.filter((view) => view.lastViewedAt >= viewedSince).map((view) => view.listingId),
    );
    return { profile, recentlyViewed };
  };

  const candidates = async (where: Prisma.ListingWhereInput[]): Promise<Listing[]> =>
    (await repository.list({ where: { AND: where }, order: 'live', limit: CANDIDATE_LIMIT })).slice(
      0,
      CANDIDATE_LIMIT,
    );

  const popular = async (base: Prisma.ListingWhereInput[], provinceCode: number | undefined) => {
    const rows = await candidates([...base, provinceCode ? { provinceCode } : {}]);
    const ids = rows.map((row) => row.id);
    const since = daysAgo(config.get('listing.suggestionPopularDays'));
    const [saves, inquiries] = await Promise.all([
      activity.saveCounts(ids, since),
      buyerInterest.inquiryCounts(ids, since),
    ]);
    return rankPopular(rows, { saves, inquiries });
  };

  return {
    async homeSuggestions(actor, query) {
      const offset = query.cursor ?? 0;
      const viewer = { accountId: actor?.accountId ?? null, memberGroupIds: new Set<string>() };
      const base: Prisma.ListingWhereInput[] = [visibleWhere(viewer, 'feed')];
      let ranked: Listing[] = [];
      let isPersonal = false;
      if (actor) {
        // Tắt công tắc thì xếp như khách; tin của mình, đã lưu, đã hỏi vẫn bị loại.
        const [prefs, saved, asked] = await Promise.all([
          identity.suggestionPrefs(actor.accountId),
          repository.savedIds(actor.accountId),
          buyerInterest.askedListingIds(actor.accountId),
        ]);
        base.push({ ownerId: { not: actor.accountId } }, { id: { notIn: [...saved, ...asked] } });
        const found = prefs.personalized
          ? await profileOf(actor.accountId, { saved, asked }, prefs.homeProvinceCode)
          : null;
        if (found) {
          isPersonal = true;
          const { profile, recentlyViewed } = found;
          const rows = await candidates([
            ...base,
            {
              OR: [
                { categoryId: { in: [...profile.categories.keys()] } },
                ...profile.keywords.map((keyword) => ({ searchFolded: { contains: keyword } })),
              ],
            },
          ]);
          ranked = rankSuggestions(rows, profile, { now: clock(), recentlyViewed });
        }
      }
      if (ranked.length < offset + PAGE_SIZE + 1) {
        const taken = new Set(ranked.map((row) => row.id));
        const more = await popular(base, query.provinceCode);
        ranked = [...ranked, ...more.filter((row) => !taken.has(row.id))];
      }
      const end = offset + PAGE_SIZE;
      return {
        items: await toDtos(ranked.slice(offset, end)),
        nextCursor: ranked.length > end ? String(end) : null,
        personalized: isPersonal,
      };
    },

    async recordView(actor, listing) {
      if (!actor || actor.accountId === listing.ownerId) return;
      const { accountId } = actor;
      await guarded('view', accountId, async () => {
        if (!(await identity.suggestionPrefs(accountId)).personalized) return;
        await activity.recordView(accountId, listing.id, clock());
      });
    },

    async recordSearch(actor, query) {
      if (!actor || query.cursor !== undefined || !hasFilter(query)) return;
      const { accountId } = actor;
      await guarded('search', accountId, async () => {
        if (!(await identity.suggestionPrefs(accountId)).personalized) return;
        const now = clock();
        const q = query.q?.trim();
        await activity.recordSearch(
          accountId,
          {
            qFolded: q ? fold(q) : null,
            categoryId: query.categoryId ?? null,
            provinceCode: query.provinceCode ?? null,
            priceMin: toBig(query.priceMin),
            priceMax: toBig(query.priceMax),
          },
          now,
          new Date(now.getTime() - SEARCH_DEDUPE_MS),
        );
      });
    },

    clearActivity: (actor) => activity.clear(actor.accountId),

    forgetActivity: (accountId) => activity.clear(accountId),

    async purgeActivity(before) {
      const { views, searches } = await activity.purgeBefore(before);
      return views + searches;
    },
  };
}
