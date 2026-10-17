import type { Conversation } from '@prisma/client';

import type { Actor } from '../../common/auth/actor.js';
import type { RuntimeConfig } from '../../common/config/runtime-config.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '../../common/errors/app-error.js';
import type { Realtime } from '../../common/realtime/realtime.js';
import { formatTimeVN } from '../../common/time/time.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { ListingService } from '../listing/listing.service.js';
import type { ReviewService } from '../review/review.service.js';
import type { ScreeningService } from '../screening/screening.service.js';
import type { TrustTier } from '../trust/calc/tier.calc.js';
import type { MessagingRepository } from './messaging.repository.js';

// ── CỔNG ─────────────────────────────────────────────────────────────────────────────────────────

export type MessagingIdentityPort = Pick<
  IdentityService,
  'accountSummaries' | 'sharedDeviceAccounts' | 'deviceToken'
>;
/** `reportTarget` = tin người này thấy được qua đường link, kể cả tin của mình — đúng luật mở hội thoại mới. */
export type MessagingListingPort = Pick<ListingService, 'reportTarget' | 'titles'>;
export interface MessagingTrustPort {
  tierOf(accountId: string): Promise<TrustTier>;
}
export type MessagingScreeningPort = Pick<ScreeningService, 'phraseVerdict'>;
/** `review` vẫn là nơi duy nhất ghi báo cáo; `messaging` chỉ kiểm tư cách rồi chuyển lượt báo kèm mã hội thoại. */
export type MessagingReviewPort = Pick<ReviewService, 'submitReport'>;

export interface MessagingServiceDeps {
  repository: MessagingRepository;
  identity: MessagingIdentityPort;
  listings: MessagingListingPort;
  trust: MessagingTrustPort;
  screening: MessagingScreeningPort;
  review: MessagingReviewPort;
  realtime: Realtime;
  config: RuntimeConfig;
  clock: () => Date;
}

// ── VAI TRONG HỘI THOẠI ──────────────────────────────────────────────────────────────────────────

export type Side = 'buyer' | 'seller';

/** Dòng hội thoại giữ cột "phía tôi" theo vai mua / bán — mọi chỗ đọc chọn cột qua đây (design, Risks). */
export const sideOf = (
  row: Pick<Conversation, 'buyerId' | 'sellerId'>,
  accountId: string,
): Side | null =>
  row.buyerId === accountId ? 'buyer' : row.sellerId === accountId ? 'seller' : null;

export const otherOf = (row: Pick<Conversation, 'buyerId' | 'sellerId'>, side: Side): string =>
  side === 'buyer' ? row.sellerId : row.buyerId;

export const hiddenFor = (
  row: Pick<Conversation, 'buyerHiddenAt' | 'sellerHiddenAt'>,
  side: Side,
): boolean => (side === 'buyer' ? row.buyerHiddenAt : row.sellerHiddenAt) !== null;

// ── LỖI ──────────────────────────────────────────────────────────────────────────────────────────

/** Người ngoài hội thoại nhận đúng câu của hội thoại không tồn tại (spec conversations). */
export const conversationNotFound = (): NotFoundError =>
  new NotFoundError('Không có hội thoại này');
/** Cùng một câu cho người chặn lẫn người bị chặn — không lộ ai chặn (spec blocking). */
export const messagingBlocked = (): ForbiddenError =>
  new ForbiddenError('Hội thoại này không nhận tin nhắn', 'MESSAGING_BLOCKED');
export const listingNotLive = (): ConflictError =>
  new ConflictError('Tin không còn hiển thị — không mở được hội thoại mới', 'LISTING_NOT_LIVE');
export const ownListing = (): ForbiddenError =>
  new ForbiddenError('Không nhắn tin cho tin của chính mình', 'CANNOT_MESSAGE_OWN_LISTING');
export const conversationClosed = (): ConflictError =>
  new ConflictError('Người kia đã rời Ghim — hội thoại chỉ còn để đọc', 'CONVERSATION_CLOSED');
/** Câu chung, không nêu cụm nào bị trúng (spec conversations, cam kết 5). */
export const messageNotAllowed = (): ConflictError =>
  new ConflictError('Tin nhắn có nội dung không được phép trên Ghim', 'MESSAGE_NOT_ALLOWED');
export const newConversationLimit = (cap: number, retryAt: Date): TooManyRequestsError =>
  new TooManyRequestsError(
    `Mỗi ngày mở tối đa ${cap} hội thoại mới — mở tiếp được từ ${formatTimeVN(retryAt)}`,
    'NEW_CONVERSATION_LIMIT',
    { retryAt: retryAt.toISOString() },
  );

/** Master nhắn bằng tài khoản cá nhân như mọi người (spec conversations "Ai được nhắn tin"). */
export const assertCanMessage = (actor: Actor): void => {
  if (actor.role === 'master') {
    throw new ForbiddenError('Tài khoản master không nhắn tin — dùng tài khoản cá nhân');
  }
};

export const DAY_MS = 86_400_000;
