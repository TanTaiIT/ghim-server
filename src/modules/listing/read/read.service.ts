import type { Listing, ListingState, Prisma } from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import { NotFoundError } from '../../../common/errors/app-error.js';
import { type CursorKey, toCursorPage } from '../../../common/schemas/cursor.js';
import { fold } from '../../../common/text/fold.js';
import type { FeedQuery, ListingDto, OwnListingDto } from '../listing.schema.js';
import { type ListingShared, listingNotFound } from '../listing.shared.js';
import { canView, type ListSurface, visibleWhere } from '../calc/visibility.calc.js';

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface Page {
  cursor?: CursorKey | undefined;
  limit: number;
}

export interface ListingReadService {
  /** Người đăng thấy tin của mình ở mọi trạng thái, kèm lý do; người khác theo luật "ai thấy một tin" (404 nếu không). */
  get(actor: Actor | null, id: string): Promise<ListingDto | OwnListingDto>;
  /** Không từ khoá = bảng tin / danh mục (mức đầy đủ); có từ khoá = tìm kiếm (gồm tin hạn chế) — TK 15. */
  feed(actor: Actor | null, query: FeedQuery): Promise<CursorPage<ListingDto>>;
  suggestions(actor: Actor | null, id: string): Promise<ListingDto[]>;
  groupFeed(
    actor: Actor | null,
    groupId: string,
    query: Page & { q?: string | undefined },
  ): Promise<CursorPage<ListingDto>>;
  /** Hồ sơ người bán: tin đang hiển thị người xem được phép thấy (delta identity/profile). */
  profile(actor: Actor | null, userId: string, query: Page): Promise<CursorPage<ListingDto>>;
  mine(
    actor: Actor,
    query: Page & { state?: ListingState | undefined },
  ): Promise<CursorPage<OwnListingDto>>;
  /** Cổng cho `notification`: tiêu đề tin theo mã, để câu thông báo nêu đúng món đồ. */
  titles(ids: string[]): Promise<Map<string, string>>;
}

/** Gợi ý ngắn, không phân trang: vài tin cùng danh mục để người xem đi tiếp. */
const SUGGESTION_LIMIT = 10;

const liveKey = (row: Listing): CursorKey => ({ at: row.firstLiveAt ?? row.createdAt, id: row.id });
const updatedKey = (row: Listing): CursorKey => ({ at: row.updatedAt, id: row.id });

const keywordWhere = (q: string | undefined): Prisma.ListingWhereInput =>
  q ? { searchFolded: { contains: fold(q) } } : {};

export function createListingReadService(shared: ListingShared): ListingReadService {
  const { repository, groups, clock, viewerFor, toDtos, toOwnDtos } = shared;

  const page = async <T>(
    where: Prisma.ListingWhereInput,
    query: Page,
    map: (rows: Listing[]) => Promise<T[]>,
    order: 'live' | 'updated' = 'live',
  ): Promise<CursorPage<T>> => {
    const rows = await repository.list({ where, order, cursor: query.cursor, limit: query.limit });
    const { items, nextCursor } = toCursorPage(
      rows,
      query.limit,
      order === 'live' ? liveKey : updatedKey,
    );
    return { items: await map(items), nextCursor };
  };

  return {
    async get(actor, id) {
      const listing = await repository.findById(id);
      if (!listing || listing.deletedAt !== null) throw listingNotFound();
      if (actor?.accountId === listing.ownerId) return shared.toOwnDto(listing, clock());
      const viewer = await viewerFor(actor, listing.groupId);
      if (!canView(listing, viewer, 'link')) throw listingNotFound();
      return shared.toDto(listing);
    },

    feed(actor, query) {
      const surface: ListSurface = query.q ? 'search' : query.categoryId ? 'category' : 'feed';
      const viewer = { accountId: actor?.accountId ?? null, memberGroupIds: new Set<string>() };
      const filters: Prisma.ListingWhereInput = {
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.provinceCode ? { provinceCode: query.provinceCode } : {}),
        ...(query.wardCode ? { wardCode: query.wardCode } : {}),
        ...(query.priceMin !== undefined || query.priceMax !== undefined
          ? {
              price: {
                ...(query.priceMin !== undefined ? { gte: BigInt(query.priceMin) } : {}),
                ...(query.priceMax !== undefined ? { lte: BigInt(query.priceMax) } : {}),
              },
            }
          : {}),
        ...keywordWhere(query.q),
      };
      return page({ AND: [visibleWhere(viewer, surface), filters] }, query, toDtos);
    },

    async suggestions(actor, id) {
      const listing = await repository.findById(id);
      if (!listing || listing.deletedAt !== null) throw listingNotFound();
      const viewer = await viewerFor(actor, listing.groupId);
      if (actor?.accountId !== listing.ownerId && !canView(listing, viewer, 'link')) {
        throw listingNotFound();
      }
      if (!listing.categoryId) return [];
      const rows = await repository.list({
        where: {
          AND: [
            visibleWhere(viewer, 'suggest'),
            { categoryId: listing.categoryId, id: { not: listing.id } },
          ],
        },
        order: 'live',
        limit: SUGGESTION_LIMIT,
      });
      return toDtos(rows.slice(0, SUGGESTION_LIMIT));
    },

    async groupFeed(actor, groupId, query) {
      if (!(await groups.findGroup(groupId))) throw new NotFoundError('Không có nhóm này');
      const viewer = await viewerFor(actor, groupId);
      const surface: ListSurface = query.q ? 'group_search' : 'group_feed';
      return page(
        { AND: [visibleWhere(viewer, surface, groupId), keywordWhere(query.q)] },
        query,
        toDtos,
      );
    },

    async profile(actor, userId, query) {
      const memberGroupIds = actor
        ? await groups.memberGroupIds(actor.accountId)
        : new Set<string>();
      const viewer = { accountId: actor?.accountId ?? null, memberGroupIds };
      return page({ AND: [visibleWhere(viewer, 'profile'), { ownerId: userId }] }, query, toDtos);
    },

    mine(actor, query) {
      return page(
        {
          ownerId: actor.accountId,
          deletedAt: null,
          ...(query.state ? { state: query.state } : {}),
        },
        query,
        (rows) => toOwnDtos(rows, clock()),
        'updated',
      );
    },

    async titles(ids) {
      const rows = await repository.findByIds(ids);
      return new Map(rows.flatMap((row) => (row.title ? [[row.id, row.title] as const] : [])));
    },
  };
}
