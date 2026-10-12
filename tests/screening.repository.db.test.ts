import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ruleBookOf } from '../src/modules/screening/score.calc.js';
import { createScreeningRepository } from '../src/modules/screening/screening.repository.js';
import { INITIAL_RULES } from '../src/modules/screening/screening.rules.js';
import { prisma, truncateAll } from './db-helpers.js';

/* `screening` trên Postgres thật: phiên bản luật khởi tạo lúc khởi động (task 1.4, spec rule-management). */
const NOW = new Date('2026-10-12T04:00:00.000Z');
const repository = createScreeningRepository(prisma);

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

describe('khởi tạo luật lúc khởi động', () => {
  it('bảng rỗng: 12 dấu hiệu và 3 cổng cứng bật đúng trọng số TK 14, cùng phiên bản luật 1', async () => {
    expect(await repository.seedRules(INITIAL_RULES, NOW)).toEqual({ version: 1, added: 15 });
    const rows = await prisma.screeningRule.findMany();
    expect(rows).toHaveLength(15);
    expect(rows.every((row) => row.mode === 'on')).toBe(true);
    expect(
      rows
        .filter((row) => row.kind === 'gate')
        .map((row) => row.code)
        .toSorted(),
    ).toEqual(['certain_phrase', 'duplicate_image', 'price_over_cap']);
    const current = await repository.currentRuleVersion();
    expect(current?.version).toBe(1);
    const book = ruleBookOf(
      1,
      current?.snapshot ?? { rules: [], overrides: [], bands: [], phrases: [] },
      {
        mediumFrom: 30,
        highFrom: 60,
      },
    );
    expect(book.rules.get('gibberish')).toEqual({ weight: 30, mode: 'on' });
    expect(book.rules.get('new_account')).toEqual({ weight: 10, mode: 'on' });
    expect(book.rules.size).toBe(15);
    const version = await prisma.screeningRuleVersion.findUniqueOrThrow({ where: { version: 1 } });
    expect(version).toMatchObject({ createdBy: null, createdAt: NOW });
  });

  it('khởi động lại: không tạo thêm luật hay phiên bản', async () => {
    await repository.seedRules(INITIAL_RULES, NOW);
    expect(await repository.seedRules(INITIAL_RULES, NOW)).toBeNull();
    expect(await prisma.screeningRuleVersion.count()).toBe(1);
    expect(await repository.ruleVersionNumber()).toBe(1);
  });

  it('hai tiến trình khởi động cùng lúc: đúng một phiên bản 1, không lượt nào ném', async () => {
    const results = await Promise.all([
      repository.seedRules(INITIAL_RULES, NOW),
      repository.seedRules(INITIAL_RULES, NOW),
    ]);
    expect(results.filter((result) => result !== null)).toEqual([{ version: 1, added: 15 }]);
    expect(await prisma.screeningRuleVersion.count()).toBe(1);
    expect(await prisma.screeningRule.count()).toBe(15);
  });

  it('luật đưa vào sau phiên bản 1 bắt đầu ở chạy thử, luật cũ giữ nguyên', async () => {
    await repository.seedRules(INITIAL_RULES, NOW);
    await prisma.screeningRule.update({ where: { code: 'burst' }, data: { weight: 5 } });
    await prisma.screeningRule.delete({ where: { code: 'held_many' } });
    expect(await repository.seedRules(INITIAL_RULES, NOW)).toEqual({ version: 2, added: 1 });
    expect(
      await prisma.screeningRule.findUniqueOrThrow({ where: { code: 'held_many' } }),
    ).toMatchObject({
      mode: 'trial',
      weight: 15,
    });
    expect(
      await prisma.screeningRule.findUniqueOrThrow({ where: { code: 'burst' } }),
    ).toMatchObject({
      mode: 'on',
      weight: 5,
    });
    const snapshot = (await repository.currentRuleVersion())?.snapshot;
    expect(snapshot?.rules.find((rule) => rule.code === 'held_many')).toMatchObject({
      mode: 'trial',
    });
  });

  it('chưa có phiên bản nào: đọc ra null', async () => {
    expect(await repository.ruleVersionNumber()).toBeNull();
    expect(await repository.currentRuleVersion()).toBeNull();
  });
});
