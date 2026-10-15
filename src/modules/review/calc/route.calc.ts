import type { GroupReview, ListingPlacement } from '@prisma/client';

import type { Queue } from './task.calc.js';

/** Bậc đang giữ việc — chuỗi chuyển tiếp TK 16, đi từ trái sang phải khi bậc trước không còn ai xử được. */
export type RouteLevel =
  'unit_moderators' | 'group_moderators' | 'group_owner' | 'category_staff' | 'master';

export interface GroupReviewers {
  /** Nhóm đang cho điều hành (đang hoạt động, thiếu chủ, đang chuyển riêng tư) — không thì bỏ qua cả bậc nhóm. */
  moderationAllowed: boolean;
  ownerId: string | null;
  /** `unitId` null = điều hành cả nhóm. */
  moderators: readonly { accountId: string; unitId: string | null }[];
}

export interface RouteInput {
  queue: Queue;
  placement: ListingPlacement | null;
  groupId: string | null;
  unitId: string | null;
  /** Cài đặt danh mục "tin nhóm bị giữ do ai duyệt" — chỉ quyết việc hàng 0 (TK 11, 16). */
  groupReview: GroupReview;
  escalated: boolean;
  /** Người đăng, người chuyển lên, người đã cho đạt, và tài khoản dùng chung máy với họ — master không bao giờ ở đây. */
  excluded: ReadonlySet<string>;
  group: GroupReviewers | null;
  categoryStaff: readonly string[];
  masters: readonly string[];
}

export interface Route {
  level: RouteLevel;
  handlers: string[];
}

/**
 * Việc về tin nhóm đi theo chuỗi của nhóm khi: là mẫu hậu kiểm (hàng 5), hay là việc máy giữ (hàng 0) mà danh mục để
 * nhóm duyệt. Hàng 3, 4 và tin sàn luôn về staff danh mục (TK 16, spec review/queues).
 */
function groupScoped(input: RouteInput): boolean {
  if (!input.groupId || input.placement === 'marketplace') return false;
  return input.queue === 5 || (input.queue === 0 && input.groupReview === 'group');
}

/**
 * Bậc đầu tiên còn người không bị loại là bậc xử. Trong nhóm: điều hành đơn vị của tin → điều hành cả nhóm → chủ nhóm
 * → staff danh mục → master; điều hành cả nhóm và chủ nhóm chỉ thấy việc của đơn vị khi đơn vị không còn ai xử được
 * (chốt 15/10/2026). Việc đã quá hạn chuyển master thì chỉ master.
 */
export function routeOf(input: RouteInput): Route {
  const keep = (ids: readonly string[]) =>
    [...new Set(ids)].filter((id) => !input.excluded.has(id));
  const levels: [RouteLevel, string[]][] = [];

  if (!input.escalated && groupScoped(input) && input.group?.moderationAllowed) {
    const { moderators, ownerId } = input.group;
    if (input.unitId) {
      levels.push([
        'unit_moderators',
        keep(moderators.filter((m) => m.unitId === input.unitId).map((m) => m.accountId)),
      ]);
    }
    levels.push([
      'group_moderators',
      keep(moderators.filter((m) => m.unitId === null).map((m) => m.accountId)),
    ]);
    levels.push(['group_owner', keep(ownerId ? [ownerId] : [])]);
  }
  if (!input.escalated) levels.push(['category_staff', keep(input.categoryStaff)]);

  const found = levels.find(([, handlers]) => handlers.length > 0);
  return found
    ? { level: found[0], handlers: found[1] }
    : { level: 'master', handlers: [...new Set(input.masters)] };
}

/** Master thấy và xử được mọi việc (spec review/queues) — kể cả việc dùng chung máy với mình. */
export const canHandle = (route: Route, accountId: string, isMaster: boolean): boolean =>
  isMaster || route.handlers.includes(accountId);
