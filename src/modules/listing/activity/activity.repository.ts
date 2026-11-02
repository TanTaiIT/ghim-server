import type { PrismaClient } from '@prisma/client';

/**
 * Lịch sử xem và tìm kiếm cho mục "Gợi ý cho bạn" (add-home-suggestions), cùng đếm lượt lưu cho "được quan tâm nhiều" —
 * tách khỏi `listing.repository.ts` (đã quá trần). Dữ liệu cá nhân: chỉ chính người đó dùng, không route nào đọc của
 * người khác.
 */

/** Trần mỗi người (spec listing/activity-history): giữ phần mới nhất, xoá phần cũ ngay lúc ghi. */
export const VIEW_CAP = 200;
export const SEARCH_CAP = 100;

export interface SearchEntry {
  qFolded: string | null;
  categoryId: string | null;
  provinceCode: number | null;
  priceMin: bigint | null;
  priceMax: bigint | null;
}

export interface ViewRow {
  listingId: string;
  viewCount: number;
  lastViewedAt: Date;
}

export interface ActivityRepository {
  recordView(accountId: string, listingId: string, at: Date): Promise<void>;
  /** Trùng y hệt lượt cuối từ `dedupeSince` thì chỉ dời mốc lượt cuối. */
  recordSearch(accountId: string, entry: SearchEntry, at: Date, dedupeSince: Date): Promise<void>;
  recentViews(accountId: string, since: Date): Promise<ViewRow[]>;
  recentSearches(accountId: string, since: Date): Promise<SearchEntry[]>;
  /** Số người đã lưu mỗi tin từ `since`; tin không ai lưu thì vắng. */
  saveCounts(listingIds: string[], since: Date): Promise<Map<string, number>>;
  clear(accountId: string): Promise<void>;
  purgeBefore(before: Date): Promise<{ views: number; searches: number }>;
}

const sameSearch = (a: SearchEntry, b: SearchEntry): boolean =>
  a.qFolded === b.qFolded &&
  a.categoryId === b.categoryId &&
  a.provinceCode === b.provinceCode &&
  a.priceMin === b.priceMin &&
  a.priceMax === b.priceMax;

const SEARCH_FIELDS = {
  qFolded: true,
  categoryId: true,
  provinceCode: true,
  priceMin: true,
  priceMax: true,
} as const;

export function createActivityRepository(prisma: PrismaClient): ActivityRepository {
  return {
    async recordView(accountId, listingId, at) {
      await prisma.listingView.upsert({
        where: { accountId_listingId: { accountId, listingId } },
        create: { accountId, listingId, lastViewedAt: at },
        update: { viewCount: { increment: 1 }, lastViewedAt: at },
      });
      await prisma.$executeRaw`
        DELETE FROM listing_views
        WHERE account_id = ${accountId}::uuid
          AND listing_id IN (
            SELECT listing_id FROM listing_views
            WHERE account_id = ${accountId}::uuid
            ORDER BY last_viewed_at DESC, listing_id DESC
            OFFSET ${VIEW_CAP}
          )`;
    },

    async recordSearch(accountId, entry, at, dedupeSince) {
      const last = await prisma.searchHistory.findFirst({
        where: { accountId },
        orderBy: [{ searchedAt: 'desc' }, { id: 'desc' }],
      });
      if (last && last.searchedAt >= dedupeSince && sameSearch(last, entry)) {
        await prisma.searchHistory.update({ where: { id: last.id }, data: { searchedAt: at } });
        return;
      }
      await prisma.searchHistory.create({ data: { accountId, ...entry, searchedAt: at } });
      await prisma.$executeRaw`
        DELETE FROM search_history
        WHERE account_id = ${accountId}::uuid
          AND id IN (
            SELECT id FROM search_history
            WHERE account_id = ${accountId}::uuid
            ORDER BY searched_at DESC, id DESC
            OFFSET ${SEARCH_CAP}
          )`;
    },

    recentViews: (accountId, since) =>
      prisma.listingView.findMany({
        where: { accountId, lastViewedAt: { gte: since } },
        orderBy: { lastViewedAt: 'desc' },
        select: { listingId: true, viewCount: true, lastViewedAt: true },
        take: VIEW_CAP,
      }),

    recentSearches: (accountId, since) =>
      prisma.searchHistory.findMany({
        where: { accountId, searchedAt: { gte: since } },
        orderBy: { searchedAt: 'desc' },
        select: SEARCH_FIELDS,
        take: SEARCH_CAP,
      }),

    async saveCounts(listingIds, since) {
      if (listingIds.length === 0) return new Map();
      const rows = await prisma.$queryRaw<{ listing_id: string; saves: number }[]>`
        SELECT listing_id::text, count(*)::int AS saves FROM saved_listings
        WHERE listing_id = ANY(${listingIds}::uuid[]) AND saved_at >= ${since}
        GROUP BY listing_id`;
      return new Map(rows.map((row) => [row.listing_id, row.saves]));
    },

    async clear(accountId) {
      await prisma.$transaction([
        prisma.listingView.deleteMany({ where: { accountId } }),
        prisma.searchHistory.deleteMany({ where: { accountId } }),
      ]);
    },

    async purgeBefore(before) {
      const [views, searches] = await prisma.$transaction([
        prisma.listingView.deleteMany({ where: { lastViewedAt: { lt: before } } }),
        prisma.searchHistory.deleteMany({ where: { searchedAt: { lt: before } } }),
      ]);
      return { views: views.count, searches: searches.count };
    },
  };
}
