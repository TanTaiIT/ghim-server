import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';

/*
 * Ràng buộc chỉ DB trả lời được của migration `init_screening`: mỗi CHECK viết tay (23514), unique lượt theo phiên bản
 * tin, unique mã tra cứu, unique cụm từ, và khoá ngoại sang `accounts`, `categories`.
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
  const email = `may${seq}@ghim.test`;
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

async function category() {
  const owner = await account();
  return prisma.category.create({ data: { name: `Danh mục ${seq}`, createdBy: owner.id } });
}

const run = (
  accountId: string,
  overrides: Partial<Prisma.ScreeningRunUncheckedCreateInput> = {},
): Prisma.ScreeningRunUncheckedCreateInput => ({
  listingId: randomUUID(),
  listingVersion: 2,
  accountId,
  trigger: 'submission',
  startedAt: NOW,
  textResult: {},
  imageIds: [],
  configVersion: 1,
  ruleVersion: 1,
  ...overrides,
});

const decided = { decidedAt: NOW, outcome: 'hold' as const, cause: 'gate' as const };

describe('screening_runs', () => {
  it('lượt mở và lượt đã kết luận hợp lệ; kết luận phải đủ lúc, kết quả, căn cứ', async () => {
    const { id } = await account();
    await prisma.screeningRun.createMany({ data: [run(id), run(id, decided)] });
    expect(await prisma.screeningRun.count()).toBe(2);
    const partials = [
      { decidedAt: NOW },
      { outcome: 'hold' as const, decidedAt: NOW },
      { outcome: 'hold' as const, cause: 'gate' as const },
    ];
    const states = await Promise.all(
      partials.map((partial) => sqlStateOf(prisma.screeningRun.create({ data: run(id, partial) }))),
    );
    expect(states).toEqual([CHECK, CHECK, CHECK]);
    expect(await sqlStateOf(prisma.screeningRun.create({ data: run(id, { score: -1 }) }))).toBe(
      CHECK,
    );
  });

  it('mỗi phiên bản tin một lượt mỗi lối mở; mã tra cứu không trùng', async () => {
    const { id } = await account();
    const listingId = randomUUID();
    await prisma.screeningRun.create({ data: run(id, { listingId, lookupCode: 'S-ABCD1234' }) });
    expect(
      await prisma.screeningRun.create({ data: run(id, { listingId, trigger: 'recall' }) }),
    ).toBeTruthy();
    expect(
      await prismaErrorCode(prisma.screeningRun.create({ data: run(id, { listingId }) })),
    ).toBe(UNIQUE);
    expect(
      await prismaErrorCode(
        prisma.screeningRun.create({ data: run(id, { lookupCode: 'S-ABCD1234' }) }),
      ),
    ).toBe(UNIQUE);
    expect(await prismaErrorCode(prisma.screeningRun.create({ data: run(randomUUID()) }))).toBe(
      FOREIGN_KEY,
    );
  });
});

describe('image_checks, luật, dải, cụm từ, giá', () => {
  it('ảnh kiểm xong phải có dHash, chưa xong thì không', async () => {
    const owner = randomUUID();
    const base = { ownerAccountId: owner, band0: 1, band1: 2, band2: 3, band3: 4, band4: 5 };
    await prisma.imageCheck.create({
      data: { imageId: randomUUID(), ...base, status: 'done', dhash: 42n },
    });
    await prisma.imageCheck.create({
      data: { imageId: randomUUID(), ownerAccountId: owner, status: 'pending' },
    });
    expect(
      await sqlStateOf(
        prisma.imageCheck.create({ data: { imageId: randomUUID(), ...base, status: 'done' } }),
      ),
    ).toBe(CHECK);
    expect(
      await sqlStateOf(
        prisma.imageCheck.create({
          data: {
            imageId: randomUUID(),
            ...base,
            status: 'error',
            errorKind: 'transient',
            dhash: 1n,
          },
        }),
      ),
    ).toBe(CHECK);
    // image_checks_error_kind_check (fix-audit-screening-trust, T21): lỗi đi đôi với loại lỗi.
    await prisma.imageCheck.create({
      data: { imageId: randomUUID(), ...base, status: 'error', errorKind: 'permanent' },
    });
    expect(
      await sqlStateOf(
        prisma.imageCheck.create({ data: { imageId: randomUUID(), ...base, status: 'error' } }),
      ),
    ).toBe(CHECK);
    expect(
      await sqlStateOf(
        prisma.imageCheck.create({
          data: { imageId: randomUUID(), ...base, status: 'pending', errorKind: 'transient' },
        }),
      ),
    ).toBe(CHECK);
  });

  it('cổng cứng không tắt được; trọng số không âm; ghi đè phải có giá trị', async () => {
    await prisma.screeningRule.create({
      data: { code: 'gate_a', kind: 'gate', weight: 0, mode: 'trial' },
    });
    expect(
      await sqlStateOf(
        prisma.screeningRule.create({
          data: { code: 'gate_b', kind: 'gate', weight: 0, mode: 'off' },
        }),
      ),
    ).toBe(CHECK);
    expect(
      await sqlStateOf(
        prisma.screeningRule.create({
          data: { code: 's', kind: 'signal', weight: -1, mode: 'on' },
        }),
      ),
    ).toBe(CHECK);
    const { id } = await category();
    expect(
      await sqlStateOf(
        prisma.screeningRuleOverride.create({ data: { code: 'gate_a', categoryId: id } }),
      ),
    ).toBe(CHECK);
    expect(
      await prismaErrorCode(
        prisma.screeningRuleOverride.create({
          data: { code: 'gate_a', categoryId: randomUUID(), weight: 1 },
        }),
      ),
    ).toBe(FOREIGN_KEY);
  });

  it('ngưỡng dải đúng thứ tự: 0 < Vừa < Cao', async () => {
    const [a, b, c] = [await category(), await category(), await category()];
    await prisma.screeningCategoryBand.create({
      data: { categoryId: a.id, mediumFrom: 20, highFrom: 50 },
    });
    expect(
      await sqlStateOf(
        prisma.screeningCategoryBand.create({
          data: { categoryId: b.id, mediumFrom: 50, highFrom: 50 },
        }),
      ),
    ).toBe(CHECK);
    expect(
      await sqlStateOf(
        prisma.screeningCategoryBand.create({
          data: { categoryId: c.id, mediumFrom: 0, highFrom: 50 },
        }),
      ),
    ).toBe(CHECK);
  });

  it('cụm từ: từ hai chữ trở lên, không trùng; chạy thử phải có hạn', async () => {
    const { id } = await account();
    const phrase = (
      folded: string,
      overrides: Partial<Prisma.BannedPhraseUncheckedCreateInput> = {},
    ) =>
      prisma.bannedPhrase.create({
        data: {
          text: folded,
          folded,
          level: 'certain',
          mode: 'trial',
          trialEndsAt: NOW,
          exceptions: [],
          createdBy: id,
          createdAt: NOW,
          ...overrides,
        },
      });
    await phrase('ban sung');
    expect(await prismaErrorCode(phrase('ban sung'))).toBe(UNIQUE);
    expect(await sqlStateOf(phrase('sung'))).toBe(CHECK);
    expect(await sqlStateOf(phrase('ban dan', { trialEndsAt: null }))).toBe(CHECK);
  });

  it('khoảng giá: thấp ≤ cao, không âm', async () => {
    const [a, b] = [await category(), await category()];
    await prisma.categoryPriceStat.create({
      data: { categoryId: a.id, low: 1n, high: 2n, samples: 30, computedAt: NOW },
    });
    expect(
      await sqlStateOf(
        prisma.categoryPriceStat.create({
          data: { categoryId: b.id, low: 3n, high: 2n, samples: 30, computedAt: NOW },
        }),
      ),
    ).toBe(CHECK);
  });
});
