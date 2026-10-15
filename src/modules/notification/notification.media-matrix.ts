import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { MEDIA_EVENTS } from '../media/media.schema.js';
import {
  empty,
  type Handler,
  type MatrixContext,
  type MatrixResult,
  type Payload,
  str,
} from './notification.matrix.js';

const listingImagesMissing = (count: number): string =>
  `${count === 1 ? 'Một' : count} ảnh của tin không còn trong kho — mở tin để thay ảnh khác.`;

/**
 * Ma trận N38, N39 (change notify-missing-images): lượt đối chiếu kho hằng tháng thấy ảnh đang dùng mà mất tệp. Chỉ
 * báo, không sửa tin hay hồ sơ (TK 25) — người dùng tự thay ảnh. Tháng sau còn mất thì sự kiện phát lại, nên báo lại.
 */
export const MEDIA_MATRIX: Record<string, Handler> = {
  async [MEDIA_EVENTS.imageMissing](payload: Payload, ctx: MatrixContext): Promise<MatrixResult> {
    const ownerId = str(payload, 'ownerId');
    const imageId = str(payload, 'imageId');
    if (!ownerId) return empty();
    const kind = str(payload, 'ownerKind');

    // N38 — một tin 6 ảnh mất cả 6 là một dòng chưa đọc, không phải 6 dòng.
    if (kind === 'listing') {
      const target = (await ctx.listingTargets([ownerId])).get(ownerId);
      if (!target) return empty();
      return {
        ...empty(),
        drafts: [
          {
            recipients: [target.ownerId],
            category: 'your_listings',
            personal: true,
            type: 'listing.image.missing',
            title: target.title ?? 'Tin đăng của bạn',
            body: listingImagesMissing(1),
            data: { listingId: ownerId, imageId },
            groupId: null,
            alertable: true,
            collapse: { key: `listings:image-missing:${ownerId}`, render: listingImagesMissing },
          },
        ],
      };
    }

    // N39
    if (kind === 'profile') {
      return {
        ...empty(),
        drafts: [
          {
            recipients: [ownerId],
            category: 'account',
            personal: true,
            type: 'account.avatar.missing',
            title: 'Ảnh đại diện',
            body: 'Ảnh đại diện của bạn không còn trong kho — chọn ảnh khác.',
            data: { imageId },
            groupId: null,
            alertable: true,
          },
        ],
      };
    }
    return empty();
  },
};

export const MEDIA_NOTICE_EVENTS = Object.keys(MEDIA_MATRIX) as OutboxEventType[];
