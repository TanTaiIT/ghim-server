import { Prisma, type WalletTransaction } from '@prisma/client';

import { appendAudit, auditActor } from '../../common/audit/audit.js';
import type { Actor } from '../../common/auth/actor.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { type CursorQuery, toCursorPage } from '../../common/schemas/cursor.js';
import type { WalletIdentityPort } from './wallet.ports.js';
import type { LedgerEntry, WalletRepository } from './wallet.repository.js';
import {
  OPS_WALLET_RECENT,
  type OpsWalletDto,
  type WalletAdjustBody,
  type WalletAdjustResultDto,
  type WalletDto,
  type WalletTransactionDto,
} from './wallet.schema.js';

export interface WalletServiceDeps {
  repository: WalletRepository;
  identity: WalletIdentityPort;
  clock: () => Date;
}

export interface WalletService {
  myWallet(actor: Actor): Promise<WalletDto>;
  myTransactions(
    actor: Actor,
    query: CursorQuery,
  ): Promise<{ items: WalletTransactionDto[]; nextCursor: string | null }>;
  /** Master xem ví một tài khoản trước khi cấp: số dư và các dòng gần nhất (spec "Master xem ví trước khi cấp"). */
  opsWallet(accountId: string): Promise<OpsWalletDto>;
  /**
   * Master cấp (dương) hay trừ (âm) Xu kèm lý do — một transaction: `apply` với khoá `adjust:<masterId>:<khoá app>`
   * rồi nhật ký. Gửi lại cùng khoá trả cùng dòng, không ghi thêm nhật ký (design add-wallet mục 3, 6).
   */
  adjust(actor: Actor, accountId: string, body: WalletAdjustBody): Promise<WalletAdjustResultDto>;
  /** Cổng hạn lưu cho `ops`: xoá sổ cái và ví của tài khoản đã xoá quá hạn. */
  purgeAccount(accountId: string): Promise<void>;
}

const isDuplicateKey = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Cột `refs` là JSON tự do của Prisma; mọi lượt ghi chỉ đặt chuỗi vào (`LedgerEntry.refs`). */
const refsOf = (row: WalletTransaction): Record<string, string> =>
  Object.fromEntries(
    Object.entries((row.refs ?? {}) as Record<string, unknown>).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as const] : [],
    ),
  );

export const toTransactionDto = (row: WalletTransaction): WalletTransactionDto => ({
  id: row.id,
  amount: row.amount,
  type: row.type,
  balanceAfter: row.balanceAfter,
  refs: refsOf(row),
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

export function createWalletService(deps: WalletServiceDeps): WalletService {
  const { repository, identity, clock } = deps;

  /** Tài khoản không có hay đã xoá → 404; bị khoá vẫn được cấp (design mục 5). */
  const requireAccount = async (accountId: string): Promise<void> => {
    const state = await identity.accountState(accountId);
    if (!state || state.status === 'deleted') throw new NotFoundError('Không có tài khoản này');
  };

  const recordAdjust = (actor: Actor, entry: LedgerEntry) =>
    repository.inTransaction(async (tx) => {
      const { transaction: row, replayed } = await repository.apply(tx, entry);
      // Gửi lại cùng khoá: `apply` trả dòng cũ (không phát sự kiện) — nhật ký cũng không ghi thêm.
      if (!replayed) {
        await appendAudit(tx, {
          ...auditActor(actor),
          action: 'wallet.wallet.adjust',
          targetType: 'account',
          targetId: entry.accountId,
          details: {
            amount: entry.amount,
            balanceAfter: row.balanceAfter,
            transactionId: row.id,
            reason: entry.note ?? null,
          },
        });
      }
      return row;
    });

  return {
    async myWallet(actor) {
      return { balance: await repository.balanceOf(actor.accountId) };
    },

    async myTransactions(actor, query) {
      const rows = await repository.transactionsOf({
        accountId: actor.accountId,
        cursor: query.cursor,
        limit: query.limit,
      });
      const { items, nextCursor } = toCursorPage(rows, query.limit, (row) => ({
        at: row.createdAt,
        id: row.id,
      }));
      return { items: items.map(toTransactionDto), nextCursor };
    },

    async opsWallet(accountId) {
      await requireAccount(accountId);
      const [balance, rows] = await Promise.all([
        repository.balanceOf(accountId),
        repository.transactionsOf({ accountId, limit: OPS_WALLET_RECENT }),
      ]);
      return { balance, transactions: rows.slice(0, OPS_WALLET_RECENT).map(toTransactionDto) };
    },

    async adjust(actor, accountId, body) {
      await requireAccount(accountId);
      const entry: LedgerEntry = {
        accountId,
        amount: body.amount,
        type: 'admin_adjust',
        refs: {},
        note: body.reason,
        actorId: actor.accountId,
        idempotencyKey: `adjust:${actor.accountId}:${body.idempotencyKey}`,
        at: clock(),
      };
      let row: WalletTransaction;
      try {
        row = await recordAdjust(actor, entry);
      } catch (error) {
        // Hai lượt cùng khoá song song: lượt sau vấp unique, cả transaction quay lui — đọc lại dòng của lượt trước.
        if (!isDuplicateKey(error)) throw error;
        const earlier = await repository.replay(entry);
        if (!earlier) throw error;
        row = earlier;
      }
      return { balance: row.balanceAfter, transaction: toTransactionDto(row) };
    },

    purgeAccount: (accountId) => repository.purgeAccount(accountId),
  };
}
