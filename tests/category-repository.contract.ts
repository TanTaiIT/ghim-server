import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { CategoryRepository } from '../src/modules/category/category.repository.js';
import { TEST_AUDIT } from './fakes/audit.fake.js';

/* Hợp đồng repository của `category` — xem `identity-repository.contract.ts` về cách chạy. */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const ACTOR = TEST_AUDIT.actorId;
const SETTINGS = {
  priceCap: null,
  referencePrice: null,
  riskLevel: 'low' as const,
  alwaysManual: false,
  groupReview: 'group' as const,
};
const hang = { name: 'hang', label: 'Hãng', type: 'text' as const, required: true };

const create = (repository: CategoryRepository, name: string) =>
  repository.create({ name, settings: SETTINGS, createdBy: ACTOR, at: NOW, audit: TEST_AUDIT });

const saveDraft = (repository: CategoryRepository, id: string, baseDraftVersion: number) =>
  repository.saveDraft({
    id,
    baseDraftVersion,
    fields: [hang],
    updatedBy: ACTOR,
    at: NOW,
    audit: TEST_AUDIT,
  });

const publish = (
  repository: CategoryRepository,
  id: string,
  version: number,
  draftVersion: number,
) =>
  repository.publishTemplate({
    id,
    version,
    draftVersion,
    fields: [hang],
    publishedBy: ACTOR,
    at: NOW,
    audit: TEST_AUDIT,
  });

export function describeCategoryRepositoryContract(
  label: string,
  make: () => Promise<CategoryRepository>,
): void {
  describe(`CategoryRepository — ${label}`, () => {
    it('tên danh mục unique: tạo trùng và đổi tên trùng ném đúng lỗi P2002 của Prisma', async () => {
      const repository = await make();
      const phone = await create(repository, 'Điện thoại');
      await create(repository, 'Xe máy');
      const duplicate = create(repository, 'Điện thoại');
      await expect(duplicate).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      await expect(duplicate).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        repository.rename({ id: phone.id, name: 'Xe máy', at: NOW, audit: TEST_AUDIT }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await repository.rename({ id: phone.id, name: 'Điện thoại', at: NOW, audit: TEST_AUDIT });
    });

    it('phiên bản cài đặt kế tiếp; phiên bản cũ đọc lại nguyên', async () => {
      const repository = await make();
      const phone = await create(repository, 'Máy tính');
      const v2 = await repository.addSettingsVersion({
        id: phone.id,
        settings: { ...SETTINGS, priceCap: 70_000_000n },
        changedBy: ACTOR,
        at: NOW,
        audit: TEST_AUDIT,
      });
      expect(v2.settings).toMatchObject({ version: 2, priceCap: 70_000_000n });
      expect((await repository.findSettingsVersion(phone.id, 1))?.priceCap).toBeNull();
    });

    it('khoá lạc quan của nháp: số nháp lệch trả null, không ghi gì', async () => {
      const repository = await make();
      const phone = await create(repository, 'Điện thoại');
      expect((await saveDraft(repository, phone.id, 0))?.draftVersion).toBe(1);
      expect(await saveDraft(repository, phone.id, 0)).toBeNull();
      expect((await saveDraft(repository, phone.id, 1))?.draftVersion).toBe(2);
      expect(await saveDraft(repository, phone.id, 1)).toBeNull();
      expect((await repository.findDraft(phone.id))?.draftVersion).toBe(2);
    });

    it('phát hành chỉ với đúng số nháp đã đọc; phiên bản mẫu là khoá chính', async () => {
      const repository = await make();
      const phone = await create(repository, 'Điện thoại');
      await saveDraft(repository, phone.id, 0);
      await saveDraft(repository, phone.id, 1);

      expect(await publish(repository, phone.id, 1, 1)).toBeNull();
      expect((await publish(repository, phone.id, 1, 2))?.version).toBe(1);
      expect(await repository.findDraft(phone.id)).toBeNull();
      expect(await publish(repository, phone.id, 2, 2)).toBeNull();

      await saveDraft(repository, phone.id, 0);
      await expect(publish(repository, phone.id, 1, 1)).rejects.toMatchObject({ code: 'P2002' });
    });
  });
}
