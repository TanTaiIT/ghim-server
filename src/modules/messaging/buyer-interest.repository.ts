import type { PrismaClient } from '@prisma/client';

/**
 * Truy vấn "người mua quan tâm" trên hội thoại về tin — tách khỏi `messaging.repository.ts` (đã chạm trần 500 dòng) vì
 * đều là dữ kiện module khác hỏi qua cổng: tin sạch (`trust`, TK 20) và gợi ý trang chủ (`listing`, add-home-suggestions).
 * Chỉ tính hội thoại người mua đã nhắn ít nhất một tin — mở hội thoại rồi bỏ đó không phải là hỏi mua.
 */
export interface BuyerInterestQueries {
  /** Người bán và những người mua đã nhắn ít nhất một tin trong hội thoại về tin này — dữ kiện tin sạch (TK 20). */
  inquiries(listingId: string): Promise<{ sellerId: string; buyerIds: string[] } | null>;
  /** Mã các tin người này đã hỏi mua, mới hỏi trước, tối đa `limit`. */
  askedListingIds(buyerId: string, limit: number): Promise<string[]>;
  /** Số người đã hỏi mua mỗi tin trong `listingIds` từ `since`; tin không ai hỏi thì vắng. */
  inquiryCounts(listingIds: string[], since: Date): Promise<Map<string, number>>;
}

export function createBuyerInterestQueries(prisma: PrismaClient): BuyerInterestQueries {
  return {
    async inquiries(listingId) {
      const rows = await prisma.conversation.findMany({
        where: { listingId, buyerMessages: { gt: 0 } },
        select: { sellerId: true, buyerId: true },
      });
      // Chỉ hội thoại về tin có `listing_id`, nên người bán luôn có (CHECK conversations_kind_check).
      const sellerId = rows.find((row) => row.sellerId !== null)?.sellerId;
      return sellerId ? { sellerId, buyerIds: rows.map((row) => row.buyerId) } : null;
    },

    async askedListingIds(buyerId, limit) {
      const rows = await prisma.conversation.findMany({
        where: { buyerId, kind: 'listing', listingId: { not: null }, buyerMessages: { gt: 0 } },
        orderBy: { lastActivityAt: 'desc' },
        select: { listingId: true },
        take: limit,
      });
      return rows.flatMap((row) => (row.listingId ? [row.listingId] : []));
    },

    async inquiryCounts(listingIds, since) {
      if (listingIds.length === 0) return new Map();
      const rows = await prisma.$queryRaw<{ listing_id: string; buyers: number }[]>`
        SELECT listing_id::text, count(*)::int AS buyers FROM conversations
        WHERE listing_id = ANY(${listingIds}::uuid[]) AND buyer_messages > 0 AND created_at >= ${since}
        GROUP BY listing_id`;
      return new Map(rows.map((row) => [row.listing_id, row.buyers]));
    },
  };
}
