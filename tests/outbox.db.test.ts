import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { appendEvent } from '../src/common/outbox/outbox.js';
import { prisma, truncateAll } from './db-helpers.js';

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

describe('appendEvent', () => {
  it('transaction gốc rollback thì không còn dòng sự kiện nào', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await appendEvent(tx, 'identity.account.locked', { accountId: 'x' });
        throw new Error('rollback cố ý');
      }),
    ).rejects.toThrow('rollback cố ý');
    await expect(prisma.outboxEvent.count()).resolves.toBe(0);
  });

  it('commit thì sự kiện nằm chờ với payload nguyên vẹn và chưa phát', async () => {
    await prisma.$transaction(async (tx) => {
      await appendEvent(tx, 'identity.account.locked', { accountId: 'x', reason: 'Thử' });
    });
    const [event] = await prisma.outboxEvent.findMany();
    expect(event).toMatchObject({
      type: 'identity.account.locked',
      payload: { accountId: 'x', reason: 'Thử' },
      publishedAt: null,
    });
  });
});
