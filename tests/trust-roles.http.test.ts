import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import {
  addMember,
  api,
  createActiveGroup,
  createPendingGroup,
  newMaster,
  newUser,
  seedTier,
  type TestUser,
} from './group-helpers.js';
import { buildTestApp } from './test-app.js';

/*
 * Delta group/group-roles của remove-role-trust-tier: nhận vai chủ nhóm / điều hành viên không xét mức tin cậy — người
 * ở T0 được giao là nhận được (chốt 03/11/2026). Mức ghi thẳng bằng `seedTier` để ca nào cũng chắc chắn đang ở T0.
 */
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

const roleOf = async (groupId: string, accountId: string) =>
  (await prisma.groupMember.findUnique({ where: { groupId_accountId: { groupId, accountId } } }))
    ?.role;
const accept = (user: TestUser, offerId: string) =>
  api(app, 'POST', `/group-owner-offers/${offerId}/accept`, user.token);

describe('Nhận vai không xét mức tin cậy', () => {
  it('bổ nhiệm điều hành viên đang ở T0: có vai', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    await seedTier(member.id, 'T0');
    const res = await api(
      app,
      'PUT',
      `/groups/${group.groupId}/moderators/${member.id}`,
      group.owner.token,
      { unitId: null },
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(group.groupId, member.id)).toBe('moderator');
  });

  it('người được chuyển nhượng chủ nhóm bấm đồng ý khi đang ở T0: thành chủ nhóm', async () => {
    const group = await createActiveGroup(app);
    const heir = await addMember(app, group.groupId);
    await seedTier(heir.id, 'T0');
    const offer = await api(
      app,
      'POST',
      `/groups/${group.groupId}/owner-transfer`,
      group.owner.token,
      { accountId: heir.id },
    );
    expect(offer.statusCode, offer.body).toBe(201);
    const res = await accept(heir, offer.json().data.id as string);
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(group.groupId, heir.id)).toBe('owner');
  });

  it('master giao chủ, người được giao bấm đồng ý khi đang ở T0: thành chủ nhóm', async () => {
    const groupId = await createPendingGroup(app, master);
    const user = await newUser(app);
    await seedTier(user.id, 'T0');
    const offer = await api(app, 'POST', `/ops/groups/${groupId}/owner-offers`, master.token, {
      accountId: user.id,
    });
    expect(offer.statusCode, offer.body).toBe(201);
    const res = await accept(user, offer.json().data.id as string);
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(groupId, user.id)).toBe('owner');
  });
});
