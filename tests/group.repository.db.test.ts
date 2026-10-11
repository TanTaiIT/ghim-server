import type { GroupState, Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import { outboxEvents, prisma, truncateAll } from './db-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { repositories, TEST_AUDIT, TEST_NOW } from './test-app.js';

/*
 * Repository `group` trên Postgres thật: mỗi dòng của bảng tranh chấp (design mục 9) chạy hai lượt trở lên cùng lúc
 * và phải ra đúng một bên thắng với trạng thái cuối nhất quán; cùng các lượt ghi nhiều bảng một lúc (nhận lời giao
 * chủ, đóng nhóm, việc theo lịch) và sự kiện outbox chúng để lại.
 */
const repo = repositories.group;
const NOW = TEST_NOW;
const DAY_MS = 86_400_000;
const at = (days: number): Date => new Date(NOW.getTime() + days * DAY_MS);
/** Ca chạy song song lặp vài vòng để gặp nhiều kiểu đan xen — cơ chế đúng thì vòng nào cũng phải đúng. */
const ROUNDS = 4;
const CLOSABLE: ReadonlySet<GroupState> = new Set(['active', 'going_private', 'locked']);

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

let seq = 0;

async function group(overrides: Partial<Prisma.GroupUncheckedCreateInput> = {}) {
  seq += 1;
  return prisma.group.create({
    data: {
      name: `Nhóm ${seq}`,
      nameFolded: `NHOM ${seq}`,
      kind: 'school',
      mode: 'public_review',
      state: 'active',
      createdBy: TEST_AUDIT.actorId,
      ...overrides,
    },
  });
}

const user = async (): Promise<string> => (await seedAccount()).id;

async function member(
  groupId: string,
  accountId: string,
  role: 'member' | 'moderator' | 'owner' = 'member',
  extra: Partial<Prisma.GroupMemberUncheckedCreateInput> = {},
) {
  await prisma.groupMember.create({
    data: {
      groupId,
      accountId,
      role,
      joinedVia: role === 'owner' ? 'assigned' : 'approved',
      joinedAt: at(-100),
      roleSince: role === 'member' ? null : at(-100),
      ...extra,
    },
  });
}

async function groupWithOwner(overrides: Partial<Prisma.GroupUncheckedCreateInput> = {}) {
  const { id } = await group(overrides);
  const ownerId = await user();
  await member(id, ownerId, 'owner');
  return { groupId: id, ownerId };
}

function created<T>(result: T | string): T {
  if (typeof result === 'string') throw new Error(`Dựng dữ liệu hỏng: ${result}`);
  return result;
}

const won = <T>(result: T | string): result is T => typeof result !== 'string';

const requestJoin = (groupId: string, accountId: string, maxPending = 3) =>
  repo.createJoinRequest({ groupId, accountId, at: NOW, expiresAt: at(21), maxPending });

const joinDirect = (groupId: string, accountId: string) =>
  repo.joinDirect({ groupId, accountId, via: 'joined', unitId: null, at: NOW });

const offerTo = (groupId: string, toAccountId: string) =>
  repo.createOwnerOffer({
    groupId,
    kind: 'assignment',
    fromAccountId: null,
    toAccountId,
    at: NOW,
    expiresAt: at(14),
    audit: TEST_AUDIT,
  });

/** Nhóm thiếu chủ: chủ cũ (bị khoá) vẫn là chủ trên giấy, master đã giao cho điều hành viên được đề cử. */
async function ownerlessWithOffer() {
  const { id: groupId } = await group({ state: 'ownerless', ownerlessSince: at(-5) });
  const oldOwner = await user();
  await member(groupId, oldOwner, 'owner');
  const nominee = await user();
  await member(groupId, nominee, 'moderator');
  await repo.setNominee(groupId, nominee);
  const offer = created(await offerTo(groupId, nominee));
  return { groupId, oldOwner, nominee, offerId: offer.id };
}

const ownersOf = async (groupId: string) =>
  (await prisma.groupMember.findMany({ where: { groupId, role: 'owner' } })).map(
    (row) => row.accountId,
  );

const eventsOf = async (type: string, groupId: string) =>
  (await outboxEvents()).filter(
    (event) =>
      event.type === type && (event.payload as Record<string, unknown>).groupId === groupId,
  );

/** Bên nghe không được dựa vào thứ tự giữa các sự kiện (CLAUDE.md luật 12), nên chỉ so tập loại. */
const typesAfter = async (count: number) =>
  (await outboxEvents())
    .slice(count)
    .map((event) => event.type)
    .toSorted();

const eachRound = (body: () => Promise<void>): Promise<void> =>
  sequentially(
    Array.from({ length: ROUNDS }, (_, round) => round),
    body,
  );

async function lockWaiters(count: number, attempt = 0): Promise<void> {
  const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
    SELECT count(*)::int AS waiting FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`;
  if ((row?.waiting ?? 0) >= count) return;
  if (attempt >= 400) throw new Error(`Chờ mãi không thấy ${count} lượt xếp hàng trên khoá`);
  await new Promise((resolve) => setTimeout(resolve, 5));
  return lockWaiters(count, attempt + 1);
}

/**
 * `Promise.all` trần phó mặc thứ tự cho lịch của event loop, nên kiểu đan xen nguy hiểm có khi không bao giờ xảy ra.
 * Một transaction giữ dòng nhóm cho tới khi cả hai lượt đã xếp hàng trên khoá của dòng đó; thả ra thì Postgres cho
 * lượt xếp trước đi trước — ca chạy đúng một kiểu đan xen, lần nào cũng như nhau.
 */
async function queuedOnGroup<A, B>(
  groupId: string,
  first: () => Promise<A>,
  second: () => Promise<B>,
): Promise<[A, B]> {
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  const { promise: held, resolve: holding } = Promise.withResolvers<void>();
  const blocker = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`;
    holding();
    await released;
  });
  try {
    await Promise.race([held, blocker]);
    const a = first();
    a.catch(() => undefined);
    await lockWaiters(1);
    const b = second();
    b.catch(() => undefined);
    await lockWaiters(2);
    release();
    await blocker;
    return await Promise.all([a, b]);
  } finally {
    release();
  }
}

describe('tranh chấp: xử đơn xin vào', () => {
  it.each([
    [true, true],
    [true, false],
    [false, false],
  ])('hai quản trị cùng xử một đơn (duyệt: %s / %s): đúng một lượt ghi', async (first, second) => {
    await eachRound(async () => {
      const { groupId, ownerId } = await groupWithOwner();
      const moderatorId = await user();
      await member(groupId, moderatorId, 'moderator');
      const applicant = await user();
      const request = created(await requestJoin(groupId, applicant));
      const decide = (approve: boolean, decidedBy: string) =>
        repo.decideJoinRequest({
          requestId: request.id,
          approve,
          decidedBy,
          at: NOW,
          reapplyAt: at(7),
        });

      const results = await Promise.all([decide(first, ownerId), decide(second, moderatorId)]);

      const winners = results.filter(won);
      expect(winners).toHaveLength(1);
      expect(results.filter((result) => result === 'gone')).toHaveLength(1);
      const final = await prisma.groupJoinRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(final).toMatchObject({
        status: winners[0]?.status,
        decidedBy: winners[0]?.decidedBy,
      });
      expect(await repo.findMember(groupId, applicant)).toEqual(
        final.status === 'approved' ? expect.objectContaining({ joinedVia: 'approved' }) : null,
      );
      expect(await eventsOf('group.join_request.decided', groupId)).toHaveLength(1);
    });
  });

  it('duyệt đúng lúc người xin rút đơn: một bên thắng, không bao giờ vừa rút vừa thành thành viên', async () => {
    await eachRound(async () => {
      const { groupId, ownerId } = await groupWithOwner();
      const applicant = await user();
      const request = created(await requestJoin(groupId, applicant));

      const [approved, withdrawn] = await Promise.all([
        repo.decideJoinRequest({
          requestId: request.id,
          approve: true,
          decidedBy: ownerId,
          at: NOW,
          reapplyAt: at(7),
        }),
        repo.withdrawJoinRequest({ requestId: request.id, accountId: applicant, at: NOW }),
      ]);

      const approveWon = won(approved);
      expect(withdrawn).toBe(!approveWon);
      if (!approveWon) expect(approved).toBe('gone');
      const final = await prisma.groupJoinRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(final.status).toBe(approveWon ? 'approved' : 'withdrawn');
      expect((await repo.findMember(groupId, applicant)) !== null).toBe(approveWon);
      const decided = await eventsOf('group.join_request.decided', groupId);
      expect(decided.map((event) => (event.payload as { outcome: string }).outcome)).toEqual([
        approveWon ? 'approved' : 'withdrawn',
      ]);
    });
  });
});

describe('tranh chấp: vào nhóm', () => {
  it('bấm tham gia đúng lúc bị cấm: không bao giờ vừa là thành viên vừa bị cấm', async () => {
    await eachRound(async () => {
      const { groupId, ownerId } = await groupWithOwner({ mode: 'public_open' });
      const person = await user();

      const [joined, removed] = await Promise.all([
        joinDirect(groupId, person),
        repo.removeMember({ groupId, accountId: person, reason: 'banned', by: ownerId, at: NOW }),
      ]);

      expect(await repo.isBanned(groupId, person)).toBe(true);
      expect(await repo.findMember(groupId, person)).toBeNull();
      if (won(joined)) {
        expect(removed).toEqual({ removed: expect.objectContaining({ accountId: person }) });
      } else {
        expect(joined).toBe('banned');
        expect(removed).toEqual({ removed: null });
      }
    });
  });

  it('bấm tham gia hai lần cùng lúc: một dòng thành viên, lượt kia nhận "member"', async () => {
    await eachRound(async () => {
      const { groupId } = await groupWithOwner({ mode: 'public_open' });
      const person = await user();

      const results = await Promise.all([joinDirect(groupId, person), joinDirect(groupId, person)]);

      expect(results.filter(won)).toHaveLength(1);
      expect(results.filter((result) => result === 'member')).toHaveLength(1);
      expect(await prisma.groupMember.count({ where: { groupId, accountId: person } })).toBe(1);
      expect(await eventsOf('group.member.joined', groupId)).toHaveLength(1);
    });
  });

  it('bốn đơn của một người vào bốn nhóm cùng lúc, trần 3: đúng ba đơn được ghi', async () => {
    const groups = await Promise.all(Array.from({ length: 4 }, () => groupWithOwner()));
    const person = await user();

    const results = await Promise.all(groups.map(({ groupId }) => requestJoin(groupId, person, 3)));

    expect(results.filter(won)).toHaveLength(3);
    expect(results.filter((result) => result === 'limit')).toHaveLength(1);
    expect(
      await prisma.groupJoinRequest.count({ where: { accountId: person, status: 'pending' } }),
    ).toBe(3);
  });

  it('nhóm đóng trước, người bấm tham gia xếp hàng sau: không vào được nhóm đã đóng', async () => {
    const { groupId, ownerId } = await groupWithOwner({ mode: 'public_open' });
    const person = await user();

    const [closed, joined] = await queuedOnGroup(
      groupId,
      () => repo.closeGroup({ id: groupId, expectStates: CLOSABLE, closedBy: ownerId, at: NOW }),
      () => joinDirect(groupId, person),
    );

    expect(closed?.state).toBe('closed');
    expect(joined).toBe('state');
    expect(await repo.findMember(groupId, person)).toBeNull();
    expect(await eventsOf('group.member.joined', groupId)).toEqual([]);
  });

  it('người bấm tham gia xếp hàng trước khi nhóm đóng: vào lúc nhóm còn mở, rồi nhóm đóng', async () => {
    const { groupId, ownerId } = await groupWithOwner({ mode: 'public_open' });
    const person = await user();

    const [joined, closed] = await queuedOnGroup(
      groupId,
      () => joinDirect(groupId, person),
      () => repo.closeGroup({ id: groupId, expectStates: CLOSABLE, closedBy: ownerId, at: NOW }),
    );

    expect(joined).toMatchObject({ accountId: person, joinedVia: 'joined' });
    expect(closed?.state).toBe('closed');
  });
});

describe('tranh chấp: chủ nhóm', () => {
  it('hai lời giao chủ cùng lúc cho một nhóm: một lời được ghi, lượt kia nhận "duplicate"', async () => {
    await eachRound(async () => {
      const { id: groupId } = await group({ state: 'pending_owner' });
      const [a, b] = [await user(), await user()];

      const settled = await Promise.allSettled([offerTo(groupId, a), offerTo(groupId, b)]);

      const outcomes = settled.map((result) => {
        if (result.status === 'rejected') {
          return `ném ${(result.reason as { code?: string }).code ?? String(result.reason)}`;
        }
        return typeof result.value === 'string' ? result.value : 'offer';
      });
      expect(outcomes.toSorted()).toEqual(['duplicate', 'offer']);
      expect(await prisma.groupOwnerOffer.count({ where: { groupId, status: 'pending' } })).toBe(1);
    });
  });

  it('nhận lời giao chủ đúng lúc master huỷ: một bên thắng, nhóm theo đúng bên đó', async () => {
    await eachRound(async () => {
      const { id: groupId } = await group({ state: 'pending_owner' });
      const recipient = await user();
      const offer = created(await offerTo(groupId, recipient));

      const [accepted, cancelled] = await Promise.all([
        repo.acceptOwnerOffer({ offerId: offer.id, accountId: recipient, at: NOW }),
        repo.closeOwnerOffer({ offerId: offer.id, status: 'cancelled', at: NOW }),
      ]);

      const acceptWon = won(accepted);
      expect(cancelled === null).toBe(acceptWon);
      if (!acceptWon) expect(accepted).toBe('gone');
      const final = await prisma.groupOwnerOffer.findUniqueOrThrow({ where: { id: offer.id } });
      expect(final.status).toBe(acceptWon ? 'accepted' : 'cancelled');
      expect((await repo.findGroup(groupId))?.state).toBe(acceptWon ? 'active' : 'pending_owner');
      expect(await ownersOf(groupId)).toEqual(acceptWon ? [recipient] : []);
      expect(await eventsOf('group.owner.offer_decided', groupId)).toHaveLength(1);
    });
  });

  it('chủ cũ được mở khoá trước: nhóm về với chủ cũ, lời giao bị huỷ, người được giao nhận lời thì thua', async () => {
    const { groupId, oldOwner, nominee, offerId } = await ownerlessWithOffer();

    const [restored, accepted] = await queuedOnGroup(
      groupId,
      () => repo.restoreOwner({ groupId, at: NOW }),
      () => repo.acceptOwnerOffer({ offerId, accountId: nominee, at: NOW }),
    );

    expect(await ownersOf(groupId)).toEqual([oldOwner]);
    expect(restored?.state).toBe('active');
    expect(accepted).toBe('gone');
    expect(
      (await prisma.groupOwnerOffer.findUniqueOrThrow({ where: { id: offerId } })).status,
    ).toBe('cancelled');
    expect(await repo.findMember(groupId, nominee)).toMatchObject({ role: 'moderator' });
  });

  it('người được giao nhận lời trước: chủ cũ trở lại sau đó phải thua, nhóm giữ chủ mới', async () => {
    const { groupId, oldOwner, nominee, offerId } = await ownerlessWithOffer();

    const [accepted, restored] = await queuedOnGroup(
      groupId,
      () => repo.acceptOwnerOffer({ offerId, accountId: nominee, at: NOW }),
      () => repo.restoreOwner({ groupId, at: NOW }),
    );

    expect(await ownersOf(groupId)).toEqual([nominee]);
    expect(accepted).toMatchObject({ previousOwnerId: oldOwner });
    expect(await repo.findMember(groupId, oldOwner)).toMatchObject({ role: 'member' });
    expect(restored).toBeNull();
    const resolved = await eventsOf('group.ownerless.resolved', groupId);
    expect(resolved.map((event) => (event.payload as { outcome: string }).outcome)).toEqual([
      'new_owner',
    ]);
  });
});

describe('acceptOwnerOffer', () => {
  it('nhận lời chuyển chủ: chủ cũ về thành viên thường, người nhận bỏ phạm vi điều hành và thành chủ', async () => {
    const { groupId, ownerId } = await groupWithOwner();
    const unit = await prisma.groupUnit.create({ data: { groupId, name: '12A1' } });
    const recipient = await user();
    await member(groupId, recipient, 'moderator', { moderatorUnitId: unit.id, roleSince: at(-10) });
    const offer = created(
      await repo.createOwnerOffer({
        groupId,
        kind: 'transfer',
        fromAccountId: ownerId,
        toAccountId: recipient,
        at: NOW,
        expiresAt: at(14),
      }),
    );
    const before = (await outboxEvents()).length;

    const result = await repo.acceptOwnerOffer({
      offerId: offer.id,
      accountId: recipient,
      at: at(1),
    });

    expect(result).toMatchObject({ previousOwnerId: ownerId, group: { state: 'active' } });
    expect(await repo.findMember(groupId, ownerId)).toMatchObject({
      role: 'member',
      moderatorUnitId: null,
      roleSince: null,
    });
    expect(await repo.findMember(groupId, recipient)).toMatchObject({
      role: 'owner',
      moderatorUnitId: null,
      roleSince: at(1),
      joinedVia: 'approved',
    });
    expect(await typesAfter(before)).toEqual(['group.owner.changed', 'group.owner.offer_decided']);
    const [changed] = await eventsOf('group.owner.changed', groupId);
    expect(changed?.payload).toEqual({
      groupId,
      previousOwnerId: ownerId,
      newOwnerId: recipient,
      cause: 'transfer',
    });
    const [decided] = await eventsOf('group.owner.offer_decided', groupId);
    expect(decided?.payload).toEqual({
      groupId,
      offerId: offer.id,
      kind: 'transfer',
      toAccountId: recipient,
      fromAccountId: ownerId,
      outcome: 'accepted',
    });
  });

  it('nhận lời giao lần đầu: người ngoài vào nhóm bằng đường "master giao", nhóm sang đang hoạt động', async () => {
    const { id: groupId } = await group({ state: 'pending_owner' });
    const recipient = await user();
    const offer = created(
      await repo.createOwnerOffer({
        groupId,
        kind: 'assignment',
        fromAccountId: null,
        toAccountId: recipient,
        at: NOW,
        expiresAt: at(14),
      }),
    );
    const before = (await outboxEvents()).length;

    const result = await repo.acceptOwnerOffer({
      offerId: offer.id,
      accountId: recipient,
      at: NOW,
    });

    expect(result).toMatchObject({ previousOwnerId: null, group: { state: 'active' } });
    expect(await repo.findMember(groupId, recipient)).toMatchObject({
      role: 'owner',
      joinedVia: 'assigned',
      joinedAt: NOW,
      roleSince: NOW,
    });
    expect(await typesAfter(before)).toEqual([
      'group.member.joined',
      'group.owner.changed',
      'group.owner.offer_decided',
    ]);
    const [changed] = await eventsOf('group.owner.changed', groupId);
    expect(changed?.payload).toMatchObject({ previousOwnerId: null, cause: 'assignment' });
  });
});

describe('closeGroup', () => {
  it('huỷ đơn, lời mời, lời giao chủ đang chờ, xoá mã và báo đúng người có đơn / lời mời còn hạn', async () => {
    const { groupId, ownerId } = await groupWithOwner({ mode: 'private_code', code: 'K7M2Q9' });
    const [liveApplicant, staleApplicant, rejectedApplicant] = [
      await user(),
      await user(),
      await user(),
    ];
    const [liveInvitee, staleInvitee] = [await user(), await user()];
    const recipient = await user();
    await member(groupId, recipient);
    await prisma.groupJoinRequest.createMany({
      data: [
        { groupId, accountId: liveApplicant, createdAt: NOW, expiresAt: at(21) },
        { groupId, accountId: staleApplicant, createdAt: at(-30), expiresAt: at(-1) },
        {
          groupId,
          accountId: rejectedApplicant,
          status: 'rejected',
          createdAt: at(-3),
          expiresAt: at(18),
          decidedAt: at(-2),
          decidedBy: ownerId,
        },
      ],
    });
    await prisma.groupInvitation.createMany({
      data: [
        { groupId, accountId: liveInvitee, invitedBy: ownerId, createdAt: NOW, expiresAt: at(14) },
        {
          groupId,
          accountId: staleInvitee,
          invitedBy: ownerId,
          createdAt: at(-20),
          expiresAt: at(-6),
        },
      ],
    });
    created(
      await repo.createOwnerOffer({
        groupId,
        kind: 'transfer',
        fromAccountId: ownerId,
        toAccountId: recipient,
        at: NOW,
        expiresAt: at(14),
      }),
    );
    const before = (await outboxEvents()).length;

    const closed = await repo.closeGroup({
      id: groupId,
      expectStates: CLOSABLE,
      closedBy: ownerId,
      at: at(1),
    });

    expect(closed).toMatchObject({
      state: 'closed',
      closedAt: at(1),
      closedBy: ownerId,
      code: null,
    });
    const requests = await prisma.groupJoinRequest.findMany({ where: { groupId } });
    expect(Object.fromEntries(requests.map((row) => [row.accountId, row.status]))).toEqual({
      [liveApplicant]: 'cancelled',
      [staleApplicant]: 'cancelled',
      [rejectedApplicant]: 'rejected',
    });
    expect(
      await prisma.groupInvitation.count({ where: { groupId, status: { not: 'cancelled' } } }),
    ).toBe(0);
    expect(await prisma.groupOwnerOffer.count({ where: { groupId, status: 'cancelled' } })).toBe(1);
    expect(await repo.countPendingRequestsOf(liveApplicant, at(1))).toBe(0);

    expect(await typesAfter(before)).toEqual(['group.badge.rights_changed', 'group.state.closed']);
    const [event] = await eventsOf('group.state.closed', groupId);
    expect(event?.payload).toEqual({
      groupId,
      closedBy: ownerId,
      cancelledRequestAccountIds: [liveApplicant],
      cancelledInviteeIds: [liveInvitee],
      cancelledOfferAccountIds: [recipient],
    });
    const [badges] = await eventsOf('group.badge.rights_changed', groupId);
    expect(badges?.payload).toEqual({ groupId, accountId: null });

    await group({ mode: 'private_code', code: 'K7M2Q9' });
  });

  it('nhóm đã đóng: lượt đóng thứ hai không ghi gì', async () => {
    const { groupId, ownerId } = await groupWithOwner();
    await repo.closeGroup({ id: groupId, expectStates: CLOSABLE, closedBy: ownerId, at: NOW });
    const before = (await outboxEvents()).length;

    expect(
      await repo.closeGroup({ id: groupId, expectStates: CLOSABLE, closedBy: ownerId, at: at(1) }),
    ).toBeNull();
    expect((await repo.findGroup(groupId))?.closedAt).toEqual(NOW);
    expect((await outboxEvents()).length).toBe(before);
  });
});

describe('expireDue', () => {
  it('hết hạn đúng các dòng đã quá hạn, mỗi dòng một sự kiện; chạy lại không làm gì thêm', async () => {
    const { groupId, ownerId } = await groupWithOwner();
    const other = await groupWithOwner();
    const [dueApplicant, liveApplicant, dueInvitee, liveInvitee] = [
      await user(),
      await user(),
      await user(),
      await user(),
    ];
    const [dueRecipient, liveRecipient] = [await user(), await user()];
    const dueRequest = await prisma.groupJoinRequest.create({
      data: { groupId, accountId: dueApplicant, createdAt: at(-22), expiresAt: at(-1) },
    });
    await prisma.groupJoinRequest.create({
      data: { groupId, accountId: liveApplicant, createdAt: NOW, expiresAt: at(1) },
    });
    const dueInvitation = await prisma.groupInvitation.create({
      data: {
        groupId,
        accountId: dueInvitee,
        invitedBy: ownerId,
        createdAt: at(-14),
        expiresAt: NOW,
      },
    });
    await prisma.groupInvitation.create({
      data: {
        groupId,
        accountId: liveInvitee,
        invitedBy: ownerId,
        createdAt: NOW,
        expiresAt: at(1),
      },
    });
    const dueOffer = await prisma.groupOwnerOffer.create({
      data: {
        groupId,
        kind: 'transfer',
        fromAccountId: ownerId,
        toAccountId: dueRecipient,
        createdAt: at(-15),
        expiresAt: at(-1),
      },
    });
    await prisma.groupOwnerOffer.create({
      data: {
        groupId: other.groupId,
        kind: 'assignment',
        toAccountId: liveRecipient,
        createdAt: NOW,
        expiresAt: at(1),
      },
    });
    const before = (await outboxEvents()).length;

    expect(await repo.expireDue(NOW)).toEqual({ requests: 1, invitations: 1, offers: 1 });

    expect(
      await prisma.groupJoinRequest.findMany({
        where: { status: 'expired' },
        select: { id: true, decidedAt: true },
      }),
    ).toEqual([{ id: dueRequest.id, decidedAt: NOW }]);
    expect(
      await prisma.groupInvitation.findMany({ where: { status: 'expired' }, select: { id: true } }),
    ).toEqual([{ id: dueInvitation.id }]);
    expect(
      await prisma.groupOwnerOffer.findMany({ where: { status: 'expired' }, select: { id: true } }),
    ).toEqual([{ id: dueOffer.id }]);
    expect(await prisma.groupJoinRequest.count({ where: { status: 'pending' } })).toBe(1);
    expect(await prisma.groupInvitation.count({ where: { status: 'pending' } })).toBe(1);
    expect(await prisma.groupOwnerOffer.count({ where: { status: 'pending' } })).toBe(1);

    const events = (await outboxEvents()).slice(before);
    expect(events.map((event) => [event.type, event.payload]).toSorted()).toEqual(
      [
        [
          'group.invitation.decided',
          { groupId, invitationId: dueInvitation.id, accountId: dueInvitee, outcome: 'expired' },
        ],
        [
          'group.join_request.decided',
          { groupId, requestId: dueRequest.id, accountId: dueApplicant, outcome: 'expired' },
        ],
        [
          'group.owner.offer_decided',
          {
            groupId,
            offerId: dueOffer.id,
            kind: 'transfer',
            toAccountId: dueRecipient,
            fromAccountId: ownerId,
            outcome: 'expired',
          },
        ],
      ].toSorted(),
    );

    const after = (await outboxEvents()).length;
    expect(await repo.expireDue(NOW)).toEqual({ requests: 0, invitations: 0, offers: 0 });
    expect((await outboxEvents()).length).toBe(after);
  });
});

const ownerlessFor = async (ms: number) =>
  (await group({ state: 'ownerless', ownerlessSince: new Date(NOW.getTime() - ms) })).id;

describe('lockOwnerlessTimedOut', () => {
  it('chỉ khoá nhóm thiếu chủ quá số ngày cho trước, mỗi nhóm một sự kiện; chạy lại không khoá thêm', async () => {
    const days31 = await ownerlessFor(31 * DAY_MS);
    const justOver = await ownerlessFor(30 * DAY_MS + 1);
    const justUnder = await ownerlessFor(30 * DAY_MS - 1);
    const days29 = await ownerlessFor(29 * DAY_MS);
    const { groupId: active } = await groupWithOwner();
    const { id: masterLocked } = await group({
      state: 'locked',
      lockedAt: at(-40),
      lockCause: 'master',
      lockedReason: 'Vi phạm',
      ownerlessSince: at(-60),
    });
    const before = (await outboxEvents()).length;

    const locked = await repo.lockOwnerlessTimedOut(NOW, 30);

    expect(locked.toSorted()).toEqual([days31, justOver].toSorted());
    expect(await repo.findGroup(days31)).toMatchObject({
      state: 'locked',
      lockCause: 'ownerless_timeout',
      lockedAt: NOW,
    });
    const untouched = await Promise.all([justUnder, days29].map((id) => repo.findGroup(id)));
    expect(untouched.map((row) => row?.state)).toEqual(['ownerless', 'ownerless']);
    expect((await repo.findGroup(active))?.state).toBe('active');
    expect(await repo.findGroup(masterLocked)).toMatchObject({
      lockCause: 'master',
      lockedAt: at(-40),
    });
    const events = (await outboxEvents()).slice(before);
    expect(events.map((event) => event.payload)).toEqual(
      expect.arrayContaining(
        [days31, justOver].map((groupId) => ({ groupId, cause: 'ownerless_timeout' })),
      ),
    );
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.type))).toEqual(new Set(['group.state.locked']));

    expect(await repo.lockOwnerlessTimedOut(NOW, 30)).toEqual([]);
    expect((await repo.lockOwnerlessTimedOut(NOW, 28)).toSorted()).toEqual(
      [justUnder, days29].toSorted(),
    );
  });
});

/** Đi hết các trang như bên gửi thông báo cho cả nhóm: mỗi trang tiếp sau mã cuối của trang trước. */
const allPages = async (
  groupId: string,
  take: number,
  unitId?: string,
  after?: string,
): Promise<string[]> => {
  const page = await repo.memberIds(groupId, {
    take,
    ...(unitId ? { unitId } : {}),
    ...(after ? { after } : {}),
  });
  const last = page.at(-1);
  return page.length === take && last
    ? [...page, ...(await allPages(groupId, take, unitId, last))]
    : page;
};

describe('memberIds', () => {
  it('đi hết các trang: đủ mọi thành viên, không trùng, không lẫn nhóm khác; lọc theo đơn vị', async () => {
    const { groupId, ownerId } = await groupWithOwner();
    const unit = await prisma.groupUnit.create({ data: { groupId, name: '12A1' } });
    const inUnit = await Promise.all([1, 2, 3].map(async () => user()));
    const others = await Promise.all([1, 2, 3, 4].map(async () => user()));
    await Promise.all([
      ...inUnit.map((id) => member(groupId, id, 'member', { unitId: unit.id })),
      ...others.map((id) => member(groupId, id)),
    ]);
    const elsewhere = await groupWithOwner();
    await member(elsewhere.groupId, await user());

    const everyone = await allPages(groupId, 3);
    expect(everyone).toHaveLength(8);
    expect(new Set(everyone)).toEqual(new Set([ownerId, ...inUnit, ...others]));

    const unitOnly = await allPages(groupId, 2, unit.id);
    expect(unitOnly).toHaveLength(3);
    expect(new Set(unitOnly)).toEqual(new Set(inUnit));
  });
});
