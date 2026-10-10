import { describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/actor.js';
import { buildIdentityService } from './identity.service.test.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');
const MASTER: Actor = {
  accountId: '00000000-0000-7000-8000-00000000000a',
  role: 'master',
  sessionId: 's',
  secondFactorAt: NOW,
  emailVerified: true,
};

describe('isDisposableEmail', () => {
  it('so theo đuôi miền: miền con của miền bị chặn cũng bị chặn; miền đã bỏ thì không', async () => {
    const { service, repository } = buildIdentityService();
    await repository.seedDisposableDomains(['tempmail.example', 'oan.example'], NOW);
    await service.removeDisposableDomain(MASTER, 'oan.example');

    expect(await service.isDisposableEmail('a@tempmail.example')).toBe(true);
    expect(await service.isDisposableEmail('a@mx.tempmail.example')).toBe(true);
    expect(await service.isDisposableEmail('a@tempmail.example.vn')).toBe(false);
    expect(await service.isDisposableEmail('a@oan.example')).toBe(false);
    expect(await service.isDisposableEmail('a@gmail.com')).toBe(false);
  });
});

describe('master thêm / bỏ miền', () => {
  it('thêm → chặn ngay; bỏ → hết chặn, dòng còn lại dạng bia mộ; bỏ miền không có → 404', async () => {
    const { service, repository } = buildIdentityService();
    const added = await service.addDisposableDomain(MASTER, 'moi.example');
    expect(added).toMatchObject({ domain: 'moi.example', source: 'manual', removedAt: null });
    expect(await service.isDisposableEmail('x@moi.example')).toBe(true);

    await service.removeDisposableDomain(MASTER, 'moi.example');
    expect(await service.isDisposableEmail('x@moi.example')).toBe(false);
    expect(repository.domains.get('moi.example')).toMatchObject({ removedBy: MASTER.accountId });
    expect(repository.domains.get('moi.example')?.removedAt).not.toBeNull();

    await expect(service.removeDisposableDomain(MASTER, 'moi.example')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('thêm lại một miền đã bỏ thì sống lại dưới dạng manual', async () => {
    const { service } = buildIdentityService();
    await service.addDisposableDomain(MASTER, 'lai.example');
    await service.removeDisposableDomain(MASTER, 'lai.example');
    expect(await service.addDisposableDomain(MASTER, 'lai.example')).toMatchObject({
      source: 'manual',
      removedAt: null,
    });
    expect(await service.isDisposableEmail('x@lai.example')).toBe(true);
  });

  it('danh sách phân trang gồm cả miền đã bỏ, đúng vỏ trang', async () => {
    const { service } = buildIdentityService();
    await service.addDisposableDomain(MASTER, 'b.example');
    await service.addDisposableDomain(MASTER, 'a.example');
    await service.removeDisposableDomain(MASTER, 'b.example');
    const page = await service.listDisposableDomains({ page: 1, limit: 1 });
    expect(page).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(page.items.map((row) => row.domain)).toEqual(['a.example']);
  });
});

describe('seedDisposableDomainsIfEmpty', () => {
  it('bảng rỗng thì nạp hạt giống trong repo (hàng chục nghìn miền); bảng có dòng thì không làm gì', async () => {
    const { service, repository } = buildIdentityService();
    const seeded = await service.seedDisposableDomainsIfEmpty();
    expect(seeded).toBeGreaterThan(50_000);
    expect(repository.domains.size).toBe(seeded);
    expect(await service.isDisposableEmail('x@mailinator.com')).toBe(true);
    expect(await service.seedDisposableDomainsIfEmpty()).toBe(0);
  });
});
