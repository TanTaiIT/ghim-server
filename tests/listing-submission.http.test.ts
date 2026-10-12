import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TooManyRequestsError } from '../src/common/errors/app-error.js';
import { createInterimTrust } from '../src/modules/listing/listing.ports.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  createActiveGroup,
  createUnit,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  createCategory,
  DEVICE,
  getOwn,
  groupSettings,
  listingApi,
  liveListingOf,
  patch,
  publishTemplate,
  readyDraft,
  setCategoryEnabled,
  someRegion,
  submit,
} from './listing-http-helpers.js';
import { buildTestApp } from './test-app.js';

/* Spec `listing/submission`, `listing/placement` qua HTTP: thứ tự kiểm của design mục 5, không dòng nào đổi khi lỗi. */
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const stateOf = async (id: string) =>
  (await prisma.listing.findUniqueOrThrow({ where: { id } })).state;
const submissionsOf = (listingId: string) =>
  prisma.listingSubmission.count({ where: { listingId } });

/** Gửi rồi kiểm lỗi trả về và nháp không đổi một cột nào. */
async function expectRefused(
  user: TestUser,
  draft: { id: string; version: number },
  status: number,
  code: string,
): Promise<void> {
  const before = await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } });
  const res = await submit(app, user, draft);
  expect(res.statusCode, res.body).toBe(status);
  expect(codeOf(res)).toBe(code);
  expect(await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(before);
  expect(await submissionsOf(draft.id)).toBe(0);
}

describe('Gửi nháp cho máy duyệt', () => {
  it('đủ điều kiện: tin sang đang kiểm, người khác mở tin nhận 404', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const draft = await readyDraft(app, owner);
    const res = await submit(app, owner, draft);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ state: 'checking', version: draft.version + 1 });
    expect((await listingApi(app, 'GET', `/listings/${draft.id}`, other)).statusCode).toBe(404);
  });

  it('gửi nháp của người khác: 404, nháp không đổi', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const draft = await readyDraft(app, owner);
    expect((await submit(app, other, draft)).statusCode).toBe(404);
    expect(await stateOf(draft.id)).toBe('draft');
  });

  it('thiếu x-device-id: 400 VALIDATION_ERROR — sau 404 của nháp người khác (thứ tự kiểm)', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const draft = await readyDraft(app, owner);
    expect((await submit(app, other, draft, null)).statusCode).toBe(404);
    const res = await submit(app, owner, draft, null);
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect(res.json().error.message).toContain('x-device-id');
    expect(await stateOf(draft.id)).toBe('draft');
  });

  it('mã máy thô không vào outbox; bên nghe của identity ghi dấu băm của máy', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner);
    await submit(app, owner, draft);
    const events = await prisma.outboxEvent.findMany({
      where: { type: 'listing.listing.submitted' },
    });
    const mine = events.find((event) => JSON.stringify(event.payload).includes(draft.id));
    expect(JSON.stringify(mine?.payload)).not.toContain(DEVICE);
    const deviceHash = (mine?.payload as { deviceHash?: string } | undefined)?.deviceHash ?? '';
    expect(deviceHash).toMatch(/^[0-9a-f]{64}$/);
    await deliverAll(app);
    expect(
      await prisma.devicePost.findUnique({
        where: { deviceHash_accountId: { deviceHash, accountId: owner.id } },
      }),
    ).not.toBeNull();
  });
});

describe('Chưa xác nhận email thì không gửi tin', () => {
  it('403 EMAIL_NOT_VERIFIED, nháp vẫn là nháp; xác nhận xong gửi lại thì sang đang kiểm', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner);
    await prisma.account.update({
      where: { id: owner.id },
      data: { status: 'pending_verification' },
    });
    await expectRefused(owner, draft, 403, 'EMAIL_NOT_VERIFIED');
    await prisma.account.update({ where: { id: owner.id }, data: { status: 'active' } });
    expect((await submit(app, owner, draft)).json().data.state).toBe('checking');
  });
});

describe('Thiếu điều kiện gửi thì báo ngay, không gửi gì', () => {
  it('danh mục đang tắt: 409 CATEGORY_DISABLED; bật lại rồi gửi thì sang đang kiểm', async () => {
    const owner = await newUser(app);
    const categoryId = await createCategory(app, master);
    const draft = await readyDraft(app, owner, { categoryId });
    await setCategoryEnabled(app, master, categoryId, false);
    await expectRefused(owner, draft, 409, 'CATEGORY_DISABLED');
    await setCategoryEnabled(app, master, categoryId, true);
    expect((await submit(app, owner, draft)).json().data.state).toBe('checking');
  });

  it('chưa có ảnh: 400 VALIDATION_ERROR nêu thiếu ảnh', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner, { imageIds: [] });
    await expectRefused(owner, draft, 400, 'VALIDATION_ERROR');
    expect((await submit(app, owner, draft)).json().error.message).toContain('ảnh');
  });

  it('để trống mô tả: vẫn gửi được', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner, { description: null });
    expect((await submit(app, owner, draft)).json().data.state).toBe('checking');
  });

  it('cổng chặn trong transaction (hạn mức của trust): 429, nháp nguyên nội dung và ảnh', async () => {
    // Thời gian chờ của `screening` có bên ném ở `add-screening`; ở đây cổng `trust` chứng minh luật chung: ném ở
    // bước 6 thì lượt gửi quay lui hết, kể cả dòng `listing_submissions` và nhãn ảnh.
    const blocked = await buildTestApp({
      trust: {
        ...createInterimTrust('T0'),
        assertCanSubmit: () =>
          Promise.reject(new TooManyRequestsError('Đợi chút', 'SUBMISSION_COOLDOWN')),
      },
    });
    try {
      const owner = await newUser(blocked);
      const draft = await readyDraft(blocked, owner);
      const before = await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } });
      const res = await submit(blocked, owner, draft);
      expect(res.statusCode).toBe(429);
      expect(codeOf(res)).toBe('SUBMISSION_COOLDOWN');
      expect(await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(before);
      expect(await submissionsOf(draft.id)).toBe(0);
    } finally {
      await blocked.close();
    }
  });
});

describe('Bấm Đăng hai lần chỉ ra một tin', () => {
  it('hai request cùng lúc: một tin đang kiểm, một lượt gửi, cả hai nhận cùng tin', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner);
    const [a, b] = await Promise.all([submit(app, owner, draft), submit(app, owner, draft)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json().data.id).toBe(b.json().data.id);
    expect(await stateOf(draft.id)).toBe('checking');
    expect(await submissionsOf(draft.id)).toBe(1);
  });

  it('request thứ hai tới sau: 200 đúng tin của lượt đầu, không tính thêm lượt gửi', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner);
    const first = (await submit(app, owner, draft)).json().data;
    const again = await submit(app, owner, draft);
    expect(again.statusCode).toBe(200);
    expect(again.json().data).toMatchObject({ id: first.id, version: first.version });
    expect(await submissionsOf(draft.id)).toBe(1);
  });
});

describe('Nơi đăng', () => {
  it('thành viên đúng một nhóm gửi khi chưa chọn nơi đăng: 400, không tự gán', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const draft = await readyDraft(app, member, { placement: null });
    await expectRefused(member, draft, 400, 'VALIDATION_ERROR');
    expect((await getOwn(app, member, draft.id)).placement).toBeNull();
  });

  it('chọn sàn chung, không chọn nhóm: được', async () => {
    const owner = await newUser(app);
    const sent = (await submit(app, owner, await readyDraft(app, owner))).json().data;
    expect(sent).toMatchObject({ placement: 'marketplace', groupId: null, state: 'checking' });
  });

  // Cặp nơi đăng ↔ nhóm là CHECK của bảng kể cả ở nháp, nên lỗi tới ngay lúc lưu lựa chọn đó — nháp không bao giờ
  // mang cặp sai để tới lượt gửi.
  it.each([
    ['"chỉ thành viên" mà không chọn nhóm', null, 400, 'VALIDATION_ERROR'],
    ['mã nhóm không tồn tại', randomUUID(), 404, 'NOT_FOUND'],
  ])('%s: lỗi ngay lúc lưu, nháp vẫn là nháp như trước', async (_name, groupId, status, code) => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner);
    const before = await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } });
    const res = await patch(app, owner, draft, { placement: 'members_only', groupId });
    expect(res.statusCode).toBe(status);
    expect(codeOf(res)).toBe(code);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(before);
  });

  it('thành viên đăng "chỉ thành viên", không khu vực: sang đang kiểm, không bị đòi khu vực', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const draft = await readyDraft(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
      provinceCode: null,
      wardCode: null,
    });
    expect((await submit(app, member, draft)).json().data).toMatchObject({
      state: 'checking',
      groupId: group.groupId,
      provinceCode: null,
    });
  });

  it('người ngoài đăng "chỉ thành viên": 403 NOT_GROUP_MEMBER', async () => {
    const group = await createActiveGroup(app);
    const outsider = await newUser(app);
    const draft = await readyDraft(app, outsider, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    await expectRefused(outsider, draft, 403, 'NOT_GROUP_MEMBER');
  });

  it('thành viên nhóm riêng tư chọn "nhóm công khai": 409 PLACEMENT_NOT_ALLOWED', async () => {
    const group = await createActiveGroup(app, { mode: 'private_code' });
    const member = await addMember(app, group.groupId);
    const draft = await readyDraft(app, member, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    await expectRefused(member, draft, 409, 'PLACEMENT_NOT_ALLOWED');
  });

  it('người ngoài vào nhóm công khai: được khi bật nhận tin người ngoài, 403 khi tắt', async () => {
    const group = await createActiveGroup(app);
    const outsider = await newUser(app);
    const draft = await readyDraft(app, outsider, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    await expectRefused(outsider, draft, 403, 'OUTSIDER_POSTS_DISABLED');
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    expect((await submit(app, outsider, draft)).json().data.state).toBe('checking');
  });

  it('người bị cấm gửi theo đường người ngoài: 403 GROUP_BANNED', async () => {
    const group = await createActiveGroup(app);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    const banned = await newUser(app);
    await listingApi(app, 'PUT', `/groups/${group.groupId}/bans/${banned.id}`, group.owner);
    const draft = await readyDraft(app, banned, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    await expectRefused(banned, draft, 403, 'GROUP_BANNED');
  });

  it('nhóm đang tạm khoá: 409 GROUP_LOCKED; nhóm đã đóng: 409 GROUP_CLOSED', async () => {
    const locked = await createActiveGroup(app, { master });
    const closed = await createActiveGroup(app, { master });
    const lockedMember = await addMember(app, locked.groupId);
    const closedMember = await addMember(app, closed.groupId);
    const toLocked = await readyDraft(app, lockedMember, {
      placement: 'members_only',
      groupId: locked.groupId,
    });
    const toClosed = await readyDraft(app, closedMember, {
      placement: 'members_only',
      groupId: closed.groupId,
    });
    await listingApi(app, 'POST', `/ops/groups/${locked.groupId}/lock`, master, { reason: 'Thử' });
    await listingApi(app, 'POST', `/groups/${closed.groupId}/close`, closed.owner);
    await expectRefused(lockedMember, toLocked, 409, 'GROUP_LOCKED');
    await expectRefused(closedMember, toClosed, 409, 'GROUP_CLOSED');
  });

  it('thành viên lớp 10A gửi "chỉ thành viên": tin tự mang đơn vị 10A', async () => {
    const group = await createActiveGroup(app);
    const unitId = await createUnit(app, group, '10A');
    const student = await addMember(app, group.groupId, { unitId });
    const draft = await readyDraft(app, student, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect((await submit(app, student, draft)).json().data.unitId).toBe(unitId);
  });
});

describe('Danh mục, mẫu thông tin', () => {
  it('chưa chọn danh mục: 400 VALIDATION_ERROR', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner, { categoryId: null });
    await expectRefused(owner, draft, 400, 'VALIDATION_ERROR');
  });

  it('sửa tin đang hiển thị sang danh mục đang tắt: 409 CATEGORY_DISABLED, tin không đổi', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    const off = await createCategory(app, master);
    await setCategoryEnabled(app, master, off, false);
    const res = await patch(app, owner, live, { categoryId: off });
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('CATEGORY_DISABLED');
    expect(await getOwn(app, owner, live.id)).toMatchObject({
      categoryId: live.categoryId,
      state: 'live',
      version: live.version,
    });
  });

  const hang = { name: 'hang', label: 'Hãng', type: 'text', required: true };
  const doiXe = { name: 'doi_xe', label: 'Đời xe', type: 'number', required: false };

  it('mục không có trong mẫu: 400 VALIDATION_ERROR', async () => {
    const owner = await newUser(app);
    const categoryId = await createCategory(app, master);
    await publishTemplate(app, master, categoryId, [hang]);
    const draft = await readyDraft(app, owner, { categoryId, attributes: { hang: 'Honda' } });
    // Mục lạ bị chặn từ lúc lưu (D9), nên lượt gửi không bao giờ mang được nó.
    const res = await patch(app, owner, draft, { attributes: { hang: 'Honda', mau_la: 'đỏ' } });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect(res.json().error.message).toContain('mau_la');
  });

  it('mẫu mới phát hành: tin cũ giữ mẫu lúc đăng; điền mục chỉ có ở mẫu mới thì 400, tin không đổi', async () => {
    const owner = await newUser(app);
    const categoryId = await createCategory(app, master);
    const v1 = await publishTemplate(app, master, categoryId, [hang]);
    const live = await liveListingOf(app, owner, { categoryId, attributes: { hang: 'Honda' } });
    await publishTemplate(app, master, categoryId, [hang, doiXe]);
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: live.id } });
    expect(row).toMatchObject({ templateVersion: v1, state: 'live', version: live.version });
    const res = await patch(app, owner, live, { attributes: { hang: 'Honda', doi_xe: 2020 } });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: live.id } })).toEqual(row);
  });
});

describe('Giá và khu vực', () => {
  it.each([
    ['giá âm', -1000],
    ['giá có phần lẻ', 2_500_000.5],
  ])('%s: 400 VALIDATION_ERROR', async (_name, price) => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner);
    const res = await patch(app, owner, draft, { price });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('giá 0 là cho tặng, không bị báo thiếu giá', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner, { price: 0 });
    expect((await submit(app, owner, draft)).json().data).toMatchObject({
      state: 'checking',
      price: 0,
    });
  });

  it('tin sàn chung thiếu phường: 400 REGION_REQUIRED', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner, { wardCode: null });
    await expectRefused(owner, draft, 400, 'REGION_REQUIRED');
  });

  it('phường không thuộc tỉnh: 400 VALIDATION_ERROR', async () => {
    const owner = await newUser(app);
    const { provinceCode } = await someRegion(app);
    const elsewhere = await prisma.ward.findFirstOrThrow({
      where: { provinceCode: { not: provinceCode } },
    });
    const res = await patch(app, owner, await readyDraft(app, owner), {
      provinceCode,
      wardCode: elsewhere.code,
    });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
  });
});
