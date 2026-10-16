import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';

/*
 * Ràng buộc chỉ DB trả lời được của migration `init_group`: mỗi CHECK viết tay (23514), mỗi partial unique
 * (P2002) và FK ghép (nhóm, đơn vị). Ghi thẳng bằng Prisma những dòng repository không bao giờ tạo — design
 * mục 9 dựa vào chính các ràng buộc này khi service hay repository sai.
 */
const UNIQUE = 'P2002';
const FOREIGN_KEY = 'P2003';
const CHECK = '23514';
const NOW = new Date('2026-10-10T04:00:00.000Z');
const LATER = new Date('2026-10-24T04:00:00.000Z');

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

let seq = 0;

async function account() {
  seq += 1;
  const email = `nhom${seq}@ghim.test`;
  return prisma.account.create({
    data: {
      email,
      emailNormalized: email,
      emailHash: `hash-${email}`,
      passwordHash: 'argon2id-gia',
      displayName: `Người thử ${seq}`,
      status: 'active',
    },
  });
}

function groupData(
  createdBy: string,
  overrides: Partial<Prisma.GroupUncheckedCreateInput> = {},
): Prisma.GroupUncheckedCreateInput {
  seq += 1;
  return {
    name: `Nhóm ${seq}`,
    nameFolded: `NHOM ${seq}`,
    kind: 'school',
    mode: 'public_review',
    state: 'active',
    createdBy,
    ...overrides,
  };
}

const insertGroup = (createdBy: string, overrides: Partial<Prisma.GroupUncheckedCreateInput>) =>
  sqlStateOf(prisma.group.create({ data: groupData(createdBy, overrides) }));

async function activeGroup() {
  const creator = await account();
  const group = await prisma.group.create({ data: groupData(creator.id) });
  return { group, creator };
}

const member = (
  groupId: string,
  accountId: string,
  overrides: Partial<Prisma.GroupMemberUncheckedCreateInput> = {},
) =>
  prisma.groupMember.create({
    data: { groupId, accountId, joinedVia: 'approved', joinedAt: NOW, ...overrides },
  });

describe('groups — CHECK', () => {
  it('groups_locked_check: tạm khoá phải có cả mốc khoá lẫn nguyên nhân', async () => {
    const { id } = await account();
    await expect(insertGroup(id, { state: 'locked', lockCause: 'no_moderators' })).resolves.toBe(
      CHECK,
    );
    await expect(insertGroup(id, { state: 'locked', lockedAt: NOW })).resolves.toBe(CHECK);
    await expect(
      insertGroup(id, { state: 'locked', lockedAt: NOW, lockCause: 'no_moderators' }),
    ).resolves.toBeNull();
  });

  it('groups_master_lock_reason_check: master khoá phải ghi lý do', async () => {
    const { id } = await account();
    await expect(
      insertGroup(id, { state: 'locked', lockedAt: NOW, lockCause: 'master' }),
    ).resolves.toBe(CHECK);
    await expect(
      insertGroup(id, {
        state: 'locked',
        lockedAt: NOW,
        lockCause: 'master',
        lockedReason: 'Vi phạm',
        lockedBy: id,
      }),
    ).resolves.toBeNull();
  });

  it('groups_closed_check: đã đóng ⇔ có mốc đóng, hai chiều', async () => {
    const { id } = await account();
    await expect(insertGroup(id, { state: 'closed' })).resolves.toBe(CHECK);
    await expect(insertGroup(id, { state: 'active', closedAt: NOW })).resolves.toBe(CHECK);
    await expect(
      insertGroup(id, { state: 'closed', closedAt: NOW, closedBy: id }),
    ).resolves.toBeNull();
  });

  it('groups_ownerless_check: thiếu chủ phải có mốc bắt đầu thiếu chủ', async () => {
    const { id } = await account();
    await expect(insertGroup(id, { state: 'ownerless' })).resolves.toBe(CHECK);
    await expect(insertGroup(id, { state: 'ownerless', ownerlessSince: NOW })).resolves.toBeNull();
  });

  it('groups_going_private_check: đang chuyển ⇔ có chế độ đích, và đích phải là riêng tư', async () => {
    const { id } = await account();
    await expect(insertGroup(id, { state: 'going_private' })).resolves.toBe(CHECK);
    await expect(insertGroup(id, { state: 'active', targetMode: 'private_code' })).resolves.toBe(
      CHECK,
    );
    await expect(
      insertGroup(id, { state: 'going_private', targetMode: 'public_open' }),
    ).resolves.toBe(CHECK);
    await expect(
      insertGroup(id, { state: 'going_private', targetMode: 'private_invite' }),
    ).resolves.toBeNull();
  });

  it('groups_outsiders_check: "nhận tin người ngoài" chỉ ở chế độ công khai', async () => {
    const { id } = await account();
    await expect(insertGroup(id, { mode: 'private_invite', allowOutsiders: true })).resolves.toBe(
      CHECK,
    );
    await expect(
      insertGroup(id, { mode: 'public_open', allowOutsiders: true }),
    ).resolves.toBeNull();
  });

  it('groups_show_name_check: "hiện tên trên tin sàn" chỉ ở chế độ riêng tư', async () => {
    const { id } = await account();
    await expect(
      insertGroup(id, { mode: 'public_review', showNameOnMarketplace: true }),
    ).resolves.toBe(CHECK);
    await expect(
      insertGroup(id, { mode: 'private_invite', showNameOnMarketplace: true }),
    ).resolves.toBeNull();
  });

  it('groups_code_check: có mã ⇔ riêng tư · có mã và chưa đóng', async () => {
    const { id } = await account();
    await expect(insertGroup(id, { mode: 'private_code' })).resolves.toBe(CHECK);
    await expect(insertGroup(id, { mode: 'public_open', code: 'AAAAAA' })).resolves.toBe(CHECK);
    await expect(
      insertGroup(id, { mode: 'private_code', state: 'closed', closedAt: NOW, code: 'BBBBBB' }),
    ).resolves.toBe(CHECK);
    await expect(
      insertGroup(id, { mode: 'private_code', state: 'closed', closedAt: NOW }),
    ).resolves.toBeNull();
    await expect(insertGroup(id, { mode: 'private_code', code: 'CCCCCC' })).resolves.toBeNull();
  });
});

describe('groups — mã nhóm duy nhất', () => {
  it('hai nhóm không trùng mã; nhiều nhóm không mã cùng tồn tại', async () => {
    const { id } = await account();
    await prisma.group.create({ data: groupData(id, { mode: 'private_code', code: 'K7M2Q9' }) });
    await expect(
      prismaErrorCode(
        prisma.group.create({ data: groupData(id, { mode: 'private_code', code: 'K7M2Q9' }) }),
      ),
    ).resolves.toBe(UNIQUE);
    await prisma.group.create({ data: groupData(id) });
    await prisma.group.create({ data: groupData(id) });
  });
});

describe('group_members', () => {
  it('group_members_moderator_unit_check: phạm vi đơn vị chỉ cho điều hành viên', async () => {
    const { group } = await activeGroup();
    const unit = await prisma.groupUnit.create({ data: { groupId: group.id, name: '12A1' } });
    const a = await account();
    const b = await account();
    await expect(sqlStateOf(member(group.id, a.id, { moderatorUnitId: unit.id }))).resolves.toBe(
      CHECK,
    );
    await expect(
      sqlStateOf(
        member(group.id, a.id, { role: 'owner', roleSince: NOW, moderatorUnitId: unit.id }),
      ),
    ).resolves.toBe(CHECK);
    await member(group.id, b.id, { role: 'moderator', roleSince: NOW, moderatorUnitId: unit.id });
  });

  it('group_members_role_since_check: chủ và điều hành viên phải có mốc nhận vai', async () => {
    const { group } = await activeGroup();
    const a = await account();
    await expect(sqlStateOf(member(group.id, a.id, { role: 'moderator' }))).resolves.toBe(CHECK);
    await expect(sqlStateOf(member(group.id, a.id, { role: 'owner' }))).resolves.toBe(CHECK);
    await member(group.id, a.id);
  });

  it('một chủ mỗi nhóm; hạ chủ cũ về thành viên thì người khác lên được', async () => {
    const { group } = await activeGroup();
    const first = await account();
    const second = await account();
    await member(group.id, first.id, { role: 'owner', roleSince: NOW });
    await expect(
      prismaErrorCode(member(group.id, second.id, { role: 'owner', roleSince: NOW })),
    ).resolves.toBe(UNIQUE);

    await member(group.id, second.id);
    await prisma.groupMember.update({
      where: { groupId_accountId: { groupId: group.id, accountId: first.id } },
      data: { role: 'member', roleSince: null },
    });
    await prisma.groupMember.update({
      where: { groupId_accountId: { groupId: group.id, accountId: second.id } },
      data: { role: 'owner', roleSince: NOW },
    });
    const other = await activeGroup();
    await member(other.group.id, first.id, { role: 'owner', roleSince: NOW });
  });

  it('một người vào một nhóm đúng một lần (PK nhóm, người)', async () => {
    const { group } = await activeGroup();
    const a = await account();
    await member(group.id, a.id);
    await expect(prismaErrorCode(member(group.id, a.id, { joinedVia: 'joined' }))).resolves.toBe(
      UNIQUE,
    );
  });

  it('FK ghép: không xếp được thành viên vào đơn vị của nhóm khác, kể cả làm phạm vi điều hành', async () => {
    const mine = await activeGroup();
    const other = await activeGroup();
    const foreignUnit = await prisma.groupUnit.create({
      data: { groupId: other.group.id, name: '12A1' },
    });
    const a = await account();
    await expect(
      prismaErrorCode(member(mine.group.id, a.id, { unitId: foreignUnit.id })),
    ).resolves.toBe(FOREIGN_KEY);
    await expect(
      prismaErrorCode(
        member(mine.group.id, a.id, {
          role: 'moderator',
          roleSince: NOW,
          moderatorUnitId: foreignUnit.id,
        }),
      ),
    ).resolves.toBe(FOREIGN_KEY);
    await member(other.group.id, a.id, { unitId: foreignUnit.id });
  });
});

describe('group_units', () => {
  it('tên đơn vị không trùng trong một nhóm; nhóm khác dùng lại được', async () => {
    const mine = await activeGroup();
    const other = await activeGroup();
    await prisma.groupUnit.create({ data: { groupId: mine.group.id, name: '12A1' } });
    await expect(
      prismaErrorCode(prisma.groupUnit.create({ data: { groupId: mine.group.id, name: '12A1' } })),
    ).resolves.toBe(UNIQUE);
    await prisma.groupUnit.create({ data: { groupId: other.group.id, name: '12A1' } });
  });

  it('không xoá được đơn vị còn thành viên hay còn điều hành viên phụ trách; trống thì xoá được', async () => {
    const { group } = await activeGroup();
    const withMember = await prisma.groupUnit.create({ data: { groupId: group.id, name: 'A' } });
    const withModerator = await prisma.groupUnit.create({ data: { groupId: group.id, name: 'B' } });
    const empty = await prisma.groupUnit.create({ data: { groupId: group.id, name: 'C' } });
    await member(group.id, (await account()).id, { unitId: withMember.id });
    await member(group.id, (await account()).id, {
      role: 'moderator',
      roleSince: NOW,
      moderatorUnitId: withModerator.id,
    });

    await expect(
      prismaErrorCode(prisma.groupUnit.delete({ where: { id: withMember.id } })),
    ).resolves.toBe(FOREIGN_KEY);
    await expect(
      prismaErrorCode(prisma.groupUnit.delete({ where: { id: withModerator.id } })),
    ).resolves.toBe(FOREIGN_KEY);
    await prisma.groupUnit.delete({ where: { id: empty.id } });
    expect(await prisma.groupUnit.count({ where: { groupId: group.id } })).toBe(2);
  });
});

const request = (
  groupId: string,
  accountId: string,
  overrides: Partial<Prisma.GroupJoinRequestUncheckedCreateInput> = {},
) =>
  prisma.groupJoinRequest.create({
    data: { groupId, accountId, createdAt: NOW, expiresAt: LATER, ...overrides },
  });

describe('group_join_requests', () => {
  it('group_join_requests_decided_check: đang chờ ⇔ chưa có mốc quyết định', async () => {
    const { group } = await activeGroup();
    const a = await account();
    await expect(sqlStateOf(request(group.id, a.id, { decidedAt: NOW }))).resolves.toBe(CHECK);
    await expect(sqlStateOf(request(group.id, a.id, { status: 'rejected' }))).resolves.toBe(CHECK);
    await request(group.id, a.id, { status: 'rejected', decidedAt: NOW, decidedBy: a.id });
  });

  it('một đơn chờ mỗi cặp (nhóm, người); đơn đã xử không giữ chỗ', async () => {
    const { group } = await activeGroup();
    const a = await account();
    await request(group.id, a.id, { status: 'rejected', decidedAt: NOW });
    await request(group.id, a.id, { status: 'expired', decidedAt: NOW });
    await request(group.id, a.id);
    await expect(prismaErrorCode(request(group.id, a.id))).resolves.toBe(UNIQUE);
    const other = await activeGroup();
    await request(other.group.id, a.id);
  });
});

/** Lời mời của tài khoản `accountId`; dấu băm email giả theo tài khoản — unique lời mời chờ tính theo dấu băm. */
const invitation = (
  groupId: string,
  accountId: string,
  overrides: Partial<Prisma.GroupInvitationUncheckedCreateInput> = {},
) =>
  prisma.groupInvitation.create({
    data: {
      groupId,
      accountId,
      emailHash: `hash-${accountId}`,
      emailHint: 'a***@ghim.vn',
      invitedBy: accountId,
      createdAt: NOW,
      expiresAt: LATER,
      ...overrides,
    },
  });

describe('group_invitations', () => {
  it('group_invitations_decided_check: đang chờ ⇔ chưa có mốc quyết định', async () => {
    const { group } = await activeGroup();
    const a = await account();
    await expect(sqlStateOf(invitation(group.id, a.id, { decidedAt: NOW }))).resolves.toBe(CHECK);
    await expect(sqlStateOf(invitation(group.id, a.id, { status: 'revoked' }))).resolves.toBe(
      CHECK,
    );
    await invitation(group.id, a.id, { status: 'declined', decidedAt: NOW });
  });

  it('một lời mời chờ mỗi cặp (nhóm, email); lời mời đã đóng không giữ chỗ', async () => {
    const { group } = await activeGroup();
    const a = await account();
    await invitation(group.id, a.id, { status: 'revoked', decidedAt: NOW });
    await invitation(group.id, a.id);
    await expect(prismaErrorCode(invitation(group.id, a.id))).resolves.toBe(UNIQUE);
  });

  it('lời mời mù (không người nhận) cũng giữ chỗ theo email: hai dòng chờ cùng dấu băm → trùng', async () => {
    const { group } = await activeGroup();
    const inviter = await account();
    const blind = { accountId: null, invitedBy: inviter.id, emailHash: 'hash-email-la' };
    await invitation(group.id, inviter.id, blind);
    await expect(prismaErrorCode(invitation(group.id, inviter.id, blind))).resolves.toBe(UNIQUE);
  });
});

const offer = (
  groupId: string,
  toAccountId: string,
  overrides: Partial<Prisma.GroupOwnerOfferUncheckedCreateInput> = {},
) =>
  prisma.groupOwnerOffer.create({
    data: {
      groupId,
      kind: 'assignment',
      toAccountId,
      createdAt: NOW,
      expiresAt: LATER,
      ...overrides,
    },
  });

describe('group_owner_offers', () => {
  it('group_owner_offers_decided_check: đang chờ ⇔ chưa có mốc quyết định', async () => {
    const { group } = await activeGroup();
    const a = await account();
    await expect(sqlStateOf(offer(group.id, a.id, { decidedAt: NOW }))).resolves.toBe(CHECK);
    await expect(sqlStateOf(offer(group.id, a.id, { status: 'accepted' }))).resolves.toBe(CHECK);
    await offer(group.id, a.id, { status: 'cancelled', decidedAt: NOW });
  });

  it('một lời giao chủ chờ mỗi nhóm, kể cả cho hai người khác nhau; lời đã đóng không giữ chỗ', async () => {
    const { group } = await activeGroup();
    const a = await account();
    const b = await account();
    await offer(group.id, a.id, { status: 'expired', decidedAt: NOW });
    await offer(group.id, a.id);
    await expect(
      prismaErrorCode(offer(group.id, b.id, { kind: 'transfer', fromAccountId: a.id })),
    ).resolves.toBe(UNIQUE);
  });
});
