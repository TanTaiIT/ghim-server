import type {
  Prisma,
  PrismaClient,
  Report,
  ReportCategory,
  ReportEntry,
  ReportSubjectKind,
  ReportVerdict,
  ReporterScore,
} from '@prisma/client';

import type { Tx } from '../review.repository.js';

export type { Report, ReportEntry, ReporterScore };

export type ReportSubject =
  { kind: 'listing'; listingId: string } | { kind: 'account'; accountId: string };

export type ReportWithEntries = Report & { entries: ReportEntry[] };

/** Báo cáo của một người báo: lượt của chính họ và kết quả — không lượt của người khác (TK 23). */
export type MyReportRow = ReportEntry & { report: Report };

export interface ReportRepository {
  /**
   * Một lượt gửi: khoá theo người báo (trần mỗi giờ) rồi theo đối tượng (một báo cáo mở mỗi đối tượng), trong một
   * transaction — hai lượt chen nhau xếp hàng chứ không mở hai báo cáo hay vượt trần.
   */
  withSubmitLock<T>(
    input: { reporterId: string; subject: ReportSubject },
    write: (tx: Tx) => Promise<T>,
  ): Promise<T>;
  findOpenIn(tx: Tx, subject: ReportSubject): Promise<ReportWithEntries | null>;
  /** Khoá dòng báo cáo mở trong `tx` — sau khoá dòng tin và việc, cùng thứ tự với lượt quyết. */
  lockOpenIn(tx: Tx, subject: ReportSubject): Promise<ReportWithEntries | null>;
  createReport(
    tx: Tx,
    data: {
      subjectKind: ReportSubjectKind;
      listingId: string | null;
      accountId: string;
      severe: boolean;
      lowPriority: boolean;
      createdAt: Date;
    },
  ): Promise<Report>;
  updateReport(tx: Tx, id: string, data: Prisma.ReportUncheckedUpdateInput): Promise<Report>;
  addEntry(
    tx: Tx,
    data: {
      reportId: string;
      reporterId: string;
      category: ReportCategory;
      deviceHash: string | null;
      countsForHide: boolean;
      conversationId: string | null;
      createdAt: Date;
    },
  ): Promise<ReportEntry>;
  /** Thời điểm các lượt báo của người này từ `since` — trần mỗi giờ. */
  entryTimesSince(tx: Tx, reporterId: string, since: Date): Promise<Date[]>;
  scoreOf(accountId: string, tx?: Tx): Promise<ReporterScore | null>;
  /** Cộng dồn nguyên tử — hai báo cáo cùng người báo đóng cùng lúc không đè nhau. Trả điểm mới. */
  adjustScore(tx: Tx, accountId: string, delta: number): Promise<number>;
  suspend(tx: Tx, accountId: string, until: Date): Promise<void>;
  /** Đóng báo cáo bằng quyết định — chỉ khi còn mở. `null` = đã đóng ở lượt khác. */
  close(
    tx: Tx,
    input: { id: string; verdict: ReportVerdict; decisionId: string; at: Date },
  ): Promise<ReportWithEntries | null>;
  /** Báo cáo mở về tin đã tự ẩn tin — cờ `reported` của `listing` theo đây. */
  hidesListing(listingId: string): Promise<boolean>;
  /**
   * Quyết định gần nhất của người về tin là bác một báo cáo đã tự ẩn tin: báo cáo mới không tự ẩn nữa tới khi có quyết
   * định khác (TK 23, chốt 16/10/2026).
   */
  autoHideSpent(tx: Tx, listingId: string): Promise<boolean>;
  /** Báo cáo về một tin, về một người, hay về tin của người đó — mới trước, kể cả đã đóng. */
  related(input: {
    listingId: string | null;
    accountId: string;
    limit: number;
  }): Promise<ReportWithEntries[]>;
  /** Đối tượng đang có báo cáo mở chỉ gồm lượt của người điểm thấp — xếp cuối hàng. */
  lowPriorityOpen(input: { listingIds: string[]; accountIds: string[] }): Promise<{
    listingIds: Set<string>;
    accountIds: Set<string>;
  }>;
  myReports(
    reporterId: string,
    page: { skip: number; take: number },
  ): Promise<{ items: MyReportRow[]; total: number }>;
  /**
   * Tạm giữ bằng chứng (add-data-retention): báo cáo đang mở hay đóng sau `since` dính tới tin, người, hội thoại trong
   * danh sách — trả mã tin bị báo, mã người bị báo (báo cáo về người), mã người đăng của mọi báo cáo, mã hội thoại gửi kèm.
   */
  holds(
    input: { listingIds: string[]; accountIds: string[]; conversationIds: string[] },
    since: Date,
  ): Promise<ReportHolds>;
}

export interface ReportHolds {
  listingIds: Set<string>;
  subjectAccountIds: Set<string>;
  posterIds: Set<string>;
  conversationIds: Set<string>;
}

const lockKey = (subject: ReportSubject): string =>
  subject.kind === 'listing'
    ? `report:listing:${subject.listingId}`
    : `report:account:${subject.accountId}`;

const openWhere = (subject: ReportSubject): Prisma.ReportWhereInput =>
  subject.kind === 'listing'
    ? { status: 'open', listingId: subject.listingId }
    : { status: 'open', subjectKind: 'account', accountId: subject.accountId };

export function createReportRepository(prisma: PrismaClient): ReportRepository {
  return {
    withSubmitLock: ({ reporterId, subject }, write) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`report-by:${reporterId}`}, 0))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(subject)}, 0))`;
        return write(tx);
      }),

    findOpenIn: (tx, subject) =>
      tx.report.findFirst({ where: openWhere(subject), include: { entries: true } }),

    async lockOpenIn(tx, subject) {
      const rows =
        subject.kind === 'listing'
          ? await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM reports WHERE listing_id = ${subject.listingId}::uuid AND status = 'open' FOR UPDATE`
          : await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM reports WHERE account_id = ${subject.accountId}::uuid AND status = 'open'
                AND subject_kind = 'account' FOR UPDATE`;
      const [row] = rows;
      return row
        ? tx.report.findUnique({ where: { id: row.id }, include: { entries: true } })
        : null;
    },

    createReport: (tx, data) => tx.report.create({ data }),

    updateReport: (tx, id, data) => tx.report.update({ where: { id }, data }),

    addEntry: (tx, data) => tx.reportEntry.create({ data }),

    async entryTimesSince(tx, reporterId, since) {
      const rows = await tx.reportEntry.findMany({
        where: { reporterId, createdAt: { gt: since } },
        select: { createdAt: true },
      });
      return rows.map((row) => row.createdAt);
    },

    scoreOf: (accountId, tx) => (tx ?? prisma).reporterScore.findUnique({ where: { accountId } }),

    async adjustScore(tx, accountId, delta) {
      const row = await tx.reporterScore.upsert({
        where: { accountId },
        create: { accountId, score: delta },
        update: { score: { increment: delta } },
      });
      return row.score;
    },

    async suspend(tx, accountId, until) {
      await tx.reporterScore.update({ where: { accountId }, data: { suspendedUntil: until } });
    },

    async close(tx, { id, verdict, decisionId, at }) {
      const { count } = await tx.report.updateMany({
        where: { id, status: 'open' },
        data: { status: verdict, decisionId, decidedAt: at },
      });
      return count === 1
        ? tx.report.findUnique({ where: { id }, include: { entries: true } })
        : null;
    },

    async hidesListing(listingId) {
      const row = await prisma.report.findFirst({
        where: { listingId, status: 'open', autoHiddenAt: { not: null } },
        select: { id: true },
      });
      return row !== null;
    },

    async autoHideSpent(tx, listingId) {
      const latest = await tx.reviewDecision.findFirst({
        where: { listingId },
        orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
        select: { reportId: true, reportVerdict: true },
      });
      if (!latest?.reportId || latest.reportVerdict !== 'dismissed') return false;
      const report = await tx.report.findUnique({
        where: { id: latest.reportId },
        select: { autoHiddenAt: true },
      });
      return Boolean(report?.autoHiddenAt);
    },

    related: ({ listingId, accountId, limit }) =>
      prisma.report.findMany({
        where: { OR: [...(listingId ? [{ listingId }] : []), { accountId }] },
        include: { entries: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),

    async lowPriorityOpen({ listingIds, accountIds }) {
      const rows = await prisma.report.findMany({
        where: {
          status: 'open',
          lowPriority: true,
          OR: [
            { listingId: { in: listingIds } },
            { subjectKind: 'account', accountId: { in: accountIds } },
          ],
        },
        select: { subjectKind: true, listingId: true, accountId: true },
      });
      return {
        listingIds: new Set(rows.flatMap((row) => row.listingId ?? [])),
        accountIds: new Set(
          rows.filter((row) => row.subjectKind === 'account').map((row) => row.accountId),
        ),
      };
    },

    async holds({ listingIds, accountIds, conversationIds }, since) {
      const holds: ReportHolds = {
        listingIds: new Set(),
        subjectAccountIds: new Set(),
        posterIds: new Set(),
        conversationIds: new Set(),
      };
      const subjects: Prisma.ReportWhereInput[] = [
        ...(listingIds.length > 0 ? [{ listingId: { in: listingIds } }] : []),
        ...(accountIds.length > 0 ? [{ accountId: { in: accountIds } }] : []),
        ...(conversationIds.length > 0
          ? [{ entries: { some: { conversationId: { in: conversationIds } } } }]
          : []),
      ];
      if (subjects.length === 0) return holds;
      const rows = await prisma.report.findMany({
        where: {
          OR: [{ status: 'open' }, { decidedAt: { gt: since } }],
          AND: [{ OR: subjects }],
        },
        select: {
          subjectKind: true,
          listingId: true,
          accountId: true,
          entries: { where: { conversationId: { not: null } }, select: { conversationId: true } },
        },
      });
      for (const row of rows) {
        if (row.listingId) holds.listingIds.add(row.listingId);
        if (row.subjectKind === 'account') holds.subjectAccountIds.add(row.accountId);
        holds.posterIds.add(row.accountId);
        for (const entry of row.entries) {
          if (entry.conversationId) holds.conversationIds.add(entry.conversationId);
        }
      }
      return holds;
    },

    async myReports(reporterId, { skip, take }) {
      const where = { reporterId };
      const [items, total] = await Promise.all([
        prisma.reportEntry.findMany({
          where,
          include: { report: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        }),
        prisma.reportEntry.count({ where }),
      ]);
      return { items, total };
    },
  };
}
