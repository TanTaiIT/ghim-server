import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';
import { seedAccount } from './ops-helpers.js';

/*
 * Ràng buộc của migration `init_notification`: giao trùng một sự kiện không sinh hai dòng (unique nguồn + người nhận
 * — bên nghe outbox dựa vào nó để idempotent), CHECK số đếm của dòng gộp, khoá chính bật tắt / tắt tiếng, và dọn
 * theo tài khoản, theo nhóm.
 */
const UNIQUE = 'P2002';
const FOREIGN_KEY = 'P2003';
const CHECK = '23514';
const NOW = new Date('2026-10-11T04:00:00.000Z');

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

const notice = (
  recipientId: string,
  overrides: Partial<Prisma.NotificationUncheckedCreateInput> = {},
): Prisma.NotificationUncheckedCreateInput => ({
  recipientId,
  category: 'your_groups',
  type: 'group.join_request.approved',
  title: 'Nhóm thử',
  body: 'Bạn đã là thành viên «Nhóm thử».',
  data: {},
  alert: true,
  sourceEventId: randomUUID(),
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

async function group(createdBy: string) {
  return prisma.group.create({
    data: {
      name: 'Nhóm thử',
      nameFolded: 'NHOM THU',
      kind: 'school',
      mode: 'public_review',
      state: 'active',
      createdBy,
    },
  });
}

describe('notifications', () => {
  it('một sự kiện, một người nhận: dòng thứ hai → P2002; cùng sự kiện cho người khác thì được', async () => {
    const [first, second] = await Promise.all([seedAccount(), seedAccount()]);
    const sourceEventId = randomUUID();
    await prisma.notification.create({ data: notice(first.id, { sourceEventId }) });
    expect(
      await prismaErrorCode(
        prisma.notification.create({ data: notice(first.id, { sourceEventId }) }),
      ),
    ).toBe(UNIQUE);
    expect(
      await prismaErrorCode(
        prisma.notification.create({ data: notice(second.id, { sourceEventId }) }),
      ),
    ).toBeNull();
  });

  it('số đếm của dòng gộp không dưới 1 → 23514', async () => {
    const { id } = await seedAccount();
    expect(await sqlStateOf(prisma.notification.create({ data: notice(id, { count: 0 }) }))).toBe(
      CHECK,
    );
  });

  it('người nhận không tồn tại → P2003', async () => {
    expect(await prismaErrorCode(prisma.notification.create({ data: notice(randomUUID()) }))).toBe(
      FOREIGN_KEY,
    );
  });
});

describe('notification_preferences và group_notification_mutes', () => {
  it('một dòng mỗi (người, nhóm thông báo) và mỗi (người, nhóm) → P2002', async () => {
    const { id: accountId } = await seedAccount();
    const { id: groupId } = await group(accountId);
    const preference = { accountId, category: 'group_announcements', enabled: false } as const;
    await prisma.notificationPreference.create({ data: preference });
    expect(await prismaErrorCode(prisma.notificationPreference.create({ data: preference }))).toBe(
      UNIQUE,
    );
    await prisma.groupNotificationMute.create({ data: { accountId, groupId, createdAt: NOW } });
    expect(
      await prismaErrorCode(
        prisma.groupNotificationMute.create({ data: { accountId, groupId, createdAt: NOW } }),
      ),
    ).toBe(UNIQUE);
  });

  it('tắt tiếng nhóm không tồn tại → P2003', async () => {
    const { id: accountId } = await seedAccount();
    expect(
      await prismaErrorCode(
        prisma.groupNotificationMute.create({
          data: { accountId, groupId: randomUUID(), createdAt: NOW },
        }),
      ),
    ).toBe(FOREIGN_KEY);
  });
});

describe('dọn theo chủ', () => {
  it('xoá hẳn tài khoản (việc dọn dữ liệu) mang theo hộp thư, bật tắt, tắt tiếng của người đó', async () => {
    const { id: creator } = await seedAccount();
    const { id: accountId } = await seedAccount();
    const { id: groupId } = await group(creator);
    await prisma.notification.create({ data: notice(accountId) });
    await prisma.notificationPreference.create({
      data: { accountId, category: 'group_announcements', enabled: false },
    });
    await prisma.groupNotificationMute.create({ data: { accountId, groupId, createdAt: NOW } });
    await prisma.account.delete({ where: { id: accountId } });
    expect(await prisma.notification.count({ where: { recipientId: accountId } })).toBe(0);
    expect(await prisma.notificationPreference.count({ where: { accountId } })).toBe(0);
    expect(await prisma.groupNotificationMute.count({ where: { accountId } })).toBe(0);
  });
});
