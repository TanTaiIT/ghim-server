import type { Listing } from '@prisma/client';

import type {
  OutboxEventInput,
  OutboxEventType,
  OutboxPayload,
} from '../../common/outbox/outbox.js';

/**
 * Sự kiện `listing` phát vào outbox (design add-listings mục 16). Payload chỉ mang mã và trạng thái; bên nghe phải
 * chịu được nhận trùng. Tên đủ ba phần như mọi module — sự kiện về chính tin mang thực thể `listing`.
 */
export const LISTING_EVENTS = {
  /** Mỗi lượt gửi (gửi, gửi lại sau sửa, gia hạn, chuyển lên sàn chung) — `identity` ghi dấu máy, máy duyệt nghe. */
  submitted: 'listing.listing.submitted',
  stateChanged: 'listing.state.changed',
  hiddenChanged: 'listing.hidden.changed',
  /** Tin rời nhóm hẳn (nhóm đóng, sang riêng tư, bị gỡ khỏi nhóm) — kèm hạn chuyển lên sàn chung. */
  detached: 'listing.listing.detached',
  placementDowngraded: 'listing.placement.downgraded',
  badgeRemoved: 'listing.badge.removed',
  expiryReminder: 'listing.expiry.reminder',
  edited: 'listing.listing.edited',
  deleted: 'listing.listing.deleted',
  moved: 'listing.listing.moved',
} as const satisfies Record<string, OutboxEventType>;

export const listingEvent = (
  type: (typeof LISTING_EVENTS)[keyof typeof LISTING_EVENTS],
  payload: OutboxPayload,
): OutboxEventInput => ({ type, payload });

type StateFields = Pick<
  Listing,
  | 'id'
  | 'ownerId'
  | 'state'
  | 'version'
  | 'placement'
  | 'groupId'
  | 'restrictions'
  | 'hideReasons'
  | 'firstLiveAt'
  | 'fault'
>;

/**
 * Mọi lần đổi trạng thái phát cùng một hình — `trust`, hàng đợi duyệt đọc `full` và `fault`; N31 đọc `firstLive` (tin MỚI
 * lên bảng, không phải lượt qua máy sau sửa hay khôi phục) và `hidden` (tạm ẩn thì bảng tin nhóm không có tin).
 */
export const stateChangedEvent = (
  updated: StateFields,
  before: Pick<Listing, 'state' | 'firstLiveAt'>,
  arrow: string,
): OutboxEventInput =>
  listingEvent(LISTING_EVENTS.stateChanged, {
    listingId: updated.id,
    ownerId: updated.ownerId,
    from: before.state,
    to: updated.state,
    arrow,
    version: updated.version,
    placement: updated.placement,
    groupId: updated.groupId,
    full: updated.restrictions.length === 0,
    firstLive: before.firstLiveAt === null && updated.firstLiveAt !== null,
    hidden: updated.hideReasons.length > 0,
    fault: updated.fault,
  });
