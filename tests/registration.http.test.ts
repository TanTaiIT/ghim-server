import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createFakeMailer, type FakeMailer } from '../src/lib/mailer.js';
import { lastOutboxEvent, prisma } from './db-helpers.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { buildTestApp, repositories, TEST_AUDIT } from './test-app.js';

/*
 * Mọi scenario của bốn requirement đầu spec `registration` + requirement đăng ký lại của
 * `account-deletion`, chạy trên app thật với việc nền giả (thư chỉ "đi" khi test gọi `runAll`) và
 * đồng hồ chỉnh được — "sau 10 phút" là một phép cộng, không phải chờ.
 */
const START = new Date('2026-10-10T09:00:00+07:00');
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

let now = START;
let app: FastifyInstance;
const repository = repositories.identity;
let jobs: FakeJobs;
let mailer: FakeMailer;

beforeAll(async () => {
  jobs = createFakeJobs();
  mailer = createFakeMailer();
  app = await buildTestApp({ jobs, mailer, clock: () => now });
  await app.ready();
});

afterAll(() => app.close());

beforeEach(() => {
  now = START;
});

const advance = (ms: number): void => {
  now = new Date(now.getTime() + ms);
};

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, payload: payload as object });

let seq = 0;
const nextEmail = (): string => {
  seq += 1;
  return `nguoi${seq}@ghim.test`;
};

const register = (overrides: Record<string, unknown> = {}) =>
  post('/auth/register', {
    email: nextEmail(),
    password: 'ghim-rao-vat-2026!',
    displayName: 'Người thử',
    ...overrides,
  });

/** Thư "đi" rồi đọc mã trong tiêu đề — đúng đường người dùng thật đi. */
async function lastCode(): Promise<string> {
  await jobs.runAll();
  const subject = mailer.sent.at(-1)?.subject ?? '';
  const code = /\d{6}/.exec(subject)?.[0];
  if (!code) throw new Error('Thư cuối không có mã 6 chữ số');
  return code;
}

async function deletedAccount(daysAgo: number): Promise<string> {
  const email = nextEmail();
  const account = await repository.createAccount({
    email,
    emailNormalized: email,
    emailHash: 'h',
    passwordHash: 'x',
    googleSub: null,
    status: 'active',
    displayName: 'Cũ',
    at: new Date(START.getTime() - (daysAgo + 1) * DAY_MS),
  });
  await repository.softDeleteAccount({
    accountId: account.id,
    at: new Date(START.getTime() - daysAgo * DAY_MS),
    events: [],
  });
  return email;
}

async function registered(): Promise<{ email: string; code: string }> {
  const email = nextEmail();
  const res = await post('/auth/register', {
    email,
    password: 'ghim-rao-vat-2026!',
    displayName: 'Người thử',
  });
  expect(res.statusCode).toBe(201);
  return { email, code: await lastCode() };
}

describe('POST /auth/register', () => {
  it('đăng ký thành công → 201, tài khoản chưa xác nhận, một mã gửi tới đúng email, không SMS', async () => {
    const email = nextEmail();
    const sentBefore = mailer.sent.length;
    const res = await post('/auth/register', {
      email,
      password: 'ghim-rao-vat-2026!',
      displayName: 'Lan Hoàng',
    });
    expect(res.statusCode).toBe(201);
    const { accountId } = res.json().data;
    expect(await repository.findAccountById(accountId)).toMatchObject({
      status: 'pending_verification',
      phone: null,
    });

    expect(jobs.sent.map((job) => job.name)).toEqual(['identity.send-mail']);
    await jobs.runAll();
    expect(mailer.sent).toHaveLength(sentBefore + 1);
    expect(mailer.sent.at(-1)).toMatchObject({ to: email });
    expect(mailer.sent.at(-1)?.subject).toMatch(/\d{6}/);
  });

  it('thiếu email → 400 VALIDATION_ERROR', async () => {
    const res = await post('/auth/register', {
      password: 'ghim-rao-vat-2026!',
      displayName: 'A B',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('mật khẩu 7 ký tự → 400 PASSWORD_WEAK nêu độ dài tối thiểu', async () => {
    const res = await register({ password: 'abcdefg' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({
      code: 'PASSWORD_WEAK',
      message: expect.stringContaining('8'),
    });
  });

  it('mật khẩu 12345678 → 400 PASSWORD_WEAK nói quá phổ biến', async () => {
    const res = await register({ password: '12345678' });
    expect(res.json().error).toMatchObject({
      code: 'PASSWORD_WEAK',
      message: expect.stringContaining('phổ biến'),
    });
  });

  it('tên hiển thị giả bộ phận quản lý → 400 DISPLAY_NAME_RESERVED', async () => {
    const res = await register({ displayName: 'quan tri he thong' });
    expect(res.json().error.code).toBe('DISPLAY_NAME_RESERVED');
  });

  describe('mỗi email một tài khoản, so sau khi chuẩn hoá', () => {
    it.each([
      ['lan@gmail.com', 'lan+2@gmail.com'],
      ['lanhoang@gmail.com', 'lan.hoang@googlemail.com'],
      ['minh@ghim.vn', 'Minh@Ghim.VN'],
    ])('%s đã có, đăng ký %s → 409 EMAIL_TAKEN', async (existing, attempt) => {
      expect((await register({ email: existing })).statusCode).toBe(201);
      const res = await register({ email: attempt });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('EMAIL_TAKEN');
    });

    it('dấu chấm ở miền không phải Gmail vẫn có nghĩa → tài khoản mới', async () => {
      expect((await register({ email: 'lanhoang@ghim.vn' })).statusCode).toBe(201);
      expect((await register({ email: 'lan.hoang@ghim.vn' })).statusCode).toBe(201);
    });
  });

  describe('email dùng một lần', () => {
    beforeAll(() =>
      repository.addManualDomain({ domain: 'tempmail.example', at: START, audit: TEST_AUDIT }),
    );

    it('miền trong danh sách → 400 EMAIL_DISPOSABLE bảo dùng email thường', async () => {
      const res = await register({ email: 'a@tempmail.example' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({
        code: 'EMAIL_DISPOSABLE',
        message: expect.stringContaining('email thường'),
      });
    });

    it('miền con của miền bị chặn → 400 EMAIL_DISPOSABLE', async () => {
      expect((await register({ email: 'a@mx.tempmail.example' })).json().error.code).toBe(
        'EMAIL_DISPOSABLE',
      );
    });
  });

  describe('email của tài khoản đã xoá', () => {
    it('xoá 10 ngày trước → 409 EMAIL_PENDING_DELETION kèm ngày được đăng ký lại', async () => {
      const res = await register({ email: await deletedAccount(10) });
      expect(res.statusCode).toBe(409);
      // 90 ngày sau lúc xoá = 80 ngày sau START (2026-10-10) → 29/12/2026
      expect(res.json().error).toMatchObject({
        code: 'EMAIL_PENDING_DELETION',
        message: expect.stringContaining('29/12/2026'),
      });
    });

    it('xoá quá 90 ngày → tài khoản mới được tạo như email chưa từng có', async () => {
      const email = await deletedAccount(91);
      const res = await register({ email });
      expect(res.statusCode).toBe(201);
      const rows = await prisma.account.findMany({ where: { emailNormalized: email } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: res.json().data.accountId,
        status: 'pending_verification',
      });
    });
  });
});

describe('POST /auth/verify-email', () => {
  it('đúng mã trong 10 phút → 200, tài khoản đã xác nhận, có sự kiện verified', async () => {
    const { email, code } = await registered();
    advance(9 * MINUTE_MS);
    const res = await post('/auth/verify-email', { email, code });
    expect(res.statusCode).toBe(200);
    const account = await repository.findAccountByEmail(email);
    expect(account?.status).toBe('active');
    expect(await lastOutboxEvent()).toMatchObject({
      type: 'identity.account.verified',
      payload: { accountId: account?.id },
    });
  });

  it('nhập lại mã sau khi đã xác nhận → vẫn 200', async () => {
    const { email, code } = await registered();
    await post('/auth/verify-email', { email, code });
    expect((await post('/auth/verify-email', { email, code })).statusCode).toBe(200);
  });

  it('đúng mã nhưng sau 10 phút → 400 CODE_EXPIRED, vẫn chưa xác nhận', async () => {
    const { email, code } = await registered();
    advance(10 * MINUTE_MS + 1);
    const res = await post('/auth/verify-email', { email, code });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('CODE_EXPIRED');
    expect((await repository.findAccountByEmail(email))?.status).toBe('pending_verification');
  });

  it('sai mã lần thứ nhất → 400 CODE_INVALID', async () => {
    const { email } = await registered();
    const res = await post('/auth/verify-email', { email, code: '000000' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('CODE_INVALID');
  });

  it('sai lần thứ 5 → CODE_INVALID, mã bị huỷ; nhập đúng mã cũ sau đó → CODE_EXPIRED', async () => {
    const { email, code } = await registered();
    const wrong = code === '000000' ? '111111' : '000000';
    // Tuần tự, không Promise.all: mỗi lần sai cộng một vào bộ đếm, chen nhau là đếm sai.
    const attemptWrong = async (times: number): Promise<void> => {
      if (times === 0) return;
      expect((await post('/auth/verify-email', { email, code: wrong })).json().error.code).toBe(
        'CODE_INVALID',
      );
      await attemptWrong(times - 1);
    };
    await attemptWrong(4);
    const fifth = await post('/auth/verify-email', { email, code: wrong });
    expect(fifth.json().error).toMatchObject({
      code: 'CODE_INVALID',
      message: expect.stringContaining('huỷ'),
    });
    expect((await post('/auth/verify-email', { email, code })).json().error.code).toBe(
      'CODE_EXPIRED',
    );
  });

  it('mã sai định dạng → 400 VALIDATION_ERROR', async () => {
    const { email } = await registered();
    expect((await post('/auth/verify-email', { email, code: 'abc' })).json().error.code).toBe(
      'VALIDATION_ERROR',
    );
  });
});

describe('POST /auth/resend-code', () => {
  it('xin gửi lại sau 30 giây → 429 RESEND_TOO_SOON kèm thời điểm được xin lại', async () => {
    const { email } = await registered();
    advance(30_000);
    const res = await post('/auth/resend-code', { email });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toMatchObject({
      code: 'RESEND_TOO_SOON',
      message: expect.stringMatching(/30 giây.*\d{2}:\d{2}:\d{2}/),
    });
  });

  it('xin mã mới sau 60 giây: mã cũ → CODE_INVALID, mã mới → 200', async () => {
    const { email, code: oldCode } = await registered();
    advance(60_000);
    expect((await post('/auth/resend-code', { email })).statusCode).toBe(200);
    const newCode = await lastCode();
    expect(newCode).not.toBe(oldCode);
    expect((await post('/auth/verify-email', { email, code: oldCode })).json().error.code).toBe(
      'CODE_INVALID',
    );
    expect((await post('/auth/verify-email', { email, code: newCode })).statusCode).toBe(200);
  });

  it('email không có tài khoản hay đã xác nhận → 200, không gửi gì', async () => {
    const sentBefore = jobs.sent.length;
    expect((await post('/auth/resend-code', { email: 'khong-co@ghim.test' })).statusCode).toBe(200);
    expect(jobs.sent).toHaveLength(sentBefore);
  });
});
