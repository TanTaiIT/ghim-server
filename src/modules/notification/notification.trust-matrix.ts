import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { cooldownSentence, SCREENING_EVENTS } from '../screening/screening.outbox.js';
import { TRUST_EVENTS } from '../trust/trust.outbox.js';
import {
  date,
  empty,
  type Handler,
  ids,
  type MatrixContext,
  type MatrixResult,
  type NoticeDraft,
  type Payload,
  type StrikeNotice,
  str,
} from './notification.matrix.js';

/*
 * Ma trận N49–N58 (design add-trust-notices mục 3): người dùng được báo về gậy, khiếu nại, mức tin cậy và thời gian chờ
 * đăng tin của chính mình. Payload chỉ cho biết chuyện gì và bản ghi nào; câu dựng từ trạng thái lúc gửi — gậy hỏi lại
 * `trust` (luật C1), nên sự kiện thử lại muộn vẫn ra câu đúng.
 */

type OwnerDraft = Pick<NoticeDraft, 'type' | 'body' | 'detail' | 'data' | 'alertable' | 'collapse'>;

/**
 * Một dòng cho chủ tài khoản, nhóm "mức tin cậy và gậy", ký "Ghim" — không nêu ai ra gậy (TK 24). Gậy ra được trên
 * bản lưu của tài khoản đã xoá: không ai đọc dòng đó, và tài khoản đã xoá hẳn làm hỏng khoá ngoại của hộp thư.
 */
async function toOwner(
  ctx: MatrixContext,
  accountId: string | null,
  draft: OwnerDraft,
): Promise<MatrixResult> {
  if (!accountId || !(await ctx.liveAccounts([accountId])).has(accountId)) return empty();
  const notice: NoticeDraft = {
    ...draft,
    recipients: [accountId],
    category: 'trust_strikes',
    title: 'Ghim',
    groupId: null,
    personal: true,
  };
  return { ...empty(), drafts: [notice] };
}

const KIND_LABEL: Record<StrikeNotice['kind'], string> = {
  normal: 'gậy thường',
  severe: 'gậy nặng',
  serious: 'gậy nghiêm trọng',
};

/** Điều do master soạn, có thể đã kết thúc bằng dấu chấm — bỏ đi để câu sau không thành "..". */
const ruleLine = (strike: StrikeNotice) =>
  `Điều ${strike.ruleCode}: ${strike.ruleText.replace(/[\s.]+$/, '')}`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Tiêu đề tin của gậy — tin đã xoá hẳn thì không nêu tin và không mở tin. */
async function listingOf(
  ctx: MatrixContext,
  strike: StrikeNotice,
): Promise<{ title: string | null; listingId: string | null }> {
  if (!strike.listingId) return { title: null, listingId: null };
  const title = (await ctx.listingTitles([strike.listingId])).get(strike.listingId) ?? null;
  return { title, listingId: title ? strike.listingId : null };
}

/** Gậy huỷ (khiếu nại thắng, ân xá) thì tin bị gỡ vì nó được `listing` khôi phục ở bên nghe riêng — có thể chạy sau. */
const restoredLine = (title: string | null) => (title ? `Tin «${title}» được khôi phục.` : null);

const TIERS = ['T0', 'T1', 'T2', 'T3'] as const;

export const TRUST_MATRIX: Record<string, Handler> = {
  // N49 — nhận gậy. Gậy kế thừa có N50 riêng; gậy đã huỷ lúc gửi (ân xá ngay sau khi ra) chỉ còn dòng huỷ.
  async [TRUST_EVENTS.strikeIssued](payload: Payload, ctx: MatrixContext) {
    const strikeId = str(payload, 'strikeId');
    if (!strikeId || payload['inherited'] === true) return empty();
    const strike = await ctx.strike(strikeId);
    if (!strike || strike.status === 'cancelled') return empty();
    const { title, listingId } = await listingOf(ctx, strike);
    const appeal = strike.appealUntil
      ? ` Khiếu nại được tới ngày ${date(strike.appealUntil)}.`
      : '';
    const serious = strike.kind === 'serious';
    return toOwner(ctx, strike.accountId, {
      type: 'trust.strike.issued',
      body: serious
        ? 'Tài khoản bị khoá vì một gậy nghiêm trọng.'
        : `Bạn nhận một ${KIND_LABEL[strike.kind]}${title ? ` liên quan tới tin «${title}»` : ''}.`,
      detail: serious
        ? `${ruleLine(strike)}. Gậy nghiêm trọng đang chờ master quyết, chưa có ngày hết hạn.${appeal}`
        : `${ruleLine(strike)}. ${capitalize(KIND_LABEL[strike.kind])} ${strike.points} điểm, hết hạn ngày ` +
          `${date(strike.expiresAt)}.${appeal}`,
      data: { strikeId, listingId },
      alertable: true,
    });
  },

  // N50 — đăng ký lại bằng cùng email mang theo gậy: một dòng cho cả lượt, không nêu tài khoản trước.
  async [TRUST_EVENTS.strikeInherited](payload: Payload, ctx: MatrixContext) {
    const strikes = (
      await Promise.all(ids(payload, 'strikeIds').map((id) => ctx.strike(id)))
    ).filter((strike): strike is StrikeNotice => strike !== null && strike.status === 'active');
    if (strikes.length === 0) return empty();
    return toOwner(ctx, str(payload, 'accountId'), {
      type: 'trust.strike.inherited',
      body: `Tài khoản mang theo ${strikes.length} gậy còn hiệu lực.`,
      detail: strikes
        .map((strike) =>
          strike.expiresAt
            ? `Một ${KIND_LABEL[strike.kind]}, hết hạn ngày ${date(strike.expiresAt)}.`
            : `Một ${KIND_LABEL[strike.kind]}, đang chờ master quyết.`,
        )
        .join(' '),
      data: {},
      alertable: true,
    });
  },

  // N51 — khiếu nại có kết quả, kể cả lượt tự thắng khi quá hạn. Thắng còn kèm `strike.cancelled { cause: 'appeal' }`,
  // bỏ qua ở dưới để không thành hai dòng.
  async [TRUST_EVENTS.appealDecided](payload: Payload, ctx: MatrixContext) {
    const strikeId = str(payload, 'strikeId');
    const verdict = str(payload, 'verdict');
    if (!strikeId || (verdict !== 'won' && verdict !== 'lost')) return empty();
    const strike = await ctx.strike(strikeId);
    if (!strike) return empty();
    const { title, listingId } = await listingOf(ctx, strike);
    const kept =
      verdict === 'lost' && strike.expiresAt
        ? `Gậy vẫn hết hạn ngày ${date(strike.expiresAt)}.`
        : null;
    return toOwner(ctx, strike.accountId, {
      type: 'trust.appeal.decided',
      body:
        verdict === 'won'
          ? 'Khiếu nại được chấp nhận — gậy đã huỷ.'
          : 'Khiếu nại không được chấp nhận.',
      detail: verdict === 'won' ? restoredLine(title) : kept,
      data: { strikeId, listingId },
      alertable: true,
    });
  },

  // N52 — gậy huỷ ngoài khiếu nại: ân xá, master huỷ gậy nghiêm trọng. Không nêu lý do ân xá.
  async [TRUST_EVENTS.strikeCancelled](payload: Payload, ctx: MatrixContext) {
    const strikeId = str(payload, 'strikeId');
    const cause = str(payload, 'cause');
    if (!strikeId || (cause !== 'amnesty' && cause !== 'serious_cancel')) return empty();
    const strike = await ctx.strike(strikeId);
    if (!strike) return empty();
    const { title, listingId } = await listingOf(ctx, strike);
    return toOwner(ctx, strike.accountId, {
      type: 'trust.strike.cancelled',
      body: 'Một gậy của bạn đã được huỷ.',
      detail: cause === 'serious_cancel' ? 'Tài khoản đã mở khoá.' : restoredLine(title),
      data: { strikeId, listingId },
      alertable: true,
    });
  },

  // N53, N54 — master quyết gậy nghiêm trọng, gỡ khoá vĩnh viễn. `cancel` đã có N52 qua `serious_cancel`; `kept` (xem lại
  // và giữ nguyên) không đổi gì người dùng thấy.
  async [TRUST_EVENTS.strikeDecided](payload: Payload, ctx: MatrixContext) {
    const strikeId = str(payload, 'strikeId');
    const decision = str(payload, 'decision');
    if (
      !strikeId ||
      (decision !== 'permanent' && decision !== 'downgrade' && decision !== 'lifted')
    ) {
      return empty();
    }
    const strike = await ctx.strike(strikeId);
    if (!strike) return empty();
    const data = { strikeId, listingId: null };
    if (decision === 'permanent') {
      return toOwner(ctx, strike.accountId, {
        type: 'trust.strike.decided',
        body: 'Tài khoản bị khoá vĩnh viễn.',
        detail: null,
        data,
        alertable: true,
      });
    }
    if (decision === 'lifted') {
      return toOwner(ctx, strike.accountId, {
        type: 'trust.strike.lifted',
        body: 'Khoá vĩnh viễn đã được gỡ.',
        detail: null,
        data,
        alertable: true,
      });
    }
    // Hạn của gậy nặng tính từ ngày ra gậy nghiêm trọng (spec trust/serious-strikes): hạ muộn thì `trust` ghi thẳng
    // "đã hết hạn" và không phát `strike.expired`.
    return toOwner(ctx, strike.accountId, {
      type: 'trust.strike.decided',
      body: 'Tài khoản đã mở khoá; gậy nghiêm trọng đã hạ thành gậy nặng.',
      detail:
        strike.status === 'expired' || !strike.expiresAt
          ? 'Gậy nặng này đã hết hạn.'
          : `Gậy nặng ${strike.points} điểm, hết hạn ngày ${date(strike.expiresAt)}.`,
      data,
      alertable: true,
    });
  },

  // N55 — gậy hết hạn, không nhắc. Gậy này kéo điểm về dưới ngưỡng khoá đăng tin thì nói đã đăng tin lại được.
  async [TRUST_EVENTS.strikeExpired](payload: Payload, ctx: MatrixContext) {
    const strikeId = str(payload, 'strikeId');
    if (!strikeId) return empty();
    const strike = await ctx.strike(strikeId);
    if (!strike) return empty();
    const { points } = await ctx.standing(strike.accountId);
    const threshold = ctx.postingLockPoints();
    const unlocked = points < threshold && points + strike.points >= threshold;
    return toOwner(ctx, strike.accountId, {
      type: 'trust.strike.expired',
      body: `Một ${KIND_LABEL[strike.kind]} của bạn đã hết hạn.${unlocked ? ' Bạn đã đăng tin lại được.' : ''}`,
      detail: null,
      data: { strikeId, listingId: null },
      alertable: false,
    });
  },

  // N56, N57 — mức tin cậy đổi: lên không nhắc, xuống có nhắc (hạn mức giảm ngay, cần biết trước lượt đăng sau).
  async [TRUST_EVENTS.tierChanged](payload: Payload, ctx: MatrixContext) {
    const from = TIERS.indexOf(str(payload, 'from') as (typeof TIERS)[number]);
    const to = TIERS.indexOf(str(payload, 'to') as (typeof TIERS)[number]);
    if (from < 0 || to < 0 || from === to) return empty();
    const tier = TIERS[to];
    const up = to > from;
    return toOwner(ctx, str(payload, 'accountId'), {
      type: up ? 'trust.tier.raised' : 'trust.tier.lowered',
      body: up ? `Tài khoản đã lên mức ${tier}.` : `Tài khoản đang ở mức ${tier}.`,
      detail: 'Hạn mức đăng tin của mức này có trong bảng uy tín.',
      data: {},
      alertable: !up,
    });
  },

  // N58 — vào thời gian chờ vì dò cổng cứng: đúng câu của lỗi 429, không nêu dấu hiệu (TK 13). Phát lại khi đang chờ
  // (sửa, gia hạn tin vẫn dò) thì cập nhật dòng chưa đọc theo mốc mới nhất.
  async [SCREENING_EVENTS.cooldownStarted](payload: Payload, ctx: MatrixContext) {
    const until = str(payload, 'until');
    const at = until ? new Date(until) : null;
    if (!at || Number.isNaN(at.getTime())) return empty();
    const body = cooldownSentence(at);
    return toOwner(ctx, str(payload, 'accountId'), {
      type: 'listing.submission.cooldown',
      body,
      detail: 'Cần giúp thì nhắn Hỗ trợ Ghim.',
      data: { retryAt: until },
      alertable: true,
      collapse: { key: 'trust:cooldown', render: () => body },
    });
  },
};

export const TRUST_NOTICE_EVENTS = Object.keys(TRUST_MATRIX) as OutboxEventType[];
