/**
 * Mọi con số ở TK phần 28 đi qua đây (CLAUDE.md luật 19). Bảng con số có phiên bản thuộc
 * `platform` (chưa có); tới lúc đó `add-platform-roles` thay bản tĩnh này bằng bản đọc bảng —
 * service không đổi dòng nào vì chỉ thấy `RuntimeConfig`.
 *
 * Giá trị dưới là GIÁ TRỊ KHỞI ĐẦU của bảng, đúng TK 28; đổi một con số là đổi TK trước.
 */
export const RUNTIME_CONFIG_DEFAULTS = {
  // TK 28 — Tài khoản
  'identity.codeTtlMinutes': 10,
  'identity.codeMaxAttempts': 5,
  'identity.resendCooldownSeconds': 60,
  'identity.unverifiedPurgeDays': 7,
  'identity.sessionCapUser': 20,
  'identity.sessionCapPrivileged': 3,
  'identity.sessionIdleDays': 30,
  'identity.accessTokenMinutes': 15,
  'identity.passwordMinLength': 8,
  'identity.passwordMaxLength': 128,
  'identity.emailChangeIntervalDays': 30,
  'identity.deletedEmailHoldDays': 90,
  'identity.authRateLimitPerMinute': 10,
  // TK 28 — Thiết bị
  'identity.deviceSlots': 3,
  'identity.deviceWindowDays': 90,
} as const;

export type RuntimeConfigKey = keyof typeof RUNTIME_CONFIG_DEFAULTS;

export interface RuntimeConfig {
  get(key: RuntimeConfigKey): number;
}

/**
 * Bản tĩnh: mặc định TK 28, test đè từng khoá bằng `overrides` để kiểm đúng ngưỡng (vd trần 2
 * phiên thay vì 20) mà không dựng 21 phiên.
 */
export function createStaticRuntimeConfig(
  overrides: Partial<Record<RuntimeConfigKey, number>> = {},
): RuntimeConfig {
  const values: Record<string, number> = { ...RUNTIME_CONFIG_DEFAULTS, ...overrides };
  return {
    get(key) {
      const value = values[key];
      // Bản đọc bảng sau này nhận khoá từ dữ liệu, không chỉ từ code: khoá lạ phải nổ chứ
      // không trả undefined rồi thành NaN ở một phép so sánh cách đó ba hàm.
      if (value === undefined) throw new Error(`Khoá cấu hình không tồn tại: ${key}`);
      return value;
    },
  };
}
