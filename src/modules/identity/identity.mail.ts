import type { CodePurpose } from './identity.schema.js';

export interface CodeMail {
  subject: string;
  text: string;
}

/**
 * Ba mẫu thư cho ba mục đích mã, cùng một luật mã (TK 7). Chữ nghĩa ở đây thuần văn bản, không
 * HTML: thư mã xác nhận không cần bố cục, và text đi qua mọi bộ lọc thư rác tốt hơn.
 */
export type NoticeKind = 'email_changed';

/** Thư báo không mang mã: gửi tới người cần biết chuyện vừa xảy ra trên tài khoản. */
export function renderNoticeMail(kind: NoticeKind, detail: { newEmail: string }): CodeMail {
  switch (kind) {
    case 'email_changed':
      return {
        subject: 'Email đăng nhập Ghim của bạn vừa được đổi',
        text: `Chào bạn,\n\nEmail đăng nhập tài khoản Ghim của bạn vừa được đổi sang ${detail.newEmail}. Mọi thiết bị khác đã bị đăng xuất.\n\nNếu không phải bạn đổi, liên hệ hỗ trợ Ghim ngay.\n\nGhim`,
      };
  }
}

export function renderCodeMail(purpose: CodePurpose, code: string, ttlMinutes: number): CodeMail {
  const expiry = `Mã có hiệu lực ${ttlMinutes} phút. Nếu không phải bạn yêu cầu, bỏ qua thư này.`;
  switch (purpose) {
    case 'email_verify':
      return {
        subject: `${code} là mã xác nhận email Ghim của bạn`,
        text: `Chào bạn,\n\nNhập mã sau vào app Ghim để xác nhận email: ${code}\n\n${expiry}\n\nGhim`,
      };
    case 'password_reset':
      return {
        subject: `${code} là mã đặt lại mật khẩu Ghim`,
        text: `Chào bạn,\n\nNhập mã sau vào app Ghim để đặt lại mật khẩu: ${code}\n\n${expiry} Sau khi đặt lại, mọi thiết bị sẽ phải đăng nhập lại.\n\nGhim`,
      };
    case 'email_change':
      return {
        subject: `${code} là mã xác nhận email mới cho Ghim`,
        text: `Chào bạn,\n\nNhập mã sau vào app Ghim để dùng email này làm email đăng nhập: ${code}\n\n${expiry}\n\nGhim`,
      };
  }
}
