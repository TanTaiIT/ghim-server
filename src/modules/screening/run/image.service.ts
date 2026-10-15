import { logger } from '../../../lib/logger.js';
import { bandsOf, toStored } from '../calc/dhash.calc.js';
import { IMAGE_CHECK_RETRIES, SCREENING_JOBS } from '../screening.jobs.js';
import type { ScreeningShared } from '../screening.shared.js';
import type { Conclusion } from './conclusion.js';

export interface ScreeningImageService {
  /** Bên nghe `listing.listing.submitted` (sau commit): ảnh chưa có dòng kiểm thì thêm `pending` và xếp việc kiểm. */
  scheduleChecks(input: { listingId: string; version: number; ownerId: string }): Promise<number>;
  /** Việc `screening.check-image`: băm, ghi kết quả, rồi thử kết luận mọi lượt đang chờ ảnh này. */
  checkImage(imageId: string): Promise<void>;
}

/** Kiểm ảnh bất đồng bộ (design mục 5 bước 3): kết quả ảnh dùng chung cho mọi lượt chứa ảnh đó. */
export function createImageService(
  shared: ScreeningShared,
  conclusion: Conclusion,
): ScreeningImageService {
  const { repository, media, hasher, jobs, clock } = shared;

  const concludeWaiting = async (imageId: string): Promise<void> => {
    const runs = await repository.openRunsWithImage(imageId);
    await Promise.all(
      runs.map((run) => repository.inTransaction((tx) => conclusion.conclude(tx, run))),
    );
  };

  return {
    async scheduleChecks({ listingId, version, ownerId }) {
      const run = await repository.findRun(listingId, version, 'submission');
      if (!run || run.decidedAt) return 0;
      // Ảnh đang `pending` của lượt khác: việc kiểm đang chạy sẽ kết luận cả lượt này.
      const added = await repository.addPendingChecks(run.imageIds, ownerId);
      await Promise.all(added.map((imageId) => jobs.send(SCREENING_JOBS.checkImage, { imageId })));
      return added.length;
    },

    async checkImage(imageId) {
      const check = await repository.findImageCheck(imageId);
      if (check?.status !== 'pending') return;
      let bytes: Uint8Array | null;
      try {
        bytes = await media.readImage(imageId);
      } catch (error) {
        // Kho không trả lời: lỗi thoáng qua, để hàng việc thử lại; hết lượt thì giữ cho người.
        if ((await repository.bumpAttempts(imageId)) <= IMAGE_CHECK_RETRIES) throw error;
        logger.warn({ err: error, imageId }, 'screening: đọc ảnh hết lượt thử, giữ cho người');
        bytes = null;
      }
      // Kho mất tệp hay tệp không giải mã được thì thử lại cũng vậy: ghi lỗi ngay.
      const hash = bytes ? await hasher.dhash(bytes).catch(() => null) : null;
      await repository.finishImageCheck(
        imageId,
        hash === null
          ? { status: 'error' }
          : { status: 'done', dhash: toStored(hash), bands: bandsOf(hash) },
        clock(),
      );
      await concludeWaiting(imageId);
    },
  };
}
