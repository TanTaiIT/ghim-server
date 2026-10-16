import type {
  Prisma,
  PrismaClient,
  TrustCleanVia,
  TrustTier,
  TrustTierResult,
  TrustVoidCause,
} from '@prisma/client';

import { appendEvents } from '../../common/outbox/outbox.js';
import { TRUST_EVENTS, trustEvent } from './trust.outbox.js';

type Tx = Prisma.TransactionClient;

export interface CleanFact {
  listingId: string;
  cleanAt: Date;
}

export interface TierWrite {
  accountId: string;
  /** Dấu của dòng đang có lúc đọc (`null` = chưa có dòng): ghi có điều kiện, lượt thua tính lại trên dữ kiện mới. */
  expectHash: string | null;
  fromTier: TrustTier;
  tier: TrustTier;
  countedClean: number;
  factsHash: string;
  configVersion: number;
  at: Date;
}

export interface TrustRepository {
  /**
   * Transaction mở bằng khoá advisory theo tài khoản: các lượt tính mức của một người chạy lần lượt, lượt sau đọc dữ kiện
   * mới nhất (fix-audit-screening-trust, T23). Khác khoá `trust-submit:` của hạn mức.
   */
  withAccountLock<T>(accountId: string, work: (tx: Tx) => Promise<T>): Promise<T>;
  findTier(accountId: string, tx?: Tx): Promise<TrustTierResult | null>;
  /** Tin sạch đang được tính: có mốc, không bị void. */
  validClean(accountId: string, tx?: Tx): Promise<CleanFact[]>;
  /**
   * Ghi "tin X thành sạch lúc D" một lần cho mỗi tin (PK): đã có mốc thì không đổi; dòng chỉ mang dấu void thì điền mốc
   * (design mục 13). `true` = lượt này ghi được mốc.
   */
  addClean(input: {
    listingId: string;
    accountId: string;
    via: TrustCleanVia;
    at: Date;
  }): Promise<boolean>;
  /** Đặt dấu void — thêm dòng không mốc nếu tin chưa sạch, để lượt phát hiện về sau thấy tin đang bị void. */
  voidClean(input: {
    listingId: string;
    accountId: string;
    cause: TrustVoidCause;
    at: Date;
  }): Promise<void>;
  /** Gỡ dấu void đúng lý do (khôi phục, khiếu nại thắng, báo cáo bị huỷ); dòng chỉ mang dấu void thì xoá hẳn. */
  unvoidClean(listingId: string, cause: TrustVoidCause): Promise<void>;
  /** Tin đã có dòng (sạch hay đang bị void) — lượt hằng ngày bỏ qua. */
  knownListings(listingIds: string[]): Promise<Set<string>>;
  /** `'stale'` = dòng đã đổi từ lúc đọc; mức đổi thì ghi lịch sử và phát `trust.tier.changed` cùng transaction. */
  writeTier(input: TierWrite, tx?: Tx): Promise<'written' | 'stale'>;
  /**
   * Tài khoản lượt hằng ngày tính lại (design mục 7): có tin sạch hay đã có kết quả, trừ tài khoản đã ở T3 theo bảng
   * con số hiện hành — tuổi chạm mốc, tin dời tới lượt, bảng con số mới đều nằm trong tập này. Theo trang mã tài khoản.
   */
  recomputeCandidates(input: {
    configVersion: number;
    after: string | null;
    take: number;
  }): Promise<string[]>;
  deleteTier(accountId: string): Promise<void>;
}

const FIRST_UUID = '00000000-0000-0000-0000-000000000000';

/** Mức đổi thật thì ghi lịch sử và phát sự kiện, cùng transaction với kết quả (TK 27 cam kết 11, 33). */
async function recordChange(tx: Tx, input: TierWrite): Promise<void> {
  if (input.fromTier === input.tier) return;
  await tx.trustTierChange.create({
    data: {
      accountId: input.accountId,
      fromTier: input.fromTier,
      toTier: input.tier,
      factsHash: input.factsHash,
      configVersion: input.configVersion,
      at: input.at,
    },
  });
  await appendEvents(tx, [
    trustEvent(TRUST_EVENTS.tierChanged, {
      accountId: input.accountId,
      from: input.fromTier,
      to: input.tier,
      configVersion: input.configVersion,
    }),
  ]);
}

export function createTrustRepository(prisma: PrismaClient): TrustRepository {
  return {
    withAccountLock: (accountId, work) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`trust-tier:${accountId}`}, 0))`;
        return work(tx);
      }),
    findTier: (accountId, tx) =>
      (tx ?? prisma).trustTierResult.findUnique({ where: { accountId } }),
    async validClean(accountId, tx) {
      const rows = await (tx ?? prisma).trustCleanListing.findMany({
        where: { accountId, cleanAt: { not: null }, voidedAt: null },
        select: { listingId: true, cleanAt: true },
      });
      return rows.flatMap((row) =>
        row.cleanAt ? [{ listingId: row.listingId, cleanAt: row.cleanAt }] : [],
      );
    },

    async addClean({ listingId, accountId, via, at }) {
      const written = await prisma.$executeRaw`
        INSERT INTO trust_clean_listings (listing_id, account_id, via, clean_at)
        VALUES (${listingId}::uuid, ${accountId}::uuid, ${via}::trust_clean_via, ${at})
        ON CONFLICT (listing_id) DO UPDATE SET via = EXCLUDED.via, clean_at = EXCLUDED.clean_at
        WHERE trust_clean_listings.clean_at IS NULL`;
      return written > 0;
    },

    async voidClean({ listingId, accountId, cause, at }) {
      await prisma.$executeRaw`
        INSERT INTO trust_clean_listings (listing_id, account_id, voided_at, void_cause)
        VALUES (${listingId}::uuid, ${accountId}::uuid, ${at}, ${cause}::trust_void_cause)
        ON CONFLICT (listing_id) DO UPDATE SET voided_at = EXCLUDED.voided_at, void_cause = EXCLUDED.void_cause`;
    },

    unvoidClean: (listingId, cause) =>
      prisma.$transaction(async (tx) => {
        await tx.trustCleanListing.deleteMany({
          where: { listingId, voidCause: cause, cleanAt: null },
        });
        await tx.trustCleanListing.updateMany({
          where: { listingId, voidCause: cause },
          data: { voidedAt: null, voidCause: null },
        });
      }),

    async knownListings(listingIds) {
      if (listingIds.length === 0) return new Set();
      const rows = await prisma.trustCleanListing.findMany({
        where: { listingId: { in: listingIds } },
        select: { listingId: true },
      });
      return new Set(rows.map((row) => row.listingId));
    },

    writeTier: (input, outer) => {
      const write = async (tx: Tx): Promise<'written' | 'stale'> => {
        const data = {
          tier: input.tier,
          countedClean: input.countedClean,
          factsHash: input.factsHash,
          configVersion: input.configVersion,
          computedAt: input.at,
        };
        if (input.expectHash === null) {
          const inserted = await tx.trustTierResult.createMany({
            data: [{ accountId: input.accountId, ...data }],
            skipDuplicates: true,
          });
          if (inserted.count === 0) return 'stale';
        } else {
          const updated = await tx.trustTierResult.updateMany({
            where: { accountId: input.accountId, factsHash: input.expectHash },
            data,
          });
          if (updated.count === 0) return 'stale';
        }
        await recordChange(tx, input);
        return 'written';
      };
      return outer ? write(outer) : prisma.$transaction(write);
    },

    async recomputeCandidates({ configVersion, after, take }) {
      const rows = await prisma.$queryRaw<{ accountId: string }[]>`
        SELECT DISTINCT candidates.account_id::text AS "accountId"
        FROM (
          SELECT account_id FROM trust_clean_listings WHERE clean_at IS NOT NULL AND voided_at IS NULL
          UNION
          SELECT account_id FROM trust_tiers
        ) AS candidates
        LEFT JOIN trust_tiers AS t ON t.account_id = candidates.account_id
        WHERE (t.account_id IS NULL OR t.tier <> 'T3' OR t.config_version <> ${configVersion})
          AND candidates.account_id > ${after ?? FIRST_UUID}::uuid
        ORDER BY "accountId"
        LIMIT ${take}`;
      return rows.map((row) => row.accountId);
    },

    async deleteTier(accountId) {
      await prisma.trustTierResult.deleteMany({ where: { accountId } });
    },
  };
}
