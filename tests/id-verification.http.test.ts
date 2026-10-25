import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditOf } from './db-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { buildTestApp, grantStaff, repositories } from './test-app.js';

/*
 * Các scenario của spec `id-verification` (kể cả "Người nộp xem được hồ sơ của mình", add-id-verification-status), và số
 * giấy tờ không xuất hiện ở bất kỳ response nào.
 */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const DOCUMENT_NUMBER = '079123456789';

const repository = repositories.identity;
let app: FastifyInstance;
let reviewerToken: string;
let otherStaffToken: string;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => NOW });
  await app.ready();
  const reviewer = await seedAccount({}, NOW);
  await grantStaff(reviewer.id, ['id_verification']);
  reviewerToken = await tokenFor(app, reviewer.id);
  const other = await seedAccount({}, NOW);
  await grantStaff(other.id, ['support']);
  otherStaffToken = await tokenFor(app, other.id);
});

afterAll(() => app.close());

const submit = (
  token: string,
  payload: object = {
    documentType: 'cccd',
    documentNumber: DOCUMENT_NUMBER,
    fullName: 'Nguyễn Văn A',
  },
) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/me/id-verification',
    headers: { authorization: `Bearer ${token}` },
    payload,
  });

const mine = (token: string | null) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/me/id-verification',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const list = (token: string, query = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/ops/id-verifications${query}`,
    headers: { authorization: `Bearer ${token}` },
  });

const decide = (id: string, token: string, payload: object) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/ops/id-verifications/${id}/decision`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });

describe('POST /me/id-verification', () => {
  it('nộp giấy tờ → 201 chờ duyệt; số giấy tờ được mã hoá, không nằm trong response', async () => {
    const user = await seedAccount({}, NOW);
    const token = await tokenFor(app, user.id);
    const res = await submit(token);
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      accountId: user.id,
      status: 'pending',
      documentType: 'cccd',
    });
    expect(JSON.stringify(res.json())).not.toContain(DOCUMENT_NUMBER);
    const row = await repository.findLatestIdVerification(user.id);
    expect(row?.documentNumberEnc).not.toContain(DOCUMENT_NUMBER);
  });

  it('nộp tiếp khi đang có hồ sơ chờ duyệt → 409 CONFLICT', async () => {
    const user = await seedAccount({}, NOW);
    const token = await tokenFor(app, user.id);
    await submit(token);
    const res = await submit(token);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
  });
});

describe('GET /me/id-verification', () => {
  it('chưa nộp lần nào → 200, không có hồ sơ', async () => {
    const user = await seedAccount({}, NOW);
    const res = await mine(await tokenFor(app, user.id));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
  });

  it('vừa nộp → 200, chờ duyệt, không có số giấy tờ', async () => {
    const user = await seedAccount({}, NOW);
    const token = await tokenFor(app, user.id);
    const { id } = (await submit(token)).json().data;
    const res = await mine(token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      id,
      status: 'pending',
      reviewedAt: null,
      reason: null,
    });
    expect(res.body).not.toContain(DOCUMENT_NUMBER);
  });

  it('bị từ chối → 200, đúng lý do và lúc duyệt, không nêu người duyệt; nộp lại → hồ sơ mới chờ duyệt', async () => {
    const user = await seedAccount({}, NOW);
    const token = await tokenFor(app, user.id);
    const { id } = (await submit(token)).json().data;
    await decide(id, reviewerToken, { status: 'rejected', reason: 'Ảnh mờ' });
    const rejected = await mine(token);
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().data).toMatchObject({
      id,
      status: 'rejected',
      reason: 'Ảnh mờ',
      reviewedAt: NOW.toISOString(),
    });
    expect(rejected.json().data).not.toHaveProperty('reviewedBy');
    const again = (await submit(token)).json().data;
    expect((await mine(token)).json().data).toMatchObject({ id: again.id, status: 'pending' });
  });

  it('khách → 401 UNAUTHORIZED', async () => {
    const res = await mine(null);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('/ops/id-verifications', () => {
  it('staff không được giao việc duyệt giấy tờ → 403 FORBIDDEN ở cả danh sách và quyết định', async () => {
    expect((await list(otherStaffToken)).json().error.code).toBe('FORBIDDEN');
    expect(
      (
        await decide('00000000-0000-7000-8000-000000000000', otherStaffToken, {
          status: 'verified',
        })
      ).json().error.code,
    ).toBe('FORBIDDEN');
  });

  it('staff được giao việc duyệt → hồ sơ chuyển sang đã xác minh; duyệt lần hai → 409', async () => {
    const user = await seedAccount({}, NOW);
    const { id } = (await submit(await tokenFor(app, user.id))).json().data;
    const pending = await list(reviewerToken, '?status=pending');
    expect(pending.json().data.items.map((row: { id: string }) => row.id)).toContain(id);
    expect(JSON.stringify(pending.json())).not.toContain(DOCUMENT_NUMBER);

    const res = await decide(id, reviewerToken, { status: 'verified' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      status: 'verified',
      reviewedAt: NOW.toISOString(),
      reason: null,
    });
    expect((await decide(id, reviewerToken, { status: 'verified' })).statusCode).toBe(409);
    // Một dòng cho lượt duyệt thành công, không dòng nào cho lượt 409.
    expect(await auditOf(id)).toMatchObject([
      {
        actorRole: 'user',
        action: 'identity.id_verification.decide',
        targetType: 'id_verification',
        details: { status: 'verified' },
      },
    ]);
  });

  it('từ chối không có lý do → 400; có lý do → bị từ chối, và người đó vẫn dùng app như trước', async () => {
    const user = await seedAccount({}, NOW);
    const userToken = await tokenFor(app, user.id);
    const { id } = (await submit(userToken)).json().data;
    expect((await decide(id, reviewerToken, { status: 'rejected' })).json().error.code).toBe(
      'VALIDATION_ERROR',
    );

    const res = await decide(id, reviewerToken, { status: 'rejected', reason: 'Ảnh mờ' });
    expect(res.json().data).toMatchObject({ status: 'rejected', reason: 'Ảnh mờ' });

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(JSON.stringify(me.json())).not.toMatch(/verification|giấy tờ|rejected/i);
    expect((await submit(userToken)).statusCode).toBe(201);
  });

  it('hồ sơ công khai của người đã xác minh không chứa số giấy tờ', async () => {
    const user = await seedAccount({}, NOW);
    const { id } = (await submit(await tokenFor(app, user.id))).json().data;
    await decide(id, reviewerToken, { status: 'verified' });
    const profile = await app.inject({ method: 'GET', url: `/api/v1/users/${user.id}` });
    expect(profile.statusCode).toBe(200);
    expect(JSON.stringify(profile.json())).not.toContain(DOCUMENT_NUMBER);
  });

  it('staff duyệt hồ sơ của chính mình → 403 FORBIDDEN, hồ sơ vẫn chờ (fix-audit-identity-low, L2)', async () => {
    const self = await seedAccount({}, NOW);
    await grantStaff(self.id, ['id_verification']);
    const selfToken = await tokenFor(app, self.id);
    const { id } = (await submit(selfToken)).json().data;
    const res = await decide(id, selfToken, { status: 'verified' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    expect(await repository.findLatestIdVerification(self.id)).toMatchObject({
      id,
      status: 'pending',
    });
    expect(await auditOf(id)).toEqual([]);
  });

  it('hai staff cùng duyệt một hồ sơ → một 200, một 409, hồ sơ mang kết quả lượt thắng (L2)', async () => {
    const user = await seedAccount({}, NOW);
    const { id } = (await submit(await tokenFor(app, user.id))).json().data;
    const second = await seedAccount({}, NOW);
    await grantStaff(second.id, ['id_verification']);
    const [verified, rejected] = await Promise.all([
      decide(id, reviewerToken, { status: 'verified' }),
      decide(id, await tokenFor(app, second.id), { status: 'rejected', reason: 'Ảnh mờ' }),
    ]);
    expect([verified.statusCode, rejected.statusCode].toSorted()).toEqual([200, 409]);
    const winner = verified.statusCode === 200 ? 'verified' : 'rejected';
    expect(await repository.findIdVerificationById(id)).toMatchObject({ status: winner });
    expect(await auditOf(id)).toHaveLength(1);
  });

  it('hồ sơ không có → 404', async () => {
    expect(
      (await decide('00000000-0000-7000-8000-000000000000', reviewerToken, { status: 'verified' }))
        .statusCode,
    ).toBe(404);
  });
});
