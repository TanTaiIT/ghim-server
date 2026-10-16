import { SCREENING_JOBS } from '../screening.jobs.js';
import { MINUTE_MS, type ScreeningShared } from '../screening.shared.js';

/**
 * Xếp việc kiểm ảnh (fix-audit-image-checks, mục 2): chỉ ảnh vừa giành được `queued_at` mới được gửi việc, nên bên nghe
 * chạy lại, lượt rà chồng nhau hay nhiều tiến trình không dồn việc trùng; ảnh xếp quá thời gian chờ ảnh thì xếp lại được.
 * Gửi việc hỏng thì trả ảnh về "chưa xếp" rồi ném, để lượt thử lại của bên nghe xếp ngay (T20).
 */
export function createImageQueue(shared: ScreeningShared) {
  const { repository, jobs, config } = shared;

  const staleBefore = (now: Date): Date =>
    new Date(now.getTime() - config.get('screening.imageResultTimeoutMinutes') * MINUTE_MS);

  const send = async (imageIds: string[]): Promise<number> => {
    const results = await Promise.allSettled(
      imageIds.map((imageId) => jobs.send(SCREENING_JOBS.checkImage, { imageId })),
    );
    const failed = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [{ imageId: imageIds[index] ?? '', error: result.reason }]
        : [],
    );
    if (failed.length === 0) return imageIds.length;
    await repository.unqueue(failed.map(({ imageId }) => imageId));
    throw failed[0]?.error;
  };

  return {
    /** Xếp các ảnh này nếu còn `pending` mà chưa xếp hay xếp đã lâu; trả số việc đã gửi. */
    async queue(imageIds: string[], now: Date): Promise<number> {
      return send(await repository.claimQueued(imageIds, staleBefore(now), now));
    },
    /** Lưới an toàn: xếp lại ảnh `pending` kẹt trên toàn hệ thống, tối đa `limit` ảnh. */
    async queueStale(now: Date, limit: number): Promise<number> {
      return send(await repository.claimStalePending(staleBefore(now), now, limit));
    },
  };
}

export type ImageQueue = ReturnType<typeof createImageQueue>;
