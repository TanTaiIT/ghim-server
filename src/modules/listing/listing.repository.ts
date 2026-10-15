import type {
  Listing,
  ListingState,
  ListingSubmission,
  ListingSubmissionKind,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import { appendAudit, type AuditEntry } from '../../common/audit/audit.js';
import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';
import type { CursorKey } from '../../common/schemas/cursor.js';
import { DETACHED_REASONS } from './calc/hide.calc.js';

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
  order === 'live'
    ? [{ firstLiveAt: 'desc' }, { id: 'desc' }]
    : [{ updatedAt: 'desc' }, { id: 'desc' }];

/** Trang sau con trỏ (`at`, `id`) theo đúng thứ tự xếp — không lặp, không sót khi có tin mới chen lên đầu. */
function afterCursor(order: ListingOrder, cursor: CursorKey): Prisma.ListingWhereInput {
  const column = order === 'live' ? 'firstLiveAt' : 'updatedAt';
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
            updated_at = ${input.at}
          FROM jsonb_to_recordset(${JSON.stringify(updates.map(jsonOf))}::jsonb) AS v(
            id uuid, state text, version int, hide_reasons text[], restrictions text[], placement text,
            badge_group_id uuid, unit_id uuid, expires_at timestamptz, clock_remaining_ms bigint, shown_ms bigint,
            shown_since timestamptz, left_group_at timestamptz, reminded_for timestamptz)
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
