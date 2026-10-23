import { beforeEach, describe, expect, it } from 'vitest';

import { prisma, truncateAll } from './db-helpers.js';
import { buildIdentityService } from './identity-service.helpers.js';

/* Spec master-accounts, phần do công cụ của đội kỹ thuật làm (`src/cli/*`). */
const PASSWORD = 'ghim-rao-vat-2026!';

beforeEach(truncateAll);

describe('createMaster', () => {
  it('email chưa có tài khoản → master đã xác nhận, không qua đăng ký, không gửi thư', async () => {
    const { service, repository, jobs } = buildIdentityService();
    const { accountId } = await service.createMaster({
      email: 'Master@Ghim.vn',
      password: PASSWORD,
      displayName: 'Quản trị Ghim',
    });

    expect(await repository.findAccountById(accountId)).toMatchObject({
      role: 'master',
      status: 'active',
      emailNormalized: 'master@ghim.vn',
    });
    expect(jobs.sent).toEqual([]);
  });

  it('email trùng (sau chuẩn hoá) tài khoản đã có → EMAIL_TAKEN, không ai thành master', async () => {
    const { service, repository } = buildIdentityService();
    await service.register({ email: 'hung@ghim.vn', password: PASSWORD, displayName: 'Hùng' });

    await expect(
      service.createMaster({ email: ' HUNG@ghim.vn ', password: PASSWORD, displayName: 'M' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    expect(await repository.findMaster()).toBeNull();
  });

  it('đã có master → từ chối master thứ hai', async () => {
    const { service } = buildIdentityService();
    await service.createMaster({ email: 'a@ghim.vn', password: PASSWORD, displayName: 'A' });

    await expect(
      service.createMaster({ email: 'b@ghim.vn', password: PASSWORD, displayName: 'B' }),
    ).rejects.toMatchObject({ code: 'MASTER_EXISTS' });
    expect(await prisma.account.count({ where: { role: 'master' } })).toBe(1);
  });

  it('mật khẩu yếu → PASSWORD_WEAK, không tạo gì', async () => {
    const { service } = buildIdentityService();
    await expect(
      service.createMaster({ email: 'a@ghim.vn', password: '12345678', displayName: 'A' }),
    ).rejects.toMatchObject({ code: 'PASSWORD_WEAK' });
    expect(await prisma.account.count()).toBe(0);
  });
});
