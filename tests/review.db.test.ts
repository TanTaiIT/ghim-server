import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/*
 * Ràng buộc chỉ DB trả lời được của migration `init_review`: một việc mở mỗi tin (partial unique), mỗi CHECK viết tay
 * (23514), và cột lý do người đăng thấy chỉ đi cùng một lỗi của tin.
 */
const UNIQUE = 'P2002';
const CHECK = '23514';
const HOUR_MS = 3_600_000;

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

async function listingId(): Promise<string> {
  const owner = await seedAccount();
  return (await seedListing(liveListing(owner.id, await seedCategory()))).id;
}

const task = (
  listing: string,
  overrides: Partial<Prisma.ReviewTaskUncheckedCreateInput> = {},
): Prisma.ReviewTaskUncheckedCreateInput => ({
  listingId: listing,
  reasons: ['machine_hold'],
  queue: 0,
  dueAt: new Date(TEST_NOW.getTime() + 24 * HOUR_MS),
  ...overrides,
});

const decision = (
  overrides: Partial<Prisma.ReviewDecisionUncheckedCreateInput> = {},
): Prisma.ReviewDecisionUncheckedCreateInput => ({
  listingId: randomUUID(),
  actorId: randomUUID(),
  actorRole: 'staff',
  outcome: 'pass',
  listingStateAfter: 'live',
  decidedAt: TEST_NOW,
  ...overrides,
});

describe('Một tin, một việc đang mở', () => {
  it('việc mở thứ hai về cùng tin bị chặn; việc đã khép thì không tính', async () => {
    const id = await listingId();
    await prisma.reviewTask.create({
      data: task(id, { status: 'decided', closeCause: 'decided', closedAt: TEST_NOW }),
    });
    await prisma.reviewTask.create({ data: task(id) });
    expect(await prismaErrorCode(prisma.reviewTask.create({ data: task(id) }))).toBe(UNIQUE);
  });
});

describe('CHECK của review_tasks', () => {
  it('việc mở không có lý do nào bị chặn, kể cả mảng NULL', async () => {
    const id = await listingId();
    expect(await sqlStateOf(prisma.reviewTask.create({ data: task(id, { reasons: [] }) }))).toBe(
      CHECK,
    );
    expect(
      await sqlStateOf(
        prisma.$executeRaw`INSERT INTO review_tasks (listing_id, queue, due_at, updated_at)
          VALUES (${id}::uuid, 0, now(), now())`,
      ),
    ).toBe(CHECK);
  });

  it('số hàng ngoài 0–5 bị chặn', async () => {
    const id = await listingId();
    expect(await sqlStateOf(prisma.reviewTask.create({ data: task(id, { queue: 6 }) }))).toBe(
      CHECK,
    );
  });

  it('nhận việc phải đủ người nhận, hạn giữ và phiên bản tin', async () => {
    const id = await listingId();
    expect(
      await sqlStateOf(prisma.reviewTask.create({ data: task(id, { claimedBy: randomUUID() }) })),
    ).toBe(CHECK);
  });

  it('việc mở không mang mốc khép; việc khép phải có lý do khép', async () => {
    const id = await listingId();
    expect(
      await sqlStateOf(prisma.reviewTask.create({ data: task(id, { closedAt: TEST_NOW }) })),
    ).toBe(CHECK);
    expect(
      await sqlStateOf(
        prisma.reviewTask.create({ data: task(id, { status: 'cancelled', closedAt: TEST_NOW }) }),
      ),
    ).toBe(CHECK);
  });
});

describe('CHECK của review_decisions', () => {
  it('từ chối, gỡ phải có mức độ; đạt thì không', async () => {
    expect(
      await sqlStateOf(prisma.reviewDecision.create({ data: decision({ outcome: 'reject' }) })),
    ).toBe(CHECK);
    expect(
      await sqlStateOf(
        prisma.reviewDecision.create({ data: decision({ outcome: 'pass', severity: 'mistake' }) }),
      ),
    ).toBe(CHECK);
  });

  it('nhận định về máy chỉ đi với kết quả đạt', async () => {
    expect(
      await sqlStateOf(
        prisma.reviewDecision.create({
          data: decision({
            outcome: 'remove',
            severity: 'mistake',
            machineJudgment: 'machine_overreach',
          }),
        }),
      ),
    ).toBe(CHECK);
  });
});

describe('Lý do người đăng thấy', () => {
  it('chỉ có khi tin mang một lỗi', async () => {
    const owner = await seedAccount();
    expect(
      await sqlStateOf(
        seedListing(liveListing(owner.id, await seedCategory(), { faultReason: 'Sai danh mục' })),
      ),
    ).toBe(CHECK);
  });
});
