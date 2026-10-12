import { CONFIG_KEYS, type RuntimeConfigKey } from './config-keys.js';

export type { RuntimeConfigKey };

/**
 * Mọi con số ở TK phần 28 đi qua đây (CLAUDE.md luật 19). Sổ đăng ký `config-keys.ts` là nguồn
 * của khoá và giá trị khởi đầu; bản thật đọc phiên bản hiện hành của `platform`
 * (`createVersionedRuntimeConfig`), bản tĩnh dưới đây cho test và cho lúc chưa có DB.
 */
export const RUNTIME_CONFIG_DEFAULTS: Record<RuntimeConfigKey, number> = Object.fromEntries(
  Object.entries(CONFIG_KEYS).map(([key, spec]) => [key, spec.initial]),
) as Record<RuntimeConfigKey, number>;

export interface RuntimeConfig {
  get(key: RuntimeConfigKey): number;
  /**
   * Phiên bản bảng con số mà `get` đang đọc — kết quả tính theo con số (mức tin cậy) ghi kèm để biết nó cần tính lại
   * khi master phát hành bảng mới (TK 27 cam kết 33). `0` = chưa có phiên bản nào, đang dùng giá trị khởi đầu.
   */
  version(): number;
}

/**
 * Bản tĩnh: mặc định TK 28, test đè từng khoá bằng `overrides` để kiểm đúng ngưỡng (vd trần 2
 * phiên thay vì 20) mà không dựng 21 phiên.
 */
export function createStaticRuntimeConfig(
  overrides: Partial<Record<RuntimeConfigKey, number>> = {},
  version = 0,
): RuntimeConfig {
  const values: Record<string, number> = { ...RUNTIME_CONFIG_DEFAULTS, ...overrides };
  return {
    get(key) {
      const value = values[key];
      // Bản đọc bảng nhận khoá từ dữ liệu, không chỉ từ code: khoá lạ phải nổ chứ không trả
      // undefined rồi thành NaN ở một phép so sánh cách đó ba hàm.
      if (value === undefined) throw new Error(`Khoá cấu hình không tồn tại: ${key}`);
      return value;
    },
    version: () => version,
  };
}
