import type { ListingRestriction, ListingState } from '@prisma/client';

import { shownMsAt } from './display-period.calc.js';
import type { Tx } from './listing.repository.js';
import type { ListingShared } from './listing.shared.js';

export interface QuotaFacts {
  live: number;
  submittedAt: Date[];
  liveInGroup: number | null;
}

export interface ListingSummary {
  id: string;
  title: string | null;
  state: ListingState;
}

export interface LiveListingFacts {
  id: string;
  version: number;
  ownerId: string;
  text: string;
  imageIds: string[];
}

/** Chữ máy chấm của một tin: tiêu đề rồi mô tả, như lúc gửi. */
const textOf = (row: { title: string | null; description: string | null }): string =>
  `${row.title ?? ''}\n${row.description ?? ''}`;

/**
 * Dữ kiện `listing` lộ cho `trust` (design add-trust-tiers mục 5, 6, 9) và `screening` (design add-screening mục 12):
 * hai module không đọc bảng `listings`, chỉ hỏi qua đây. Không cổng nào ghi gì.
 */
export interface ListingFactsService {
  /** `tx` của lượt gửi khi kiểm hạn mức; `null` khi chỉ đọc (bảng uy tín). */
  quotaFacts(
    tx: Tx | null,
    input: { accountId: string; since: Date; groupId: string | null },
  ): Promise<QuotaFacts>;
  occupying(tx: Tx, accountId: string): Promise<ListingSummary[]>;
  dashboardFacts(accountId: string): Promise<{
    restricted: (ListingSummary & { restrictions: ListingRestriction[] })[];
    pending: ListingSummary[];
  }>;
  shownCandidates(input: {
    minShownMs: number;
    since: Date;
    now: Date;
  }): Promise<{ listingId: string; ownerId: string }[]>;
  /** Tổng thời gian tin đã được thấy tới `now` — lối "đã bán" cần đủ số ngày; `null` khi không có tin này. */
  shownMs(listingId: string, now: Date): Promise<number | null>;
  ownTexts(input: {
    accountId: string;
    since: Date;
    excludeId: string;
  }): Promise<{ id: string; text: string }[]>;
  countSubmissions(accountId: string, since: Date): Promise<number>;
  priceSamples(categoryId: string, since: Date): Promise<bigint[]>;
  liveListings(after: string | null, take: number): Promise<LiveListingFacts[]>;
}

export function createListingFactsService(shared: ListingShared): ListingFactsService {
  const { repository } = shared;
  return {
    quotaFacts: (tx, input) => repository.quotaFacts(tx, input),
    occupying: (tx, accountId) => repository.occupying(tx, accountId),

    async dashboardFacts(accountId) {
      const rows = await repository.dashboardRows(accountId);
      return {
        restricted: rows.filter((row) => row.state === 'live'),
        pending: rows
          .filter((row) => row.state === 'pending')
          .map(({ id, title, state }) => ({ id, title, state })),
      };
    },

    async shownCandidates(input) {
      const rows = await repository.shownCandidates(input);
      return rows.map((row) => ({ listingId: row.id, ownerId: row.ownerId }));
    },

    async shownMs(listingId, now) {
      const listing = await repository.findById(listingId);
      return listing ? shownMsAt(listing, now) : null;
    },

    async ownTexts(input) {
      const rows = await repository.ownTexts(input);
      return rows.map((row) => ({ id: row.id, text: textOf(row) }));
    },
    countSubmissions: (accountId, since) => repository.countSubmissions(accountId, since),
    priceSamples: (categoryId, since) => repository.priceSamples(categoryId, since),

    async liveListings(after, take) {
      const rows = await repository.liveBatch(after, take);
      return rows.map(({ title, description, ...row }) => ({
        ...row,
        text: textOf({ title, description }),
      }));
    },
  };
}
