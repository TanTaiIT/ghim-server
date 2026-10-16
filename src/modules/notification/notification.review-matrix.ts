import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { type ListingDecidedOutcome, REVIEW_EVENTS } from '../review/review.outbox.js';
import {
  empty,
  type Handler,
  type MatrixContext,
  type MatrixResult,
  type NoticeDraft,
  num,
  type Payload,
  str,
} from './notification.matrix.js';

/** Một dòng cho mọi master, nhóm "tài khoản" (luôn bật), có nhắc; lặp lại thì cập nhật dòng chưa đọc, không thêm dòng. */
async function toMasters(
  ctx: MatrixContext,
  draft: { type: string; title: string; body: string },
): Promise<MatrixResult> {
  const recipients = await ctx.masterIds();
  if (recipients.length === 0) return empty();
  const notice: NoticeDraft = {
    ...draft,
    recipients,
    category: 'account',
    personal: true,
    data: {},
    groupId: null,
    alertable: true,
    // Câu luôn theo số của lượt mới nhất: dòng chưa đọc là trạng thái hiện tại, không phải số lần nhắc.
    collapse: {
      key: draft.type,
      render: () => draft.body,
      alertMinutes: 'notification.reviewAlertMinutes',
    },
  };
  return { ...empty(), drafts: [notice] };
}

/** N45: câu nhắc chỉ nói kết quả kèm tiêu đề tin — lý do mẫu chỉ nằm trong `detail` xem trong app (TK 24). */
const DECIDED_TEXT: Record<ListingDecidedOutcome, (title: string) => string> = {
  approved: (title) => `Tin «${title}» đã được duyệt và đang hiển thị.`,
  rejected: (title) => `Tin «${title}» chưa được duyệt.`,
  removed: (title) => `Tin «${title}» đã bị gỡ.`,
  restored: (title) => `Tin «${title}» đã hiển thị lại.`,
};

/** Sai sót thì người đăng sửa rồi gửi lại được (TK 17). Vi phạm (gậy) có câu riêng ở `add-strikes`. */
const FIX_HINT: Partial<Record<ListingDecidedOutcome, string>> = {
  rejected: 'Sửa tin rồi gửi lại để người duyệt xem lại.',
  removed: 'Sửa tin rồi gửi lại để tin hiện lại.',
};

const isDecidedOutcome = (value: string | null): value is ListingDecidedOutcome =>
  value !== null && Object.hasOwn(DECIDED_TEXT, value);

function decidedDetail(payload: Payload, outcome: ListingDecidedOutcome): string | null {
  const reason = str(payload, 'reason');
  const hint = str(payload, 'fault') === 'mistake' ? FIX_HINT[outcome] : undefined;
  const parts = [reason ? `Lý do: ${reason}.` : null, hint ?? null].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Ma trận N40–N42 (design add-review-queues mục 10): việc theo lịch của `review` báo master. Payload luôn mang đủ số
 * (cả ngưỡng đang dùng); thiếu số là sự kiện hỏng — không báo. N45 (change notify-listing-decisions): người duyệt quyết
 * về tin thì báo người đăng.
 */
export const REVIEW_MATRIX: Record<string, Handler> = {
  // N45 — đạt tin chờ duyệt, từ chối, gỡ, khôi phục. Quản trị nhóm ký tên nhóm, staff và master ký "Ghim"; không tên ai.
  async [REVIEW_EVENTS.listingDecided](payload: Payload, ctx: MatrixContext) {
    const listingId = str(payload, 'listingId');
    const ownerId = str(payload, 'ownerId');
    const outcome = str(payload, 'outcome');
    if (!listingId || !ownerId || !isDecidedOutcome(outcome)) return empty();
    const groupId = str(payload, 'groupId');
    const [titles, group] = await Promise.all([
      ctx.listingTitles([listingId]),
      groupId ? ctx.group(groupId) : Promise.resolve(null),
    ]);
    // Tin đã xoá hẳn trước khi bên nghe chạy: không còn gì để mở.
    const title = titles.get(listingId);
    if (!title) return empty();
    const signer = groupId ? `Quản trị nhóm «${group?.name ?? 'của nhóm'}»` : 'Ghim';
    const notice: NoticeDraft = {
      recipients: [ownerId],
      category: 'your_listings',
      type: `listing.review.${outcome}`,
      title: signer,
      body: DECIDED_TEXT[outcome](title),
      detail: decidedDetail(payload, outcome),
      data: { listingId, groupId },
      groupId,
      alertable: true,
      personal: true,
    };
    return { ...empty(), drafts: [notice] };
  },

  // N40 — việc nằm ở hàng master quá hạn nhắc, nhắc lại mỗi ngày.
  async [REVIEW_EVENTS.masterReminder](payload: Payload, ctx: MatrixContext) {
    const count = num(payload, 'count');
    const hours = num(payload, 'hours');
    if (!count || hours === null) return empty();
    return toMasters(ctx, {
      type: 'review.master.reminder',
      title: 'Hàng chờ của master',
      body: `${count} việc nằm ở hàng master quá ${hours} giờ chưa ai xử.`,
    });
  },

  // N41 — một nửa số việc đang chờ sắp chạm hạn.
  async [REVIEW_EVENTS.deadlineWarning](payload: Payload, ctx: MatrixContext) {
    const open = num(payload, 'open');
    const dueSoon = num(payload, 'dueSoon');
    const hours = num(payload, 'hours');
    if (open === null || dueSoon === null || hours === null) return empty();
    return toMasters(ctx, {
      type: 'review.deadline.warning',
      title: 'Hàng chờ sắp chạm hạn',
      body: `${dueSoon} trong ${open} việc đang chờ sẽ chạm hạn trong ${hours} giờ tới.`,
    });
  },

  // N42 — hậu kiểm tuần trước làm xong dưới ngưỡng.
  async [REVIEW_EVENTS.postcheckLow](payload: Payload, ctx: MatrixContext) {
    const rate = num(payload, 'rate');
    const done = num(payload, 'done');
    const expired = num(payload, 'expired');
    const threshold = num(payload, 'threshold');
    if (rate === null || done === null || expired === null || threshold === null) return empty();
    return toMasters(ctx, {
      type: 'review.postcheck.low',
      title: 'Hậu kiểm tuần trước',
      body:
        `Hậu kiểm tuần trước làm xong ${rate}% (${done} việc xử xong, ${expired} việc tự huỷ vì quá hạn)` +
        ` — dưới ngưỡng ${threshold}%.`,
    });
  },
};

export const REVIEW_NOTICE_EVENTS = Object.keys(REVIEW_MATRIX) as OutboxEventType[];
