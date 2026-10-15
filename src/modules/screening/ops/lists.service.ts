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
  addWhitelist(actor: Actor, imageId: string): Promise<WhitelistEntryDto>;
  removeWhitelist(actor: Actor, id: string): Promise<void>;
  replaceKeywords(actor: Actor, categoryId: string, keywords: string[]): Promise<KeywordsDto>;
}

const toWhitelistDto = (row: ImageWhitelistEntry): WhitelistEntryDto => ({
  id: row.id,
  sourceImageId: row.sourceImageId,
  addedBy: row.addedBy,
  addedAt: row.addedAt.toISOString(),
});

const isUuid = (value: string): boolean => z.uuid().safeParse(value).success;

/**
 * Danh sách trắng ảnh mẫu của hãng (spec image-checks — mọi staff và master, câu 13) và từ khoá suy ra danh mục (master
 * và staff của danh mục đó, design mục 3).
 */
export function createListsService(shared: ScreeningShared): ScreeningListsService {
  const { repository, media, hasher, categories, clock } = shared;

  return {
    async listWhitelist() {
      return (await repository.listWhitelist()).map(toWhitelistDto);
    },

    async addWhitelist(actor, imageId) {
      const bytes = isUuid(imageId) ? await media.readImage(imageId) : null;
      if (!bytes) throw imageNotInStorage();
      let hash: bigint;
      try {
        hash = await hasher.dhash(bytes);
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
      return toWhitelistDto(row);
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
      if (!(await categories.existingIds([categoryId])).has(categoryId)) {
        throw new NotFoundError('Không có danh mục này');
      }
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
