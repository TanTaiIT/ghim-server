import { argOf, runCli, usage } from './cli-identity.js';

/*
 * Tạo tài khoản master — đường DUY NHẤT (spec master-accounts): không có route HTTP nào làm việc
 * này. Mật khẩu ưu tiên đọc từ `MASTER_PASSWORD` để không nằm lại trong lịch sử shell.
 *
 *   MASTER_PASSWORD=... pnpm cli:create-master --email master@ghim.vn --name "Quản trị Ghim"
 */
const email = argOf('email');
const password = process.env.MASTER_PASSWORD ?? argOf('password');
const displayName = argOf('name') ?? 'Master';
if (!email || !password) {
  usage(
    'MASTER_PASSWORD=<mật khẩu> pnpm cli:create-master --email <email> [--name <tên hiển thị>]',
  );
}

await runCli(async (identity) => {
  const { accountId } = await identity.createMaster({ email, password, displayName });
  return `Đã tạo master ${accountId} (${email}). Đăng nhập rồi thiết lập lớp thứ hai (POST /api/v1/me/two-factor/setup rồi /confirm) trước khi dùng bàn vận hành.`;
});
