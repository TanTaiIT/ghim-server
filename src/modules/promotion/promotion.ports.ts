import type { GroupService } from '../group/group.service.js';
import type { ListingService } from '../listing/listing.service.js';
import type { TrustService } from '../trust/trust.service.js';
import type { WalletRepository } from '../wallet/wallet.repository.js';

/*
 * Điều `promotion` hỏi và gọi ở module khác (design add-promotions mục 1) — chỉ qua cổng. Chiều ngược: `notification`
 * nghe sự kiện, `ops` gọi `purgeAccount`; không ai gọi hàm khác của `promotion`.
 */

/** Tin của người đăng (trạng thái, nơi đăng, phiên bản) và đường ghi hiệu ứng trong transaction của lượt mua. */
export type PromotionListingPort = Pick<ListingService, 'reviewSubject' | 'applyPromotion'>;

/** Sổ cái Xu: trừ trong transaction của lượt mua, đọc lại sau P2002, số dư để báo "mua được không". */
export type PromotionWalletPort = Pick<WalletRepository, 'apply' | 'replay' | 'balanceOf'>;

export type PromotionTrustPort = Pick<TrustService, 'tierOf' | 'postingLockedUntil'>;

/** Nhóm của tin: còn cho thành viên dùng gói không. */
export type PromotionGroupPort = Pick<GroupService, 'findGroup'>;
