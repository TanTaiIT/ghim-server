import type {
  Listing,
  ListingState,
  ListingSubmission,
  ListingSubmissionKind,
  Prisma,
  PrismaClient,
  SavedSearch,
} from '@prisma/client';

import { type DayCount, SHOP_TIME_ZONE } from '../../common/time/time.js';
import { appendAudit, type AuditEntry } from '../../common/audit/audit.js';
import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';
import type { CursorKey } from '../../common/schemas/cursor.js';
import { DETACHED_REASONS } from './calc/hide.calc.js';
import type { RetentionRow } from './listing.ports.js';
import { LISTING_EVENTS, listingEvent } from './listing.outbox.js';

export type Tx = Prisma.TransactionClient;

export interface SubmissionRow {
  kind: ListingSubmissionKind;
  accountId: string;
  fromVersion: number;
  at: Date;
}

/**
 * Một lượt ghi vào một tin (design add-listings mục 5, 19): khoá dòng, kiểm trạng thái / phiên bản, rồi mới tính cột
 * mới TỪ DÒNG ĐÃ KHOÁ — bên nghe không ghi đè nội dung của người đăng, người đăng không ghi đè lý do tạm ẩn.
 */
export interface ListingChange {
  id: string;
  /** Trạng thái được phép lúc ghi; lệch (hay đã xoá) thì không ghi gì và trả `null`. */
  states: readonly ListingState[];
  /** Phiên bản app đang có (sửa, gửi) hay kết quả máy nhắm tới; lệch thì `null`. */
  version?: number | undefined;
  /** Trong transaction, sau khoá dòng tin, trước khi ghi: khoá nhóm, hạn mức… ném là quay lui cả lượt. */
  before?: (tx: Tx, locked: Listing) => Promise<void>;
  data: (locked: Listing) => Prisma.ListingUncheckedUpdateInput;
  /** Sau khi ghi, cùng transaction: gỡ nhãn ảnh, ghi lượt chấm của máy, ghi quyết định của người duyệt. */
  after?: ((tx: Tx, updated: Listing) => Promise<void>) | undefined;
  submission?: SubmissionRow;
  events?: (updated: Listing, locked: Listing) => OutboxEventInput[];
  audit?: AuditEntry | undefined;
}

/** Cột bên nghe và việc nền được ghi theo lô — mọi cột khác (nội dung) chỉ đi qua `change`. */
export type BatchRow = Pick<
  Listing,
  | 'id'
  | 'state'
  | 'version'
  | 'hideReasons'
  | 'restrictions'
  | 'placement'
  | 'badgeGroupId'
  | 'unitId'
  | 'expiresAt'
  | 'clockRemainingMs'
  | 'shownMs'
  | 'shownSince'
  | 'leftGroupAt'
  | 'remindedFor'
  | 'purgeRemindedFor'
>;

export interface BatchInput<C = undefined> {
  where: Prisma.ListingWhereInput;
  /**
   * Đọc trạng thái của module khác SAU khi đã khoá dòng của lô, trong transaction của lô — mỗi lô đọc lại. Bên nghe đối
   * chiếu (fix-audit-listeners, C1): bên nghe đối chiều chạy song song thì bên sau luôn thấy kết quả của bên trước.
   */
  prepare?: () => Promise<C>;
  /** Hàm thuần: cột mới cho dòng phải đổi; dòng không có trong kết quả thì giữ nguyên. */
  compute: (rows: Listing[], context: C) => BatchRow[];
  events?: (changed: { before: Listing; after: BatchRow }[], context: C) => OutboxEventInput[];
  at: Date;
}

export type ListingOrder = 'live' | 'updated';

export type NewSavedSearch = Omit<SavedSearch, 'id'>;
/** Phần của một tin mà phép khớp ngược lượt tìm đã lưu cần. */
export type SearchableListing = Pick<
  Listing,
  'ownerId' | 'searchFolded' | 'categoryId' | 'provinceCode' | 'wardCode' | 'price'
>;

export interface ListingRepository {
  create(input: {
    data: Prisma.ListingUncheckedCreateInput;
    after?: (tx: Tx, created: Listing) => Promise<void>;
  }): Promise<Listing>;
  findById(id: string): Promise<Listing | null>;
  findByIds(ids: string[]): Promise<Listing[]>;
  change(input: ListingChange): Promise<{ before: Listing; after: Listing } | null>;
  /**
   * Tin mới chép từ tin đã rời nhóm (design mục 13): unique `moved_from_listing_id` chặn lượt thứ hai, kể cả song song —
   * lượt thua ném P2002.
   */
  createMoved(input: {
    data: Prisma.ListingUncheckedCreateInput;
    before?: (tx: Tx) => Promise<void>;
    after?: (tx: Tx, created: Listing) => Promise<void>;
    submission: Omit<SubmissionRow, 'fromVersion'>;
    events: (created: Listing) => OutboxEventInput[];
  }): Promise<Listing>;
  findSubmission(listingId: string, fromVersion: number): Promise<ListingSubmission | null>;
  /** Đổi theo lô cho bên nghe và việc nền: lô 500 dòng, mỗi lô một transaction. Trả số dòng đã đổi. */
  applyBatch<C = undefined>(input: BatchInput<C>): Promise<number>;
  list(input: {
    where: Prisma.ListingWhereInput;
    order: ListingOrder;
    cursor?: CursorKey | undefined;
    limit: number;
  }): Promise<Listing[]>;
  /** Lưu tin (add-saved-listings): khoá chính (người, tin) — lưu lại là không đổi gì. */
  saveListing(accountId: string, listingId: string, at: Date): Promise<void>;
  unsaveListing(accountId: string, listingId: string): Promise<void>;
  /**
   * Trang tin đã lưu, lưu gần nhất trước, con trỏ (lúc lưu, mã tin). Lọc hiển thị `visible` chạy trong cùng câu SQL,
   * nên trang luôn đủ `limit` tin hiện được nếu còn (design add-saved-listings mục 3). Trả `limit + 1` dòng.
   */
  savedPage(input: {
    accountId: string;
    visible: Prisma.ListingWhereInput;
    cursor?: CursorKey | undefined;
    limit: number;
  }): Promise<{ listing: Listing; savedAt: Date }[]>;
  savedIds(accountId: string): Promise<string[]>;
  /** Tin đã lưu và lượt tìm đã lưu của một tài khoản — bên nghe xoá tài khoản. */
  forgetSaved(accountId: string): Promise<void>;
  /**
   * Lưu một lượt tìm (add-saved-searches) dưới khoá advisory theo người: hai lượt lưu cùng lúc không vượt trần. Đã có
   * lượt cùng `key` thì trả lượt đó, `created: false`; chạm trần thì `null`.
   */
  saveSearch(
    input: NewSavedSearch,
    max: number,
  ): Promise<{ search: SavedSearch; created: boolean } | null>;
  savedSearches(accountId: string): Promise<SavedSearch[]>;
  /** `false` = người đó không có lượt tìm này. */
  deleteSavedSearch(accountId: string, id: string): Promise<boolean>;
  /**
   * Lượt tìm khớp ngược một tin: từ khoá đã bỏ dấu nằm trong `search_folded` của tin và tin nằm trong mọi bộ lọc — phép
   * `position(x IN y)` với cột ở vế trái Prisma không viết được. Không gồm lượt tìm của người đăng; luật "ai thấy một
   * tin" do bên gọi xét.
   */
  savedSearchMatches(
    listing: SearchableListing,
  ): Promise<{ id: string; accountId: string; q: string }[]>;
  /** Tin "nhóm công khai" còn trong nhóm — đếm trong transaction đổi chế độ của `group` (cam kết 22). */
  countGroupPublic(tx: Tx, groupId: string): Promise<number>;
  /**
   * `FOR KEY SHARE` dòng tin trong `tx` của bên gọi: chờ lượt đổi tin đang chạy xong, không chặn lượt đọc. Trả phiên
   * bản và trạng thái lúc giữ — đứng yên tới hết `tx` vì lượt đổi tin cần `FOR UPDATE` (fix-audit-review, T5).
   */
  holdKey(tx: Tx, id: string): Promise<{ version: number; state: ListingState } | null>;
  existingIds(ids: string[]): Promise<Set<string>>;
  badgeBlocked(listingId: string, groupId: string): Promise<boolean>;
  /** Tin này đã được chuyển lên sàn chung chưa (kiểm trước cho câu lỗi; unique mới là chốt thật). */
  movedFrom(listingId: string): Promise<boolean>;
  /** Mã cho tin sắp tạo — bản sao ảnh cần chủ có mã trước khi tin có dòng. */
  newId(): Promise<string>;
  /** Người đăng của các tin khớp điều kiện — bên nghe hỏi `group` một lần cho cả nhóm thay vì từng dòng. */
  ownersWhere(where: Prisma.ListingWhereInput): Promise<string[]>;
  /** Cộng `ms` vào hạn của tin đang hiện của người này — trả ngày đã trôi trong lúc khoá (add-strikes). */
  extendLiveExpiry(tx: Tx, accountId: string, ms: number): Promise<number>;
  /** Nhóm gỡ huy hiệu: chặn gắn lại huy hiệu nhóm đó cho tin này (cam kết 23). */
  blockBadge(
    tx: Tx,
    input: { listingId: string; groupId: string; removedBy: string; at: Date },
  ): Promise<void>;
  /** Dữ kiện hạn mức cho `trust`, đọc bằng `tx` của lượt gửi — sau khoá theo người (design add-trust-tiers mục 6). */
  quotaFacts(
    tx: Tx | null,
    input: { accountId: string; since: Date; groupId: string | null },
  ): Promise<{ live: number; submittedAt: Date[]; liveInGroup: number | null }>;
  /** Tin đang chiếm chỗ — kèm vào lỗi hết chỗ để người dùng biết giải phóng tin nào. */
  occupying(tx: Tx, accountId: string): Promise<Pick<Listing, 'id' | 'title' | 'state'>[]>;
  /** Bảng uy tín: tin đang hiển thị hạn chế và tin chờ người duyệt của một người. */
  dashboardRows(
    accountId: string,
  ): Promise<Pick<Listing, 'id' | 'title' | 'state' | 'restrictions'>[]>;
  /** Tin đã được thấy đủ `minShownMs` và còn được thấy sau `since` — lượt hằng ngày của `trust` (mục 5). */
  shownCandidates(input: {
    minShownMs: number;
    since: Date;
    now: Date;
  }): Promise<{ id: string; ownerId: string }[]>;
  /**
   * Tin khác của chính người đăng để so "trùng tin của mình" (spec risk-scoring): tin còn đó tính mọi tuổi, tin đã xoá
   * hay đã hết hạn chỉ tính từ `since`.
   */
  ownTexts(input: {
    accountId: string;
    since: Date;
    excludeId: string;
  }): Promise<Pick<Listing, 'id' | 'title' | 'description'>[]>;
  /** Lượt gửi mọi loại, kể cả gửi lại sau sửa — "đăng dồn". */
  countSubmissions(accountId: string, since: Date): Promise<number>;
  /** Giá khác 0 của tin cùng danh mục lên bảng lần đầu từ `since` — lượt đêm `screening.price-stats`. */
  priceSamples(categoryId: string, since: Date): Promise<bigint[]>;
  /** Tin đang hiển thị theo con trỏ `id` — quét lại khi bật cụm, lưới an toàn ảnh. */
  liveBatch(
    after: string | null,
    take: number,
  ): Promise<Pick<Listing, 'id' | 'version' | 'ownerId' | 'title' | 'description' | 'imageIds'>[]>;

  /** Tin lên bảng lần đầu trong `[from, to)` đếm theo ngày Việt Nam (add-ops-daily-stats). */
  firstLiveByDay(from: Date, to: Date): Promise<DayCount[]>;

  // ── HẠN LƯU (add-data-retention) ──
  /** Tin khớp điều kiện một luật hạn lưu, theo trang con trỏ `id` (tin đang tạm giữ bị bỏ qua nên trang không lùi). */
  retentionDue(
    where: Prisma.ListingWhereInput,
    after: string | null,
    limit: number,
  ): Promise<RetentionRow[]>;
  /**
   * Xoá HẲN các tin trong `ids` còn khớp `where` lúc xoá — một transaction, điều kiện của luật kiểm lại ngay trong câu
   * xoá (tin vừa được gia hạn giữa lúc chọn và lúc xoá thì ở lại). Trả mã đã xoá.
   */
  purgeWhere(ids: string[], where: Prisma.ListingWhereInput): Promise<string[]>;
  /** Xoá mềm theo lô kèm `listing.listing.deleted` mỗi tin (bên nghe huỷ việc đang mở). Trả mã vừa xoá mềm. */
  softDeleteWhere(where: Prisma.ListingWhereInput, at: Date): Promise<string[]>;
}

/** Người đăng nhiều tin nhất cũng chỉ so với ngần này tin gần nhất — lượt chấm chữ không chậm dần theo số tin. */
const OWN_TEXTS_LIMIT = 200;

/** Lô của bên nghe: đủ lớn để ít lượt, đủ nhỏ để một transaction không giữ khoá quá lâu (design mục 9). */
export const BATCH_SIZE = 500;

/**
 * Tin sống (spec trust/quotas): đang kiểm, chờ duyệt, đang hiển thị không tạm ẩn, chưa xoá — đếm chung mọi nơi đăng.
 * Định nghĩa nằm một chỗ cạnh dữ liệu; `trust` chỉ nhận con số.
 */
const liveWhere = (ownerId: string): Prisma.ListingWhereInput => ({
  ownerId,
  deletedAt: null,
  state: { in: ['checking', 'pending', 'live'] },
  hideReasons: { isEmpty: true },
});

const orderBy = (order: ListingOrder): Prisma.ListingOrderByWithRelationInput[] =>
  order === 'live' ? [{ rankAt: 'desc' }, { id: 'desc' }] : [{ updatedAt: 'desc' }, { id: 'desc' }];

/** Trang sau con trỏ (`at`, `id`) theo đúng thứ tự xếp — không lặp, không sót khi có tin mới chen lên đầu. */
function afterCursor(order: ListingOrder, cursor: CursorKey): Prisma.ListingWhereInput {
  const column = order === 'live' ? 'rankAt' : 'updatedAt';
  return {
    OR: [{ [column]: { lt: cursor.at } }, { [column]: cursor.at, id: { lt: cursor.id } }],
  };
}

const jsonOf = (row: BatchRow) => ({
  id: row.id,
  state: row.state,
  version: row.version,
  hide_reasons: row.hideReasons,
  restrictions: row.restrictions,
  placement: row.placement,
  badge_group_id: row.badgeGroupId,
  unit_id: row.unitId,
  expires_at: row.expiresAt?.toISOString() ?? null,
  clock_remaining_ms: row.clockRemainingMs?.toString() ?? null,
  shown_ms: row.shownMs.toString(),
  shown_since: row.shownSince?.toISOString() ?? null,
  left_group_at: row.leftGroupAt?.toISOString() ?? null,
  reminded_for: row.remindedFor?.toISOString() ?? null,
  purge_reminded_for: row.purgeRemindedFor?.toISOString() ?? null,
});

async function lockListing(tx: Tx, id: string): Promise<Listing | null> {
  await tx.$executeRaw`SELECT 1 FROM listings WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.listing.findUnique({ where: { id } });
}

export function createListingRepository(prisma: PrismaClient): ListingRepository {
  /** Một lô: chọn mã, khoá, đọc lại dòng đã khoá, tính, ghi một câu. `null` = hết dòng. */
  const batchOnce = async <C>(
    input: BatchInput<C>,
    after: string | null,
  ): Promise<{ last: string; changed: number } | null> =>
    prisma.$transaction(async (tx) => {
      const ids = (
        await tx.listing.findMany({
          where: { ...input.where, ...(after ? { id: { gt: after } } : {}) },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          select: { id: true },
        })
      ).map((row) => row.id);
      const last = ids.at(-1);
      if (!last) return null;
      await tx.$executeRaw`SELECT 1 FROM listings WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
      const rows = await tx.listing.findMany({ where: { id: { in: ids } } });
      const context = (input.prepare ? await input.prepare() : undefined) as C;
      const updates = input.compute(rows, context);
      if (updates.length > 0) {
        await tx.$executeRaw`
          UPDATE listings AS l SET
            state = v.state::listing_state,
            version = v.version,
            hide_reasons = v.hide_reasons::listing_hide_reason[],
            restrictions = v.restrictions::listing_restriction[],
            placement = v.placement::listing_placement,
            badge_group_id = v.badge_group_id,
            unit_id = v.unit_id,
            expires_at = v.expires_at,
            clock_remaining_ms = v.clock_remaining_ms,
            shown_ms = v.shown_ms,
            shown_since = v.shown_since,
            left_group_at = v.left_group_at,
            reminded_for = v.reminded_for,
            purge_reminded_for = v.purge_reminded_for,
            updated_at = ${input.at}
          FROM jsonb_to_recordset(${JSON.stringify(updates.map(jsonOf))}::jsonb) AS v(
            id uuid, state text, version int, hide_reasons text[], restrictions text[], placement text,
            badge_group_id uuid, unit_id uuid, expires_at timestamptz, clock_remaining_ms bigint, shown_ms bigint,
            shown_since timestamptz, left_group_at timestamptz, reminded_for timestamptz,
            purge_reminded_for timestamptz)
          WHERE l.id = v.id`;
        const byId = new Map(rows.map((row) => [row.id, row]));
        const changed = updates.flatMap((row) => {
          const before = byId.get(row.id);
          return before ? [{ before, after: row }] : [];
        });
        await appendEvents(tx, input.events?.(changed, context) ?? []);
      }
      return { last, changed: updates.length };
    });

  const runBatches = async <C>(
    input: BatchInput<C>,
    after: string | null,
    done: number,
  ): Promise<number> => {
    const result = await batchOnce(input, after);
    if (!result) return done;
    return runBatches(input, result.last, done + result.changed);
  };

  return {
    create: ({ data, after }) =>
      prisma.$transaction(async (tx) => {
        const created = await tx.listing.create({ data });
        await after?.(tx, created);
        return created;
      }),

    findById: (id) => prisma.listing.findUnique({ where: { id } }),
    findByIds: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.listing.findMany({ where: { id: { in: ids } } }),

    change: (input) =>
      prisma.$transaction(async (tx) => {
        const locked = await lockListing(tx, input.id);
        if (!locked || locked.deletedAt !== null || !input.states.includes(locked.state))
          return null;
        if (input.version !== undefined && locked.version !== input.version) return null;
        await input.before?.(tx, locked);
        const updated = await tx.listing.update({
          where: { id: input.id },
          data: input.data(locked),
        });
        await input.after?.(tx, updated);
        if (input.submission) {
          await tx.listingSubmission.create({ data: { listingId: input.id, ...input.submission } });
        }
        await appendEvents(tx, input.events?.(updated, locked) ?? []);
        if (input.audit) await appendAudit(tx, input.audit);
        return { before: locked, after: updated };
      }),

    createMoved: ({ data, before, after, submission, events }) =>
      prisma.$transaction(async (tx) => {
        await before?.(tx);
        const created = await tx.listing.create({ data });
        await after?.(tx, created);
        await tx.listingSubmission.create({
          data: { listingId: created.id, fromVersion: created.version, ...submission },
        });
        await appendEvents(tx, events(created));
        return created;
      }),

    findSubmission: (listingId, fromVersion) =>
      prisma.listingSubmission.findUnique({
        where: { listingId_fromVersion: { listingId, fromVersion } },
      }),

    applyBatch: (input) => runBatches(input, null, 0),

    list: ({ where, order, cursor, limit }) =>
      prisma.listing.findMany({
        where: cursor ? { AND: [where, afterCursor(order, cursor)] } : where,
        orderBy: orderBy(order),
        take: limit + 1,
      }),

    async saveListing(accountId, listingId, at) {
      await prisma.savedListing.createMany({
        data: [{ accountId, listingId, savedAt: at }],
        skipDuplicates: true,
      });
    },

    async unsaveListing(accountId, listingId) {
      await prisma.savedListing.deleteMany({ where: { accountId, listingId } });
    },

    async savedPage({ accountId, visible, cursor, limit }) {
      const rows = await prisma.savedListing.findMany({
        where: {
          accountId,
          listing: visible,
          ...(cursor
            ? {
                OR: [
                  { savedAt: { lt: cursor.at } },
                  { savedAt: cursor.at, listingId: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ savedAt: 'desc' }, { listingId: 'desc' }],
        take: limit + 1,
        include: { listing: true },
      });
      return rows.map((row) => ({ listing: row.listing, savedAt: row.savedAt }));
    },

    async savedIds(accountId) {
      const rows = await prisma.savedListing.findMany({
        where: { accountId },
        orderBy: { savedAt: 'desc' },
        select: { listingId: true },
      });
      return rows.map((row) => row.listingId);
    },

    async forgetSaved(accountId) {
      await prisma.$transaction([
        prisma.savedListing.deleteMany({ where: { accountId } }),
        prisma.savedSearch.deleteMany({ where: { accountId } }),
      ]);
    },

    saveSearch: (input, max) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`saved-searches:${input.accountId}`}, 0))`;
        const existing = await tx.savedSearch.findUnique({
          where: { accountId_key: { accountId: input.accountId, key: input.key } },
        });
        if (existing) return { search: existing, created: false };
        if ((await tx.savedSearch.count({ where: { accountId: input.accountId } })) >= max) {
          return null;
        }
        return { search: await tx.savedSearch.create({ data: input }), created: true };
      }),

    savedSearches: (accountId) =>
      prisma.savedSearch.findMany({
        where: { accountId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),

    async deleteSavedSearch(accountId, id) {
      const { count } = await prisma.savedSearch.deleteMany({ where: { id, accountId } });
      return count > 0;
    },

    savedSearchMatches: (listing) =>
      prisma.$queryRaw<{ id: string; accountId: string; q: string }[]>`
        SELECT id::text AS id, account_id::text AS "accountId", q
          FROM saved_searches
         WHERE account_id <> ${listing.ownerId}::uuid
           AND position(q_folded IN ${listing.searchFolded}) > 0
           AND (category_id IS NULL OR category_id = ${listing.categoryId}::uuid)
           AND (province_code IS NULL OR province_code = ${listing.provinceCode})
           AND (ward_code IS NULL OR ward_code = ${listing.wardCode})
           AND (price_min IS NULL OR price_min <= ${listing.price})
           AND (price_max IS NULL OR price_max >= ${listing.price})`,

    holdKey: async (tx, id) => {
      const [row] = await tx.$queryRaw<{ version: number; state: ListingState }[]>`
        SELECT version, state FROM listings WHERE id = ${id}::uuid FOR KEY SHARE`;
      return row ?? null;
    },

    countGroupPublic: (tx, groupId) =>
      tx.listing.count({
        where: {
          groupId,
          placement: 'group_public',
          deletedAt: null,
          state: { not: 'draft' },
          NOT: { hideReasons: { hasSome: [...DETACHED_REASONS] } },
        },
      }),

    async badgeBlocked(listingId, groupId) {
      const row = await prisma.listingBadgeBlock.findUnique({
        where: { listingId_groupId: { listingId, groupId } },
        select: { listingId: true },
      });
      return row !== null;
    },

    async movedFrom(listingId) {
      return (await prisma.listing.count({ where: { movedFromListingId: listingId } })) > 0;
    },

    async newId() {
      const [row] = await prisma.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
      if (!row) throw new Error('Postgres không sinh được mã');
      return row.id;
    },

    extendLiveExpiry: (tx, accountId, ms) =>
      tx.$executeRaw`UPDATE listings SET expires_at = expires_at + make_interval(secs => ${Math.round(ms / 1000)})
        WHERE owner_id = ${accountId}::uuid AND state = 'live' AND deleted_at IS NULL AND expires_at IS NOT NULL`,

    async ownersWhere(where) {
      const rows = await prisma.listing.findMany({
        where,
        distinct: ['ownerId'],
        select: { ownerId: true },
      });
      return rows.map((row) => row.ownerId);
    },

    async blockBadge(tx, { listingId, groupId, removedBy, at }) {
      await tx.listingBadgeBlock.upsert({
        where: { listingId_groupId: { listingId, groupId } },
        create: { listingId, groupId, removedBy, removedAt: at },
        update: { removedBy, removedAt: at },
      });
    },

    async quotaFacts(tx, { accountId, since, groupId }) {
      const db = tx ?? prisma;
      const [live, submissions, liveInGroup] = await Promise.all([
        db.listing.count({ where: liveWhere(accountId) }),
        db.listingSubmission.findMany({
          where: { accountId, at: { gt: since } },
          select: { at: true },
        }),
        groupId ? db.listing.count({ where: { ...liveWhere(accountId), groupId } }) : null,
      ]);
      return { live, submittedAt: submissions.map((row) => row.at), liveInGroup };
    },

    occupying: (tx, accountId) =>
      tx.listing.findMany({
        where: liveWhere(accountId),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, title: true, state: true },
      }),

    dashboardRows: (accountId) =>
      prisma.listing.findMany({
        where: {
          ownerId: accountId,
          deletedAt: null,
          OR: [{ state: 'pending' }, { state: 'live', NOT: { restrictions: { isEmpty: true } } }],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, title: true, state: true, restrictions: true },
      }),

    // Khoảng đang mở chưa cộng vào `shown_ms`: cộng tại chỗ. Khoảng đã đóng thì lần ghi đóng nó làm mới `updated_at`.
    shownCandidates: ({ minShownMs, since, now }) =>
      prisma.$queryRaw<{ id: string; ownerId: string }[]>`
        SELECT id::text AS id, owner_id::text AS "ownerId"
        FROM listings
        WHERE (shown_since IS NOT NULL
               AND shown_ms + (EXTRACT(EPOCH FROM (${now}::timestamptz - shown_since)) * 1000)::bigint >= ${minShownMs})
           OR (shown_since IS NULL AND shown_ms >= ${minShownMs} AND updated_at >= ${since})`,

    ownTexts: ({ accountId, since, excludeId }) =>
      prisma.listing.findMany({
        where: {
          ownerId: accountId,
          id: { not: excludeId },
          state: { not: 'draft' },
          OR: [
            { deletedAt: null, state: { not: 'expired' } },
            { deletedAt: { gte: since } },
            { deletedAt: null, state: 'expired', expiresAt: { gte: since } },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: OWN_TEXTS_LIMIT,
        select: { id: true, title: true, description: true },
      }),

    countSubmissions: (accountId, since) =>
      prisma.listingSubmission.count({ where: { accountId, at: { gt: since } } }),

    async priceSamples(categoryId, since) {
      const rows = await prisma.listing.findMany({
        where: { categoryId, firstLiveAt: { gte: since }, price: { gt: 0n } },
        select: { price: true },
      });
      return rows.flatMap((row) => (row.price === null ? [] : [row.price]));
    },

    liveBatch: (after, take) =>
      prisma.listing.findMany({
        where: { state: 'live', deletedAt: null, ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: 'asc' },
        take,
        select: {
          id: true,
          version: true,
          ownerId: true,
          title: true,
          description: true,
          imageIds: true,
        },
      }),

    firstLiveByDay: (from, to) =>
      prisma.$queryRaw<DayCount[]>`
        SELECT to_char((first_live_at AT TIME ZONE ${SHOP_TIME_ZONE})::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
          FROM listings
         WHERE first_live_at >= ${from} AND first_live_at < ${to}
         GROUP BY 1
         ORDER BY 1`,

    retentionDue: (where, after, limit) =>
      prisma.listing.findMany({
        where: { ...where, ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: 'asc' },
        take: limit,
        select: { id: true, ownerId: true, groupId: true, updatedAt: true },
      }),

    purgeWhere: (ids, where) =>
      prisma.$transaction(async (tx) => {
        if (ids.length === 0) return [];
        await tx.$executeRaw`SELECT 1 FROM listings WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
        const due = await tx.listing.findMany({
          where: { ...where, id: { in: ids } },
          select: { id: true },
        });
        const dueIds = due.map((row) => row.id);
        if (dueIds.length > 0) await tx.listing.deleteMany({ where: { id: { in: dueIds } } });
        return dueIds;
      }),

    softDeleteWhere: (where, at) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.listing.updateManyAndReturn({
          where: { ...where, deletedAt: null },
          data: { deletedAt: at },
          select: { id: true, ownerId: true },
        });
        await appendEvents(
          tx,
          rows.map((row) =>
            listingEvent(LISTING_EVENTS.deleted, { listingId: row.id, ownerId: row.ownerId }),
          ),
        );
        return rows.map((row) => row.id);
      }),

    async existingIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = await prisma.listing.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      return new Set(rows.map((row) => row.id));
    },
  };
}
