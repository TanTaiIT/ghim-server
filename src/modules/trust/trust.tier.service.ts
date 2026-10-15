import type { ListingFault, ListingState, Prisma } from '@prisma/client';

import { sequentially } from '../../common/utils/sequential.js';
import { computeTier, factsHash, type TrustTier } from './calc/tier.calc.js';
import { DAY_MS, HOUR_MS, tierSettings, type TrustServiceDeps } from './trust.shared.js';

type Tx = Prisma.TransactionClient;

export interface ListingStateChange {
  listingId: string;
  ownerId: string;
  from: ListingState;
  to: ListingState;
  fault: ListingFault | null;
}

export interface TrustTierService {
  /** Mức đã lưu ở lần tính gần nhất; chưa tính bao giờ = T0. Không tính lại trong request đọc (design T5). */
  tierOf(accountId: string): Promise<TrustTier>;
  /** Số tin sạch đã tính ở lần tính mức gần nhất — người duyệt thấy lịch sử tin sạch của người bán (TK 17). */
  cleanCount(accountId: string): Promise<number>;
  /** Tính lại từ toàn bộ dữ kiện và bảng con số hiện hành; ghi khi kết quả đổi. */
  recompute(accountId: string): Promise<TrustTier>;
  /** Lối "đã bán", mất / có lại tư cách tin sạch (design mục 5) — tính lại ngay. */
  onListingStateChanged(change: ListingStateChange): Promise<void>;
  /** Cổng cho `add-reports`: báo cáo được xác nhận đúng làm tin thôi sạch, báo cáo bị huỷ trả lại. */
  voidByReport(listingId: string, accountId: string): Promise<void>;
  restoreAfterReport(listingId: string, accountId: string): Promise<void>;
  /** Lượt hằng ngày (design mục 7): ghi tin sạch theo lối hiện đủ ngày, rồi tính lại các tài khoản có thể đổi mức. */
  recomputeDaily(): Promise<{ newClean: number; recomputed: number }>;
  /** Tài khoản xoá: bỏ kết quả; dữ kiện tin sạch đi theo hạn lưu (`add-data-retention`). */
  onAccountDeleted(accountId: string): Promise<void>;
}

const PAGE = 500;
/** Lượt hằng ngày lỡ một ngày vẫn bắt kịp tin được thấy trong hai ngày qua (design mục 5). */
const CATCH_UP_MS = 48 * HOUR_MS;

export function createTrustTierService(deps: TrustServiceDeps): TrustTierService {
  const { repository, listings, identity, buyerInterest, config, clock } = deps;

  const recomputeIn = async (tx: Tx, accountId: string): Promise<TrustTier> => {
    const summaries = await identity.accountSummaries([accountId]);
    const current = await repository.findTier(accountId, tx);
    const clean = await repository.validClean(accountId, tx);
    const account = summaries.get(accountId);
    if (!account || account.status === 'deleted') return current?.tier ?? 'T0';
    const now = clock();
    const configVersion = config.version();
    const result = computeTier({
      accountCreatedAt: account.createdAt,
      cleanAt: clean.map((fact) => fact.cleanAt),
      now,
      settings: tierSettings(config),
    });
    const hash = factsHash({ accountCreatedAt: account.createdAt, clean, configVersion });
    if (
      current?.factsHash === hash &&
      current.tier === result.tier &&
      current.countedClean === result.countedClean
    ) {
      return current.tier;
    }
    await repository.writeTier(
      {
        accountId,
        expectHash: current?.factsHash ?? null,
        fromTier: current?.tier ?? 'T0',
        tier: result.tier,
        countedClean: result.countedClean,
        factsHash: hash,
        configVersion,
        at: now,
      },
      tx,
    );
    return result.tier;
  };

  /**
   * Dưới khoá theo tài khoản, đọc và ghi trong cùng transaction (T23): lượt tính chạy song song với một lượt gỡ vì vi phạm
   * không ghi đè mức bằng dữ kiện cũ. Dữ kiện tin sạch ghi ngoài khoá, nhưng mỗi lượt ghi kéo theo một lượt tính xếp sau
   * nó — lượt tính sau cùng luôn thấy dữ kiện mới nhất.
   */
  const recompute = (accountId: string): Promise<TrustTier> =>
    repository.withAccountLock(accountId, (tx) => recomputeIn(tx, accountId));

  const recomputePages = async (after: string | null, done: number): Promise<number> => {
    const ids = await repository.recomputeCandidates({
      configVersion: config.version(),
      after,
      take: PAGE,
    });
    await sequentially(ids, async (id) => {
      await recompute(id);
    });
    const last = ids.at(-1);
    return ids.length === PAGE && last
      ? recomputePages(last, done + ids.length)
      : done + ids.length;
  };

  return {
    async tierOf(accountId) {
      return (await repository.findTier(accountId))?.tier ?? 'T0';
    },

    async cleanCount(accountId) {
      return (await repository.findTier(accountId))?.countedClean ?? 0;
    },

    recompute: (accountId) => recompute(accountId),

    async onListingStateChanged({ listingId, ownerId, from, to, fault }) {
      const now = clock();
      if (to === 'sold') {
        const shown = await listings.shownMs(listingId, now);
        const longEnough =
          shown !== null && shown >= config.get('trust.soldCountsCleanAfterDays') * DAY_MS;
        if (!longEnough || !(await buyerInterest.hasInquiry(listingId))) return;
        if (await repository.addClean({ listingId, accountId: ownerId, via: 'sold', at: now })) {
          await recompute(ownerId);
        }
        return;
      }
      // Hai lối giữ như cũ, nhưng chỉ ghi khi trạng thái hiện tại của tin còn đúng chiều: lượt gỡ được xử lại sau khiếu
      // nại thắng không làm tin mất tư cách, lượt khôi phục xử lại khi tin lại bị gỡ không trả tư cách
      // (fix-audit-screening-trust).
      const removal = (to === 'removed' || to === 'rejected') && fault === 'violation';
      const restore = to === 'live' && (from === 'removed' || from === 'rejected');
      if (!removal && !restore) return;
      const current = await listings.stateOf(listingId);
      const violated =
        current !== null &&
        (current.state === 'removed' || current.state === 'rejected') &&
        current.fault === 'violation';
      // Chỉ vi phạm mới mất tư cách; gỡ vì sai sót không trừ gì (TK 20).
      if (removal && violated) {
        await repository.voidClean({ listingId, accountId: ownerId, cause: 'violation', at: now });
        await recompute(ownerId);
        return;
      }
      // Khôi phục, khiếu nại thắng: có lại tư cách với mốc cũ (câu 2).
      if (restore && current !== null && !violated) {
        await repository.unvoidClean(listingId, 'violation');
        await recompute(ownerId);
      }
    },

    async voidByReport(listingId, accountId) {
      await repository.voidClean({ listingId, accountId, cause: 'report', at: clock() });
      await recompute(accountId);
    },

    async restoreAfterReport(listingId, accountId) {
      await repository.unvoidClean(listingId, 'report');
      await recompute(accountId);
    },

    async recomputeDaily() {
      const now = clock();
      const candidates = await listings.shownCandidates({
        minShownMs: config.get('trust.cleanShownDays') * DAY_MS,
        since: new Date(now.getTime() - CATCH_UP_MS),
        now,
      });
      const known = await repository.knownListings(candidates.map((row) => row.listingId));
      const fresh = candidates.filter((row) => !known.has(row.listingId));
      // Mốc sạch = lúc lượt này phát hiện, không phải phút tin vượt mốc: dữ kiện đã ghi không đổi khi tính lại (mục 5).
      await sequentially(fresh, async (row) => {
        await repository.addClean({
          listingId: row.listingId,
          accountId: row.ownerId,
          via: 'shown',
          at: now,
        });
      });
      return { newClean: fresh.length, recomputed: await recomputePages(null, 0) };
    },

    onAccountDeleted: (accountId) => repository.deleteTier(accountId),
  };
}
