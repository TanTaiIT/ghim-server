import { z } from 'zod';

import { priceSchema } from '../../common/schemas/money.js';
import {
  duplicateFieldNames,
  isChoiceType,
  TEMPLATE_FIELD_TYPES,
  type TemplateField,
} from './template.calc.js';

/** Tuple của các enum trong schema.prisma (CLAUDE.md luật 5). */
export const CATEGORY_STATUSES = ['active', 'disabled'] as const;
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export const GROUP_REVIEWS = ['group', 'platform'] as const;

export const CATEGORY_NAME_MAX = 60;
export const TEMPLATE_FIELDS_MAX = 40;
export const TEMPLATE_OPTIONS_MAX = 100;
export const TEMPLATE_LABEL_MAX = 80;
export const REGION_QUERY_MAX = 60;
export const REGION_SEARCH_LIMIT = 50;

export const categoryIdParamsSchema = z.object({ id: z.uuid() });
export const settingsVersionParamsSchema = categoryIdParamsSchema.extend({
  version: z.coerce.number().int().positive(),
});
export const templateVersionParamsSchema = settingsVersionParamsSchema;

export const categoryNameSchema = z.string().trim().min(1).max(CATEGORY_NAME_MAX);

const settingsShape = {
  priceCap: priceSchema.nullable(),
  referencePrice: priceSchema.nullable(),
  riskLevel: z.enum(RISK_LEVELS),
  alwaysManual: z.boolean(),
  groupReview: z.enum(GROUP_REVIEWS),
};

const referenceWithinCap = (value: {
  priceCap: bigint | null;
  referencePrice: bigint | null;
}): boolean =>
  value.priceCap === null ||
  value.referencePrice === null ||
  value.referencePrice <= value.priceCap;

const REFERENCE_ABOVE_CAP = {
  message: 'Giá tham chiếu không được vượt trần giá',
  path: ['referencePrice'],
};

/** PUT cài đặt gửi TRỌN bộ (design 1): thiếu một mục là 400, không có "giữ nguyên phần còn lại". */
export const categorySettingsBodySchema = z
  .object(settingsShape)
  .refine(referenceWithinCap, REFERENCE_ABOVE_CAP);

/** Tạo danh mục: mục nào không gửi thì lấy mặc định — không trần, rủi ro thấp, không luôn duyệt tay, nhóm duyệt. */
export const createCategoryBodySchema = z
  .object({
    name: categoryNameSchema,
    priceCap: priceSchema.nullable().default(null),
    referencePrice: priceSchema.nullable().default(null),
    riskLevel: z.enum(RISK_LEVELS).default('low'),
    alwaysManual: z.boolean().default(false),
    groupReview: z.enum(GROUP_REVIEWS).default('group'),
  })
  .refine(referenceWithinCap, REFERENCE_ABOVE_CAP);

export const renameCategoryBodySchema = z.object({ name: categoryNameSchema });

/** Những gì khách thấy — cố ý không có trường cài đặt nào (nguyên tắc 8, design 2). */
export const publicCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  templateVersion: z.number().int().nullable(),
});

export const categorySettingsSchema = z.object({
  version: z.number().int(),
  ...settingsShape,
  changedBy: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const categoryAdminSchema = publicCategorySchema.extend({
  status: z.enum(CATEGORY_STATUSES),
  settings: categorySettingsSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// ── MẪU THÔNG TIN ───────────────────────────────────────────────────────────────────────────────

export const templateFieldSchema: z.ZodType<TemplateField> = z
  .object({
    name: z.string().regex(/^[a-z0-9_]{1,40}$/, 'Tên mục gồm chữ thường, số, gạch dưới, tối đa 40'),
    label: z.string().trim().min(1).max(TEMPLATE_LABEL_MAX),
    type: z.enum(TEMPLATE_FIELD_TYPES),
    required: z.boolean(),
    options: z
      .array(z.string().trim().min(1).max(TEMPLATE_LABEL_MAX))
      .max(TEMPLATE_OPTIONS_MAX)
      .optional(),
  })
  .superRefine((field, ctx) => {
    if (isChoiceType(field.type) && (field.options?.length ?? 0) === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Mục chọn cần ít nhất một lựa chọn',
      });
    }
    if (!isChoiceType(field.type) && field.options !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Mục chữ / số không có lựa chọn',
      });
    }
  });

export const templateFieldsSchema = z
  .array(templateFieldSchema)
  .max(TEMPLATE_FIELDS_MAX)
  .superRefine((fields, ctx) => {
    for (const name of duplicateFieldNames(fields)) {
      ctx.addIssue({ code: 'custom', message: `Mục "${name}" xuất hiện hai lần trong mẫu` });
    }
  });

/**
 * `version` không phải trường của nháp: body nhắm vào một phiên bản đã phát hành là 409
 * `TEMPLATE_PUBLISHED` (spec), nên schema nhận nó để service trả đúng mã thay vì 400 vô danh.
 */
export const saveDraftBodySchema = z.object({
  /** Số nháp client đang sửa; 0 = chưa có nháp. Lệch là 409 `CONFLICT` (khoá lạc quan). */
  baseDraftVersion: z.number().int().nonnegative(),
  fields: templateFieldsSchema,
  version: z.number().int().optional(),
});

export const templateDraftSchema = z.object({
  categoryId: z.uuid(),
  /** 0 = chưa có nháp, `fields` khi đó là mẫu hiện hành để bắt đầu sửa. */
  draftVersion: z.number().int(),
  fields: z.array(templateFieldSchema),
  updatedBy: z.uuid().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});

export const templateSchema = z.object({
  categoryId: z.uuid(),
  /** null = danh mục chưa phát hành mẫu nào; `fields` rỗng. */
  version: z.number().int().nullable(),
  fields: z.array(templateFieldSchema),
  publishedAt: z.iso.datetime().nullable(),
});

// ── KHU VỰC ─────────────────────────────────────────────────────────────────────────────────────

export const provinceCodeParamsSchema = z.object({ code: z.coerce.number().int().positive() });

export const regionSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(REGION_QUERY_MAX),
});

export const provinceSchema = z.object({
  code: z.number().int(),
  name: z.string(),
  fullName: z.string(),
  formerNames: z.array(z.string()),
  aliases: z.array(z.string()),
});

export const wardSchema = z.object({
  code: z.number().int(),
  provinceCode: z.number().int(),
  name: z.string(),
  formerNames: z.array(z.string()),
});

export const regionHitSchema = z.object({
  kind: z.enum(['province', 'ward']),
  code: z.number().int(),
  name: z.string(),
  provinceCode: z.number().int(),
  provinceName: z.string(),
  formerNames: z.array(z.string()),
});
