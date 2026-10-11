import { describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { createSecretBox } from '../src/common/crypto/secrets.js';
import { createFakeMailer } from '../src/lib/mailer.js';
import {
  createPurgeUnverifiedHandler,
  createRefreshDisposableDomainsHandler,
  createSendMailHandler,
  parseDomainList,
  type SendMailJob,
} from '../src/modules/identity/identity.jobs.js';
import { prisma } from './db-helpers.js';
import { repositories, TEST_AUDIT } from './test-app.js';

const NOW = new Date('2026-10-10T09:00:00+07:00');
const DAY_MS = 86_400_000;
const secrets = createSecretBox(Buffer.alloc(32, 3).toString('base64'));
const repository = repositories.identity;

describe('identity.send-mail', () => {
  it('mở mã đã niêm phong, gửi đúng người nhận với tiêu đề mang mã; payload không chứa mã thô', async () => {
    const mailer = createFakeMailer();
    const job: SendMailJob = {
      to: 'lan@ghim.test',
      purpose: 'email_verify',
      sealedCode: secrets.seal('482913'),
      ttlMinutes: 10,
    };
    expect(JSON.stringify(job)).not.toContain('482913');

    await createSendMailHandler({ mailer, secrets })(job);
    expect(mailer.sent).toEqual([
      expect.objectContaining({ to: 'lan@ghim.test', subject: expect.stringContaining('482913') }),
    ]);
    expect(mailer.sent[0]?.text).toContain('10 phút');
  });

  it('ba mục đích ra ba thư khác nhau', async () => {
    const mailer = createFakeMailer();
    const handler = createSendMailHandler({ mailer, secrets });
    await Promise.all(
      (['email_verify', 'password_reset', 'email_change'] as const).map((purpose) =>
        handler({ to: 'a@ghim.test', purpose, sealedCode: secrets.seal('000000'), ttlMinutes: 10 }),
      ),
    );
    expect(new Set(mailer.sent.map((mail) => mail.subject)).size).toBe(3);
  });
});

describe('parseDomainList', () => {
  it('bỏ dòng trống, chú thích, dòng không phải miền; hạ chữ thường; khử trùng', () => {
    expect(
      parseDomainList(
        '# nguồn\n\nTempMail.Example\nmx.tempmail.example\nkhông hợp lệ\ntempmail.example\n',
      ),
    ).toEqual(['tempmail.example', 'mx.tempmail.example']);
  });
});

const refresh = (fetchText: (url: string) => Promise<string>) =>
  createRefreshDisposableDomainsHandler({
    repository,
    clock: () => NOW,
    disposableDomainsUrl: 'https://example.test/domains.txt',
    fetchText,
  });

describe('identity.refresh-disposable-domains', () => {
  it('tải được thì chỉ THÊM miền mới; miền master đã thêm và bia mộ master đã bỏ giữ nguyên', async () => {
    const run = refresh(async () => 'tempmail.example\noan.example\nmoi.example\n');
    await repository.addManualDomain({ domain: 'tay.example', at: NOW, audit: TEST_AUDIT });
    await repository.seedDisposableDomains(['oan.example'], NOW);
    await repository.removeDisposableDomain({
      domain: 'oan.example',
      removedBy: TEST_AUDIT.actorId,
      at: NOW,
      audit: TEST_AUDIT,
    });

    await run();

    expect(
      (
        await repository.findBlockedDomains(['tempmail.example', 'moi.example', 'tay.example'])
      ).toSorted(),
    ).toEqual(['moi.example', 'tay.example', 'tempmail.example']);
    expect(await repository.findBlockedDomains(['oan.example'])).toEqual([]);
    expect(
      (await prisma.disposableDomain.findUnique({ where: { domain: 'tay.example' } }))?.source,
    ).toBe('manual');
  });

  it('tải lỗi hay nội dung rỗng thì không đụng bảng', async () => {
    await repository.seedDisposableDomains(['giu.example'], NOW);
    const before = await repository.countDisposableDomains();

    await refresh(async () => {
      throw new Error('mạng hỏng');
    })();
    expect(await repository.countDisposableDomains()).toBe(before);

    await refresh(async () => '# chỉ có chú thích\n')();
    expect(await repository.countDisposableDomains()).toBe(before);
  });
});

describe('identity.purge-unverified', () => {
  it('xoá hẳn tài khoản chưa xác nhận quá 7 ngày, giữ tài khoản mới và tài khoản đã xác nhận', async () => {
    const make = (email: string, status: 'pending_verification' | 'active', daysAgo: number) =>
      repository.createAccount({
        email,
        emailNormalized: email,
        emailHash: 'h',
        passwordHash: 'x',
        googleSub: null,
        status,
        displayName: 'A',
        at: new Date(NOW.getTime() - daysAgo * DAY_MS),
      });
    const old = await make('cu@ghim.test', 'pending_verification', 8);
    const recent = await make('moi@ghim.test', 'pending_verification', 6);
    const active = await make('xong@ghim.test', 'active', 30);

    await createPurgeUnverifiedHandler({
      repository,
      config: createStaticRuntimeConfig(),
      clock: () => NOW,
    })();

    expect(await repository.findAccountById(old.id)).toBeNull();
    expect(await repository.findAccountById(recent.id)).not.toBeNull();
    expect(await repository.findAccountById(active.id)).not.toBeNull();
  });
});
