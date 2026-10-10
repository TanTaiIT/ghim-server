import { createTransport } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Cửa gửi thư duy nhất của app. Service chỉ biết interface này; bản thật đi SMTP, bản giả ghi
 * vào mảng — nên test HTTP không cần máy chủ thư, và đổi nhà cung cấp SMTP là đổi một biến env.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = createTransport(smtpUrl);
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
        throw new Error('Máy chủ SMTP từ chối người nhận');
      }
    },
  };
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
