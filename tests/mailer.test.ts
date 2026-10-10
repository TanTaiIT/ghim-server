import { describe, expect, it } from 'vitest';

import { createFakeMailer, createSmtpMailer } from '../src/lib/mailer.js';

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
