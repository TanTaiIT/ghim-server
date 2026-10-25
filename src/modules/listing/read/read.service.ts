import type { Listing, ListingState, Prisma } from '@prisma/client';

import type { Actor } from '../../../common/auth/actor.js';
import { NotFoundError } from '../../../common/errors/app-error.js';
import { type CursorKey, toCursorPage } from '../../../common/schemas/cursor.js';
import { fold } from '../../../common/text/fold.js';
import { attributeFilterIssue, attributeFilterWhere } from '../calc/attribute-filter.calc.js';
import { isDetached, placementsHiddenOnLeave } from '../calc/hide.calc.js';
import type {
  ConversationCard,
  GroupLeave,
  ReportTarget,
  ReviewSubject,
} from '../listing.ports.js';
import type { FeedQuery, ListingDto, OwnListingDto } from '../listing.schema.js';
import { type ListingShared, listingNotFound, validationError } from '../listing.shared.js';
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
  /**
   * Lưu tin (add-saved-listings): chỉ tin người đó mở được bằng đường link — không thấy thì 404 như tin không có, nên lưu
   * không thành cách dò tin ẩn.
   */
  save(actor: Actor, id: string): Promise<void>;
  unsave(actor: Actor, id: string): Promise<void>;
  /** Tin đã lưu mà người lưu còn mở được: đang hiện, đã bán, hết hạn — bề mặt `saved` (design mục 2). */
  saved(actor: Actor, query: Page): Promise<CursorPage<ListingDto>>;
  /** Mọi mã đã lưu, không lọc hiển thị: để app tô nút trái tim (design mục 4). */
  savedIds(actor: Actor): Promise<string[]>;
  /** Bên nghe `identity.account.deleted`: tài khoản chỉ ẩn danh, không xoá dòng — khoá ngoại không tự dọn. */
  forgetSaved(accountId: string): Promise<void>;
  /** Cổng cho `notification`: tiêu đề tin theo mã, để câu thông báo nêu đúng món đồ. */
  titles(ids: string[]): Promise<Map<string, string>>;
  /** Cổng cho `messaging`: thẻ tin của một trang hội thoại, một lượt đọc; tin đã xoá hẳn thì vắng. */
  conversationCards(ids: string[]): Promise<Map<string, ConversationCard>>;
  /**
   * Cổng cho `review`: dữ kiện để định tuyến việc và kiểm quyết định; tin đã xoá thì `null`, trừ khi hỏi kèm
   * `includeDeleted` — báo cáo về tin đã xoá vẫn được nhận, được quyết trên bản lưu (add-reports).
   */
  reviewSubject(id: string, options?: { includeDeleted?: boolean }): Promise<ReviewSubject | null>;
  /**
   * Cổng cho `review`: tin như người đăng thấy — người xử cần thấy đủ nội dung, kể cả tin chưa hiện (TK 17), và bản lưu
   * của tin đã xoá còn báo cáo mở (add-reports).
   */
  forReviewer(id: string): Promise<OwnListingDto | null>;
  /** Cổng cho `review`: tin người này đang thấy được để báo cáo; không thấy (hay không có) thì `null` (add-reports). */
  reportTarget(actor: Actor, id: string): Promise<ReportTarget | null>;
  /**
   * Cổng cho `review`: tin chờ duyệt của một người trong một nhóm — vào lại nhóm thì sinh lại việc (chốt 15/10/2026).
   * Có `leave` thì chỉ tin lượt rời đó làm ẩn: tin "nhóm công khai" ở lại làm tin người ngoài vẫn giữ việc (C8).
   */
  pendingInGroup(accountId: string, groupId: string, leave?: GroupLeave): Promise<string[]>;
  /**
   * Cổng cho `review` lúc khởi động: tin đang chờ duyệt và tin đang hiện mang lý do "máy", có từ trước khi có hàng chờ
   * (design add-review-queues, Migration Plan). Bỏ tin đang bị ẩn — tin của người đã rời nhóm, của nhóm đã đóng cố ý
   * không có việc (chốt 15/10/2026).
   */
  reviewBacklog(): Promise<{ held: string[]; machineRestricted: string[] }>;
  /**
   * Cổng cho `notification`: người đăng và tiêu đề của tin chưa xoá. Tin đã xoá thì vắng — người đăng không còn việc gì
   * để làm với nó, nên không ai được báo (change notify-missing-images).
   */
  noticeTargets(ids: string[]): Promise<Map<string, { ownerId: string; title: string | null }>>;
}

/** Gợi ý ngắn, không phân trang: vài tin cùng danh mục để người xem đi tiếp. */
const SUGGESTION_LIMIT = 10;
/** Tin chờ duyệt của một người trong một nhóm: trần hạn mức tin sống còn nhỏ hơn nhiều. */
const PENDING_IN_GROUP_LIMIT = 100;
/** Việc bù lúc khởi động — giai đoạn đầu chỉ vài chục tin; lần khởi động sau bù tiếp phần còn lại. */
const BACKLOG_LIMIT = 5000;

const liveKey = (row: Listing): CursorKey => ({ at: row.rankAt ?? row.createdAt, id: row.id });
const updatedKey = (row: Listing): CursorKey => ({ at: row.updatedAt, id: row.id });

const keywordWhere = (q: string | undefined): Prisma.ListingWhereInput =>
  q ? { searchFolded: { contains: fold(q) } } : {};

export function createListingReadService(shared: ListingShared): ListingReadService {
  const { repository, groups, categories, clock, viewerFor, toDtos, toOwnDtos, toOwnDto } = shared;

  const backlogIds = async (where: Prisma.ListingWhereInput): Promise<string[]> => {
    const rows = await repository.list({
      where: { ...where, deletedAt: null, hideReasons: { isEmpty: true } },
      order: 'updated',
      limit: BACKLOG_LIMIT,
    });
    return rows.map((row) => row.id);
  };

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

  /**
   * Bộ lọc theo mẫu thông tin (add-listing-filters): kiểm theo mẫu HIỆN HÀNH của danh mục rồi mới thành điều kiện —
   * mục đã bỏ ở bản mẫu mới là 400 nêu mục, app đọc lại mẫu và bỏ bộ lọc đó (design, Risks).
   */
  const templateWhere = async (query: FeedQuery): Promise<Prisma.ListingWhereInput[]> => {
    if (!query.attrs || Object.keys(query.attrs).length === 0) return [];
    if (!query.categoryId) throw validationError('Chọn danh mục để lọc theo mẫu thông tin');
    const { fields } = await categories.currentTemplate(query.categoryId);
    const issue = attributeFilterIssue(fields, query.attrs);
    if (issue) throw validationError(issue.message, { field: issue.field });
    return attributeFilterWhere(fields, query.attrs);
  };

  /** Tin người xem mở được bằng đường link (người đăng luôn mở được tin của mình); không thì 404 như tin không có. */
  const viewable = async (actor: Actor | null, id: string): Promise<Listing> => {
    const listing = await repository.findById(id);
    if (!listing || listing.deletedAt !== null) throw listingNotFound();
    if (actor?.accountId === listing.ownerId) return listing;
    const viewer = await viewerFor(actor, listing.groupId);
    if (!canView(listing, viewer, 'link')) throw listingNotFound();
    return listing;
  };

  return {
    async get(actor, id) {
      const listing = await viewable(actor, id);
      return actor?.accountId === listing.ownerId
        ? shared.toOwnDto(listing, clock())
        : shared.toDto(listing);
    },

    async feed(actor, query) {
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
      const byTemplate = await templateWhere(query);
      return page({ AND: [visibleWhere(viewer, surface), filters, ...byTemplate] }, query, toDtos);
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

    async save(actor, id) {
      await viewable(actor, id);
      await repository.saveListing(actor.accountId, id, clock());
    },

    unsave: (actor, id) => repository.unsaveListing(actor.accountId, id),

    async saved(actor, query) {
      const viewer = {
        accountId: actor.accountId,
        memberGroupIds: await groups.memberGroupIds(actor.accountId),
      };
      const rows = await repository.savedPage({
        accountId: actor.accountId,
        visible: visibleWhere(viewer, 'saved'),
        cursor: query.cursor,
        limit: query.limit,
      });
      const { items, nextCursor } = toCursorPage(rows, query.limit, (row) => ({
        at: row.savedAt,
        id: row.listing.id,
      }));
      return { items: await toDtos(items.map((row) => row.listing)), nextCursor };
    },

    savedIds: (actor) => repository.savedIds(actor.accountId),

    forgetSaved: (accountId) => repository.forgetSaved(accountId),

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

    async conversationCards(ids) {
      const rows = await repository.findByIds(ids);
      const cards = await Promise.all(
        rows.map(async (row): Promise<[string, ConversationCard]> => {
          const deleted = row.deletedAt !== null;
          const [coverId] = row.imageIds;
          const cover =
            deleted || row.state === 'removed' || !coverId
              ? null
              : { id: coverId, url: await shared.media.viewUrl(coverId) };
          return [
            row.id,
            {
              title: deleted ? null : row.title,
              price: deleted ? null : row.price,
              negotiable: row.negotiable,
              state: row.state,
              visible: !deleted && row.state === 'live' && row.hideReasons.length === 0,
              deleted,
              cover,
            },
          ];
        }),
      );
      return new Map(cards);
    },

    async reviewSubject(id, options = {}) {
      const row = await repository.findById(id);
      if (!row || (row.deletedAt !== null && !options.includeDeleted)) return null;
      return {
        id: row.id,
        ownerId: row.ownerId,
        state: row.state,
        version: row.version,
        placement: row.placement,
        groupId: row.groupId,
        unitId: row.unitId,
        categoryId: row.categoryId,
        restrictions: row.restrictions,
        detached: isDetached(row.hideReasons),
        hideReasons: row.hideReasons,
        deleted: row.deletedAt !== null,
      };
    },

    async forReviewer(id) {
      const row = await repository.findById(id);
      return row ? toOwnDto(row, clock()) : null;
    },

    async reportTarget(actor, id) {
      const row = await repository.findById(id);
      if (!row || row.deletedAt !== null) return null;
      // Người đăng "thấy" tin của mình để nhận lỗi "không tự báo cáo mình" thay vì 404.
      const viewer = await viewerFor(actor, row.groupId);
      if (row.ownerId !== actor.accountId && !canView(row, viewer, 'link')) return null;
      return {
        id: row.id,
        ownerId: row.ownerId,
        state: row.state,
        placement: row.placement,
        visible: row.state === 'live' && row.hideReasons.length === 0,
      };
    },

    async reviewBacklog() {
      const [held, machineRestricted] = await Promise.all([
        backlogIds({ state: 'pending' }),
        backlogIds({ state: 'live', restrictions: { has: 'machine' } }),
      ]);
      return { held, machineRestricted };
    },

    async pendingInGroup(accountId, groupId, leave) {
      // Bị cấm hay xoá tài khoản ẩn mọi mức; tự rời, bị gỡ thì theo công tắc người ngoài lúc rời.
      const hiddenOnly =
        leave && (leave.reason === 'left' || leave.reason === 'removed')
          ? { placement: { in: placementsHiddenOnLeave(leave.allowOutsiders) } }
          : {};
      const rows = await repository.list({
        where: { ownerId: accountId, groupId, state: 'pending', deletedAt: null, ...hiddenOnly },
        order: 'updated',
        limit: PENDING_IN_GROUP_LIMIT,
      });
      return rows.map((row) => row.id);
    },

    async noticeTargets(ids) {
      const rows = await repository.findByIds(ids);
      return new Map(
        rows.flatMap((row) =>
          row.deletedAt === null
            ? [[row.id, { ownerId: row.ownerId, title: row.title }] as const]
            : [],
        ),
      );
    },
  };
}
