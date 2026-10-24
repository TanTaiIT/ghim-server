/** Giờ của người dùng Ghim (CLAUDE.md luật 24): mọi "ngày" nói với người dùng tính theo múi này, không theo máy chủ. */
export const SHOP_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const DATE_VN = new Intl.DateTimeFormat('vi-VN', {
  timeZone: SHOP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const TIME_VN = new Intl.DateTimeFormat('vi-VN', {
  timeZone: SHOP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const HOUR_MINUTE_VN = new Intl.DateTimeFormat('vi-VN', {
  timeZone: SHOP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** `dd/mm/yyyy` theo giờ Việt Nam — cho câu báo lỗi "được đăng ký lại từ …". */
export function formatDateVN(date: Date): string {
  return DATE_VN.format(date);
}

/** `HH:mm:ss` theo giờ Việt Nam — cho câu "xin gửi lại sau …". */
export function formatTimeVN(date: Date): string {
  return TIME_VN.format(date);
}

/**
 * `HH:mm ngày dd/mm/yyyy` theo giờ Việt Nam — cho mốc xa hơn vài phút (thời gian chờ 24 giờ): giờ trần không nói hôm
 * nay hay mai, giây chỉ là nhiễu. Lỗi 429 và thông báo cùng dùng để hai câu khớp từng chữ (add-trust-notices).
 */
export function formatMomentVN(date: Date): string {
  return `${HOUR_MINUTE_VN.format(date)} ngày ${DATE_VN.format(date)}`;
}

/** Việt Nam là UTC+7 quanh năm, không đổi giờ mùa hè — nên đầu ngày là một phép trừ, không cần thư viện múi giờ. */
const VN_OFFSET_MS = 7 * 3_600_000;
export const DAY_MS = 86_400_000;

/** 00:00 theo giờ Việt Nam của ngày chứa `at` — trần "mỗi ngày" tính theo ngày của người dùng, không theo UTC. */
export function startOfDayVN(at: Date): Date {
  const shifted = at.getTime() + VN_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - VN_OFFSET_MS);
}

/** Khoá ngày `YYYY-MM-DD` theo giờ Việt Nam — cùng phép tính với `startOfDayVN`, khớp `to_char(… AT TIME ZONE …)` trong SQL. */
export function dayKeyVN(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Một dòng đếm theo ngày Việt Nam (`day` = khoá của `dayKeyVN`) — các module trả cho `ops` qua cổng (add-ops-daily-stats). */
export interface DayCount {
  day: string;
  count: number;
}
