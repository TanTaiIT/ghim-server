import type { SavedSearch } from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import { ConflictError, NotFoundError } from '../../../common/errors/app-error.js';
import { fold } from '../../../common/text/fold.js';
import { canView } from '../calc/visibility.calc.js';
import type { SavedSearchBody, SavedSearchDto } from '../listing.schema.js';
import { type ListingShared, validationError } from '../listing.shared.js';

export interface ListingSavedSearchService {
  /** Lưu một lượt tìm (add-saved-searches); `created: false` = đã có đúng lượt tìm này, trả lượt cũ. */
  saveSearch(
    actor: Actor,
    body: SavedSearchBody,
  ): Promise<{ search: SavedSearchDto; created: boolean }>;
  /** Mới nhất trước — tối đa trần của bảng con số, nên không phân trang. */
  savedSearches(actor: Actor): Promise<SavedSearchDto[]>;
  /** Lượt tìm của người khác trả lời như không có. */
  deleteSavedSearch(actor: Actor, id: string): Promise<void>;
  /**
   * Cổng của `notification`: người có lượt tìm khớp một tin đang hiện đầy đủ trên sàn chung. Tin không như vậy (hạn chế,
   * trong nhóm, đã thôi hiện lúc sự kiện tới nơi) → rỗng: luật của bảng tin, không phải của tìm kiếm có từ khoá (TK 15).
   */
  savedSearchMatches(
    listingId: string,
  ): Promise<{ searchId: string; accountId: string; q: string }[]>;
}

/** Bảng tin không phụ thuộc người xem: tin sàn chung, mức đầy đủ — xét như khách. */
const NOBODY = { accountId: null, memberGroupIds: new Set<string>() };

const toDto = (row: SavedSearch): SavedSearchDto => ({
  id: row.id,
  q: row.q,
  categoryId: row.categoryId,
  provinceCode: row.provinceCode,
  wardCode: row.wardCode,
  priceMin: row.priceMin,
  priceMax: row.priceMax,
  createdAt: row.createdAt.toISOString(),
});

export function createListingSavedSearchService(shared: ListingShared): ListingSavedSearchService {
  const { repository, categories, regions, config, clock } = shared;

  return {
    async saveSearch(actor, body) {
      const filters = {
        categoryId: body.categoryId ?? null,
        provinceCode: body.provinceCode ?? null,
        wardCode: body.wardCode ?? null,
        priceMin: body.priceMin ?? null,
        priceMax: body.priceMax ?? null,
      };
      if (filters.categoryId !== null) {
        const known = await categories.statusOf([filters.categoryId]);
        if (!known.has(filters.categoryId)) throw validationError('Không có danh mục này');
      }
      if (filters.provinceCode !== null) {
        const issue = await regions.validateRegion(filters.provinceCode, filters.wardCode);
        if (issue) throw validationError(issue);
      }
      const qFolded = fold(body.q);
      // Khoá trùng: từ khoá đã bỏ dấu cùng bộ lọc — "Sam Sung" và "samsung" khác nhau, "Điện" và "dien" như nhau.
      const key = JSON.stringify([
        qFolded,
        filters.categoryId,
        filters.provinceCode,
        filters.wardCode,
        filters.priceMin?.toString() ?? null,
        filters.priceMax?.toString() ?? null,
      ]);
      const max = config.get('listing.maxSavedSearches');
      const saved = await repository.saveSearch(
        { accountId: actor.accountId, key, q: body.q, qFolded, ...filters, createdAt: clock() },
        max,
      );
      if (!saved) {
        throw new ConflictError(`Đã lưu đủ ${max} lượt tìm — xoá bớt một lượt để lưu thêm`);
      }
      return { search: toDto(saved.search), created: saved.created };
    },

    savedSearches: async (actor) => (await repository.savedSearches(actor.accountId)).map(toDto),

    async deleteSavedSearch(actor, id) {
      if (!(await repository.deleteSavedSearch(actor.accountId, id))) {
        throw new NotFoundError('Không có lượt tìm này');
      }
    },

    async savedSearchMatches(listingId) {
      const listing = await repository.findById(listingId);
      if (!listing || !canView(listing, NOBODY, 'feed')) return [];
      const rows = await repository.savedSearchMatches(listing);
      return rows.map((row) => ({ searchId: row.id, accountId: row.accountId, q: row.q }));
    },
  };
}
