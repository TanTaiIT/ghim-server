import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import type { GroupJoinPath, GroupKind, GroupMode } from '@prisma/client';

import { prisma } from './db-helpers.js';
import { seedAccount, tokenFor } from './ops-helpers.js';
import { repositories, TEST_NOW } from './test-app.js';

/**
 * Ghi thẳng mức tin cậy như dữ liệu nền: nhận vai chủ nhóm / điều hành viên cần T1 (spec group-roles), mà lên T1 thật
 * cần 7 ngày tuổi và một tin hiện đủ 7 ngày. Ca kiểm luật đó tự dựng mức qua luồng thật (`trust-tiers.http.test.ts`).
 */
export async function seedTier(accountId: string, tier: 'T0' | 'T1' | 'T2' | 'T3' = 'T1') {
  const row = {
    tier,
    countedClean: 0,
    factsHash: 'du-lieu-nen',
    configVersion: 0,
    computedAt: TEST_NOW,
  };
  await prisma.trustTierResult.upsert({
    where: { accountId },
    create: { accountId, ...row },
    update: row,
  });
}

/** Người dùng có sẵn token — mọi test nhóm cần một bộ như vậy cho chủ, điều hành viên, thành viên, người ngoài. */
export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export async function newUser(app: FastifyInstance): Promise<TestUser> {
  const account = await seedAccount();
  return { id: account.id, email: account.email, token: await tokenFor(app, account.id) };
}

/** Master với phiên đã qua lớp thứ hai — mọi route `/ops/groups` đòi cả hai. */
export async function newMaster(app: FastifyInstance): Promise<TestUser> {
  const account = await seedAccount({ role: 'master' });
  return { id: account.id, email: account.email, token: await tokenFor(app, account.id) };
}

/** Giao hết sự kiện đang chờ cho bên nghe thật của app — một lượt của bộ phát chỉ lấy 100. */
export async function deliverAll(app: FastifyInstance): Promise<void> {
  if ((await app.outbox.runOnce()).published > 0) await deliverAll(app);
}

export function api(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  token?: string,
  payload?: object,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload } : {}),
  });
}

let seq = 0;

/** Master lập nhóm qua bàn vận hành; nhóm ở trạng thái chờ giao chủ. */
export async function createPendingGroup(
  app: FastifyInstance,
  master: TestUser,
  input: { mode?: GroupMode; kind?: GroupKind; name?: string } = {},
): Promise<string> {
  seq += 1;
  const res = await api(app, 'POST', '/ops/groups', master.token, {
    name: input.name ?? `Nhóm thử ${seq}`,
    kind: input.kind ?? 'school',
    mode: input.mode ?? 'public_review',
  });
  if (res.statusCode !== 201) throw new Error(`Lập nhóm hỏng: ${res.statusCode} ${res.body}`);
  return res.json().data.id as string;
}

export interface ActiveGroup {
  groupId: string;
  master: TestUser;
  owner: TestUser;
}

/** Nhóm đang hoạt động: master lập, giao chủ cho một người mới, người đó nhận lời. */
export async function createActiveGroup(
  app: FastifyInstance,
  input: { mode?: GroupMode; kind?: GroupKind; name?: string; master?: TestUser } = {},
): Promise<ActiveGroup> {
  const master = input.master ?? (await newMaster(app));
  const groupId = await createPendingGroup(app, master, input);
  const owner = await newUser(app);
  await seedTier(owner.id);
  const offer = await api(app, 'POST', `/ops/groups/${groupId}/owner-offers`, master.token, {
    accountId: owner.id,
  });
  if (offer.statusCode !== 201) throw new Error(`Giao chủ hỏng: ${offer.statusCode} ${offer.body}`);
  const accepted = await api(
    app,
    'POST',
    `/group-owner-offers/${offer.json().data.id as string}/accept`,
    owner.token,
  );
  if (accepted.statusCode !== 200) {
    throw new Error(`Nhận làm chủ hỏng: ${accepted.statusCode} ${accepted.body}`);
  }
  return { groupId, master, owner };
}

/**
 * Thêm thành viên thẳng qua repository với đường vào tuỳ chọn — để dựng nhanh tình huống (vd người vào bằng lời mời
 * ở nhóm mở cửa) mà không đi lại cả luồng mời. Luồng thật có test riêng.
 */
export async function addMember(
  app: FastifyInstance,
  groupId: string,
  input: { via?: GroupJoinPath; unitId?: string | null } = {},
): Promise<TestUser> {
  const user = await newUser(app);
  const result = await repositories.group.joinDirect({
    groupId,
    accountId: user.id,
    via: input.via ?? 'approved',
    unitId: input.unitId ?? null,
    at: TEST_NOW,
  });
  if (typeof result === 'string') throw new Error(`Thêm thành viên hỏng: ${result}`);
  return user;
}

/** Bổ nhiệm điều hành viên qua route của chủ nhóm (unitId null = cả nhóm). */
export async function appointModerator(
  app: FastifyInstance,
  group: ActiveGroup,
  user: TestUser,
  unitId: string | null = null,
): Promise<void> {
  await seedTier(user.id);
  const res = await api(
    app,
    'PUT',
    `/groups/${group.groupId}/moderators/${user.id}`,
    group.owner.token,
    {
      unitId,
    },
  );
  if (res.statusCode !== 200) throw new Error(`Bổ nhiệm hỏng: ${res.statusCode} ${res.body}`);
}

export async function createUnit(
  app: FastifyInstance,
  group: ActiveGroup,
  name: string,
): Promise<string> {
  const res = await api(app, 'POST', `/groups/${group.groupId}/units`, group.owner.token, { name });
  if (res.statusCode !== 201) throw new Error(`Lập đơn vị hỏng: ${res.statusCode} ${res.body}`);
  return res.json().data.id as string;
}
