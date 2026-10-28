import type { OutboxEventType } from '../../common/outbox/outbox.js';
import { WALLET_EVENTS } from '../wallet/wallet.schema.js';
import {
  empty,
  type Handler,
  type MatrixContext,
  type MatrixResult,
  type NoticeDraft,
  type Payload,
  str,
} from './notification.matrix.js';

/*
 * N59 (design add-wallet mục 7): biến động ví do người khác gây ra — master cấp / trừ, hoàn Xu — một dòng cá nhân có
 * nhắc, ký "Ghim", không nêu master, không nêu lý do (màn hình khoá ai cũng đọc; lý do nằm ở dòng sổ cái trong app).
 * Người dùng tự mua gói thì không báo.
 */

const num = (payload: Payload, key: string): number | null => {
  const value = payload[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
};

const line = (type: string, amount: number, balance: number): string | null => {
  const xu = Math.abs(amount);
  if (type === 'refund') return `Hoàn ${xu} Xu · số dư ${balance} Xu`;
  if (type !== 'admin_adjust') return null;
  return amount > 0
    ? `Ghim cấp cho bạn ${xu} Xu · số dư ${balance} Xu`
    : `Ghim trừ ${xu} Xu trong ví · số dư ${balance} Xu`;
};

export const WALLET_MATRIX: Record<string, Handler> = {
  async [WALLET_EVENTS.balanceChanged](
    payload: Payload,
    ctx: MatrixContext,
  ): Promise<MatrixResult> {
    const accountId = str(payload, 'accountId');
    const transactionId = str(payload, 'transactionId');
    const type = str(payload, 'type');
    const amount = num(payload, 'amount');
    const balance = num(payload, 'balanceAfter');
    if (!accountId || !transactionId || !type || amount === null || balance === null)
      return empty();
    const body = line(type, amount, balance);
    if (!body || !(await ctx.liveAccounts([accountId])).has(accountId)) return empty();
    const draft: NoticeDraft = {
      recipients: [accountId],
      category: 'wallet',
      type: `wallet.${type}`,
      title: 'Ghim',
      body,
      detail: null,
      data: { transactionId },
      groupId: null,
      alertable: true,
      personal: true,
    };
    return { ...empty(), drafts: [draft] };
  },
};

export const WALLET_NOTICE_EVENTS = Object.keys(WALLET_MATRIX) as OutboxEventType[];
