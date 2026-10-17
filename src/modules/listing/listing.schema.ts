import { z } from 'zod';

import { cursorQuerySchema } from '../../common/schemas/cursor.js';
import { priceSchema } from '../../common/schemas/money.js';

/** Tuple của các enum Prisma — đổi enum thì đổi luôn ở đây (CLAUDE.md luật 5). */
export const LISTING_STATES = [
  'draft',
  'checking',
  'pending',
  'live',
  'rejected',
  'sold',
  'expired',
  'removed',
] as const;
export const LISTING_PLACEMENTS = ['marketplace', 'group_public', 'members_only'] as const;
export const LISTING_HIDE_REASONS = [
  'account_locked',
  'account_deleted',
  'left_group',
  'removed_from_group',
  'group_banned',
  'group_locked',
  'category_disabled',
  'group_closed',
  'group_privatized',
  'detached_by_group',
  'reported',
] as const;
export const LISTING_RESTRICTIONS = ['machine', 'new_account', 'strike', 'strike_wave'] as const;

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;
/** Trần kỹ thuật chặn body khổng lồ; trần thật là `listing.maxImages` của bảng con số (`TOO_MANY_IMAGES`). */
const IMAGE_IDS_CEILING = 50;
/** Từ khoá tìm kiếm: đủ một câu ngắn, không đủ để biến LIKE thành một lượt quét nặng. */
const QUERY_MAX = 100;

/**
 * Mọi trường soạn được — đều tuỳ chọn, vì nháp lưu được khi chưa đủ (spec drafts). `imageIds` nhận chuỗi bất kỳ: đường
 * link ngoài kho phải tới service để nhận `IMAGE_NOT_IN_STORAGE` (spec media/image-storage), không dừng ở 400 vô danh.
 */
const listingFields = {
  title: z.string().trim().max(TITLE_MAX).nullable().optional(),
  description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
  price: priceSchema.nullable().optional(),
  negotiable: z.boolean().optional(),
  delivery: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  categoryId: z.uuid().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  provinceCode: z.number().int().positive().nullable().optional(),
  wardCode: z.number().int().positive().nullable().optional(),
  placement: z.enum(LISTING_PLACEMENTS).nullable().optional(),
  groupId: z.uuid().nullable().optional(),
  imageIds: z.array(z.string().min(1).max(2048)).max(IMAGE_IDS_CEILING).optional(),
  badgeGroupId: z.uuid().nullable().optional(),
};

export const createListingBodySchema = z.object(listingFields).strict();

/** Sửa luôn kèm phiên bản app đang có: hai thiết bị của một người không ghi đè nhau (design D5, 409 `CONFLICT`). */
const versionField = { version: z.number().int().positive() };

export const patchListingBodySchema = z.object({ ...versionField, ...listingFields }).strict();
export const submitListingBodySchema = z.object(versionField).strict();
/** Gia hạn nhận kèm sửa trong cùng một lượt qua máy (chốt 12/10/2026). */
export const renewListingBodySchema = patchListingBodySchema;
export const moveListingBodySchema = z
  .object({
    provinceCode: z.number().int().positive().optional(),
    wardCode: z.number().int().positive().optional(),
  })
  .strict();

export const listingParamsSchema = z.object({ id: z.uuid() });
export const groupListingParamsSchema = z.object({ groupId: z.uuid() });
export const userListingParamsSchema = z.object({ id: z.uuid() });
export const badgeParamsSchema = z.object({ groupId: z.uuid(), listingId: z.uuid() });

const keyword = z.string().trim().min(1).max(QUERY_MAX).optional();

/** Không `q` = bảng tin / danh mục (chỉ mức đầy đủ); có `q` = tìm kiếm (gồm tin hạn chế) — TK 15. */
export const feedQuerySchema = cursorQuerySchema.extend({
  q: keyword,
  categoryId: z.uuid().optional(),
  provinceCode: z.coerce.number().int().positive().optional(),
  wardCode: z.coerce.number().int().positive().optional(),
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().nonnegative().optional(),
});
export const groupFeedQuerySchema = cursorQuerySchema.extend({ q: keyword });
export const myListingsQuerySchema = cursorQuerySchema.extend({
  state: z.enum(LISTING_STATES).optional(),
});

const iso = z.iso.datetime();

export const listingImageSchema = z.object({
  id: z.uuid(),
  /** Đường xem có ký, có hạn (`media`) — không cache URL lâu hơn một giờ. */
  url: z.string(),
});

export const listingBadgeSchema = z.object({ groupId: z.uuid(), name: z.string() });

/** Tin như người khác thấy. Trạng thái chỉ có thể là đang hiển thị, đã bán, hết hạn — mọi trạng thái khác là 404. */
export const listingSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  state: z.enum(LISTING_STATES),
  placement: z.enum(LISTING_PLACEMENTS).nullable(),
  groupId: z.uuid().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  price: priceSchema.nullable(),
  negotiable: z.boolean(),
  delivery: z.boolean(),
  showPhone: z.boolean(),
  categoryId: z.uuid().nullable(),
  templateVersion: z.number().int().nullable(),
  attributes: z.record(z.string(), z.unknown()),
  provinceCode: z.number().int().nullable(),
  wardCode: z.number().int().nullable(),
  images: z.array(listingImageSchema),
  /** Huy hiệu nhóm — ẩn khi nhóm đang tạm khoá, mở khoá thì hiện lại (spec group/badges). */
  badge: listingBadgeSchema.nullable(),
  firstLiveAt: iso.nullable(),
  /** Hạn tin nổi bật — giữ chỗ cho gói đẩy tin (TK 29, 30), luôn null tới khi có gói. */
  featuredUntil: iso.nullable(),
  expiresAt: iso.nullable(),
  createdAt: iso,
  updatedAt: iso,
});

/** Tin như người đăng thấy: thêm phiên bản, lý do tạm ẩn, lý do hạn chế, đồng hồ — để biết tin đang ở đâu (TK 4 nguyên tắc 8). */
export const ownListingSchema = listingSchema.extend({
  version: z.number().int(),
  unitId: z.uuid().nullable(),
  badgeGroupId: z.uuid().nullable(),
  hideReasons: z.array(z.enum(LISTING_HIDE_REASONS)),
  restrictions: z.array(z.enum(LISTING_RESTRICTIONS)),
  /** Ngày hiển thị còn lại khi đồng hồ đang dừng (ms); đang chạy thì xem `expiresAt`. */
  remainingMs: z.number().int().nullable(),
  renewal: z.enum(['early', 'expired']).nullable(),
  fault: z.enum(['mistake', 'violation']).nullable(),
  /** Lý do mẫu người duyệt chọn khi từ chối / gỡ (spec review/decisions) — người đăng sửa theo đó rồi gửi lại. */
  faultReason: z.string().nullable(),
  /** Hạn chuyển lên sàn chung của tin đã rời nhóm hẳn. */
  moveUntil: iso.nullable(),
  /**
   * Câu của máy cho tin bị giữ hay hiện hạn chế (spec screening/explanations): `fraud` = câu chung ba phần kèm mã tra
   * cứu, không nêu tín hiệu; `fixes` = lỗi tự sửa được kèm cách sửa.
   */
  machineNotice: z
    .object({
      kind: z.enum(['plain', 'fraud', 'limited']),
      message: z.string(),
      estimatedWait: z.string().nullable(),
      lookupCode: z.string().nullable(),
      fixes: z.array(z.object({ code: z.string(), message: z.string() })),
    })
    .nullable(),
});

export type CreateListingBody = z.infer<typeof createListingBodySchema>;
export type PatchListingBody = z.infer<typeof patchListingBodySchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type ListingDto = z.infer<typeof listingSchema>;
export type OwnListingDto = z.infer<typeof ownListingSchema>;

/**
 * Mã máy của app (D2): tuỳ chọn ở đây để thiếu header ra đúng 400 ở bước 3 của thứ tự kiểm (design mục 5), sau 404 và
 * `INVALID_TRANSITION` — schema chặn sớm thì thứ tự lỗi đổi theo header.
 */
export const deviceHeadersSchema = z.object({
  'x-device-id': z.string().trim().max(200).optional(),
});
