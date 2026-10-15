import type { ListingFault, ListingState } from '@prisma/client';

/** Bên đi một mũi tên. Mỗi mũi tên của TK 18 thuộc đúng một bên — bên khác đi là không có mũi tên đó. */
export type ListingSide = 'owner' | 'machine' | 'system' | 'reviewer' | 'appeal';

interface Arrow {
  side: ListingSide;
  from: readonly ListingState[];
  to: ListingState;
}

/**
 * Sơ đồ vòng đời TK 18 — nguồn duy nhất của mọi lần đổi trạng thái tin (CLAUDE.md luật 13). Ngoài bảng này
 * không có cách nào đổi trạng thái; tạm ẩn và lý do hạn chế là cột riêng, không đi qua đây.
 */
const ARROWS = {
  submit: { side: 'owner', from: ['draft'], to: 'checking' },
  withdraw: { side: 'owner', from: ['pending'], to: 'draft' },
  /** Bị từ chối / bị gỡ chỉ sửa được khi lỗi là sai sót — xem `transition`. */
  edit: { side: 'owner', from: ['pending', 'live', 'rejected', 'removed'], to: 'checking' },
  renew: { side: 'owner', from: ['expired'], to: 'checking' },
  /** Cửa sổ 7 ngày cuối là luật của ngày hiển thị (`display-period.calc.ts`), không phải của sơ đồ. */
  renewEarly: { side: 'owner', from: ['live'], to: 'checking' },
  markSold: { side: 'owner', from: ['live', 'expired'], to: 'sold' },
  pass: { side: 'machine', from: ['checking'], to: 'live' },
  hold: { side: 'machine', from: ['checking'], to: 'pending' },
  /** Cụm từ cấm mới bật thật: máy rút tin đang hiện về chờ người, không từ chối (cam kết 16). */
  recall: { side: 'machine', from: ['live'], to: 'pending' },
  expire: { side: 'system', from: ['live'], to: 'expired' },
  approve: { side: 'reviewer', from: ['pending'], to: 'live' },
  reject: { side: 'reviewer', from: ['pending'], to: 'rejected' },
  remove: { side: 'reviewer', from: ['live'], to: 'removed' },
  restore: { side: 'reviewer', from: ['removed'], to: 'live' },
  appealWin: { side: 'appeal', from: ['rejected', 'removed'], to: 'live' },
} as const satisfies Record<string, Arrow>;

export type ListingArrow = keyof typeof ARROWS;

export const LISTING_ARROWS = Object.keys(ARROWS) as ListingArrow[];

const AFTER_DECISION: ReadonlySet<ListingState> = new Set(['rejected', 'removed']);

/**
 * Trạng thái sau khi `side` đi `arrow` từ `state`; `null` = không có mũi tên đó (HTTP 409 `INVALID_TRANSITION`).
 * Sửa tin bị từ chối / bị gỡ cần lỗi là sai sót: tin vi phạm không sửa để gửi lại được (TK 17, `add-strikes`).
 */
export function transition(
  state: ListingState,
  arrow: ListingArrow,
  side: ListingSide,
  fault: ListingFault | null = null,
): ListingState | null {
  const rule: Arrow = ARROWS[arrow];
  if (rule.side !== side || !rule.from.includes(state)) return null;
  if (arrow === 'edit' && AFTER_DECISION.has(state) && fault !== 'mistake') return null;
  return rule.to;
}
