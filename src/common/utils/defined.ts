/**
 * Giữ nguyên key BẮT BUỘC, còn key tuỳ chọn thì bỏ `undefined` khỏi kiểu giá trị.
 *
 * `{ a: string; b?: string | undefined }` → `{ a: string; b?: string }`.
 */
type DefinedOnly<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

/**
 * Loại các key đang mang giá trị `undefined` ra khỏi object.
 *
 * Cần vì hai bên nói hai thứ tiếng: `tsconfig` bật `exactOptionalPropertyTypes`, tức "không có
 * key" KHÁC "key = undefined"; mà Zod `.optional()` lại sinh ra vế thứ hai, còn Prisma chỉ nhận
 * vế thứ nhất (`undefined` với Prisma nghĩa là "bỏ qua field này", nhưng kiểu của nó không khai
 * `| undefined`).
 *
 * Đặt ở `common/utils` chứ không chép vào từng repository: mọi module đều có input tuỳ chọn, và
 * cách viết tay — trải `...(x !== undefined && { x })` cho từng field — là thứ chỉ cần quên một
 * dòng là một field lặng lẽ không bao giờ được lưu.
 */
// Ràng `object` chứ không `Record<string, unknown>`: interface không có index signature ngầm
// nên không thoả `Record`, mà repository nào cũng nhận một interface làm kiểu input.
export function definedOnly<T extends object>(input: T): DefinedOnly<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as DefinedOnly<T>;
}
