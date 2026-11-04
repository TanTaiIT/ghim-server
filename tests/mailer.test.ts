import { describe, expect, it } from 'vitest';

import { createFakeMailer, createGmailMailer, createSmtpMailer } from '../src/lib/mailer.js';
import { renderCodeMail } from '../src/modules/identity/identity.mail.js';

describe('createFakeMailer', () => {
  it('ghi lại từng thư theo thứ tự gửi, không gửi đi đâu', async () => {
    const mailer = createFakeMailer();
    await mailer.send({ to: 'a@ghim.test', subject: 'Một', text: '1' });
    await mailer.send({ to: 'b@ghim.test', subject: 'Hai', text: '2' });
    expect(mailer.sent.map((m) => m.to)).toEqual(['a@ghim.test', 'b@ghim.test']);
  });
});

/*
 * Ca gửi thật chỉ chạy khi shell có `SMTP_URL` (vd `pnpm mail:up` rồi
 * `SMTP_URL=smtp://ghim:ghim@localhost:1025 pnpm test`): bộ `pnpm test` mặc định không đòi
 * máy chủ thư. `vitest.config.ts` cố ý KHÔNG khai biến này để ca không bật nhầm trong CI.
 */
describe('createSmtpMailer', () => {
  it.skipIf(!process.env.SMTP_URL)('gửi được một thư tới Mailpit', async () => {
    const mailer = createSmtpMailer(process.env.SMTP_URL ?? '', 'Ghim test <no-reply@ghim.test>');
    await expect(
      mailer.send({ to: 'nguoi-nhan@ghim.test', subject: 'Thử SMTP', text: 'Thư thử từ test' }),
    ).resolves.toBeUndefined();
  });
});

/*
 * Ca gửi thật qua Gmail, cùng kiểu: chỉ chạy khi shell có `GMAIL_USER` và `GMAIL_APP_PASSWORD`. Gửi về chính hộp thư đó
 * nên không làm phiền ai, và kiểm được mật khẩu ứng dụng trước khi đặt lên Render.
 */
describe('createGmailMailer', () => {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  it.skipIf(!user || !pass)('gửi được thư mã (chữ + HTML) về chính hộp thư Gmail', async () => {
    const mailer = createGmailMailer(user ?? '', pass ?? '');
    const mail = renderCodeMail('email_verify', '123456', 10);
    await expect(mailer.send({ to: user ?? '', ...mail })).resolves.toBeUndefined();
  });
});

describe('renderCodeMail', () => {
  it('thư mã có cả bản chữ và HTML, mã nằm trong cả hai và trong tiêu đề', () => {
    const mail = renderCodeMail('password_reset', '482913', 10);
    expect(mail.subject).toBe('482913 là mã đặt lại mật khẩu Ghim');
    expect(mail.text).toBe(
      'Chào bạn,\n\nNhập mã sau vào app Ghim để đặt lại mật khẩu: 482913\n\nMã có hiệu lực 10 phút. Nếu không phải bạn yêu cầu, bỏ qua thư này. Sau khi đặt lại, mọi thiết bị sẽ phải đăng nhập lại.\n\nGhim',
    );
    expect(mail.html).toContain('>482913</p>');
  });
});
