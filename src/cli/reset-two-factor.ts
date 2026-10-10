import { argOf, runCli, usage } from './cli-identity.js';

/*
 * Đặt lại lớp thứ hai cho một tài khoản (master mất ứng dụng tạo mã — spec master-accounts): gỡ
 * bí mật TOTP và thu hồi mọi phiên. Người đó đăng nhập lại bằng mật khẩu và thiết lập lại trước
 * khi bàn vận hành mở.
 *
 *   pnpm cli:reset-2fa --email master@ghim.vn
 */
const email = argOf('email');
if (!email) usage('pnpm cli:reset-2fa --email <email>');

await runCli(async (identity) => {
  await identity.resetTwoFactor({ email });
  return `Đã gỡ lớp thứ hai và thu hồi mọi phiên của ${email}. Đăng nhập lại bằng mật khẩu rồi thiết lập lại ứng dụng tạo mã.`;
});
