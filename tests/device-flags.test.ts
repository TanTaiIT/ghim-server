import { describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/actor.js';
import { createFakeIdentityRepository } from './fakes/identity-repository.fake.js';
import { buildIdentityService } from './identity.service.test.js';

/*
 * `recordListingSubmission` trên repository giả: ba requirement đánh dấu của spec device-registry
 * ở mức service (tạo / đóng dòng, mã tra cứu, sự kiện) — luật thuần đã có test riêng ở device.calc.
 * "Thời gian trôi" giữa hai lượt gửi tin = dựng lại service trên cùng repository với đồng hồ khác;
 * mỗi lượt gửi một mốc riêng vì chỗ trên máy xếp theo lần đăng đầu tiên.
 */
const START = new Date('2026-10-10T09:00:00+07:00');
const SECOND_MS = 1_000;
const DAY_MS = 86_400_000;
const MASTER_ID = '00000000-0000-7000-8000-00000000000a';
const MASTER: Actor = {
  accountId: MASTER_ID,
  role: 'master',
  sessionId: 's',
  secondFactorAt: START,
  emailVerified: true,
};
const SUPPORT: Actor = { ...MASTER, role: 'user' };

type Repository = ReturnType<typeof createFakeIdentityRepository>;

const at = (offsetMs: number): Date => new Date(START.getTime() + offsetMs);

const serviceAt = (repository: Repository, now: Date) =>
  buildIdentityService({ now, repository }).service;

/** Gửi tin lúc `when` — một service mới cho mỗi mốc. */
const post = (repository: Repository, accountId: string, device: string, when: Date) =>
  serviceAt(repository, when).recordListingSubmission(accountId, device);

async function accounts(repository: Repository, names: string[]): Promise<Record<string, string>> {
  const rows = await Promise.all(
    names.map((name) => {
      const email = `${name.toLowerCase()}@ghim.test`;
      return repository.createAccount({
        email,
        emailNormalized: email,
        emailHash: email,
        passwordHash: 'x',
        googleSub: null,
        status: 'active',
        displayName: name,
        at: START,
      });
    }),
  );
  return Object.fromEntries(names.map((name, index) => [name, rows[index]?.id ?? '']));
}

const kinds = async (repository: Repository, id: string) =>
  (await repository.findOpenFlags(id)).map((flag) => flag.kind);

/** A, B, C mỗi người gửi một tin từ `device`, cách nhau một giây. */
async function threeOnDevice(repository: Repository, ids: Record<string, string>, device: string) {
  await post(repository, ids.A ?? '', device, at(0));
  await post(repository, ids.B ?? '', device, at(SECOND_MS));
  await post(repository, ids.C ?? '', device, at(2 * SECOND_MS));
}

describe('recordListingSubmission — chỗ trên máy', () => {
  it('ba tài khoản đầu không bị đánh dấu; tài khoản thứ tư có một đánh dấu với mã tra cứu 8 ký tự và sự kiện flagged', async () => {
    const repository = createFakeIdentityRepository();
    const ids = await accounts(repository, ['A', 'B', 'C', 'D']);
    await threeOnDevice(repository, ids, 'may-1');
    expect(await kinds(repository, ids.C ?? '')).toEqual([]);

    await post(repository, ids.D ?? '', 'may-1', at(3 * SECOND_MS));
    const flags = await repository.findOpenFlags(ids.D ?? '');
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: 'many_accounts_on_device', relatedAccountId: null });
    expect(flags[0]?.lookupCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(repository.events.at(-1)).toMatchObject({
      type: 'identity.device.flagged',
      payload: {
        accountId: ids.D,
        kind: 'many_accounts_on_device',
        lookupCode: flags[0]?.lookupCode,
      },
    });

    // Gửi tiếp vẫn một đánh dấu, không nhân đôi, không sự kiện mới.
    const eventsBefore = repository.events.length;
    await post(repository, ids.D ?? '', 'may-1', at(4 * SECOND_MS));
    expect(await repository.findOpenFlags(ids.D ?? '')).toHaveLength(1);
    expect(repository.events).toHaveLength(eventsBefore);
  });

  it('dấu thiết bị chỉ lưu dạng băm; hai máy khác nhau là hai bộ đếm', async () => {
    const repository = createFakeIdentityRepository();
    const ids = await accounts(repository, ['A', 'B', 'C', 'D']);
    await threeOnDevice(repository, ids, 'may-1');
    await post(repository, ids.D ?? '', 'may-2', at(3 * SECOND_MS));
    expect(await kinds(repository, ids.D ?? '')).toEqual([]);
    expect(
      repository.devicePosts.every(
        (row) => row.deviceHash !== 'may-1' && row.deviceHash.length === 64,
      ),
    ).toBe(true);
  });

  it('chỗ trống ra (tài khoản cũ im quá 90 ngày) thì đánh dấu của tài khoản thứ tư được đóng với lý do hệ thống', async () => {
    const repository = createFakeIdentityRepository();
    const ids = await accounts(repository, ['A', 'B', 'C', 'D']);
    await threeOnDevice(repository, ids, 'may-1');
    await post(repository, ids.D ?? '', 'may-1', at(3 * SECOND_MS));
    expect(await kinds(repository, ids.D ?? '')).toEqual(['many_accounts_on_device']);

    // 91 ngày sau: B, C quay lại đăng, A im lặng → A rơi khỏi cửa sổ, D lên chỗ thứ ba.
    await post(repository, ids.B ?? '', 'may-1', at(91 * DAY_MS));
    await post(repository, ids.C ?? '', 'may-1', at(91 * DAY_MS + SECOND_MS));
    await post(repository, ids.D ?? '', 'may-1', at(91 * DAY_MS + 2 * SECOND_MS));
    expect(await kinds(repository, ids.D ?? '')).toEqual([]);
    const closed = [...repository.flags.values()].find((flag) => flag.accountId === ids.D);
    expect(closed).toMatchObject({
      clearedBy: null,
      clearedReason: expect.stringContaining('Không còn thoả'),
    });
    expect(repository.events.at(-1)).toMatchObject({
      type: 'identity.device.flag_cleared',
      payload: { accountId: ids.D },
    });
  });
});

describe('recordListingSubmission — máy của tài khoản bị khoá và gỡ đánh dấu', () => {
  it('B đăng tin lần đầu sau khi A bị khoá → đánh dấu trỏ tới A; mở khoá A → đánh dấu đóng', async () => {
    const repository = createFakeIdentityRepository();
    const ids = await accounts(repository, ['A', 'B']);
    await post(repository, ids.A ?? '', 'may-1', at(0));
    await repository.lockAccount({
      accountId: ids.A ?? '',
      reason: 'x',
      lockedBy: MASTER_ID,
      at: at(SECOND_MS),
      events: [],
    });

    await post(repository, ids.B ?? '', 'may-1', at(2 * SECOND_MS));
    expect(await repository.findOpenFlags(ids.B ?? '')).toEqual([
      expect.objectContaining({ kind: 'device_of_locked_account', relatedAccountId: ids.A }),
    ]);

    await serviceAt(repository, at(3 * SECOND_MS)).unlockAccount(MASTER, ids.A ?? '');
    expect(await kinds(repository, ids.B ?? '')).toEqual([]);
  });

  it('hỗ trợ gỡ đánh dấu kèm lý do → hết đánh dấu, lượt gửi tin kế tiếp không bị đánh dấu lại vì chủ cũ', async () => {
    const repository = createFakeIdentityRepository();
    const ids = await accounts(repository, ['A', 'B', 'C', 'X']);
    await threeOnDevice(repository, ids, 'may-1');
    await post(repository, ids.X ?? '', 'may-1', at(DAY_MS));
    const [flag] = await repository.findOpenFlags(ids.X ?? '');
    expect(flag?.kind).toBe('many_accounts_on_device');

    const support = serviceAt(repository, at(2 * DAY_MS));
    await support.clearFlag(SUPPORT, flag?.lookupCode ?? '', 'Máy mua lại');
    expect(await kinds(repository, ids.X ?? '')).toEqual([]);
    expect([...repository.clearances.values()]).toEqual([
      expect.objectContaining({ accountId: ids.X, reason: 'Máy mua lại' }),
    ]);

    await post(repository, ids.X ?? '', 'may-1', at(3 * DAY_MS));
    expect(await kinds(repository, ids.X ?? '')).toEqual([]);

    const later = serviceAt(repository, at(4 * DAY_MS));
    await expect(later.clearFlag(SUPPORT, flag?.lookupCode ?? '', 'lại')).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(later.clearFlag(SUPPORT, 'KHONGCO1', 'x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
