import type { ListingPlacement, Prisma } from '@prisma/client';

export interface EditableFields {
  title: string | null;
  description: string | null;
  price: bigint | null;
  categoryId: string | null;
  attributes: Prisma.JsonValue;
  imageIds: readonly string[];
  provinceCode: number | null;
  wardCode: number | null;
  placement: ListingPlacement | null;
  groupId: string | null;
  badgeGroupId: string | null;
  negotiable: boolean;
  delivery: boolean;
  showPhone: boolean;
}

export type EditPlacementChange = 'widen' | 'narrow' | 'regroup';

export type EditOutcome =
  | {
      ok: true;
      /** Có qua máy lại không: tin chuyển sang đang kiểm theo mũi tên "sửa". */
      machine: boolean;
      placement: EditPlacementChange | null;
      badge: 'attach' | 'detach' | null;
    }
  | { ok: false; code: 'LISTING_DETACHED' | 'PLACEMENT_LOCKED' };

const LEVEL: Record<ListingPlacement, number> = {
  members_only: 0,
  group_public: 1,
  marketplace: 2,
};

/** JSON so theo giá trị: app gửi lại cùng mục theo thứ tự khác không phải là sửa. */
function sameJson(a: Prisma.JsonValue, b: Prisma.JsonValue): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameJson(item, b[i] ?? null))
    );
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && sameJson(a[key] ?? null, b[key] ?? null))
  );
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, i) => item === b[i]);

function placementChange(
  before: EditableFields,
  after: EditableFields,
): EditPlacementChange | null {
  if (before.placement === after.placement && before.groupId === after.groupId) return null;
  if (!before.placement || !after.placement) return 'regroup';
  const inGroups = before.placement !== 'marketplace' && after.placement !== 'marketplace';
  if (inGroups && before.groupId !== after.groupId) return 'regroup';
  return LEVEL[after.placement] > LEVEL[before.placement] ? 'widen' : 'narrow';
}

/**
 * Phân loại một lần sửa bằng cách so GIÁ TRỊ trước và sau (spec editing), không theo ô app có gửi hay không. Sửa gì
 * người mua đọc hay lọc theo thì qua máy; làm tin ít người thấy hơn thì không — trừ khi thu hẹp vào nhóm mình
 * không là thành viên, vì đó là gửi theo luật người ngoài. Tin đã rời nhóm hẳn không sửa được (D3): chỉ chuyển lên
 * sàn chung thành tin mới hoặc xoá, để mỗi món đồ chỉ lên sàn chung một lần.
 */
export function classifyEdit(
  before: EditableFields,
  after: EditableFields,
  context: {
    /** Tin mang lý do "rời nhóm hẳn": nhóm đóng, sang riêng tư, bị gỡ khỏi nhóm. */
    detached: boolean;
    /** Đang chờ duyệt, bị báo cáo hay đang hậu kiểm (cam kết 19). */
    placementLocked: boolean;
    /** Người đăng là thành viên của nhóm đích (`after.groupId`). */
    memberOfTarget: boolean;
  },
): EditOutcome {
  if (context.detached) return { ok: false, code: 'LISTING_DETACHED' };
  const placement = placementChange(before, after);
  if (placement && context.placementLocked) return { ok: false, code: 'PLACEMENT_LOCKED' };

  const badge =
    after.badgeGroupId && after.badgeGroupId !== before.badgeGroupId
      ? 'attach'
      : before.badgeGroupId && !after.badgeGroupId
        ? 'detach'
        : null;
  const contentChanged =
    before.title !== after.title ||
    before.description !== after.description ||
    before.price !== after.price ||
    before.categoryId !== after.categoryId ||
    !sameJson(before.attributes, after.attributes) ||
    !sameList(before.imageIds, after.imageIds) ||
    before.provinceCode !== after.provinceCode ||
    before.wardCode !== after.wardCode;
  const narrowsIntoOwnGroup = placement === 'narrow' && context.memberOfTarget;

  return {
    ok: true,
    machine: contentChanged || badge === 'attach' || (placement !== null && !narrowsIntoOwnGroup),
    placement,
    badge,
  };
}
