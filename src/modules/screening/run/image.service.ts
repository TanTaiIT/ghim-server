import { sequentially } from '../../../common/utils/sequential.js';
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
  /** Việc `screening.check-image`: đo ảnh (dHash, cỡ, độ nét, độ sáng), ghi kết quả, rồi kết luận mọi lượt đang chờ nó. */
  checkImage(imageId: string): Promise<void>;
  /**
   * Bên nghe `media.images.deleted`: dấu ảnh đi theo ảnh — ảnh đã xoá không còn là ứng viên trùng (rà soát L10). Lượt
   * còn chờ ảnh đó chỉ là lượt của phiên bản cũ; lưới an toàn kết luận chúng khi hết chờ. Nhận trùng vô hại.
   */
  onImagesDeleted(imageIds: string[]): Promise<void>;
}

/** Kiểm ảnh bất đồng bộ (design mục 5 bước 3): kết quả ảnh dùng chung cho mọi lượt chứa ảnh đó. */
export function createImageService(
  shared: ScreeningShared,
  conclusion: Conclusion,
  imageQueue: ImageQueue,
): ScreeningImageService {
  const { repository, media, inspector, clock } = shared;

  /** Lần lượt: mỗi lượt kết luận giữ một kết nối trong transaction của nó — song song thì cạn pool khi đông (T24). */
  const concludeWaiting = async (imageId: string): Promise<void> => {
    const runs = await repository.openRunsWithImage(imageId);
    await sequentially(runs, async (run) => {
      await repository.inTransaction((tx) => conclusion.conclude(tx, run));
    });
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
      let storageDown = false;
      try {
        bytes = await media.readImage(imageId);
      } catch (error) {
        // Kho không trả lời: lỗi thoáng qua, để hàng việc thử lại; hết lượt thì giữ cho người — và lượt gửi sau dùng
        // ảnh này kiểm lại (T21).
        if ((await repository.bumpAttempts(imageId)) <= IMAGE_CHECK_RETRIES) throw error;
        logger.warn({ err: error, imageId }, 'screening: đọc ảnh hết lượt thử, giữ cho người');
        bytes = null;
        storageDown = true;
      }
      // Kho mất tệp hay tệp không giải mã được thì thử lại cũng vậy: ghi lỗi ngay — kết luận coi đó là ảnh hỏng.
      const measure = bytes ? await inspector.inspect(bytes).catch(() => null) : null;
      const recorded = await repository.finishImageCheck(
        imageId,
        measure === null
          ? { status: 'error', kind: storageDown ? 'transient' : 'permanent' }
          : {
              status: 'done',
              dhash: toStored(measure.dhash),
              bands: bandsOf(measure.dhash),
              quality: {
                width: measure.width,
                height: measure.height,
                sharpness: measure.sharpness,
                brightness: measure.brightness,
              },
            },
        clock(),
      );
      // Việc trùng (xếp lại trúng lúc việc cũ chạy chậm) đã ghi trước: lượt kết luận là của nó.
      if (recorded) await concludeWaiting(imageId);
    },

    async onImagesDeleted(imageIds) {
      await repository.deleteImageChecks(imageIds);
    },
  };
}
