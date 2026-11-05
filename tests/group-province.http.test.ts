import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  newMaster,
  type TestUser,
} from './group-helpers.js';
import { buildTestApp, repositories } from './test-app.js';

/*
 * Spec `group-lifecycle` (lập nhóm kèm tỉnh) + `group-modes` (đặt/đổi/gỡ tỉnh, lọc nhóm theo tỉnh, hồ sơ trả tỉnh)
 * qua HTTP — change add-group-province. Tỉnh/thành tuỳ chọn; không ràng buộc tin trong nhóm.
 */
const MISSING_PROVINCE = 999_999;

let app: FastifyInstance;
let master: TestUser;
let pA: number;
let pB: number;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  await app.modules.region.seedRegionsIfEmpty();
  master = await newMaster(app);
  const provinces = await prisma.province.findMany({ orderBy: { code: 'asc' }, take: 2 });
  if (provinces.length < 2) throw new Error('Cần ít nhất 2 tỉnh/thành trong dữ liệu nền của test');
  [pA, pB] = [provinces[0]!.code, provinces[1]!.code];
});

afterAll(() => app.close());

const errorOf = (res: LightMyRequestResponse) => ({
  status: res.statusCode,
  code: res.body ? res.json().error?.code : undefined,
});

let seq = 0;
const createGroup = (overrides: object = {}, token = master.token) => {
  seq += 1;
  return api(app, 'POST', '/ops/groups', token, {
    name: `Nhóm tỉnh ${seq}`,
    kind: 'community',
    mode: 'public_review',
    ...overrides,
  });
};
const groupRow = (groupId: string) => repositories.group.findGroup(groupId);
const view = async (groupId: string, token?: string) =>
  (await api(app, 'GET', `/groups/${groupId}`, token)).json().data;
const settings = (group: ActiveGroup, payload: object, token = group.owner.token) =>
  api(app, 'PATCH', `/groups/${group.groupId}/settings`, token, payload);
const search = async (q: string, provinceCode?: number): Promise<string[]> => {
  const query =
    provinceCode === undefined
      ? `q=${q}&limit=100`
      : `q=${q}&provinceCode=${provinceCode}&limit=100`;
  const res = await api(app, 'GET', `/groups?${query}`);
  expect(res.statusCode).toBe(200);
  return (res.json().data.items as { id: string }[]).map((item) => item.id);
};

describe('Lập nhóm kèm tỉnh/thành', () => {
  it('Master lập nhóm kèm tỉnh/thành', async () => {
    const res = await createGroup({ provinceCode: pA });
    expect(res.statusCode).toBe(201);
    expect((await view(res.json().data.id, master.token)).province).toMatchObject({ code: pA });
  });

  it('Master lập nhóm không chọn tỉnh/thành', async () => {
    const res = await createGroup();
    expect(res.statusCode).toBe(201);
    expect((await view(res.json().data.id, master.token)).province).toBeNull();
  });

  it('Lập nhóm với tỉnh/thành không có thật', async () => {
    const name = `Nhóm tỉnh sai ${Date.now()}`;
    expect(errorOf(await createGroup({ name, provinceCode: MISSING_PROVINCE }))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(await prisma.group.count({ where: { name } })).toBe(0);
  });
});

describe('Tỉnh/thành của nhóm — đặt, đổi, gỡ', () => {
  it('Chủ nhóm đặt tỉnh/thành', async () => {
    const group = await createActiveGroup(app, { master });
    expect((await settings(group, { provinceCode: pA })).statusCode).toBe(200);
    expect((await view(group.groupId, group.owner.token)).province).toMatchObject({ code: pA });
  });

  it('Chủ nhóm gỡ tỉnh/thành', async () => {
    const group = await createActiveGroup(app, { master });
    await settings(group, { provinceCode: pA });
    expect((await settings(group, { provinceCode: null })).statusCode).toBe(200);
    expect((await view(group.groupId, group.owner.token)).province).toBeNull();
  });

  it('Đặt tỉnh/thành không có thật', async () => {
    const group = await createActiveGroup(app, { master });
    expect(errorOf(await settings(group, { provinceCode: MISSING_PROVINCE }))).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect((await groupRow(group.groupId))?.provinceCode).toBeNull();
  });

  it('Điều hành viên thử đổi tỉnh/thành', async () => {
    const group = await createActiveGroup(app, { master });
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator);
    expect(errorOf(await settings(group, { provinceCode: pA }, moderator.token))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect((await groupRow(group.groupId))?.provinceCode).toBeNull();
  });
});

describe('Lọc nhóm công khai theo tỉnh/thành', () => {
  const MARKER = `ZxqvLocTinh${Date.now()}`;
  let inA: string;
  let inB: string;
  let noProvince: string;
  let privateInA: string;

  beforeAll(async () => {
    const withProvince = async (mode: 'public_review' | 'private_invite', code?: number) => {
      const group = await createActiveGroup(app, { master, name: `${MARKER} ${seq++}`, mode });
      if (code !== undefined) {
        expect((await settings(group, { provinceCode: code })).statusCode).toBe(200);
      }
      return group.groupId;
    };
    inA = await withProvince('public_review', pA);
    inB = await withProvince('public_review', pB);
    noProvince = await withProvince('public_review');
    privateInA = await withProvince('private_invite', pA);
  });

  it('Khách lọc nhóm theo tỉnh/thành', async () => {
    const found = await search(MARKER, pA);
    expect(found).toContain(inA);
    expect(found).not.toContain(inB);
  });

  it('Nhóm không gắn tỉnh không lọt lưới lọc', async () => {
    expect(await search(MARKER, pA)).not.toContain(noProvince);
  });

  it('Không truyền tỉnh/thành', async () => {
    const found = await search(MARKER);
    expect(found).toEqual(expect.arrayContaining([inA, inB, noProvince]));
  });

  it('Lọc theo tỉnh không lộ nhóm riêng tư', async () => {
    expect(await search(MARKER, pA)).not.toContain(privateInA);
    expect(await search(MARKER)).not.toContain(privateInA);
  });
});
