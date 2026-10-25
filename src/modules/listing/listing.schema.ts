import { z } from 'zod';

import { cursorQuerySchema, numericCursorSchema } from '../../common/schemas/cursor.js';
import { priceSchema } from '../../common/schemas/money.js';
import type { AttributeFilters, NumberRange } from './calc/attribute-filter.calc.js';

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
export const savedListingParamsSchema = z.object({ listingId: z.uuid() });

/**
 * Một lượt tìm trên sàn chung để được báo tin mới khớp (add-saved-searches): từ khoá bắt buộc cùng bộ lọc của bảng tin,
 * trừ `attrs` — khớp ngược theo mẫu đổi phiên bản là change sau.
 */
export const savedSearchBodySchema = z
  .object({
    q: z.string().trim().min(1).max(QUERY_MAX),
    categoryId: z.uuid().nullable().optional(),
    provinceCode: z.number().int().positive().nullable().optional(),
    wardCode: z.number().int().positive().nullable().optional(),
    priceMin: priceSchema.nullable().optional(),
    priceMax: priceSchema.nullable().optional(),
  })
  .refine((body) => body.wardCode == null || body.provinceCode != null, {
    message: 'Chọn tỉnh / thành trước khi chọn phường / xã',
    path: ['wardCode'],
  })
  .refine(
    (body) => body.priceMin == null || body.priceMax == null || body.priceMin <= body.priceMax,
    { message: 'Giá từ không được lớn hơn giá đến', path: ['priceMax'] },
  );
export const savedSearchParamsSchema = z.object({ id: z.uuid() });
export const badgeParamsSchema = z.object({ groupId: z.uuid(), listingId: z.uuid() });

const keyword = z.string().trim().min(1).max(QUERY_MAX).optional();

/** Không `q` = bảng tin / danh mục (chỉ mức đầy đủ); có `q` = tìm kiếm (gồm tin hạn chế) — TK 15. */
/** Một mục chọn lọc theo tối đa ngần này giá trị — đủ cho "vài hãng", chặn chuỗi OR dài vô cớ. */
export const ATTRIBUTE_FILTER_VALUES_MAX = 20;

const choiceFilterSchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(ATTRIBUTE_FILTER_VALUES_MAX);
const rangeFilterSchema: z.ZodType<NumberRange> = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .refine((range) => range.min !== undefined || range.max !== undefined, {
    message: 'Khoảng số cần ít nhất một đầu',
  })
  .refine((range) => range.min === undefined || range.max === undefined || range.min <= range.max, {
    message: 'Đầu dưới của khoảng số không được lớn hơn đầu trên',
  });
/** Tên mục → mảng giá trị (mục chọn) hay khoảng số; đúng mẫu hay không là việc của service. */
export const attributeFiltersSchema: z.ZodType<AttributeFilters> = z.record(
  z.string().min(1),
  z.union([choiceFilterSchema, rangeFilterSchema]),
);
/**
 * `attrs` là JSON trong MỘT tham số (design add-listing-filters mục 1): tên tham số đổi theo danh mục nên không khai
 * được từng mục trong Swagger. JSON hỏng hay sai hình dạng → 400 `VALIDATION_ERROR` ngay ở tầng HTTP.
 */
const attrsQuerySchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Bộ lọc theo mẫu phải là JSON' });
      return z.NEVER;
    }
  })
  .pipe(attributeFiltersSchema);

/** Cách xếp của bảng tin, danh mục, tìm kiếm (add-feed-sort): mới nhất là vị trí trên bảng tin; theo giá thì hoà giá xếp theo mã. */
export const FEED_SORTS = ['newest', 'price_asc', 'price_desc'] as const;

export const feedQuerySchema = cursorQuerySchema.extend({
  cursor: numericCursorSchema.optional(),
  sort: z.enum(FEED_SORTS).default('newest'),
  q: keyword,
  categoryId: z.uuid().optional(),
  provinceCode: z.coerce.number().int().positive().optional(),
  wardCode: z.coerce.number().int().positive().optional(),
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().nonnegative().optional(),
  attrs: attrsQuerySchema.optional(),
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

export const savedSearchSchema = z.object({
  id: z.uuid(),
  q: z.string(),
  categoryId: z.uuid().nullable(),
  provinceCode: z.number().int().nullable(),
  wardCode: z.number().int().nullable(),
  priceMin: priceSchema.nullable(),
  priceMax: priceSchema.nullable(),
  createdAt: iso,
});

export type CreateListingBody = z.infer<typeof createListingBodySchema>;
export type PatchListingBody = z.infer<typeof patchListingBodySchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type ListingDto = z.infer<typeof listingSchema>;
export type OwnListingDto = z.infer<typeof ownListingSchema>;
export type SavedSearchBody = z.infer<typeof savedSearchBodySchema>;
export type SavedSearchDto = z.infer<typeof savedSearchSchema>;
