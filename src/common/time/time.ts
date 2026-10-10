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

/** `dd/mm/yyyy` theo giờ Việt Nam — cho câu báo lỗi "được đăng ký lại từ …". */
export function formatDateVN(date: Date): string {
  return DATE_VN.format(date);
}

/** `HH:mm:ss` theo giờ Việt Nam — cho câu "xin gửi lại sau …". */
export function formatTimeVN(date: Date): string {
  return TIME_VN.format(date);
}
