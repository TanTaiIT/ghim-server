import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { prisma, truncateAll } from './db-helpers.js';

/* Trần lần sai và tiêu mã một lần trên Postgres thật, với transaction chạy đồng thời. */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const repository = createIdentityRepository(prisma);

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

async function liveCode() {
  const account = await prisma.account.create({
    data: {
      email: 'a@ghim.test',
      emailNormalized: 'a@ghim.test',
      emailHash: 'h',
      passwordHash: 'x',
      displayName: 'A',
      status: 'pending_verification',
    },
  });
  const code = await repository.issueCode({
    accountId: account.id,
    purpose: 'email_verify',
    codeHash: 'hmac',
    targetEmail: null,
    expiresAt: new Date(NOW.getTime() + 600_000),
    at: NOW,
  });
  return { accountId: account.id, codeId: code.id };
}

describe('recordWrongCode', () => {
  it('10 lượt cùng lúc: mỗi lượt thấy một số khác nhau, mã huỷ đúng một lần', async () => {
    const { codeId } = await liveCode();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        repository.recordWrongCode({ id: codeId, maxAttempts: 5, at: NOW }),
      ),
    );

    expect(results.map((result) => result.attempts).toSorted((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(results.filter((result) => result.cancelled)).toHaveLength(6);
    const row = await prisma.verificationCode.findUniqueOrThrow({ where: { id: codeId } });
    expect(row).toMatchObject({ attempts: 10, consumedAt: NOW });
  });
});

describe('applyAccountChange tiêu mã có điều kiện', () => {
  it('hai lượt tiêu cùng một mã cùng lúc: đúng một lượt ghi được', async () => {
    const { accountId, codeId } = await liveCode();
    const change = () =>
      repository.applyAccountChange({
        accountId,
        consumeCodeId: codeId,
        patch: { status: 'active' },
        at: NOW,
        events: [{ type: 'identity.account.verified', payload: { accountId } }],
      });
    const results = await Promise.all([change(), change()]);

    expect(results.toSorted()).toEqual([false, true]);
    expect(await prisma.outboxEvent.count()).toBe(1);
  });

  it('mã đã bị huỷ vì sai quá trần: lượt tiêu trả false và tài khoản không đổi', async () => {
    const { accountId, codeId } = await liveCode();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        repository.recordWrongCode({ id: codeId, maxAttempts: 5, at: NOW }),
      ),
    );
    expect(
      await repository.applyAccountChange({
        accountId,
        consumeCodeId: codeId,
        patch: { status: 'active' },
        at: NOW,
        events: [],
      }),
    ).toBe(false);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).status).toBe(
      'pending_verification',
    );
  });
});
