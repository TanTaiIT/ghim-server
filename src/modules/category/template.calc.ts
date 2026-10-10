import { fold } from '../../common/text/fold.js';

export const TEMPLATE_FIELD_TYPES = ['text', 'number', 'single_choice', 'multi_choice'] as const;
export type TemplateFieldType = (typeof TEMPLATE_FIELD_TYPES)[number];

/** Một mục của mẫu thông tin — `name` là khoá lọc và là danh tính của mục qua mọi phiên bản (TK 11). */
export interface TemplateField {
  name: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  options?: string[] | undefined;
}

/**
 * Dạng lưu jsonb: bỏ `options` khi không có thay vì ghi `undefined`, để mục chữ / số không mang
 * khoá rỗng và hai lượt đọc cùng một phiên bản luôn ra cùng một JSON.
 */
export function fieldsToJson(
  fields: TemplateField[],
): Array<Record<string, string | boolean | string[]>> {
  return fields.map(({ options, ...field }) =>
    options === undefined ? { ...field } : { ...field, options },
  );
}

export function isChoiceType(type: TemplateFieldType): boolean {
  return type === 'single_choice' || type === 'multi_choice';
}

export function duplicateFieldNames(fields: TemplateField[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) duplicates.add(field.name);
    seen.add(field.name);
  }
  return [...duplicates];
}

/**
 * Vì sao tên mục bị khoá sau khi phát hành: tin đăng giữ giá trị theo `name` của phiên bản nó
 * điền, và người mua lọc theo `name` xuyên mọi phiên bản. Đổi tên hay đổi kiểu một mục đã phát
 * hành là tách bộ lọc làm hai nửa không nối lại được. Hai lỗi bị chặn:
 *
 * 1. Dùng lại một `name` đã phát hành với `type` khác.
 * 2. Đổi tên trá hình: bỏ mục đã phát hành rồi thêm mục mới cùng nhãn (so sau khi bỏ dấu) và
 *    cùng kiểu dưới tên khác — API không có thao tác "đổi tên", nên đây là hình dạng duy nhất mà
 *    một lượt đổi tên có thể mang. Muốn đổi cách gọi thì đổi `label`, giữ `name`.
 *
 * Bỏ hẳn một mục, thêm mục mới với nhãn khác, đổi nhãn của mục cũ — đều hợp lệ.
 * Trả thông điệp cho lỗi đầu tiên gặp, `null` khi bản nháp hợp lệ.
 */
export function lockedFieldIssue(
  published: TemplateField[][],
  draft: TemplateField[],
): string | null {
  // Mọi nhãn từng phát hành đều tính: đổi nhãn ở v2 rồi đổi tên ở v3 vẫn phải bị nhận ra.
  const everPublished = published.flat();
  const publishedNames = new Set(everPublished.map((field) => field.name));
  const draftNames = new Set(draft.map((field) => field.name));

  for (const field of draft) {
    const prior = everPublished.find(
      (item) => item.name === field.name && item.type !== field.type,
    );
    if (prior) {
      return `Mục "${field.name}" đã phát hành với kiểu ${prior.type}, không dùng lại tên này cho kiểu ${field.type}`;
    }
  }
  for (const field of draft) {
    if (publishedNames.has(field.name)) continue;
    const renamed = everPublished.find(
      (prior) =>
        !draftNames.has(prior.name) &&
        prior.type === field.type &&
        fold(prior.label) === fold(field.label),
    );
    if (renamed) {
      return `Mục "${renamed.name}" đã phát hành thì giữ nguyên tên — đổi nhãn được, đổi tên thành "${field.name}" thì không`;
    }
  }
  return null;
}
