import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ruleBookOf } from '../src/modules/screening/calc/score.calc.js';
import { createScreeningRepository } from '../src/modules/screening/screening.repository.js';
import { INITIAL_RULES } from '../src/modules/screening/screening.rules.js';
import { prisma, truncateAll } from './db-helpers.js';

/* `screening` trên Postgres thật: phiên bản luật khởi tạo lúc khởi động (task 1.4, spec rule-management). */
const NOW = new Date('2026-10-12T04:00:00.000Z');
const repository = createScreeningRepository(prisma);

beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

describe('khởi tạo luật lúc khởi động', () => {
  it('bảng rỗng: 13 dấu hiệu, 3 cổng cứng bật đúng trọng số TK 14, 4 luật chất lượng ảnh chạy thử, phiên bản luật 1', async () => {
    expect(await repository.seedRules(INITIAL_RULES, NOW)).toEqual({ version: 1, added: 20 });
    const rows = await prisma.screeningRule.findMany();
    expect(rows).toHaveLength(20);
    expect(rows.filter((row) => row.kind !== 'quality').every((row) => row.mode === 'on')).toBe(
      true,
    );
    expect(
      rows
        .filter((row) => row.kind === 'quality')
        .map((row) => [row.code, row.mode, row.weight])
        .toSorted(),
    ).toEqual([
      ['image_blurry', 'trial', 0],
      ['image_too_bright', 'trial', 0],
      ['image_too_dark', 'trial', 0],
      ['image_too_small', 'trial', 0],
    ]);
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
    expect(book.rules.size).toBe(20);
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
    expect(results.filter((result) => result !== null)).toEqual([{ version: 1, added: 20 }]);
    expect(await prisma.screeningRuleVersion.count()).toBe(1);
    expect(await prisma.screeningRule.count()).toBe(20);
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

/** Mã ảnh có thứ tự rõ: `imageId(1) < imageId(9)` — phá hoà khi hai ảnh kiểm xong cùng mili giây. */
const imageId = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe('ứng viên ảnh trùng: người đăng trước thắng (duplicate-image-first-wins)', () => {
  it('chỉ ảnh của tài khoản khác kiểm xong trước; cùng mili giây thì mã ảnh nhỏ hơn là trước', async () => {
    const at = new Date('2026-10-12T04:00:00.000Z');
    const shift = (ms: number) => new Date(at.getTime() + ms);
    const band = { band0: 1, band1: 2, band2: 3, band3: 4, band4: 5 };
    const done = (id: string, ownerAccountId: string, checkedAt: Date) =>
      prisma.imageCheck.create({
        data: { imageId: id, ownerAccountId, status: 'done', dhash: 42n, ...band, checkedAt },
      });
    const [mine, theirs] = [
      '00000000-0000-7000-8000-0000000000aa',
      '00000000-0000-7000-8000-0000000000bb',
    ];
    await done(imageId(5), mine, at);
    await done(imageId(1), theirs, shift(-1000));
    await done(imageId(2), theirs, shift(1000));
    await done(imageId(3), theirs, at);
    await done(imageId(9), theirs, at);

    const candidates = await repository.duplicateCandidates({
      bands: [1, 2, 3, 4, 5],
      excludeOwner: mine,
      excludeImageIds: [imageId(5)],
      before: { checkedAt: at, imageId: imageId(5) },
    });
    expect(candidates.map((row) => row.imageId).toSorted()).toEqual([imageId(1), imageId(3)]);
  });
});
