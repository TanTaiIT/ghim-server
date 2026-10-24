import type { Prisma } from '@prisma/client';

import type { TemplateField } from '../../category/calc/template.calc.js';

/*
 * Lọc tin theo mẫu thông tin của danh mục (TK 11, change add-listing-filters): kiểm bộ lọc theo mẫu hiện hành rồi
 * dựng điều kiện Prisma trên `listings.attributes` (jsonb). Tin không có mục đang lọc thì `path` trả rỗng, không khớp
 * điều kiện nào — tự loại (proposal, câu chốt 3). Tên mục không đổi và không dùng lại cho kiểu khác sau khi phát hành
 * (`lockedFieldIssue`), nên lọc theo tên là an toàn qua mọi phiên bản mẫu.
 */

/** Khoảng số: ít nhất một đầu, `min ≤ max` — schema đã kiểm, calc tin vào hình dạng. */
export interface NumberRange {
  min?: number | undefined;
  max?: number | undefined;
}
export type AttributeFilter = string[] | NumberRange;
export type AttributeFilters = Record<string, AttributeFilter>;

export interface AttributeFilterIssue {
  field: string;
  message: string;
}

const isRange = (filter: AttributeFilter): filter is NumberRange => !Array.isArray(filter);

/** Lỗi đầu tiên theo thứ tự mục gửi lên; `null` khi bộ lọc khớp mẫu. */
export function attributeFilterIssue(
  fields: TemplateField[],
  filters: AttributeFilters,
): AttributeFilterIssue | null {
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const [name, filter] of Object.entries(filters)) {
    const field = byName.get(name);
    if (!field) {
      return { field: name, message: `Mục "${name}" không có trong mẫu thông tin của danh mục` };
    }
    switch (field.type) {
      case 'text':
        return { field: name, message: `Mục "${field.label}" là mục chữ, không lọc được` };
      case 'number':
        if (!isRange(filter)) {
          return {
            field: name,
            message: `Mục "${field.label}" là mục số, lọc theo khoảng từ – tới`,
          };
        }
        break;
      case 'single_choice':
      case 'multi_choice': {
        if (isRange(filter)) {
          return { field: name, message: `Mục "${field.label}" là mục chọn, lọc theo lựa chọn` };
        }
        const options = field.options ?? [];
        const stray = filter.find((value) => !options.includes(value));
        if (stray !== undefined) {
          return { field: name, message: `Mục "${field.label}" không có lựa chọn "${stray}"` };
        }
      }
    }
  }
  return null;
}

const equalsAny = (name: string, values: string[]): Prisma.ListingWhereInput => ({
  OR: values.map((value) => ({ attributes: { path: [name], equals: value } })),
});

const containsAny = (name: string, values: string[]): Prisma.ListingWhereInput => ({
  OR: values.map((value) => ({ attributes: { path: [name], array_contains: [value] } })),
});

/** Hai đầu là hai điều kiện: `JsonFilter` của Prisma chỉ nhận một phép so sánh mỗi `path`. */
const between = (name: string, { min, max }: NumberRange): Prisma.ListingWhereInput[] => [
  ...(min !== undefined ? [{ attributes: { path: [name], gte: min } }] : []),
  ...(max !== undefined ? [{ attributes: { path: [name], lte: max } }] : []),
];

/** Mỗi mục một điều kiện, ghép AND — gọi sau khi `attributeFilterIssue` trả `null`. */
export function attributeFilterWhere(
  fields: TemplateField[],
  filters: AttributeFilters,
): Prisma.ListingWhereInput[] {
  const byName = new Map(fields.map((field) => [field.name, field]));
  return Object.entries(filters).flatMap(([name, filter]) => {
    const type = byName.get(name)?.type;
    if (isRange(filter)) return type === 'number' ? between(name, filter) : [];
    if (type === 'single_choice') return [equalsAny(name, filter)];
    if (type === 'multi_choice') return [containsAny(name, filter)];
    return [];
  });
}
