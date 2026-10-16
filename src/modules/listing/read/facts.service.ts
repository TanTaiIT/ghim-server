import { shownMsAt } from '../calc/display-period.calc.js';
import type { ListingFactsService } from '../listing.ports.js';
import type { ListingShared } from '../listing.shared.js';

/** Chữ máy chấm của một tin: tiêu đề rồi mô tả, như lúc gửi. */
const textOf = (row: { title: string | null; description: string | null }): string =>
  `${row.title ?? ''}\n${row.description ?? ''}`;

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

    async stateOf(listingId) {
      const row = await repository.findById(listingId);
      return row ? { state: row.state, fault: row.fault } : null;
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
