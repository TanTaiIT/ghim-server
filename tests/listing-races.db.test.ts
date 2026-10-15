import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import type { ListingTrustPort } from '../src/modules/listing/listing.ports.js';
import { prisma } from './db-helpers.js';
import { addMember, createActiveGroup, deliverAll, newUser } from './group-helpers.js';
import {
  getOwn,
  groupSettings,
  listingApi,
  liveListingOf,
  patch,
  readyDraft,
  signedInAt,
  submit,
} from './listing-http-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Bảng tranh chấp của design add-listings mục 19: mỗi dòng hai lượt chạy song song trên Postgres thật. Hai dòng có khoá
 * nhóm dùng một cổng `trust` giả dừng lượt gửi NGAY TRONG transaction (sau `lockForPosting`, trước khi ghi) tới khi
 * lượt kia đã chạy và đang chờ khoá — thứ tự xen kẽ cố định, không trông vào may rủi của bộ lập lịch.
 */
const DAY_MS = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;
interface Gate {
  /** Lượt gửi đã vào transaction và đang giữ khoá nhóm. */
  reached: PromiseWithResolvers<void>;
  hold: PromiseWithResolvers<void>;
}
let gate: Gate | null = null;

/** Mở một chốt: lượt gửi kế tiếp dừng trong transaction tới khi `hold.resolve()`. */
function armGate(): Gate {
  gate = { reached: Promise.withResolvers<void>(), hold: Promise.withResolvers<void>() };
  return gate;
}

const pausingTrust: ListingTrustPort = {
  ...createInterimTrust('T1'),
  async assertCanSubmit() {
    const current = gate;
    if (!current) return;
    gate = null;
    current.reached.resolve();
    await current.hold.promise;
  },
};

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, trust: pausingTrust, screening: interimScreening });
  await app.ready();
});

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });
/** Đủ lâu để lượt kia chạy tới chỗ chờ khoá dòng nhóm / khoá cặp. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe('Bấm Đăng nhiều lần', () => {
  it('năm lượt gửi cùng một nháp cùng lúc: một tin đang kiểm, một lượt gửi, cả năm nhận cùng tin', async () => {
    const owner = await newUser(app);
    const draft = await readyDraft(app, owner);
    const results = await Promise.all(Array.from({ length: 5 }, () => submit(app, owner, draft)));
    expect(results.map((res) => res.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(results.map((res) => res.json().data.version))).toEqual(
      new Set([draft.version + 1]),
    );
    expect(await prisma.listingSubmission.count({ where: { listingId: draft.id } })).toBe(1);
  });
});

describe('Gửi "nhóm công khai" đua với đổi sang riêng tư (cam kết 22)', () => {
  it('lượt gửi đang giữ nhóm: lượt đổi chế độ chờ, đếm thấy tin, đi qua đang chuyển riêng tư', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const draft = await readyDraft(app, member, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    const paused = armGate();
    const sending = submit(app, member, draft);
    await paused.reached.promise;
    let switched = false;
    const switching = (async () => {
      await groupSettings(app, group.owner, group.groupId, { mode: 'private_code' });
      switched = true;
    })();
    await settle();
    // Lượt đổi chế độ đang chờ khoá dòng nhóm mà lượt gửi giữ (FOR SHARE) — chưa thể đếm sai.
    expect(switched).toBe(false);
    paused.hold.resolve();
    expect((await sending).json().data.state).toBe('checking');
    await switching;
    expect(await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } })).toMatchObject({
      state: 'going_private',
    });
    await deliverAll(app);
    expect(await prisma.group.findUniqueOrThrow({ where: { id: group.groupId } })).toMatchObject({
      state: 'active',
      mode: 'private_code',
    });
    expect((await row(draft.id)).placement).toBe('members_only');
  });

  it('đổi chế độ xong trước: lượt gửi sau thấy nhóm riêng tư — 409, không tin "nhóm công khai" nào lọt', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const draft = await readyDraft(app, member, {
      placement: 'group_public',
      groupId: group.groupId,
    });
    await groupSettings(app, group.owner, group.groupId, { mode: 'private_code' });
    const res = await submit(app, member, draft);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('PLACEMENT_NOT_ALLOWED');
    expect((await row(draft.id)).state).toBe('draft');
  });
});

describe('Gửi vào nhóm đua với bị cấm', () => {
  it('lượt gửi đang giữ khoá cặp: lượt cấm chờ, rồi tin vừa gửi bị ẩn "bị cấm khỏi nhóm"', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const draft = await readyDraft(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    const paused = armGate();
    const sending = submit(app, member, draft);
    await paused.reached.promise;
    let banned = false;
    const banning = (async () => {
      await listingApi(app, 'PUT', `/groups/${group.groupId}/bans/${member.id}`, group.owner);
      banned = true;
    })();
    await settle();
    expect(banned).toBe(false);
    paused.hold.resolve();
    await Promise.all([sending, banning]);
    await deliverAll(app);
    expect(await row(draft.id)).toMatchObject({
      state: 'checking',
      hideReasons: ['removed_from_group', 'group_banned'],
    });
  });
});

describe('Kết quả máy, sửa và bên nghe chạy cùng lúc', () => {
  it('kết quả cũ của máy về đúng lúc người đăng sửa tin chờ duyệt: kết quả cũ bị bỏ qua', async () => {
    const owner = await newUser(app);
    const sent = (await submit(app, owner, await readyDraft(app, owner))).json().data;
    await app.modules.listing.applyMachineOutcome({
      listingId: sent.id,
      listingVersion: sent.version,
      outcome: 'hold',
      restrictMachine: false,
    });
    const pending = await getOwn(app, owner, sent.id);
    const [edited, stale] = await Promise.all([
      patch(app, owner, pending, { title: 'Sửa lúc chờ duyệt' }),
      app.modules.listing.applyMachineOutcome({
        listingId: sent.id,
        listingVersion: sent.version,
        outcome: 'pass',
        restrictMachine: false,
      }),
    ]);
    expect(edited.statusCode).toBe(200);
    expect(stale).toBe(false);
    expect(await row(sent.id)).toMatchObject({
      state: 'checking',
      version: pending.version + 1,
      title: 'Sửa lúc chờ duyệt',
    });
  });

  it('hai thiết bị cùng sửa một phiên bản: đúng một lượt được, lượt kia 409 CONFLICT', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    const results = await Promise.all([
      patch(app, owner, live, { title: 'Máy A' }),
      patch(app, owner, live, { title: 'Máy B' }),
    ]);
    expect(results.map((res) => res.statusCode).toSorted()).toEqual([200, 409]);
    expect(results.map((res) => (res.statusCode === 409 ? codeOf(res) : 'ok')).toSorted()).toEqual([
      'CONFLICT',
      'ok',
    ]);
    expect(await prisma.listingSubmission.count({ where: { listingId: live.id } })).toBe(2);
  });

  it('bên nghe đặt lý do đúng lúc người đăng sửa: cả nội dung sửa lẫn lý do đều còn', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    await Promise.all([
      patch(app, member, live, { title: 'Sửa giữa lúc khoá' }),
      app.modules.listing.onHideEvent(
        { groupId: group.groupId },
        { kind: 'group_locked' },
        group.groupId,
      ),
    ]);
    expect(await row(live.id)).toMatchObject({
      title: 'Sửa giữa lúc khoá',
      state: 'checking',
      hideReasons: ['group_locked'],
    });
  });

  it('việc hết hạn đua với gia hạn sớm: một trong hai thắng, không bao giờ cả hai', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    now = new Date(TEST_NOW.getTime() + 30 * DAY_MS + 60_000);
    try {
      const fresh = await getOwn(app, await signedInAt(app, owner, now), live.id);
      const [, renewed] = await Promise.all([
        app.modules.listing.expireDue(),
        listingApi(app, 'POST', `/listings/${live.id}/renew`, await signedInAt(app, owner, now), {
          version: fresh.version,
        }),
      ]);
      const after = await row(live.id);
      const expireEvents = await prisma.outboxEvent.count({
        where: {
          type: 'listing.state.changed',
          payload: { path: ['listingId'], equals: live.id },
          AND: { payload: { path: ['arrow'], equals: 'expire' } },
        },
      });
      // Ba kết cục hợp lệ: gia hạn sớm thắng (job bỏ qua), job thắng rồi lượt gửi đi đường gia hạn tin hết hạn,
      // hay hai lượt xen nhau — job đã tăng phiên bản nên lượt gửi nhận 409 `CONFLICT`, app tải lại thấy tin hết hạn.
      // Không bao giờ vừa hết hạn vừa gia hạn sớm.
      if (renewed.statusCode === 200 && after.renewal === 'early') {
        expect(after.state).toBe('checking');
        expect(expireEvents).toBe(0);
      } else if (renewed.statusCode === 200) {
        expect(after).toMatchObject({ state: 'checking', renewal: 'expired' });
        expect(expireEvents).toBe(1);
      } else {
        expect(codeOf(renewed)).toBe('CONFLICT');
        expect(after.state).toBe('expired');
        expect(expireEvents).toBe(1);
      }
    } finally {
      now = TEST_NOW;
    }
  });
});

describe('Gắn huy hiệu đua với mất quyền', () => {
  it('gắn và rời nhóm cùng lúc: bên nghe chạy sau cả hai, tin không giữ huy hiệu', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId, { via: 'approved' });
    const live = await liveListingOf(app, member);
    await Promise.all([
      patch(app, member, live, { badgeGroupId: group.groupId }),
      listingApi(app, 'POST', `/groups/${group.groupId}/leave`, member),
    ]);
    await deliverAll(app);
    expect((await row(live.id)).badgeGroupId).toBeNull();
  });
});
