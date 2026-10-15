import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';

/*
 * Ràng buộc chỉ DB trả lời được của migration `init_trust`: mỗi CHECK viết tay (23514), PK "mỗi tin sạch tối đa một
 * lần", và khoá ngoại sang `accounts`. Ghi thẳng bằng Prisma những dòng repository không bao giờ tạo.
 */
const UNIQUE = 'P2002';
const FOREIGN_KEY = 'P2003';
const CHECK = '23514';
const NOW = new Date('2026-10-12T04:00:00.000Z');

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

let seq = 0;

async function account() {
  seq += 1;
  const email = `trust${seq}@ghim.test`;
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

const clean = (
  accountId: string,
  overrides: Partial<Prisma.TrustCleanListingUncheckedCreateInput> = {},
): Prisma.TrustCleanListingUncheckedCreateInput => ({
  listingId: randomUUID(),
  accountId,
  via: 'shown',
  cleanAt: NOW,
  ...overrides,
});

const tierRow = (
  accountId: string,
  overrides: Partial<Prisma.TrustTierResultUncheckedCreateInput> = {},
) => ({
  accountId,
  tier: 'T1' as const,
  countedClean: 1,
  factsHash: 'dau',
  configVersion: 1,
  computedAt: NOW,
  ...overrides,
});

describe('trust_clean_listings', () => {
  it('dòng hợp lệ: tin sạch; tin sạch rồi bị void; dòng chỉ mang dấu void', async () => {
    const { id } = await account();
    await prisma.trustCleanListing.createMany({
      data: [
        clean(id),
        clean(id, { voidedAt: NOW, voidCause: 'violation' }),
        clean(id, { via: null, cleanAt: null, voidedAt: NOW, voidCause: 'report' }),
      ],
    });
    expect(await prisma.trustCleanListing.count()).toBe(3);
  });

  it.each([
    ['có mốc mà không có lối', { via: null }],
    ['có lối mà không có mốc', { cleanAt: null, voidedAt: NOW, voidCause: 'violation' as const }],
    ['void mà không có lý do', { voidedAt: NOW }],
    ['lý do mà không void', { voidCause: 'violation' as const }],
    ['không mốc, không void', { via: null, cleanAt: null }],
  ])('%s: 23514', async (_name, overrides) => {
    const { id } = await account();
    expect(await sqlStateOf(prisma.trustCleanListing.create({ data: clean(id, overrides) }))).toBe(
      CHECK,
    );
  });

  it('mỗi tin sạch tối đa một lần: PK theo tin', async () => {
    const { id } = await account();
    const listingId = randomUUID();
    await prisma.trustCleanListing.create({ data: clean(id, { listingId }) });
    expect(
      await prismaErrorCode(
        prisma.trustCleanListing.create({ data: clean(id, { listingId, via: 'sold' }) }),
      ),
    ).toBe(UNIQUE);
  });

  it('không FK sang listings — dữ kiện sống lâu hơn tin; FK sang accounts thì có', async () => {
    const { id } = await account();
    await prisma.trustCleanListing.create({ data: clean(id, { listingId: randomUUID() }) });
    expect(
      await prismaErrorCode(prisma.trustCleanListing.create({ data: clean(randomUUID()) })),
    ).toBe(FOREIGN_KEY);
  });
});

describe('trust_tiers, trust_tier_changes', () => {
  it('một dòng mỗi tài khoản; số tin sạch không âm', async () => {
    const { id } = await account();
    await prisma.trustTierResult.create({ data: tierRow(id) });
    expect(await prismaErrorCode(prisma.trustTierResult.create({ data: tierRow(id) }))).toBe(
      UNIQUE,
    );
    const other = await account();
    expect(
      await sqlStateOf(
        prisma.trustTierResult.create({ data: tierRow(other.id, { countedClean: -1 }) }),
      ),
    ).toBe(CHECK);
  });

  it('lần đổi mức phải đổi thật: from = to là 23514', async () => {
    const { id } = await account();
    const change = { accountId: id, factsHash: 'dau', configVersion: 1, at: NOW };
    await prisma.trustTierChange.create({ data: { ...change, fromTier: 'T0', toTier: 'T1' } });
    expect(
      await sqlStateOf(
        prisma.trustTierChange.create({ data: { ...change, fromTier: 'T1', toTier: 'T1' } }),
      ),
    ).toBe(CHECK);
  });

  it('tài khoản xoá hẳn: mọi dòng của trust đi theo', async () => {
    const { id } = await account();
    await prisma.trustCleanListing.create({ data: clean(id) });
    await prisma.trustTierResult.create({ data: tierRow(id) });
    await prisma.trustTierChange.create({
      data: {
        accountId: id,
        fromTier: 'T0',
        toTier: 'T1',
        factsHash: 'd',
        configVersion: 1,
        at: NOW,
      },
    });
    await prisma.account.delete({ where: { id } });
    expect([
      await prisma.trustCleanListing.count(),
      await prisma.trustTierResult.count(),
      await prisma.trustTierChange.count(),
    ]).toEqual([0, 0, 0]);
  });
});
