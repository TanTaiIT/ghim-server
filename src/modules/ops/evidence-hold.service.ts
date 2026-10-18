import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import type { ReviewService } from '../review/review.service.js';
import type { TrustService } from '../trust/trust.service.js';
import { before, DAY_MS, strikeHolds } from './calc/retention.calc.js';

export interface EvidenceHoldDeps {
  review: Pick<ReviewService, 'reportHolds'>;
  trust: Pick<TrustService, 'strikesOfListings'>;
  config: RuntimeConfig;
  clock: () => Date;
}

/**
 * Tạm giữ bằng chứng (spec ops/evidence-hold, design mục 4): dữ liệu dính tới báo cáo, gậy, khiếu nại đang mở hay đóng
 * chưa quá 30 ngày không bị xoá hẳn. `ops` chỉ hỏi dữ kiện của `review`, `trust` rồi tự tính; không cửa đọc nào đổi, nên
 * dữ liệu đã xoá không hiện lại.
 */
export interface EvidenceHold {
  /** Tin: báo cáo về tin, báo cáo về người đăng (giữ mọi tin của người đó), gậy của tin. */
  heldListings(rows: { id: string; ownerId: string }[]): Promise<Set<string>>;
  /** Hội thoại: gửi kèm báo cáo, báo cáo về tin của nó, về một trong hai bên, gậy của tin của nó. */
  /** Hội thoại với một đội không có tin hay người bán (add-team-conversations) — chỉ xét người dùng và chính hội thoại. */
  heldConversations(
    rows: { id: string; listingId: string | null; buyerId: string; sellerId: string | null }[],
  ): Promise<Set<string>>;
  /** Hồ sơ tài khoản đã xoá: báo cáo về người đó hay về tin của người đó. */
  heldAccounts(accountIds: string[]): Promise<Set<string>>;
}

const present = (ids: (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id !== null)),
];

export function createEvidenceHold(deps: EvidenceHoldDeps): EvidenceHold {
  const { review, trust, config, clock } = deps;
  const since = () => before(clock(), config.get('retention.evidenceHoldDays') * DAY_MS);

  const heldListingIds = async (listingIds: string[], at: Date): Promise<Set<string>> => {
    const facts = await trust.strikesOfListings(listingIds);
    return new Set(listingIds.filter((id) => facts.has(id) && strikeHolds(facts.get(id)!, at)));
  };

  return {
    async heldListings(rows) {
      if (rows.length === 0) return new Set();
      const at = since();
      const listingIds = rows.map((row) => row.id);
      const [reports, struck] = await Promise.all([
        review.reportHolds(
          {
            listingIds,
            accountIds: [...new Set(rows.map((row) => row.ownerId))],
            conversationIds: [],
          },
          at,
        ),
        heldListingIds(listingIds, at),
      ]);
      return new Set(
        rows
          .filter(
            (row) =>
              reports.listingIds.has(row.id) ||
              reports.subjectAccountIds.has(row.ownerId) ||
              struck.has(row.id),
          )
          .map((row) => row.id),
      );
    },

    async heldConversations(rows) {
      if (rows.length === 0) return new Set();
      const at = since();
      const listingIds = present(rows.map((row) => row.listingId));
      const [reports, struck] = await Promise.all([
        review.reportHolds(
          {
            listingIds,
            accountIds: present(rows.flatMap((row) => [row.buyerId, row.sellerId])),
            conversationIds: rows.map((row) => row.id),
          },
          at,
        ),
        heldListingIds(listingIds, at),
      ]);
      return new Set(
        rows
          .filter(
            (row) =>
              reports.conversationIds.has(row.id) ||
              (row.listingId !== null && reports.listingIds.has(row.listingId)) ||
              reports.subjectAccountIds.has(row.buyerId) ||
              (row.sellerId !== null && reports.subjectAccountIds.has(row.sellerId)) ||
              (row.listingId !== null && struck.has(row.listingId)),
          )
          .map((row) => row.id),
      );
    },

    async heldAccounts(accountIds) {
      if (accountIds.length === 0) return new Set();
      const reports = await review.reportHolds(
        { listingIds: [], accountIds, conversationIds: [] },
        since(),
      );
      return new Set(
        accountIds.filter((id) => reports.subjectAccountIds.has(id) || reports.posterIds.has(id)),
      );
    },
  };
}
