export interface PriceRange {
  low: bigint;
  high: bigint;
  samples: number;
}

/** Phân vị theo hạng gần nhất trên dãy đã xếp. */
const percentile = (sorted: readonly bigint[], p: number): bigint =>
  sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0n;

/**
 * Khoảng thường thấy [P10 ÷ 2, P90 × 2] trên giá khác 0 (câu 7) — lượt đêm `screening.price-stats` tính cho từng danh
 * mục. Giá 0 là cho tặng, không phải mẫu giá.
 */
export function priceRange(prices: readonly bigint[], percent: number, factor: number): PriceRange {
  const sorted = prices
    .filter((price) => price > 0n)
    .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    low: percentile(sorted, percent) / BigInt(factor),
    high: percentile(sorted, 100 - percent) * BigInt(factor),
    samples: sorted.length,
  };
}
