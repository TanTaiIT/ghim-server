import type { ImageWhitelistEntry } from '@prisma/client';
import { z } from 'zod';

import { auditActor } from '../../../common/audit/audit.js';
import type { Actor } from '../../../common/auth/actor.js';
import { BadRequestError, NotFoundError } from '../../../common/errors/app-error.js';
import { imageNotInStorage } from '../../media/media.service.js';
import { bandsOf, toStored } from '../calc/dhash.calc.js';
import { phraseWords } from '../calc/phrase.calc.js';
import type { KeywordsDto, WhitelistEntryDto } from '../screening.schema.js';
import type { ScreeningShared } from '../screening.shared.js';

export interface ScreeningListsService {
  listWhitelist(): Promise<WhitelistEntryDto[]>;
  /** Bộ từ khoá đang dùng của một danh mục, đã bỏ dấu như lúc so. */
  keywordsOf(categoryId: string): Promise<KeywordsDto>;
  addWhitelist(actor: Actor, imageId: string): Promise<WhitelistEntryDto>;
  removeWhitelist(actor: Actor, id: string): Promise<void>;
  replaceKeywords(actor: Actor, categoryId: string, keywords: string[]): Promise<KeywordsDto>;
}

const toWhitelistDto = (row: ImageWhitelistEntry, url: string | null): WhitelistEntryDto => ({
  id: row.id,
  sourceImageId: row.sourceImageId,
  url,
  addedBy: row.addedBy,
  addedAt: row.addedAt.toISOString(),
});

const isUuid = (value: string): boolean => z.uuid().safeParse(value).success;

/**
 * Danh sách trắng ảnh mẫu của hãng (spec image-checks — mọi staff và master, câu 13) và từ khoá suy ra danh mục (master
 * và staff của danh mục đó, design mục 3).
 */
export function createListsService(shared: ScreeningShared): ScreeningListsService {
  const { repository, media, inspector, categories, clock } = shared;

  const requireCategory = async (categoryId: string): Promise<void> => {
    if (!(await categories.existingIds([categoryId])).has(categoryId)) {
      throw new NotFoundError('Không có danh mục này');
    }
  };

  return {
    async listWhitelist() {
      const rows = await repository.listWhitelist();
      const alive = await media.ownersOf(rows.map((row) => row.sourceImageId));
      return Promise.all(
        rows.map(async (row) =>
          toWhitelistDto(
            row,
            alive.has(row.sourceImageId) ? await media.viewUrl(row.sourceImageId) : null,
          ),
        ),
      );
    },

    async keywordsOf(categoryId) {
      await requireCategory(categoryId);
      return { categoryId, keywords: await repository.keywordsOf(categoryId) };
    },

    async addWhitelist(actor, imageId) {
      const bytes = isUuid(imageId) ? await media.readImage(imageId) : null;
      if (!bytes) throw imageNotInStorage();
      let hash: bigint;
      try {
        ({ dhash: hash } = await inspector.inspect(bytes));
      } catch {
        throw new BadRequestError('Không đọc được ảnh này', 'IMAGE_UNREADABLE');
      }
      const row = await repository.addWhitelist(
        {
          dhash: toStored(hash),
          bands: bandsOf(hash),
          sourceImageId: imageId,
          addedBy: actor.accountId,
          at: clock(),
        },
        {
          ...auditActor(actor),
          action: 'screening.whitelist.add',
          targetType: 'image_whitelist',
          targetId: imageId,
        },
      );
      return toWhitelistDto(row, await media.viewUrl(imageId));
    },

    async removeWhitelist(actor, id) {
      const removed = await repository.removeWhitelist(id, {
        ...auditActor(actor),
        action: 'screening.whitelist.remove',
        targetType: 'image_whitelist',
        targetId: id,
      });
      if (!removed) throw new NotFoundError('Không có ảnh này trong danh sách trắng');
    },

    async replaceKeywords(actor, categoryId, keywords) {
      await requireCategory(categoryId);
      // Lưu dạng bỏ dấu như lúc so — "Điện thoại" và "dien thoai" là một từ khoá.
      const folded = [
        ...new Set(keywords.map((keyword) => phraseWords(keyword).join(' ')).filter(Boolean)),
      ];
      await repository.replaceKeywords(categoryId, folded, {
        ...auditActor(actor),
        action: 'screening.keywords.replace',
        targetType: 'category',
        targetId: categoryId,
        details: { keywords: folded.length },
      });
      return { categoryId, keywords: folded };
    },
  };
}
