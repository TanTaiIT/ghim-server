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
 * Delta group/group-roles của add-trust-tiers: nhận vai chủ nhóm / điều hành viên cần T1, xét đúng lúc nhận; tụt mức
 * không mất vai. Mức ghi thẳng (`seedTier`) hay tính lại thật — luật lên mức có test riêng.
 */
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const roleOf = async (groupId: string, accountId: string) =>
  (await prisma.groupMember.findUnique({ where: { groupId_accountId: { groupId, accountId } } }))
    ?.role;
const appoint = (owner: TestUser, groupId: string, accountId: string) =>
  api(app, 'PUT', `/groups/${groupId}/moderators/${accountId}`, owner.token, { unitId: null });
const offerTo = async (groupId: string, accountId: string) => {
  const res = await api(app, 'POST', `/ops/groups/${groupId}/owner-offers`, master.token, {
    accountId,
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().data.id as string;
};
const accept = (user: TestUser, offerId: string) =>
  api(app, 'POST', `/group-owner-offers/${offerId}/accept`, user.token);

describe('Nhận vai cần mức T1 trở lên', () => {
  it('bổ nhiệm điều hành viên đang ở T0: 409 TRUST_TIER_TOO_LOW, không có vai; ở T1: có vai', async () => {
    const group = await createActiveGroup(app);
    const [low, high] = [await addMember(app, group.groupId), await addMember(app, group.groupId)];
    await seedTier(high.id, 'T1');
    const refused = await appoint(group.owner, group.groupId, low.id);
    expect(refused.statusCode).toBe(409);
    expect(codeOf(refused)).toBe('TRUST_TIER_TOO_LOW');
    expect(await roleOf(group.groupId, low.id)).toBe('member');
    expect((await appoint(group.owner, group.groupId, high.id)).statusCode).toBe(200);
    expect(await roleOf(group.groupId, high.id)).toBe('moderator');
  });

  it('người được chuyển nhượng chủ nhóm bấm đồng ý khi đang ở T0: 409, chủ cũ vẫn giữ vai', async () => {
    const group = await createActiveGroup(app);
    const heir = await addMember(app, group.groupId);
    const offer = await api(
      app,
      'POST',
      `/groups/${group.groupId}/owner-transfer`,
      group.owner.token,
      {
        accountId: heir.id,
      },
    );
    expect(offer.statusCode, offer.body).toBe(201);
    const res = await accept(heir, offer.json().data.id as string);
    expect(codeOf(res)).toBe('TRUST_TIER_TOO_LOW');
    expect(await roleOf(group.groupId, group.owner.id)).toBe('owner');
  });

  it('master giao chủ cho người ở T1, người đó tụt về T0 trước khi đồng ý: 409, nhóm vẫn chờ giao chủ', async () => {
    const groupId = await createPendingGroup(app, master);
    const user = await newUser(app);
    await seedTier(user.id, 'T1');
    const offerId = await offerTo(groupId, user.id);
    // Tính lại thật: không có tin sạch nào nên về T0.
    expect(await app.modules.trust.recompute(user.id)).toBe('T0');
    const res = await accept(user, offerId);
    expect(codeOf(res)).toBe('TRUST_TIER_TOO_LOW');
    expect((await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).state).toBe(
      'pending_owner',
    );
  });

  it('master giao chủ, người được giao bấm đồng ý khi đang ở T1: thành chủ nhóm', async () => {
    const groupId = await createPendingGroup(app, master);
    const user = await newUser(app);
    await seedTier(user.id, 'T1');
    expect((await accept(user, await offerTo(groupId, user.id))).statusCode).toBe(200);
    expect(await roleOf(groupId, user.id)).toBe('owner');
  });
});

describe('Tụt mức không làm mất vai đang giữ', () => {
  it('điều hành viên bị tính lại về T0: vẫn là điều hành viên', async () => {
    const group = await createActiveGroup(app);
    const moderator = await addMember(app, group.groupId);
    await seedTier(moderator.id, 'T1');
    expect((await appoint(group.owner, group.groupId, moderator.id)).statusCode).toBe(200);
    expect(await app.modules.trust.recompute(moderator.id)).toBe('T0');
    expect(await roleOf(group.groupId, moderator.id)).toBe('moderator');
  });
});
