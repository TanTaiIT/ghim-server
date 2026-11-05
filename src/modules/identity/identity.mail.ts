import type { CodePurpose } from './identity.schema.js';

export interface CodeMail {
  subject: string;
  text: string;
  html?: string;
}

export type NoticeKind = 'email_changed';

/**
 * Thư báo không mang mã: gửi tới người cần biết chuyện vừa xảy ra trên tài khoản. Chỉ bản chữ — thư mang email người
 * dùng tự nhập, đưa vào HTML là phải thoát ký tự, đổi lại không được gì.
 */
export function renderNoticeMail(kind: NoticeKind, detail: { newEmail: string }): CodeMail {
  switch (kind) {
    case 'email_changed':
      return {
        subject: 'Email đăng nhập Ghim của bạn vừa được đổi',
        text: `Chào bạn,\n\nEmail đăng nhập tài khoản Ghim của bạn vừa được đổi sang ${detail.newEmail}. Mọi thiết bị khác đã bị đăng xuất.\n\nNếu không phải bạn đổi, liên hệ hỗ trợ Ghim ngay.\n\nGhim`,
      };
  }
}

const CODE_COPY: Record<CodePurpose, { subject: string; intro: string; after?: string }> = {
  email_verify: {
    subject: 'là mã xác nhận email Ghim của bạn',
    intro: 'Nhập mã sau vào app Ghim để xác nhận email',
  },
  password_reset: {
    subject: 'là mã đặt lại mật khẩu Ghim',
    intro: 'Nhập mã sau vào app Ghim để đặt lại mật khẩu',
    after: 'Sau khi đặt lại, mọi thiết bị sẽ phải đăng nhập lại.',
  },
  locked_appeal: {
    subject: 'là mã để khiếu nại việc khoá tài khoản Ghim',
    intro: 'Nhập mã sau vào kênh hỗ trợ của Ghim để xem lý do khoá và gửi khiếu nại',
  },
  email_change: {
    subject: 'là mã xác nhận email mới cho Ghim',
    intro: 'Nhập mã sau vào app Ghim để dùng email này làm email đăng nhập',
  },
};

/**
 * Bốn mẫu thư cho bốn mục đích mã, cùng một luật mã (TK 7). Bản chữ luôn có — thư chỉ có HTML bị bộ lọc thư rác chấm
 * điểm cao hơn, mà gửi từ Gmail vốn đã thiệt vì không có SPF/DKIM riêng. Bản HTML (như `docs/market`) để mã thành chữ
 * to, chọn được: người dùng cần chép mã, và phần lớn hộp thư chặn ảnh mặc định.
 */
export function renderCodeMail(purpose: CodePurpose, code: string, ttlMinutes: number): CodeMail {
  const copy = CODE_COPY[purpose];
  const expiry = `Mã có hiệu lực ${ttlMinutes} phút. Nếu không phải bạn yêu cầu, bỏ qua thư này.`;
  const footer = copy.after ? `${expiry} ${copy.after}` : expiry;
  return {
    subject: `${code} ${copy.subject}`,
    text: `Chào bạn,\n\n${copy.intro}: ${code}\n\n${footer}\n\nGhim`,
    html: codeHtml(copy.intro, code, footer),
  };
}

/** Style nội tuyến trên từng thẻ: trình đọc thư không có CSS chung. Mọi chữ ở đây do server soạn, không có gì cần thoát. */
const codeHtml = (intro: string, code: string, footer: string): string =>
  `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0F172A">
  <p style="font-size:15px;line-height:22px;margin:0 0 20px">${intro}:</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 20px;color:#007A8C">${code}</p>
  <p style="font-size:13px;line-height:19px;color:#64748B;margin:0">${footer}</p>
  <p style="font-size:13px;line-height:19px;color:#64748B;margin:16px 0 0">Ghim</p>
</div>`;
