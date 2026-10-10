import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toOk } from '../src/common/schemas/response.js';
import type {
  GoogleIdentity,
  GoogleTokenVerifier,
} from '../src/modules/identity/google.verifier.js';
import { hashPassword } from '../src/modules/identity/password.calc.js';
import {
  createFakeIdentityRepository,
  type FakeIdentityRepository,
} from './fakes/identity-repository.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { TEST_AUDIT } from './fakes/audit.fake.js';
import { buildTestApp } from './fakes/app.js';

/* Requirement Google của spec `registration`: bản verifier giả trả identity theo token đã đăng ký. */
const NOW = new Date('2026-10-10T09:00:00+07:00');

let app: FastifyInstance;
let repository: FakeIdentityRepository;
const identities = new Map<string, GoogleIdentity>();
const verifier: GoogleTokenVerifier = {
  verify: async (idToken) => identities.get(idToken) ?? null,
};

beforeAll(async () => {
  repository = createFakeIdentityRepository();
  app = await buildTestApp({
    repositories: { identity: repository },
    jobs: createFakeJobs(),
    googleVerifier: verifier,
    clock: () => NOW,
  });
  app.get('/__test/me', { preHandler: [app.authenticate] }, async (request) => toOk(request.actor));
  await app.ready();
});

afterAll(() => app.close());

const google = (idToken: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/google',
    payload: { idToken, deviceName: 'Pixel' },
  });

describe('POST /auth/google', () => {
  it('lần đầu → tài khoản mới ở trạng thái đã xác nhận, đăng nhập được ngay', async () => {
    identities.set('tok-moi', {
      sub: 'g-1',
      email: 'moi@gmail.com',
      emailVerified: true,
      name: 'Lan Hoàng',
    });
    const res = await google('tok-moi');
    expect(res.statusCode).toBe(200);
    const account = await repository.findAccountByEmail('moi@gmail.com');
    expect(account).toMatchObject({
      status: 'active',
      googleSub: 'g-1',
      passwordHash: null,
      displayName: 'Lan Hoàng',
    });
    expect(repository.events.at(-1)).toMatchObject({ type: 'identity.account.verified' });
    const me = await app.inject({
      method: 'GET',
      url: '/__test/me',
      headers: { authorization: `Bearer ${res.json().data.accessToken}` },
    });
    expect(me.json().data).toMatchObject({ accountId: account?.id, emailVerified: true });
  });

  it('email trùng (sau chuẩn hoá) một tài khoản đã có → vào đúng tài khoản đó, vẫn chỉ một tài khoản', async () => {
    const existing = await repository.createAccount({
      email: 'lanhoang@gmail.com',
      emailNormalized: 'lanhoang@gmail.com',
      emailHash: 'h',
      passwordHash: await hashPassword('ghim-rao-vat-2026!'),
      googleSub: null,
      status: 'pending_verification',
      displayName: 'Lan',
      at: NOW,
    });
    identities.set('tok-cu', {
      sub: 'g-2',
      email: 'Lan.Hoang@googlemail.com',
      emailVerified: true,
      name: null,
    });
    const res = await google('tok-cu');
    expect(res.statusCode).toBe(200);
    const rows = [...repository.accounts.values()].filter(
      (row) => row.emailNormalized === 'lanhoang@gmail.com',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: existing.id, googleSub: 'g-2', status: 'active' });

    // Lần sau nhận ra bằng sub, không cần email nữa.
    expect((await google('tok-cu')).statusCode).toBe(200);
  });

  it('token sai hoặc Google chưa xác thực email → 401 INVALID_CREDENTIALS', async () => {
    expect((await google('tok-bia')).statusCode).toBe(401);
    expect((await google('tok-bia')).json().error.code).toBe('INVALID_CREDENTIALS');
    identities.set('tok-chua-xac-thuc', {
      sub: 'g-3',
      email: 'chua@gmail.com',
      emailVerified: false,
      name: null,
    });
    expect((await google('tok-chua-xac-thuc')).json().error.code).toBe('INVALID_CREDENTIALS');
    expect(await repository.findAccountByEmail('chua@gmail.com')).toBeNull();
  });

  it('tài khoản bị khoá → 403 ACCOUNT_LOCKED; tên Google trùng tên dành riêng thì dùng phần trước @', async () => {
    identities.set('tok-khoa', {
      sub: 'g-4',
      email: 'khoa@gmail.com',
      emailVerified: true,
      name: 'Quản trị hệ thống',
    });
    expect((await google('tok-khoa')).statusCode).toBe(200);
    const account = await repository.findAccountByEmail('khoa@gmail.com');
    expect(account?.displayName).toBe('khoa');
    await repository.lockAccount({
      accountId: account?.id ?? '',
      reason: 'Thử',
      lockedBy: 'm',
      at: NOW,
      events: [],
      audit: TEST_AUDIT,
    });
    expect((await google('tok-khoa')).json().error.code).toBe('ACCOUNT_LOCKED');
  });
});
