import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createOutboxDispatcher } from '../src/common/outbox/dispatcher.js';
import { appendAudit } from '../src/common/audit/audit.js';
import { prisma, truncateAll } from './db-helpers.js';

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

describe('createOutboxDispatcher', () => {
  it('phát mỗi sự kiện đúng một lần theo thứ tự tạo, chỉ cho bên nghe của loại đó', async () => {
    await prisma.outboxEvent.createMany({
      data: [
        { type: 'identity.account.locked', payload: { accountId: 'a' } },
        { type: 'identity.account.unlocked', payload: { accountId: 'a' } },
        { type: 'identity.account.locked', payload: { accountId: 'b' } },
      ],
    });
    const seen: string[] = [];
    const dispatcher = createOutboxDispatcher(prisma);
    dispatcher.register('identity.account.locked', async (payload) => {
      seen.push(String(payload.accountId));
    });

    expect(await dispatcher.runOnce()).toEqual({ published: 3, failed: 0 });
    expect(seen).toEqual(['a', 'b']);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
    // Lượt sau không phát lại.
    expect(await dispatcher.runOnce()).toEqual({ published: 0, failed: 0 });
    expect(seen).toEqual(['a', 'b']);
  });

  it('bên nghe ném thì giữ sự kiện với attempts tăng và last_error, lượt sau thử lại', async () => {
    const event = await prisma.outboxEvent.create({
      data: { type: 'identity.account.locked', payload: { accountId: 'a' } },
    });
    let fail = true;
    const dispatcher = createOutboxDispatcher(prisma);
    dispatcher.register('identity.account.locked', async () => {
      if (fail) throw new Error('bên nghe hỏng');
    });

    expect(await dispatcher.runOnce()).toEqual({ published: 0, failed: 1 });
    expect(await prisma.outboxEvent.findUnique({ where: { id: event.id } })).toMatchObject({
      publishedAt: null,
      attempts: 1,
      lastError: expect.stringContaining('bên nghe hỏng'),
    });

    // Lượt ngay sau chưa tới giờ hẹn: sự kiện hỏng lùi lại, không bị nhận lại liền.
    fail = false;
    expect(await dispatcher.runOnce()).toEqual({ published: 0, failed: 0 });
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 5_000);
    expect(row.lockedUntil).toBeNull();

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { nextAttemptAt: new Date() },
    });
    expect(await dispatcher.runOnce()).toEqual({ published: 1, failed: 0 });
    expect(
      (await prisma.outboxEvent.findUnique({ where: { id: event.id } }))?.publishedAt,
    ).not.toBeNull();
  });

  it('100 sự kiện hỏng không chặn sự kiện mới: lượt sau phát sự kiện tạo sau chúng', async () => {
    const earlier = new Date(Date.now() - 60_000);
    await prisma.outboxEvent.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        type: 'test.poison.event',
        payload: { index },
        createdAt: earlier,
        nextAttemptAt: earlier,
      })),
    });
    await prisma.outboxEvent.create({ data: { type: 'test.good.event', payload: {} } });
    const dispatcher = createOutboxDispatcher(prisma);
    const good: string[] = [];
    dispatcher.register('test.poison.event', async () => {
      throw new Error('hỏng mãi');
    });
    dispatcher.register('test.good.event', async (_payload, event) => {
      good.push(event.id);
    });

    expect(await dispatcher.runOnce()).toEqual({ published: 0, failed: 100 });
    expect(await dispatcher.runOnce()).toEqual({ published: 1, failed: 0 });
    expect(good).toHaveLength(1);
  });

  it('hai bộ phát chạy cùng lúc không phát trùng sự kiện nào', async () => {
    await prisma.outboxEvent.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        type: 'identity.account.locked',
        payload: { index },
      })),
    });
    const seen: number[] = [];
    const make = () => {
      const dispatcher = createOutboxDispatcher(prisma);
      dispatcher.register('identity.account.locked', async (payload) => {
        seen.push(Number(payload.index));
      });
      return dispatcher;
    };
    const [first, second] = await Promise.all([make().runOnce(), make().runOnce()]);

    expect(first.published + second.published).toBe(50);
    expect(seen.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, index) => index));
  });

  it('lô đang được giữ thì không ai nhận; hết hạn giữ thì nhận lại', async () => {
    const held = await prisma.outboxEvent.create({
      data: {
        type: 'identity.account.locked',
        payload: {},
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    const dispatcher = createOutboxDispatcher(prisma);
    dispatcher.register('identity.account.locked', async () => {});

    expect(await dispatcher.runOnce()).toEqual({ published: 0, failed: 0 });
    await prisma.outboxEvent.update({
      where: { id: held.id },
      data: { lockedUntil: new Date(Date.now() - 1_000) },
    });
    expect(await dispatcher.runOnce()).toEqual({ published: 1, failed: 0 });
  });
});

describe('appendAudit', () => {
  it('rollback theo transaction gốc; commit thì đủ cột và không sửa được', async () => {
    const actor = await prisma.account.create({
      data: {
        email: 'm@ghim.test',
        emailNormalized: 'm@ghim.test',
        emailHash: 'h',
        passwordHash: 'x',
        displayName: 'Master',
        status: 'active',
        role: 'master',
      },
    });
    const entry = {
      actorId: actor.id,
      actorRole: 'master' as const,
      action: 'identity.account.lock' as const,
      targetType: 'account',
      targetId: 'x',
      reason: 'Thử',
      details: { version: 2 },
    };
    await expect(
      prisma.$transaction(async (tx) => {
        await appendAudit(tx, entry);
        throw new Error('rollback cố ý');
      }),
    ).rejects.toThrow('rollback cố ý');
    expect(await prisma.auditLog.count()).toBe(0);

    await prisma.$transaction((tx) => appendAudit(tx, entry));
    const [row] = await prisma.auditLog.findMany();
    expect(row).toMatchObject({ ...entry, details: { version: 2 } });
  });
});
