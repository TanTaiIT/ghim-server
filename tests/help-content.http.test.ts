import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditOf } from './db-helpers.js';
import { api, newMaster, newUser, type TestUser } from './group-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec `platform/help-content` (change add-help-content) qua HTTP. DB test được làm sạch sau migration nên không có bốn chủ
 * đề nạp sẵn; các ca chạy nối nhau trên cùng danh sách nên mỗi ca đọc lại danh sách hiện tại thay vì đếm cứng.
 */
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => TEST_NOW });
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

type Topic = { id: string; label: string; faqs: { q: string; a: string }[] };
const topics = async (): Promise<Topic[]> => {
  const res = await api(app, 'GET', '/help/topics');
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data as Topic[];
};
const body = (label: string) => ({
  label,
  faqs: [{ q: `${label}: hỏi gì?`, a: 'Trả lời ngắn.' }],
});

describe('ai cũng đọc trợ giúp', () => {
  it('khách đọc được mọi chủ đề, chủ đề thêm sau đứng cuối', async () => {
    const before = (await topics()).map((t) => t.id);
    const first = await api(app, 'POST', '/ops/help/topics', master.token, body('Đăng tin'));
    const second = await api(app, 'POST', '/ops/help/topics', master.token, body('Báo cáo'));
    const ids = [first, second].map((res) => (res.json().data as Topic).id);
    expect((await topics()).map((t) => t.id)).toEqual([...before, ...ids]);
  });
});

describe('master soạn trợ giúp', () => {
  it('thêm → 201, đứng cuối; sửa → 200, đọc lại thấy nội dung mới; mỗi lượt ghi nhật ký', async () => {
    const created = await api(app, 'POST', '/ops/help/topics', master.token, body('Giao hàng'));
    expect(created.statusCode, created.body).toBe(201);
    const { id } = created.json().data as Topic;
    expect((await topics()).at(-1)).toMatchObject({ id, label: 'Giao hàng' });
    const updated = await api(app, 'PUT', `/ops/help/topics/${id}`, master.token, {
      label: 'Giao hàng & nhận hàng',
      faqs: [
        { q: 'Ai trả phí ship?', a: 'Hai bên tự thoả thuận.' },
        { q: 'Có thu hộ không?', a: 'Ghim không giữ tiền của ai.' },
      ],
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect((await topics()).find((t) => t.id === id)?.faqs).toHaveLength(2);
    expect((await auditOf(id)).map((row) => row.action)).toEqual([
      'platform.help.create',
      'platform.help.update',
    ]);
  });

  it('chủ đề không có câu hỏi nào, tên quá dài → 400 VALIDATION_ERROR', async () => {
    const bad = [
      { label: 'Trống', faqs: [] },
      { label: 'x'.repeat(81), faqs: body('x').faqs },
    ];
    const responses = await Promise.all(
      bad.map((payload) => api(app, 'POST', '/ops/help/topics', master.token, payload)),
    );
    for (const res of responses) {
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('xoá → 204, chủ đề biến khỏi danh sách; xoá lần nữa hay sửa chủ đề không có → 404 NOT_FOUND', async () => {
    const { id } = (await api(app, 'POST', '/ops/help/topics', master.token, body('Tạm'))).json()
      .data as Topic;
    expect((await api(app, 'DELETE', `/ops/help/topics/${id}`, master.token)).statusCode).toBe(204);
    expect((await topics()).some((t) => t.id === id)).toBe(false);
    const again = await api(app, 'DELETE', `/ops/help/topics/${id}`, master.token);
    expect(again.statusCode).toBe(404);
    expect(again.json().error.code).toBe('NOT_FOUND');
    const edit = await api(app, 'PUT', `/ops/help/topics/${id}`, master.token, body('Tạm'));
    expect(edit.statusCode).toBe(404);
  });

  it('sắp lại bằng mã mọi chủ đề → 204, thứ tự đổi; thiếu một chủ đề → 409 CONFLICT, thứ tự giữ nguyên', async () => {
    const ids = (await topics()).map((t) => t.id);
    const reversed = ids.toReversed();
    expect(
      (await api(app, 'PUT', '/ops/help/order', master.token, { ids: reversed })).statusCode,
    ).toBe(204);
    expect((await topics()).map((t) => t.id)).toEqual(reversed);
    const partial = await api(app, 'PUT', '/ops/help/order', master.token, { ids: ids.slice(1) });
    expect(partial.statusCode).toBe(409);
    expect(partial.json().error.code).toBe('CONFLICT');
    expect((await topics()).map((t) => t.id)).toEqual(reversed);
  });
});

describe('chỉ master soạn trợ giúp', () => {
  it('staff → 403 FORBIDDEN; khách → 401 UNAUTHORIZED; người dùng thường → 403', async () => {
    const staff = await newUser(app);
    await grantStaff(staff.id, ['support']);
    const user = await newUser(app);
    expect((await api(app, 'POST', '/ops/help/topics', staff.token, body('S'))).statusCode).toBe(
      403,
    );
    expect((await api(app, 'POST', '/ops/help/topics', user.token, body('U'))).statusCode).toBe(
      403,
    );
    expect((await api(app, 'POST', '/ops/help/topics', undefined, body('K'))).statusCode).toBe(401);
  });
});
