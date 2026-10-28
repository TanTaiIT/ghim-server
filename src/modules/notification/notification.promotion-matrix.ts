import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { PROMOTION_EVENTS } from '../promotion/promotion.schema.js';
import {
  date,
  empty,
  type Handler,
  type MatrixContext,
  type MatrixResult,
  type NoticeDraft,
  type Payload,
  str,
} from './notification.matrix.js';

/*
 * N60, N61 (design add-promotions mục 8): người đăng được báo khi gói vừa áp và khi tin sắp hết nổi bật — nhóm "tin đăng
 * của bạn", ký "Ghim", có nhắc, không nêu số Xu (ví có dòng riêng).
 */

async function toOwner(
  ctx: MatrixContext,
  payload: Payload,
  body: (title: string, expiresAt: string | null) => string | null,
  type: string,
): Promise<MatrixResult> {
  const accountId = str(payload, 'accountId');
  const listingId = str(payload, 'listingId');
  const purchaseId = str(payload, 'purchaseId');
  if (!accountId || !listingId || !purchaseId) return empty();
  const title = (await ctx.listingTitles([listingId])).get(listingId);
  if (!title || !(await ctx.liveAccounts([accountId])).has(accountId)) return empty();
  const text = body(title, str(payload, 'expiresAt'));
  if (!text) return empty();
  const draft: NoticeDraft = {
    recipients: [accountId],
    category: 'your_listings',
    type,
    title: 'Ghim',
    body: text,
    detail: null,
    data: { listingId, purchaseId },
    groupId: null,
    alertable: true,
    personal: true,
  };
  return { ...empty(), drafts: [draft] };
}

export const PROMOTION_MATRIX: Record<string, Handler> = {
  // N60 — gói vừa áp.
  [PROMOTION_EVENTS.purchaseApplied]: (payload, ctx) =>
    toOwner(
      ctx,
      payload,
      (title, expiresAt) =>
        str(payload, 'effect') === 'featured'
          ? expiresAt
            ? `«${title}» nổi bật tới ngày ${date(expiresAt)}.`
            : null
          : `«${title}» đã được đẩy lên đầu bảng tin.`,
      'promotion.applied',
    ),
  // N61 — sắp hết nổi bật, một lần mỗi lượt mua (job đặt `reminded_at`).
  [PROMOTION_EVENTS.purchaseExpiring]: (payload, ctx) =>
    toOwner(
      ctx,
      payload,
      (title, expiresAt) =>
        expiresAt ? `«${title}» sắp hết nổi bật — hết ngày ${date(expiresAt)}.` : null,
      'promotion.expiring',
    ),
};

export const PROMOTION_NOTICE_EVENTS = Object.keys(PROMOTION_MATRIX) as OutboxEventType[];
