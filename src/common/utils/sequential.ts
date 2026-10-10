/**
 * Chạy `fn` lần lượt trên từng phần tử, cái sau chờ cái trước — cho những chỗ thứ tự là một phần
 * của hợp đồng (phát sự kiện outbox theo `created_at`, chạy việc đã xếp). `Promise.all` ở đó là
 * sai, và `for … await` thì lint cấm để người đọc không nhầm chỗ cố ý với chỗ quên.
 */
export function sequentially<T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>,
): Promise<void> {
  return items.reduce((chain, item) => chain.then(() => fn(item)), Promise.resolve());
}
