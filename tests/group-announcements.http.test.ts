import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createUnit,
  deliverAll,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { buildTestApp } from './test-app.js';

/* Spec `notification/group-announcements` của add-notification-core qua HTTP và bộ phát outbox thật. */
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const post = (group: ActiveGroup, by: TestUser, payload: object) =>
  api(app, 'POST', `/groups/${group.groupId}/announcements`, by.token, payload);

/** Ai đã nhận thông báo có nội dung này — đọc sau khi bộ phát chạy hết. */
const recipientsOf = async (body: string) => {
  await deliverAll(app);
  const rows = await prisma.notification.findMany({
    where: { type: 'group.announcement.posted', body },
    select: { recipientId: true, category: true },
  });
  expect(rows.every((row) => row.category === 'group_announcements')).toBe(true);
  return new Set(rows.map((row) => row.recipientId));
};

describe('Chủ nhóm và điều hành viên gửi thông báo cho nhóm', () => {
  it('chủ nhóm gửi: 201, mọi thành viên trừ chủ nhóm nhận', async () => {
    const group = await createActiveGroup(app);
    const first = await addMember(app, group.groupId);
    const second = await addMember(app, group.groupId);
    const res = await post(group, group.owner, { body: 'Chủ nhật họp lớp' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().data).toMatchObject({ groupId: group.groupId, unitId: null });
    expect(await recipientsOf('Chủ nhật họp lớp')).toEqual(new Set([first.id, second.id]));
  });

  it('điều hành viên cả nhóm gửi: mọi thành viên trừ người gửi nhận, kể cả chủ nhóm', async () => {
    const group = await createActiveGroup(app);
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    const member = await addMember(app, group.groupId);
    const res = await post(group, moderator, { body: 'Nhớ đóng quỹ' });
    expect(res.statusCode, res.body).toBe(201);
    expect(await recipientsOf('Nhớ đóng quỹ')).toEqual(new Set([group.owner.id, member.id]));
  });

  it('điều hành viên đơn vị gửi: chỉ thành viên đơn vị đó nhận', async () => {
    const group = await createActiveGroup(app, { kind: 'school' });
    const a1 = await createUnit(app, group, 'Lớp 12A1');
    const a2 = await createUnit(app, group, 'Lớp 12A2');
    const teacher = await addMember(app, group.groupId);
    await appointModerator(app, group, teacher, a1);
    const inA1 = await addMember(app, group.groupId, { unitId: a1 });
    await addMember(app, group.groupId, { unitId: a2 });
    const res = await post(group, teacher, { body: 'Lớp mình nghỉ' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().data.unitId).toBe(a1);
    expect(await recipientsOf('Lớp mình nghỉ')).toEqual(new Set([inA1.id]));
  });

  it('thành viên thường: 403 FORBIDDEN, không ai nhận', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const res = await post(group, member, { body: 'Tôi muốn báo' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    expect(await recipientsOf('Tôi muốn báo')).toEqual(new Set());
  });

  it('nội dung rỗng hay dài 1001 ký tự: 400 VALIDATION_ERROR, không ai nhận', async () => {
    const group = await createActiveGroup(app);
    await addMember(app, group.groupId);
    const tooLong = 'ư'.repeat(1001);
    await sequentially(['   ', tooLong], async (body) => {
      const res = await post(group, group.owner, { body });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
    expect(await recipientsOf(tooLong.slice(0, 100))).toEqual(new Set());
  });

  it('dài đúng 1000 ký tự có dấu: được gửi', async () => {
    const group = await createActiveGroup(app);
    const res = await post(group, group.owner, { body: 'ư'.repeat(1000) });
    expect(res.statusCode, res.body).toBe(201);
  });

  it('thông báo thứ sáu trong ngày: 429 ANNOUNCEMENT_LIMIT, không ai nhận', async () => {
    const group = await createActiveGroup(app);
    await addMember(app, group.groupId);
    await sequentially([1, 2, 3, 4, 5], async (index) => {
      const res = await post(group, group.owner, { body: `Thông báo ${index}` });
      expect(res.statusCode, res.body).toBe(201);
    });
    const sixth = await post(group, group.owner, { body: 'Thông báo thứ sáu' });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('ANNOUNCEMENT_LIMIT');
    expect(await recipientsOf('Thông báo thứ sáu')).toEqual(new Set());
  });

  it('nhóm đang tạm khoá: 409 GROUP_STATE_CONFLICT', async () => {
    const group = await createActiveGroup(app);
    const lock = await api(app, 'POST', `/ops/groups/${group.groupId}/lock`, group.master.token, {
      reason: 'Kiểm tra',
    });
    expect(lock.statusCode, lock.body).toBe(204);
    const res = await post(group, group.owner, { body: 'Vẫn gửi' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GROUP_STATE_CONFLICT');
  });

  it('người đã rời và người bị cấm không nhận', async () => {
    const group = await createActiveGroup(app);
    const stays = await addMember(app, group.groupId);
    const leaver = await addMember(app, group.groupId);
    const banned = await addMember(app, group.groupId);
    expect(
      (await api(app, 'POST', `/groups/${group.groupId}/leave`, leaver.token)).statusCode,
    ).toBe(204);
    const ban = await api(
      app,
      'PUT',
      `/groups/${group.groupId}/bans/${banned.id}`,
      group.owner.token,
    );
    expect(ban.statusCode, ban.body).toBe(204);
    expect((await post(group, group.owner, { body: 'Sau khi rời' })).statusCode).toBe(201);
    expect(await recipientsOf('Sau khi rời')).toEqual(new Set([stays.id]));
  });
});

describe('Thành viên xem lại thông báo của nhóm', () => {
  it('thành viên thấy thông báo cả nhóm và của đơn vị mình, mới nhất trước; không thấy của đơn vị khác', async () => {
    const group = await createActiveGroup(app, { kind: 'school' });
    const a1 = await createUnit(app, group, 'Lớp 11A1');
    const a2 = await createUnit(app, group, 'Lớp 11A2');
    const student = await addMember(app, group.groupId, { unitId: a1 });
    await sequentially(
      [
        { body: 'Cả trường nghỉ lễ' },
        { body: 'Riêng 11A1', unitId: a1 },
        { body: 'Riêng 11A2', unitId: a2 },
      ],
      async (payload) => {
        expect((await post(group, group.owner, payload)).statusCode).toBe(201);
      },
    );
    const res = await api(app, 'GET', `/groups/${group.groupId}/announcements`, student.token);
    expect(res.statusCode, res.body).toBe(200);
    const bodies = (res.json().data.items as Array<{ body: string }>).map((item) => item.body);
    expect(bodies).toEqual(['Riêng 11A1', 'Cả trường nghỉ lễ']);
  });

  it('người ngoài xem thông báo của nhóm công khai: 403 FORBIDDEN', async () => {
    const group = await createActiveGroup(app, { mode: 'public_open' });
    const outsider = await newUser(app);
    const res = await api(app, 'GET', `/groups/${group.groupId}/announcements`, outsider.token);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});
