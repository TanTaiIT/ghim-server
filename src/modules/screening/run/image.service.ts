import { logger } from '../../../lib/logger.js';
import { bandsOf, toStored } from '../calc/dhash.calc.js';
import { IMAGE_CHECK_RETRIES } from '../screening.jobs.js';
import type { ScreeningShared } from '../screening.shared.js';
import type { Conclusion } from './conclusion.js';
import type { ImageQueue } from './image-queue.js';

export interface ScreeningImageService {
  /**
   * Bên nghe `listing.listing.submitted` (sau commit): ảnh chưa có dòng kiểm thì thêm `pending`, rồi xếp việc kiểm cho mọi
   * ảnh còn `pending` của lượt — kể cả lượt đã kết luận sớm (chấm chữ lỗi, quá hạn): ảnh đã kiểm là ứng viên trùng cho
   * mọi tin sau (fix-audit-image-checks, C2). Trả số việc đã gửi.
   */
  scheduleChecks(input: { listingId: string; version: number; ownerId: string }): Promise<number>;
  /** Việc `screening.check-image`: băm, ghi kết quả, rồi thử kết luận mọi lượt đang chờ ảnh này. */
  checkImage(imageId: string): Promise<void>;
}

/** Kiểm ảnh bất đồng bộ (design mục 5 bước 3): kết quả ảnh dùng chung cho mọi lượt chứa ảnh đó. */
export function createImageService(
  shared: ScreeningShared,
  conclusion: Conclusion,
  imageQueue: ImageQueue,
): ScreeningImageService {
  const { repository, media, hasher, clock } = shared;

  const concludeWaiting = async (imageId: string): Promise<void> => {
    const runs = await repository.openRunsWithImage(imageId);
    await Promise.all(
      runs.map((run) => repository.inTransaction((tx) => conclusion.conclude(tx, run))),
    );
  };

  return {
    async scheduleChecks({ listingId, version, ownerId }) {
      const run = await repository.findRun(listingId, version, 'submission');
      if (!run) return 0;
      await repository.addPendingChecks(run.imageIds, ownerId);
      // Ảnh `pending` đã xếp gần đây (của lượt khác): việc kiểm đang chạy sẽ kết luận cả lượt này.
      return imageQueue.queue(run.imageIds, clock());
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
      const recorded = await repository.finishImageCheck(
        imageId,
        hash === null
          ? { status: 'error' }
          : { status: 'done', dhash: toStored(hash), bands: bandsOf(hash) },
        clock(),
      );
      // Việc trùng (xếp lại trúng lúc việc cũ chạy chậm) đã ghi trước: lượt kết luận là của nó.
      if (recorded) await concludeWaiting(imageId);
    },
  };
}
