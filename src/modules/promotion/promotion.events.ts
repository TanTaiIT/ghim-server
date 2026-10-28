import type { OutboxDispatcher } from '../../common/outbox/dispatcher.js';
import { LISTING_EVENTS } from '../listing/listing.outbox.js';
import type { PromotionService } from './promotion.service.js';

/**
 * Hoàn Xu khi tin hiện lại nhờ khiếu nại thắng hay ân xá (design add-promotions mục 5): `listing` khôi phục cả hai bằng
 * mũi tên `appealWin` (`restoreAfterStrike`). Staff khôi phục tin gỡ sai đi mũi tên `restore` — không hoàn, tin ấy
 * không mất gói (hạn nổi bật vẫn chạy). Bên nghe chịu được nhận trùng: khoá `refund:<purchaseId>`.
 */
export function registerPromotionListeners(
  dispatcher: OutboxDispatcher,
  promotion: PromotionService,
): void {
  dispatcher.register(LISTING_EVENTS.stateChanged, async (payload) => {
    if (payload['arrow'] !== 'appealWin' || typeof payload['listingId'] !== 'string') return;
    await promotion.refundOnRestore(payload['listingId']);
  });
}
