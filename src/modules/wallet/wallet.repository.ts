import type {
  Prisma,
  PrismaClient,
  WalletTransaction,
  WalletTransactionType,
} from '@prisma/client';

import { ConflictError } from '../../common/errors/app-error.js';
import { appendEvents } from '../../common/outbox/outbox.js';
import type { CursorKey } from '../../common/schemas/cursor.js';
import { WALLET_EVENTS } from './wallet.schema.js';

export type Tx = Prisma.TransactionClient;

/** Một biến động ví (design add-wallet mục 3). `amount` âm = trừ, dương = cộng. */
export interface LedgerEntry {
  accountId: string;
  amount: number;
  type: WalletTransactionType;
  refs: Record<string, string>;
  note?: string | null;
  actorId?: string | null;
  /** Có tiền tố theo nguồn: `adjust:<masterId>:<khoá app>`, `purchase:<accountId>:<khoá app>`, `refund:<purchaseId>`. */
  idempotencyKey: string;
  at: Date;
}

/** `replayed` = khoá đã có, trả dòng cũ: không phát sự kiện, bên gọi không ghi thêm nhật ký. */
export interface Applied {
  transaction: WalletTransaction;
  replayed: boolean;
}

export interface WalletRepository {
  /**
   * Đường ghi duy nhất của sổ cái, trong transaction của bên gọi: khoá đã có → trả dòng cũ (cùng tài khoản, số, loại) hay
   * 409 `IDEMPOTENCY_CONFLICT`; cộng `ON CONFLICT`, trừ có điều kiện `balance >= x` (không dòng → 409
   * `INSUFFICIENT_BALANCE`; `UPDATE` khoá dòng ví nên hai lượt trừ song song xếp hàng); ghi dòng; phát
   * `wallet.balance.changed`. Hai lượt CÙNG khoá song song: lượt sau vấp unique `idempotency_key` (P2002) — bên mở
   * transaction bắt sau khi quay lui rồi `findByKey`.
   */
  apply(tx: Tx, entry: LedgerEntry): Promise<Applied>;
  findByKey(idempotencyKey: string): Promise<WalletTransaction | null>;
  /**
   * Sau khi transaction quay lui vì P2002 trên `idempotency_key`: dòng của lượt trước nếu cùng tài khoản, số, loại; khác
   * → 409 `IDEMPOTENCY_CONFLICT`; chưa có (P2002 của cột khác) → `null`, bên gọi ném lại lỗi gốc.
   */
  replay(entry: LedgerEntry): Promise<WalletTransaction | null>;
  /** Mở transaction cho lượt ghi do chính `wallet` chủ trì (cấp / trừ của master). */
  inTransaction<T>(run: (tx: Tx) => Promise<T>): Promise<T>;
  /** Ví lười: không có dòng = 0. */
  balanceOf(accountId: string): Promise<number>;
  /** Mới trước, con trỏ (`createdAt`, `id`); trả `limit + 1` dòng cho `toCursorPage`. */
  transactionsOf(input: {
    accountId: string;
    cursor?: CursorKey | undefined;
    limit: number;
  }): Promise<WalletTransaction[]>;
  /** Lượt dọn tài khoản đã xoá (`ops`): một transaction `SET LOCAL ghim.purge = 'on'`, xoá sổ cái rồi ví. */
  purgeAccount(accountId: string): Promise<void>;
  /** Test DB so tổng sổ cái với số dư — sổ cái là sự thật, số dư là cache. */
  sumOf(accountId: string): Promise<number>;
}

const idempotencyConflict = (): ConflictError =>
  new ConflictError(
    'Khoá chống lặp này đã dùng cho một lượt khác — tạo khoá mới rồi gửi lại',
    'IDEMPOTENCY_CONFLICT',
  );
const insufficientBalance = (): ConflictError =>
  new ConflictError('Ví không đủ Xu', 'INSUFFICIENT_BALANCE');

const sameEntry = (row: WalletTransaction, entry: LedgerEntry): boolean =>
  row.accountId === entry.accountId && row.amount === entry.amount && row.type === entry.type;

/** Cộng tạo ví nếu chưa có (ví lười); trừ chỉ khi đủ Xu — trừ ví chưa có là thiếu Xu như ví 0. */
const move = async (tx: Tx, entry: LedgerEntry): Promise<number> => {
  const rows =
    entry.amount > 0
      ? await tx.$queryRaw<{ balance: number }[]>`
          INSERT INTO wallets (account_id, balance, updated_at)
          VALUES (${entry.accountId}::uuid, ${entry.amount}, ${entry.at})
          ON CONFLICT (account_id)
            DO UPDATE SET balance = wallets.balance + ${entry.amount}, updated_at = ${entry.at}
          RETURNING balance`
      : await tx.$queryRaw<{ balance: number }[]>`
          UPDATE wallets SET balance = balance - ${-entry.amount}, updated_at = ${entry.at}
          WHERE account_id = ${entry.accountId}::uuid AND balance >= ${-entry.amount}
          RETURNING balance`;
  const row = rows[0];
  if (!row) throw insufficientBalance();
  return row.balance;
};

export function createWalletRepository(prisma: PrismaClient): WalletRepository {
  const findByKey = (idempotencyKey: string) =>
    prisma.walletTransaction.findUnique({ where: { idempotencyKey } });

  return {
    async apply(tx, entry) {
      const existing = await tx.walletTransaction.findUnique({
        where: { idempotencyKey: entry.idempotencyKey },
      });
      if (existing) {
        if (sameEntry(existing, entry)) return { transaction: existing, replayed: true };
        throw idempotencyConflict();
      }
      const balanceAfter = await move(tx, entry);
      const row = await tx.walletTransaction.create({
        data: {
          accountId: entry.accountId,
          amount: entry.amount,
          type: entry.type,
          balanceAfter,
          refs: entry.refs,
          note: entry.note ?? null,
          actorId: entry.actorId ?? null,
          idempotencyKey: entry.idempotencyKey,
          createdAt: entry.at,
        },
      });
      await appendEvents(tx, [
        {
          type: WALLET_EVENTS.balanceChanged,
          payload: {
            accountId: entry.accountId,
            transactionId: row.id,
            type: entry.type,
            amount: entry.amount,
            balanceAfter,
          },
        },
      ]);
      return { transaction: row, replayed: false };
    },

    findByKey,

    async replay(entry) {
      const row = await findByKey(entry.idempotencyKey);
      if (!row) return null;
      if (!sameEntry(row, entry)) throw idempotencyConflict();
      return row;
    },

    inTransaction: (run) => prisma.$transaction(run),

    async balanceOf(accountId) {
      const wallet = await prisma.wallet.findUnique({ where: { accountId } });
      return wallet?.balance ?? 0;
    },

    transactionsOf: ({ accountId, cursor, limit }) =>
      prisma.walletTransaction.findMany({
        where: cursor
          ? {
              accountId,
              OR: [
                { createdAt: { lt: cursor.at } },
                { createdAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : { accountId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),

    purgeAccount: (accountId) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ghim.purge = 'on'`);
        await tx.walletTransaction.deleteMany({ where: { accountId } });
        await tx.wallet.deleteMany({ where: { accountId } });
      }),

    async sumOf(accountId) {
      const [row] = await prisma.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(amount), 0)::int AS total FROM wallet_transactions
        WHERE account_id = ${accountId}::uuid`;
      return row?.total ?? 0;
    },
  };
}
