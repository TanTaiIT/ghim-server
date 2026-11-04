import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

export interface MailMessage {
  to: string;
  subject: string;
  /** Luôn có: thư chỉ có HTML bị bộ lọc thư rác chấm điểm cao hơn hẳn. */
  text: string;
  html?: string | undefined;
}

/**
 * Cửa gửi thư duy nhất của app. Service chỉ biết interface này; bản thật đi Gmail (production) hay SMTP (Mailpit ở dev),
 * bản giả ghi vào mảng — nên test HTTP không cần máy chủ thư, và đổi nhà cung cấp là đổi biến env.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Tên người gửi là hằng số của sản phẩm, nên nằm ở code chứ không ở env. */
const SENDER_NAME = 'Ghim';

function transportMailer(
  transport: Transporter<SMTPTransport.SentMessageInfo>,
  from: string,
): Mailer {
  return {
    async send(message) {
      const info = await transport.sendMail({ from, ...message });
      /*
       * `sendMail` resolve cả khi máy chủ chỉ nhận thư cho MỘT PHẦN người nhận. Ở đây mỗi thư
       * một người nhận, nên người nhận không nằm trong `accepted` nghĩa là thư không đi — phải
       * ném ra để việc nền thử lại thay vì coi là đã gửi. Câu lỗi không chứa địa chỉ: log không
       * được mang email đầy đủ.
       */
      if (!info.accepted.includes(message.to)) {
        throw new Error('Máy chủ thư từ chối người nhận');
      }
    },
  };
}

export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  return transportMailer(createTransport(smtpUrl), from);
}

/**
 * Gửi từ hộp thư Gmail bằng mật khẩu ứng dụng — như `docs/market`. Ghim không có tên miền, mà dịch vụ gửi thư nào cũng
 * đòi xác minh tên miền qua DNS trước khi cho gửi tới người ngoài; Gmail gửi từ chính hộp thư đã đăng nhập nên không
 * cần. Người gửi ghép từ `user`: Gmail ghi đè mọi địa chỉ `from` khác, nên một biến `MAIL_FROM` riêng chỉ có thể sai.
 *
 * Cái giá: Gmail chặn quanh 500 thư/ngày cho tài khoản thường (vượt là khoá gửi ~24 giờ, không ai đăng ký được), không
 * có SPF/DKIM của riêng mình nên dễ vào Spam hơn. Gói free của Render chặn cổng SMTP (465/587) — chỉ chạy trên gói
 * trả phí hay máy khác.
 */
export function createGmailMailer(user: string, appPassword: string): Mailer {
  const transport = createTransport({ service: 'gmail', auth: { user, pass: appPassword } });
  return transportMailer(transport, `${SENDER_NAME} <${user}>`);
}

export interface FakeMailer extends Mailer {
  readonly sent: MailMessage[];
}

export function createFakeMailer(): FakeMailer {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}
