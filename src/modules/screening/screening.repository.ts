import {
  type BannedPhrase,
  type ImageCheck,
  type ImageCheckErrorKind,
  type ImageWhitelistEntry,
  Prisma,
  type PrismaClient,
  type ScreeningCategoryBand,
  type ScreeningRule,
  type ScreeningRuleKind,
  type ScreeningRuleMode,
  type ScreeningRuleOverride,
  type ScreeningRun,
  type ScreeningTrigger,
} from '@prisma/client';

import { type AuditEntry, appendAudit } from '../../common/audit/audit.js';
import { appendEvents, type OutboxEventInput } from '../../common/outbox/outbox.js';
import type { HELD_MANY_CAUSES } from './calc/decide.calc.js';
import type { PriceRange } from './calc/price-stats.calc.js';
import type { RuleSnapshot } from './calc/score.calc.js';

export type Tx = Prisma.TransactionClient;

/** Một phiên bản tin lưới an toàn đã hạn chế vì thiếu kết quả ảnh. */
export interface UncheckedMark {
  listingId: string;
  listingVersion: number;
}

export interface RuleVersion {
  version: number;
  snapshot: RuleSnapshot;
}

export interface InitialRule {
  code: string;
  kind: ScreeningRuleKind;
  weight: number;
  /** Luật đòi bật ngay dù thêm sau phiên bản 1 (add-strikes); mặc định theo lượt chèn. */
  mode?: ScreeningRuleMode | undefined;
}

export interface NewRun {
  listingId: string;
  listingVersion: number;
  accountId: string;
  trigger: ScreeningTrigger;
  startedAt: Date;
  textResult: Prisma.InputJsonValue;
  imageIds: string[];
  configVersion: number;
  ruleVersion: number;
}

export type RunDecision = Pick<
  ScreeningRun,
  'outcome' | 'cause' | 'score' | 'band' | 'tier' | 'lookupCode' | 'rankAsListingId'
> & {
  decidedAt: Date;
  hits: Prisma.InputJsonValue;
  explanation: Prisma.InputJsonValue | null;
};

/** dHash đã chia dải: `dhash` dạng có dấu của cột `bigint`, `bands` đúng thứ tự `band0..band4`. */
export interface StoredHash {
  dhash: bigint;
  bands: readonly number[];
}

export interface ScreeningRepository {
  // ── LUẬT ───────────────────────────────────────────────────────────────────────────────────────
  /**
   * Thêm mã luật code có mà bảng chưa có, cùng một phiên bản mới. Bảng rỗng → phiên bản 1, mọi luật bật (TK 14); về sau
   * → luật mới chạy thử (spec rule-management). Không thiếu mã nào thì `null`, nên khởi động lại không tạo thêm.
   */
  seedRules(
    rules: readonly InitialRule[],
    at: Date,
  ): Promise<{ version: number; added: number } | null>;
  /** Số phiên bản hiện hành — một lượt đọc khoá chính, để bộ nhớ đệm biết lúc nào phải nạp lại. */
  ruleVersionNumber(): Promise<number | null>;
  currentRuleVersion(): Promise<RuleVersion | null>;
  ruleVersion(version: number, tx?: Tx): Promise<RuleVersion | null>;
  /**
   * Một lần đổi luật, ghi đè, dải hay cụm: dưới khoá, đổi → ảnh chụp phiên bản mới → nhật ký, cùng transaction (spec
   * rule-management: mỗi lần đổi là một phiên bản). `change` trả `null` = không có gì để đổi, không tạo phiên bản.
   */
  changeRules<T>(
    input: { createdBy: string; at: Date; audit: (result: T) => AuditEntry },
    change: (tx: Tx) => Promise<T | null>,
  ): Promise<{ result: T; version: number } | null>;
  listRules(): Promise<{
    rules: ScreeningRule[];
    overrides: ScreeningRuleOverride[];
    bands: ScreeningCategoryBand[];
  }>;
  listPhrases(): Promise<BannedPhrase[]>;
  findPhrase(id: string): Promise<BannedPhrase | null>;
  phrasesByIds(ids: string[]): Promise<Pick<BannedPhrase, 'id' | 'text'>[]>;
  findRule(code: string): Promise<ScreeningRule | null>;

  // Ghi trong `changeRules` — dưới khoá luật, nên đọc rồi ghi không bị lượt khác chen giữa.
  updateRule(
    tx: Tx,
    code: string,
    patch: { weight?: number; mode?: ScreeningRuleMode },
  ): Promise<void>;
  upsertOverride(
    tx: Tx,
    row: {
      code: string;
      categoryId: string;
      weight: number | null;
      mode: ScreeningRuleMode | null;
    },
  ): Promise<void>;
  deleteOverride(tx: Tx, code: string, categoryId: string): Promise<boolean>;
  upsertBands(
    tx: Tx,
    row: { categoryId: string; mediumFrom: number; highFrom: number },
  ): Promise<void>;
  /** `null` khi đã có cụm cùng dạng bỏ dấu. */
  createPhrase(
    tx: Tx,
    data: Pick<
      BannedPhrase,
      | 'text'
      | 'folded'
      | 'level'
      | 'mode'
      | 'trialEndsAt'
      | 'exceptions'
      | 'createdBy'
      | 'createdAt'
    >,
  ): Promise<BannedPhrase | null>;
  updatePhrase(
    tx: Tx,
    id: string,
    patch: Partial<
      Pick<
        BannedPhrase,
        'level' | 'mode' | 'exceptions' | 'activatedAt' | 'activatedBy' | 'activationReason'
      >
    >,
  ): Promise<BannedPhrase>;

  // ── LƯỢT ───────────────────────────────────────────────────────────────────────────────────────
  inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  /** Unique (tin, phiên bản, loại lượt): bấm Đăng hai lần thì lượt thua ném, transaction của `listing` quay lui. */
  openRun(tx: Tx, data: NewRun): Promise<ScreeningRun>;
  findRun(
    listingId: string,
    version: number,
    trigger: ScreeningTrigger,
  ): Promise<ScreeningRun | null>;
  /** Lượt chưa kết luận đang chờ ảnh này (index GIN một phần). */
  openRunsWithImage(imageId: string): Promise<ScreeningRun[]>;
  staleOpenRuns(startedBefore: Date): Promise<ScreeningRun[]>;
  /**
   * Ghi kết luận có điều kiện `decided_at IS NULL` cùng sự kiện: lưới an toàn và ảnh cuối về cùng lúc thì một lượt
   * thắng (design mục 14). `false` = lượt khác đã kết luận trước.
   */
  decideRun(tx: Tx, id: string, data: RunDecision, events: OutboxEventInput[]): Promise<boolean>;
  /** Lượt gửi rút về có sẵn kết luận; đã có lượt rút về của đúng phiên bản thì bỏ qua (`false`). */
  createDecidedRun(
    tx: Tx,
    data: NewRun & RunDecision,
    events: OutboxEventInput[],
  ): Promise<boolean>;
  /** Khoá theo người cho dò cổng cứng — hai lượt song song chạm lượt thứ 3 không cùng bỏ lỡ (design mục 14). */
  lockAccount(tx: Tx, accountId: string): Promise<void>;
  countGateRuns(tx: Tx, accountId: string, since: Date): Promise<number>;
  /** Lần máy giữ của lượt gửi trong khung "bị giữ nhiều", chỉ những căn cứ được đếm (câu 15). */
  countHolds(accountId: string, since: Date, causes: typeof HELD_MANY_CAUSES): Promise<number>;
  /** Lượt đã kết luận của các tin, mới nhất trước — câu báo cho người đăng. */
  decidedRuns(listingIds: string[]): Promise<ScreeningRun[]>;
  findRunByLookupCode(code: string): Promise<ScreeningRun | null>;
  // ── HẠN LƯU (add-data-retention) ──
  /**
   * Lượt máy bắt đầu trước mốc, tối đa `limit`: lượt đã kết luận cộng vào `screening_run_stats` (theo tháng, phiên bản,
   * kết quả, nguyên nhân, dải, từng mã luật đã trúng và dòng tổng `*`) rồi xoá; lượt chưa kết luận chỉ xoá. Một transaction.
   */
  foldRunsBefore(startedBefore: Date, limit: number): Promise<{ folded: number; deleted: number }>;
  deleteMarksBefore(markedBefore: Date): Promise<number>;
  /** Tin trong `listingIds` đã từng bị rút về vì cụm này (cụm nằm trong `hits` của lượt `recall`), ở phiên bản nào cũng được. */
  recalledFor(phraseId: string, listingIds: string[]): Promise<Set<string>>;

  // ── THỜI GIAN CHỜ ─────────────────────────────────────────────────────────────────────────────
  activeCooldown(accountId: string, now: Date): Promise<Date | null>;
  startCooldown(
    tx: Tx,
    input: { accountId: string; until: Date; at: Date },
    events: OutboxEventInput[],
  ): Promise<void>;

  // ── ẢNH ────────────────────────────────────────────────────────────────────────────────────────
  imageChecks(imageIds: string[], tx?: Tx): Promise<ImageCheck[]>;
  /** Thêm dòng `pending` (chưa xếp) cho ảnh chưa có dòng; trả ảnh vừa thêm. */
  addPendingChecks(imageIds: string[], ownerAccountId: string): Promise<string[]>;
  /**
   * Xếp các ảnh còn `pending` mà chưa xếp hay xếp trước `staleBefore`: ghi `queued_at = now` và trả đúng các ảnh đó —
   * chỉ chúng được gửi việc, nên lượt xếp chồng nhau không gửi trùng (fix-audit-image-checks, T20).
   */
  claimQueued(imageIds: string[], staleBefore: Date, now: Date): Promise<string[]>;
  /** Như `claimQueued` nhưng trên mọi ảnh `pending` kẹt — lưới an toàn, tối đa `limit` ảnh mỗi lượt. */
  claimStalePending(staleBefore: Date, now: Date, limit: number): Promise<string[]>;
  /** Gửi việc hỏng: trả các ảnh về "chưa xếp" để lượt thử lại xếp ngay. */
  unqueue(imageIds: string[]): Promise<void>;
  /** Ảnh đã xoá hẳn ở `media`: bỏ dấu ảnh — không còn là ứng viên trùng của tin sau (rà soát L10). Trả số dòng xoá. */
  deleteImageChecks(imageIds: string[]): Promise<number>;
  findImageCheck(imageId: string): Promise<ImageCheck | null>;
  /** Mỗi lượt thử của việc kiểm ảnh; trả số lượt đã thử kể cả lượt này. */
  bumpAttempts(imageId: string): Promise<number>;
  /** Ghi kết quả khi dòng còn `pending`; `false` = việc kiểm khác đã ghi trước (việc trùng không ghi đè). */
  finishImageCheck(
    imageId: string,
    result: ({ status: 'done' } & StoredHash) | { status: 'error'; kind: ImageCheckErrorKind },
    at: Date,
  ): Promise<boolean>;
  /**
   * Lượt gửi mới dùng ảnh lỗi tạm (kho không trả lời): đưa về `pending`, chưa xếp, để lượt chờ kết quả mới thay vì giữ
   * ngay (fix-audit-screening-trust, T21). Trả các ảnh vừa đưa về.
   */
  retryTransient(tx: Tx, imageIds: string[]): Promise<string[]>;
  /**
   * Ảnh của tài khoản khác chung ít nhất một dải, đã kiểm xong TRƯỚC ảnh đang xét (`before`: mốc kiểm xong, phá hoà bằng
   * mã ảnh) — ứng viên trùng, còn phải so khoảng cách. Người đăng trước thắng: bản chép kiểm xong sau không làm ảnh gốc
   * thành "trùng" (change duplicate-image-first-wins).
   */
  duplicateCandidates(
    input: {
      bands: readonly number[];
      excludeOwner: string;
      excludeImageIds: string[];
      before: { checkedAt: Date; imageId: string };
    },
    tx?: Tx,
  ): Promise<Pick<ImageCheck, 'imageId' | 'dhash' | 'ownerAccountId'>[]>;
  whitelistCandidates(
    bands: readonly number[],
    tx?: Tx,
  ): Promise<Pick<ImageWhitelistEntry, 'dhash'>[]>;
  /**
   * Chạy `work` trong một savepoint của `tx`: lỗi thì quay về savepoint — transaction ghi tiếp được — và trả lỗi thay vì
   * ném. Kết luận lượt máy duyệt dùng để lỗi lúc đọc thành "giữ cho người" (fix-audit-screening-trust, T24).
   */
  guarded<T>(
    tx: Tx,
    work: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown }>;
  addWhitelist(
    entry: StoredHash & { sourceImageId: string; addedBy: string; at: Date },
    audit: AuditEntry,
  ): Promise<ImageWhitelistEntry>;
  removeWhitelist(id: string, audit: AuditEntry): Promise<boolean>;
  listWhitelist(): Promise<ImageWhitelistEntry[]>;

  // ── DANH MỤC ───────────────────────────────────────────────────────────────────────────────────
  priceStatOf(categoryId: string): Promise<PriceRange | null>;
  savePriceStat(categoryId: string, range: PriceRange, at: Date): Promise<void>;
  /** Từ khoá đã `fold` của mọi danh mục — suy ra danh mục từ tiêu đề. */
  keywords(): Promise<Map<string, string[]>>;
  replaceKeywords(categoryId: string, keywordsFolded: string[], audit: AuditEntry): Promise<void>;

  /** Sự kiện ngoài lượt nào — lưới an toàn hạ tin thiếu kết quả ảnh. */
  emit(events: OutboxEventInput[]): Promise<void>;
  /**
   * Lưới an toàn: ghi dấu "đã hạn chế vì thiếu kết quả ảnh" cho (tin, phiên bản) chưa có dấu, rồi phát sự kiện chỉ cho
   * dòng vừa ghi, cùng transaction — mỗi phiên bản một lần (fix-audit-image-checks, C2).
   */
  markUnchecked(
    rows: UncheckedMark[],
    at: Date,
    events: (marked: UncheckedMark[]) => OutboxEventInput[],
  ): Promise<UncheckedMark[]>;
}

/** Mọi lượt đổi luật, ghi đè, dải, cụm nối tiếp dưới một khoá: số phiên bản liền nhau, ảnh chụp đúng thứ tự ghi. */
const lockRules = (tx: Tx) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'screening-rules'}, 0))`;

const latestVersion = async (tx: Tx): Promise<number> =>
  (
    await tx.screeningRuleVersion.findFirst({
      orderBy: { version: 'desc' },
      select: { version: true },
    })
  )?.version ?? 0;

async function snapshotIn(tx: Tx): Promise<RuleSnapshot> {
  const rules = await tx.screeningRule.findMany({ orderBy: { code: 'asc' } });
  const overrides = await tx.screeningRuleOverride.findMany({
    orderBy: [{ categoryId: 'asc' }, { code: 'asc' }],
  });
  const bands = await tx.screeningCategoryBand.findMany({ orderBy: { categoryId: 'asc' } });
  const phrases = await tx.bannedPhrase.findMany({
    where: { mode: { not: 'off' } },
    select: { id: true, text: true, level: true, mode: true, exceptions: true },
    orderBy: { id: 'asc' },
  });
  return { rules, overrides, bands, phrases };
}

/** Ghi phiên bản kế tiếp từ trạng thái hiện tại của các bảng — gọi sau khi đã đổi, trong cùng transaction có khoá. */
async function writeVersion(tx: Tx, createdBy: string | null, at: Date): Promise<number> {
  const version = (await latestVersion(tx)) + 1;
  await tx.screeningRuleVersion.create({
    data: { version, snapshot: await snapshotIn(tx), createdBy, createdAt: at },
  });
  return version;
}

// Ảnh chụp do chính `writeVersion` ghi, không nhận từ client.
const toRuleVersion = (row: { version: number; snapshot: Prisma.JsonValue }): RuleVersion => ({
  version: row.version,
  snapshot: row.snapshot as RuleSnapshot,
});

const bandColumns = (bands: readonly number[]) => ({
  band0: bands[0] ?? 0,
  band1: bands[1] ?? 0,
  band2: bands[2] ?? 0,
  band3: bands[3] ?? 0,
  band4: bands[4] ?? 0,
});

const anyBand = (bands: readonly number[]) => [
  { band0: bands[0] ?? -1 },
  { band1: bands[1] ?? -1 },
  { band2: bands[2] ?? -1 },
  { band3: bands[3] ?? -1 },
  { band4: bands[4] ?? -1 },
];

export function createScreeningRepository(prisma: PrismaClient): ScreeningRepository {
  return {
    // ── LUẬT ─────────────────────────────────────────────────────────────────────────────────────

    seedRules: (rules, at) =>
      prisma.$transaction(async (tx) => {
        await lockRules(tx);
        const known = new Set(
          (await tx.screeningRule.findMany({ select: { code: true } })).map((row) => row.code),
        );
        const missing = rules.filter((rule) => !known.has(rule.code));
        if (missing.length === 0) return null;
        const mode: ScreeningRuleMode = (await latestVersion(tx)) === 0 ? 'on' : 'trial';
        await tx.screeningRule.createMany({
          data: missing.map((rule) => ({
            code: rule.code,
            kind: rule.kind,
            weight: rule.weight,
            mode: rule.mode ?? mode,
          })),
        });
        return { version: await writeVersion(tx, null, at), added: missing.length };
      }),

    ruleVersionNumber: async () =>
      (
        await prisma.screeningRuleVersion.findFirst({
          orderBy: { version: 'desc' },
          select: { version: true },
        })
      )?.version ?? null,

    async currentRuleVersion() {
      const row = await prisma.screeningRuleVersion.findFirst({ orderBy: { version: 'desc' } });
      return row ? toRuleVersion(row) : null;
    },

    async ruleVersion(version, tx) {
      const row = await (tx ?? prisma).screeningRuleVersion.findUnique({ where: { version } });
      return row ? toRuleVersion(row) : null;
    },

    changeRules: ({ createdBy, at, audit }, change) =>
      prisma.$transaction(async (tx) => {
        await lockRules(tx);
        const result = await change(tx);
        if (result === null) return null;
        const version = await writeVersion(tx, createdBy, at);
        const entry = audit(result);
        await appendAudit(tx, { ...entry, details: { ...entry.details, ruleVersion: version } });
        return { result, version };
      }),

    async listRules() {
      const [rules, overrides, bands] = await Promise.all([
        prisma.screeningRule.findMany({ orderBy: { code: 'asc' } }),
        prisma.screeningRuleOverride.findMany({
          orderBy: [{ categoryId: 'asc' }, { code: 'asc' }],
        }),
        prisma.screeningCategoryBand.findMany({ orderBy: { categoryId: 'asc' } }),
      ]);
      return { rules, overrides, bands };
    },

    listPhrases: () =>
      prisma.bannedPhrase.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    findPhrase: (id) => prisma.bannedPhrase.findUnique({ where: { id } }),
    phrasesByIds: (ids) =>
      ids.length === 0
        ? Promise.resolve([])
        : prisma.bannedPhrase.findMany({
            where: { id: { in: ids } },
            select: { id: true, text: true },
          }),
    findRule: (code) => prisma.screeningRule.findUnique({ where: { code } }),

    async updateRule(tx, code, patch) {
      await tx.screeningRule.update({ where: { code }, data: patch });
    },

    async upsertOverride(tx, { code, categoryId, weight, mode }) {
      await tx.screeningRuleOverride.upsert({
        where: { code_categoryId: { code, categoryId } },
        create: { code, categoryId, weight, mode },
        update: { weight, mode },
      });
    },

    async deleteOverride(tx, code, categoryId) {
      const { count } = await tx.screeningRuleOverride.deleteMany({ where: { code, categoryId } });
      return count > 0;
    },

    async upsertBands(tx, { categoryId, mediumFrom, highFrom }) {
      await tx.screeningCategoryBand.upsert({
        where: { categoryId },
        create: { categoryId, mediumFrom, highFrom },
        update: { mediumFrom, highFrom },
      });
    },

    async createPhrase(tx, data) {
      if (await tx.bannedPhrase.findUnique({ where: { folded: data.folded } })) return null;
      return tx.bannedPhrase.create({ data });
    },

    updatePhrase: (tx, id, patch) => tx.bannedPhrase.update({ where: { id }, data: patch }),

    // ── LƯỢT ─────────────────────────────────────────────────────────────────────────────────────

    inTransaction: (work) => prisma.$transaction(work),

    openRun: (tx, data) => tx.screeningRun.create({ data }),

    findRun: (listingId, version, trigger) =>
      prisma.screeningRun.findUnique({
        where: {
          listingId_listingVersion_trigger: { listingId, listingVersion: version, trigger },
        },
      }),

    async openRunsWithImage(imageId) {
      const ids = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM screening_runs
        WHERE decided_at IS NULL AND image_ids @> ARRAY[${imageId}::uuid]`;
      if (ids.length === 0) return [];
      return prisma.screeningRun.findMany({ where: { id: { in: ids.map((row) => row.id) } } });
    },

    staleOpenRuns: (startedBefore) =>
      prisma.screeningRun.findMany({
        where: { decidedAt: null, startedAt: { lt: startedBefore } },
        orderBy: { startedAt: 'asc' },
      }),

    async decideRun(tx, id, data, events) {
      const { count } = await tx.screeningRun.updateMany({
        where: { id, decidedAt: null },
        data: { ...data, explanation: data.explanation ?? Prisma.DbNull },
      });
      if (count === 0) return false;
      await appendEvents(tx, events);
      return true;
    },

    async createDecidedRun(tx, data, events) {
      const { count } = await tx.screeningRun.createMany({
        data: [{ ...data, explanation: data.explanation ?? Prisma.DbNull }],
        skipDuplicates: true,
      });
      if (count === 0) return false;
      await appendEvents(tx, events);
      return true;
    },

    async lockAccount(tx, accountId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`screening-probe:${accountId}`}, 0))`;
    },

    countGateRuns: (tx, accountId, since) =>
      tx.screeningRun.count({
        where: { accountId, trigger: 'submission', cause: 'gate', decidedAt: { gt: since } },
      }),

    countHolds: (accountId, since, causes) =>
      prisma.screeningRun.count({
        where: {
          accountId,
          trigger: 'submission',
          outcome: 'hold',
          cause: { in: [...causes] },
          decidedAt: { gt: since },
        },
      }),

    decidedRuns: (listingIds) =>
      listingIds.length === 0
        ? Promise.resolve([])
        : prisma.screeningRun.findMany({
            where: { listingId: { in: listingIds }, decidedAt: { not: null } },
            orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
          }),

    findRunByLookupCode: (code) => prisma.screeningRun.findUnique({ where: { lookupCode: code } }),

    foldRunsBefore: (startedBefore, limit) =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id::text AS id FROM screening_runs
           WHERE started_at < ${startedBefore}
           ORDER BY started_at, id
           LIMIT ${limit}
           FOR UPDATE SKIP LOCKED`;
        const ids = rows.map((row) => row.id);
        if (ids.length === 0) return { folded: 0, deleted: 0 };
        // `hits` là jsonb mảng `{ code, … }`; dòng tổng `*` đếm lượt, dòng theo mã đếm lượt có luật đó trúng.
        const folded = await tx.$executeRaw`
          INSERT INTO screening_run_stats
            (month, rule_version, config_version, outcome, cause, band, rule_code, runs)
          SELECT date_trunc('month', r.started_at)::date, r.rule_version, r.config_version, r.outcome::text,
                 coalesce(r.cause::text, ''), coalesce(r.band::text, ''), h.code, count(*)::int
            FROM screening_runs r
            CROSS JOIN LATERAL (
              SELECT '*' AS code
              UNION
              SELECT DISTINCT e->>'code'
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.hits) = 'array' THEN r.hits ELSE '[]'::jsonb END) e
               WHERE e ? 'code') h
           WHERE r.id = ANY(${ids}::uuid[]) AND r.decided_at IS NOT NULL
           GROUP BY 1, 2, 3, 4, 5, 6, 7
          ON CONFLICT (month, rule_version, config_version, outcome, cause, band, rule_code)
          DO UPDATE SET runs = screening_run_stats.runs + EXCLUDED.runs`;
        const deleted = await tx.$executeRaw`
          DELETE FROM screening_runs WHERE id = ANY(${ids}::uuid[])`;
        return { folded, deleted };
      }),

    async deleteMarksBefore(markedBefore) {
      const { count } = await prisma.screeningUncheckedMark.deleteMany({
        where: { markedAt: { lt: markedBefore } },
      });
      return count;
    },

    // ── THỜI GIAN CHỜ ───────────────────────────────────────────────────────────────────────────

    async activeCooldown(accountId, now) {
      const row = await prisma.screeningCooldown.findUnique({ where: { accountId } });
      return row && row.until > now ? row.until : null;
    },

    async startCooldown(tx, { accountId, until, at }, events) {
      await tx.screeningCooldown.upsert({
        where: { accountId },
        create: { accountId, until, startedAt: at },
        update: { until, startedAt: at },
      });
      await appendEvents(tx, events);
    },

    // ── ẢNH ──────────────────────────────────────────────────────────────────────────────────────

    imageChecks: (imageIds, tx) =>
      imageIds.length === 0
        ? Promise.resolve([])
        : (tx ?? prisma).imageCheck.findMany({ where: { imageId: { in: imageIds } } }),

    async addPendingChecks(imageIds, ownerAccountId) {
      if (imageIds.length === 0) return [];
      const rows = await prisma.imageCheck.createManyAndReturn({
        data: imageIds.map((imageId) => ({ imageId, ownerAccountId, status: 'pending' as const })),
        skipDuplicates: true,
        select: { imageId: true },
      });
      return rows.map((row) => row.imageId);
    },

    findImageCheck: (imageId) => prisma.imageCheck.findUnique({ where: { imageId } }),

    async bumpAttempts(imageId) {
      const row = await prisma.imageCheck.update({
        where: { imageId },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      return row.attempts;
    },

    async finishImageCheck(imageId, result, at) {
      const { count } = await prisma.imageCheck.updateMany({
        where: { imageId, status: 'pending' },
        data:
          result.status === 'done'
            ? { status: 'done', dhash: result.dhash, ...bandColumns(result.bands), checkedAt: at }
            : { status: 'error', errorKind: result.kind, checkedAt: at },
      });
      return count === 1;
    },

    async retryTransient(tx, imageIds) {
      if (imageIds.length === 0) return [];
      const rows = await tx.$queryRaw<{ image_id: string }[]>`
        UPDATE image_checks
           SET status = 'pending', error_kind = NULL, attempts = 0, queued_at = NULL, checked_at = NULL
         WHERE image_id = ANY(${imageIds}::uuid[]) AND status = 'error' AND error_kind = 'transient'
        RETURNING image_id`;
      return rows.map((row) => row.image_id);
    },

    async claimQueued(imageIds, staleBefore, now) {
      if (imageIds.length === 0) return [];
      const rows = await prisma.$queryRaw<{ image_id: string }[]>`
        UPDATE image_checks SET queued_at = ${now}
         WHERE image_id = ANY(${imageIds}::uuid[])
           AND status = 'pending'
           AND (queued_at IS NULL OR queued_at < ${staleBefore})
        RETURNING image_id`;
      return rows.map((row) => row.image_id);
    },

    async claimStalePending(staleBefore, now, limit) {
      const rows = await prisma.$queryRaw<{ image_id: string }[]>`
        UPDATE image_checks SET queued_at = ${now}
         WHERE image_id IN (
           SELECT image_id FROM image_checks
            WHERE status = 'pending' AND (queued_at IS NULL OR queued_at < ${staleBefore})
            ORDER BY queued_at NULLS FIRST
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED)
        RETURNING image_id`;
      return rows.map((row) => row.image_id);
    },

    async unqueue(imageIds) {
      if (imageIds.length === 0) return;
      await prisma.imageCheck.updateMany({
        where: { imageId: { in: imageIds }, status: 'pending' },
        data: { queuedAt: null },
      });
    },

    async deleteImageChecks(imageIds) {
      if (imageIds.length === 0) return 0;
      const { count } = await prisma.imageCheck.deleteMany({
        where: { imageId: { in: imageIds } },
      });
      return count;
    },

    duplicateCandidates: ({ bands, excludeOwner, excludeImageIds, before }, tx) =>
      (tx ?? prisma).imageCheck.findMany({
        where: {
          status: 'done',
          ownerAccountId: { not: excludeOwner },
          imageId: { notIn: excludeImageIds },
          AND: [
            { OR: anyBand(bands) },
            {
              OR: [
                { checkedAt: { lt: before.checkedAt } },
                { checkedAt: before.checkedAt, imageId: { lt: before.imageId } },
              ],
            },
          ],
        },
        select: { imageId: true, dhash: true, ownerAccountId: true },
      }),

    whitelistCandidates: (bands, tx) =>
      (tx ?? prisma).imageWhitelistEntry.findMany({
        where: { OR: anyBand(bands) },
        select: { dhash: true },
      }),

    async guarded(tx, work) {
      await tx.$executeRaw`SAVEPOINT screening_conclude`;
      try {
        const value = await work();
        await tx.$executeRaw`RELEASE SAVEPOINT screening_conclude`;
        return { ok: true, value };
      } catch (error) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT screening_conclude`;
        return { ok: false, error };
      }
    },

    addWhitelist: ({ dhash, bands, sourceImageId, addedBy, at }, audit) =>
      prisma.$transaction(async (tx) => {
        const row = await tx.imageWhitelistEntry.create({
          data: { dhash, ...bandColumns(bands), sourceImageId, addedBy, addedAt: at },
        });
        await appendAudit(tx, { ...audit, targetId: row.id });
        return row;
      }),

    removeWhitelist: (id, audit) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.imageWhitelistEntry.deleteMany({ where: { id } });
        if (count === 0) return false;
        await appendAudit(tx, audit);
        return true;
      }),

    listWhitelist: () => prisma.imageWhitelistEntry.findMany({ orderBy: { addedAt: 'desc' } }),

    // ── DANH MỤC ─────────────────────────────────────────────────────────────────────────────────

    async priceStatOf(categoryId) {
      const row = await prisma.categoryPriceStat.findUnique({ where: { categoryId } });
      return row ? { low: row.low, high: row.high, samples: row.samples } : null;
    },

    async savePriceStat(categoryId, range, at) {
      const data = { low: range.low, high: range.high, samples: range.samples, computedAt: at };
      await prisma.categoryPriceStat.upsert({
        where: { categoryId },
        create: { categoryId, ...data },
        update: data,
      });
    },

    async keywords() {
      const rows = await prisma.categoryKeyword.findMany();
      const byCategory = new Map<string, string[]>();
      for (const row of rows) {
        byCategory.set(row.categoryId, [
          ...(byCategory.get(row.categoryId) ?? []),
          row.keywordFolded,
        ]);
      }
      return byCategory;
    },

    replaceKeywords: (categoryId, keywordsFolded, audit) =>
      prisma.$transaction(async (tx) => {
        await tx.categoryKeyword.deleteMany({ where: { categoryId } });
        await tx.categoryKeyword.createMany({
          data: keywordsFolded.map((keywordFolded) => ({ categoryId, keywordFolded })),
          skipDuplicates: true,
        });
        await appendAudit(tx, audit);
      }),

    emit: (events) => prisma.$transaction((tx) => appendEvents(tx, events)),

    async recalledFor(phraseId, listingIds) {
      if (listingIds.length === 0) return new Set();
      const recalled = JSON.stringify([{ refs: [phraseId] }]);
      const rows = await prisma.$queryRaw<{ listing_id: string }[]>`
        SELECT DISTINCT listing_id FROM screening_runs
         WHERE trigger = 'recall'
           AND listing_id = ANY(${listingIds}::uuid[])
           AND hits @> ${recalled}::jsonb`;
      return new Set(rows.map((row) => row.listing_id));
    },

    markUnchecked: (rows, at, events) =>
      prisma.$transaction(async (tx) => {
        if (rows.length === 0) return [];
        const marked = await tx.screeningUncheckedMark.createManyAndReturn({
          data: rows.map((row) => ({ ...row, markedAt: at })),
          skipDuplicates: true,
          select: { listingId: true, listingVersion: true },
        });
        await appendEvents(tx, events(marked));
        return marked;
      }),
  };
}
