import { describe, expect, it } from 'vitest';

import { buildIdentityService } from './identity.service.test.js';

/* Spec master-accounts, phần do công cụ của đội kỹ thuật làm (`src/cli/*`). */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const PASSWORD = 'ghim-rao-vat-2026!';

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
    const { service, repository } = buildIdentityService();
    await service.createMaster({ email: 'a@ghim.vn', password: PASSWORD, displayName: 'A' });

    await expect(
      service.createMaster({ email: 'b@ghim.vn', password: PASSWORD, displayName: 'B' }),
    ).rejects.toMatchObject({ code: 'MASTER_EXISTS' });
    expect([...repository.accounts.values()].filter((row) => row.role === 'master')).toHaveLength(
      1,
    );
  });

  it('mật khẩu yếu → PASSWORD_WEAK, không tạo gì', async () => {
    const { service, repository } = buildIdentityService();
    await expect(
      service.createMaster({ email: 'a@ghim.vn', password: '12345678', displayName: 'A' }),
    ).rejects.toMatchObject({ code: 'PASSWORD_WEAK' });
    expect(repository.accounts.size).toBe(0);
  });
});

describe('resetTwoFactor', () => {
  it('gỡ bí mật, tắt lớp thứ hai và thu hồi mọi phiên', async () => {
    const { service, repository } = buildIdentityService();
    const { accountId } = await service.createMaster({
      email: 'master@ghim.vn',
      password: PASSWORD,
      displayName: 'M',
    });
    await repository.updateAccount(accountId, {
      totpSecretEnc: 'bi-mat-niem-phong',
      totpEnabledAt: NOW,
    });
    const session = await repository.createSession({
      accountId,
      refreshTokenHash: 'rt',
      deviceName: 'Máy',
      ip: null,
      userAgent: null,
      secondFactorAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      at: NOW,
    });

    await service.resetTwoFactor({ email: 'MASTER@ghim.vn' });

    expect(await repository.findAccountById(accountId)).toMatchObject({
      totpSecretEnc: null,
      totpEnabledAt: null,
    });
    expect((await repository.findSessionById(session.id))?.revokedAt).not.toBeNull();
  });

  it('email không có tài khoản → 404', async () => {
    const { service } = buildIdentityService();
    await expect(service.resetTwoFactor({ email: 'khong@ghim.vn' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
