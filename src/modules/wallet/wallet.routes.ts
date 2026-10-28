import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { actorOf } from '../../common/auth/actor.js';
import { cursorQuerySchema } from '../../common/schemas/cursor.js';
import { errorResponse, ok, toOk } from '../../common/schemas/response.js';
import {
  opsWalletSchema,
  walletAccountParamsSchema,
  walletAdjustBodySchema,
  walletAdjustResultSchema,
  walletPageSchema,
  walletSchema,
} from './wallet.schema.js';
import type { WalletService } from './wallet.service.js';

export interface WalletRoutesOptions {
  wallet: WalletService;
}

const TAGS_ME = ['Wallet · Ví Xu'];
const TAGS_OPS = ['Ops · Wallet'];
const bearer = [{ bearerAuth: [] }];

/**
 * Người dùng chỉ có `/me/*` — không có đường đọc ví người khác, không có route nạp hay rút (spec wallet/ledger). Bàn
 * vận hành của ví là của master (TK 6): staff cũng không cấp được.
 */
export const walletRoutes: FastifyPluginAsyncZod<WalletRoutesOptions> = async (app, { wallet }) => {
  const user = [app.authenticate];
  const master = [app.authenticate, app.requireMaster];

  app.get('/me/wallet', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary: 'Số dư Xu của tôi — tài khoản chưa có biến động nào là 0',
      security: bearer,
      response: { 200: ok(walletSchema), 401: errorResponse },
    },
    handler: async (request) => toOk(await wallet.myWallet(actorOf(request))),
  });

  app.get('/me/wallet/transactions', {
    preHandler: user,
    schema: {
      tags: TAGS_ME,
      summary:
        'Lịch sử ví của tôi, mới trước — mỗi dòng có loại, số Xu, số dư sau và lý do (nếu master ghi)',
      security: bearer,
      querystring: cursorQuerySchema,
      response: { 200: ok(walletPageSchema), 400: errorResponse, 401: errorResponse },
    },
    handler: async (request) => toOk(await wallet.myTransactions(actorOf(request), request.query)),
  });

  app.get('/ops/wallets/:accountId', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary: 'Ví của một tài khoản: số dư và 20 dòng gần nhất — xem trước khi cấp',
      security: bearer,
      params: walletAccountParamsSchema,
      response: { 200: ok(opsWalletSchema), 403: errorResponse, 404: errorResponse },
    },
    handler: async (request) => toOk(await wallet.opsWallet(request.params.accountId)),
  });

  app.post('/ops/wallets/:accountId/adjust', {
    preHandler: master,
    schema: {
      tags: TAGS_OPS,
      summary:
        'Cấp (dương) hay trừ (âm) Xu kèm lý do người dùng đọc được; khoá chống lặp sinh một lần mỗi lần mở hộp',
      description: [
        'Gửi lại cùng `idempotencyKey` trả cùng dòng sổ cái, không cộng lần hai; cùng khoá mà khác số → 409',
        '`IDEMPOTENCY_CONFLICT`. Trừ quá số dư → 409 `INSUFFICIENT_BALANCE`, ví không đổi. Tài khoản bị khoá vẫn',
        'được cấp; tài khoản đã xoá → 404.',
      ].join(' '),
      security: bearer,
      params: walletAccountParamsSchema,
      body: walletAdjustBodySchema,
      response: {
        200: ok(walletAdjustResultSchema),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
    },
    handler: async (request) =>
      toOk(await wallet.adjust(actorOf(request), request.params.accountId, request.body)),
  });
};
