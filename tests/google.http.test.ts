import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toOk } from '../src/common/schemas/response.js';
import type {
  GoogleIdentity,
  GoogleTokenVerifier,
} from '../src/modules/identity/google.verifier.js';
import { hashPassword } from '../src/modules/identity/password.calc.js';
import { lastOutboxEvent, prisma } from './db-helpers.js';
import { buildTestApp, repositories, TEST_AUDIT } from './test-app.js';

/* Requirement Google của spec `registration`: bản verifier giả trả identity theo token đã đăng ký. */
const NOW = new Date('2026-10-10T09:00:00+07:00');

const repository = repositories.identity;
let app: FastifyInstance;
const identities = new Map<string, GoogleIdentity>();
const verifier: GoogleTokenVerifier = {
  verify: async (idToken) => identities.get(idToken) ?? null,
};

beforeAll(async () => {
  app = await buildTestApp({ googleVerifier: verifier, clock: () => NOW });
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
      picture: null,
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
    expect(await lastOutboxEvent()).toMatchObject({ type: 'identity.account.verified' });
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
      picture: null,
    });
    const res = await google('tok-cu');
    expect(res.statusCode).toBe(200);
    const rows = await prisma.account.findMany({
      where: { emailNormalized: 'lanhoang@gmail.com' },
    });
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
      picture: null,
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
      picture: null,
    });
    expect((await google('tok-khoa')).statusCode).toBe(200);
    const account = await repository.findAccountByEmail('khoa@gmail.com');
    expect(account?.displayName).toBe('khoa');
    await repository.lockAccount({
      accountId: account?.id ?? '',
      reason: 'Thử',
      lockedBy: TEST_AUDIT.actorId,
      at: NOW,
      events: [],
      audit: TEST_AUDIT,
    });
    expect((await google('tok-khoa')).json().error.code).toBe('ACCOUNT_LOCKED');
  });
});

const PICTURE = 'https://lh3.googleusercontent.com/a/anh-1';
const meOf = async (res: { json(): { data: { accessToken: string } } }) =>
  (
    await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${res.json().data.accessToken}` },
    })
  ).json().data as { id: string; avatarUrl: string | null };

describe('ảnh đại diện Google (spec identity/profile, media/image-storage)', () => {
  it('tài khoản mới tạo bằng Google dùng ngay ảnh Google', async () => {
    identities.set('tok-anh', {
      sub: 'g-anh',
      email: 'anh@gmail.com',
      emailVerified: true,
      name: 'Ánh',
      picture: PICTURE,
    });
    const me = await meOf(await google('tok-anh'));
    expect(me.avatarUrl).toBe(PICTURE);
    const profile = await app.inject({ method: 'GET', url: `/api/v1/users/${me.id}` });
    expect(profile.json().data.avatarUrl).toBe(PICTURE);
  });

  it('Google đổi ảnh → lần đăng nhập sau lấy ảnh mới; Google bỏ ảnh → hồ sơ không còn ảnh', async () => {
    identities.set('tok-doi', {
      sub: 'g-doi',
      email: 'doi@gmail.com',
      emailVerified: true,
      name: 'Đổi',
      picture: PICTURE,
    });
    await google('tok-doi');
    identities.set('tok-doi', {
      sub: 'g-doi',
      email: 'doi@gmail.com',
      emailVerified: true,
      name: 'Đổi',
      picture: `${PICTURE}-moi`,
    });
    expect((await meOf(await google('tok-doi'))).avatarUrl).toBe(`${PICTURE}-moi`);
    identities.set('tok-doi', {
      sub: 'g-doi',
      email: 'doi@gmail.com',
      emailVerified: true,
      name: 'Đổi',
      picture: null,
    });
    expect((await meOf(await google('tok-doi'))).avatarUrl).toBeNull();
  });

  it('tài khoản email có sẵn nối Google: nhận ảnh Google nhưng không tự đổi ảnh đại diện', async () => {
    await repository.createAccount({
      email: 'noi@gmail.com',
      emailNormalized: 'noi@gmail.com',
      emailHash: 'h-noi',
      passwordHash: await hashPassword('ghim-rao-vat-2026!'),
      googleSub: null,
      status: 'active',
      displayName: 'Nối',
      at: NOW,
    });
    identities.set('tok-noi', {
      sub: 'g-noi',
      email: 'noi@gmail.com',
      emailVerified: true,
      name: 'Nối',
      picture: PICTURE,
    });
    expect((await meOf(await google('tok-noi'))).avatarUrl).toBeNull();
    const account = await repository.findAccountByEmail('noi@gmail.com');
    expect(account?.googlePictureUrl).toBe(PICTURE);
  });
});
