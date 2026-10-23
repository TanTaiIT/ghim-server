import { describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/actor.js';
import { createCategoryService } from '../src/modules/category/category.service.js';
import { repositories } from './test-app.js';

/* Phát hành đua với lượt lưu nháp, qua service để thấy mã lỗi; cuộc đua giữa hai lượt lưu nằm ở `category.repository.db.test.ts`. */
const NOW = new Date('2026-10-10T09:00:00+07:00');
const MASTER: Actor = {
  accountId: '00000000-0000-7000-8000-00000000000a',
  role: 'master',
  sessionId: 's',
  emailVerified: true,
};
const hang = { name: 'hang', label: 'Hãng', type: 'text' as const, required: true };
const mau = { name: 'mau', label: 'Màu', type: 'text' as const, required: false };
const repository = repositories.category;
const service = createCategoryService({ repository, clock: () => NOW });

let seq = 0;
async function phoneWithDraft() {
  seq += 1;
  const phone = await service.create(MASTER, {
    name: `Điện thoại ${seq}`,
    priceCap: null,
    referencePrice: null,
    riskLevel: 'low',
    alwaysManual: false,
    groupReview: 'group',
  });
  await service.saveDraft(MASTER, phone.id, { baseDraftVersion: 0, fields: [hang] });
  return phone.id;
}

describe('phát hành khi bản nháp vừa đổi', () => {
  it('đã đọc nháp số 1, có người lưu số 2 trước lượt ghi → 409, nháp số 2 còn nguyên, chưa có phiên bản', async () => {
    const phoneId = await phoneWithDraft();
    const stale = await repository.findDraft(phoneId);
    // Bản nháp đọc ra là số 1; lượt lưu số 2 chen vào giữa lúc đọc và lúc phát hành.
    const racing = createCategoryService({
      repository: {
        ...repository,
        findDraft: async (id) => {
          const read = stale;
          await repository.saveDraft({
            id,
            baseDraftVersion: 1,
            fields: [hang, mau],
            updatedBy: MASTER.accountId,
            at: NOW,
            audit: {
              actorId: MASTER.accountId,
              actorRole: 'master',
              action: 'category.template.save_draft',
              targetType: 'category',
              targetId: id,
            },
          });
          return read;
        },
      },
      clock: () => NOW,
    });

    await expect(racing.publish(MASTER, phoneId)).rejects.toMatchObject({ statusCode: 409 });
    expect(await repository.findDraft(phoneId)).toMatchObject({ draftVersion: 2 });
    expect(await repository.listTemplateVersions(phoneId)).toEqual([]);
  });
});
