# Design

## Context

- Chốt 28/10/2026 (kế hoạch mục 7): không có thanh toán online. Xu chỉ vào ví qua master (`admin_adjust`), chỉ ra
  qua mua gói (`product_purchase`, `add-promotions`), và quay lại qua hoàn (`refund`). Không tiền nên không chứng từ.
- Hệ cũ đã đo luật ví: số dư là cache của sổ cái, một đường ghi có khoá chống lặp, sai thì ghi dòng ngược dấu
  (`docs/market/docs/rules/xu-wallet.decision.md`).
- Hạ tầng có sẵn: `appendAudit(tx, …)` (nhật ký vận hành cùng transaction), `appendEvents(tx, …)` (outbox), ma trận
  thông báo theo module (`notification.<module>-matrix.ts`), guard `requireMaster`, bước dọn tài khoản đã xoá
  `deletedAccountsStep` của `ops/retention.service.ts` (sau `identity.deletedEmailHoldDays`, bỏ qua tài khoản tạm giữ).
- TK 30 (sửa 28/10/2026): chỉ Ví ghi sổ cái Xu; gói đẩy tin trừ Xu và áp hiệu ứng trong cùng một giao dịch — chỗ gọi
  đồng bộ thứ năm, thuộc `add-promotions`. Change này chỉ dựng cổng ghi cho nó.

## Goals / Non-Goals

**Goals:**

- Một đường ghi duy nhất `wallet.apply(tx, entry)`, chạy trong transaction của bên gọi, chống lặp bằng khoá duy nhất,
  không bao giờ để số dư âm, kể cả hai lượt song song.
- Master xem ví một tài khoản và cấp / trừ Xu kèm lý do; người dùng xem ví mình; nhóm thông báo "ví Xu".
- Ví theo hạn lưu của tài khoản: dọn cùng lượt dọn tài khoản đã xoá.

**Non-Goals:**

- Nạp tiền, phí đăng tin bằng Xu, gói đẩy tin (`add-promotions`).
- Việc nền đối soát số dư với sổ cái hằng đêm (kế hoạch 4.6): số dư và dòng sổ cái ghi trong cùng transaction, cùng
  một hàm; lệch chỉ xảy ra khi có người sửa tay DB — trigger dưới đây chặn sửa dòng sổ cái, test DB so tổng.
- Con số mới trong bảng con số: trần một lượt cấp là giới hạn của schema (chống gõ nhầm), không phải luật nghiệp vụ.

## Decisions

### 1. Module `wallet` riêng, không đặt trong `identity`

`src/modules/wallet/` phẳng (module nhỏ): `wallet.module.ts`, `wallet.routes.ts` (người dùng + bàn vận hành, hai
plugin con), `wallet.service.ts`, `wallet.repository.ts`, `wallet.schema.ts`, `wallet.ports.ts`, `wallet.events.ts`
(bên nghe — không có ở change này, xem 7). Dựng trong `buildApp` trước `ops` (bước dọn của `ops` gọi `wallet`), sau
`identity`. Không phụ thuộc `listing`; `promotion` sau này phụ thuộc `wallet`.

_Đã cân nhắc_: bảng ví trong `identity` — `identity` đã lớn nhất hệ, và TK 30 tách chủ sổ cái để `promotion` gọi một
cổng hẹp thay vì cả `IdentityService`.

### 2. Dữ liệu

```prisma
/// CHECK wallets_balance_check: balance >= 0
model Wallet {
  accountId String   @id @map("account_id") @db.Uuid
  balance   Int      @default(0)
  updatedAt DateTime @map("updated_at") @db.Timestamptz(3)
  account   Account  @relation(fields: [accountId], references: [id])
  @@map("wallets")
}

/// CHECK wallet_transactions_amount_check: amount <> 0
/// CHECK wallet_transactions_balance_check: balance_after >= 0
/// TRIGGER wallet_transactions_immutable: chặn UPDATE; DELETE chỉ khi transaction đặt ghim.purge = 'on'
model WalletTransaction {
  id             String                @id @default(uuid()) @db.Uuid
  accountId      String                @map("account_id") @db.Uuid
  amount         Int
  type           WalletTransactionType
  balanceAfter   Int                   @map("balance_after")
  refs           Json                  @default("{}")   // { listingId?, purchaseId?, productCode? }
  note           String?                                // lý do của master — người dùng đọc được
  actorId        String?               @map("actor_id") @db.Uuid
  idempotencyKey String                @unique @map("idempotency_key")
  createdAt      DateTime              @map("created_at") @db.Timestamptz(3)
  @@index([accountId, createdAt(sort: Desc), id(sort: Desc)])
  @@map("wallet_transactions")
}

enum WalletTransactionType { admin_adjust product_purchase refund  @@map("wallet_transaction_type") }
```

- **Ví lười**: tài khoản chưa có dòng `wallets` có số dư 0 — không đụng luồng đăng ký, không backfill. Đọc ví không có
  dòng trả `{ balance: 0 }` và lịch sử rỗng (spec "Tài khoản mới").
- Thời điểm lấy từ đồng hồ của app (`clock()`), không `now()` của DB — như nhật ký (CLAUDE.md, Testing).
- Trigger theo mẫu `audit_log_immutable`: dòng sổ cái không bao giờ được sửa; xoá chỉ ở bước dọn tài khoản, transaction
  đó `SET LOCAL ghim.purge = 'on'`.
- Migration `add_wallet` (bảng, enum, CHECK, trigger — SQL tay cho CHECK và trigger, `pnpm db:drift` phải sạch) và
  `add_wallet_notification_category` (`ALTER TYPE notification_category ADD VALUE 'wallet'`, file riêng).

### 3. `apply(tx, entry)` — đường ghi duy nhất

`entry = { accountId, amount, type, refs, note?, actorId?, idempotencyKey }`, trong transaction của bên gọi:

1. Tìm dòng sổ cái theo `idempotencyKey`. Có rồi: cùng `accountId`, `amount`, `type` → trả dòng đó (gửi lại); khác →
   409 `IDEMPOTENCY_CONFLICT`.
2. Cộng: `INSERT INTO wallets … ON CONFLICT (account_id) DO UPDATE SET balance = wallets.balance + $x RETURNING
balance`. Trừ: `UPDATE wallets SET balance = balance - $x WHERE account_id = $id AND balance >= $x RETURNING balance`
   — không dòng nào trả về → 409 `INSUFFICIENT_BALANCE`. Câu `UPDATE` khoá dòng ví, nên hai lượt trừ song song xếp hàng
   và lượt sau thấy số dư mới (spec "Hai lượt trừ cùng lúc").
3. `INSERT` dòng sổ cái với `balance_after` = số vừa trả về.
4. `appendEvents(tx, [{ type: 'wallet.balance.changed', payload: { accountId, transactionId, type, amount,
balanceAfter } }])`.

Hai lượt cùng khoá chạy song song: cả hai qua bước 1, lượt sau vấp unique ở bước 3, cả transaction của nó quay lui
(kể cả số dư đã cộng ở bước 2). Postgres không cho đọc tiếp trong transaction đã hỏng, nên bên mở transaction bắt
`P2002` trên `idempotency_key` **sau** khi nó quay lui, đọc lại dòng theo khoá và trả dòng của lượt trước —
`wallet.service` làm việc này cho route cấp Xu, `promotion` làm cho lượt mua. Lỗi
nghiệp vụ là `ConflictError` nên transaction của bên gọi cũng quay lui — `promotion` dựa vào đó.

**Khoá chống lặp có tiền tố theo nguồn**, để khoá của hai luồng không đụng nhau: `adjust:<masterId>:<khoá app>`,
`purchase:<accountId>:<khoá app>` (`add-promotions`), `refund:<purchaseId>` — khoá tự nhiên, nên một lượt mua chỉ hoàn
được một lần dù việc hoàn chạy lại. Khoá app: 8–64 ký tự `[A-Za-z0-9_-]`, trong thân request (`idempotencyKey`) — có
trong OpenAPI nên SDK của app có kiểu.

### 4. API

| Route                                 | Ai        | Trả                                                                                                               |
| ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /me/wallet`                      | đăng nhập | `{ balance }`                                                                                                     |
| `GET /me/wallet/transactions`         | đăng nhập | trang con trỏ (`createdAt`, `id`) các dòng `{ id, amount, type, balanceAfter, refs, note, createdAt }`, mới trước |
| `GET /ops/wallets/:accountId`         | master    | `{ balance, transactions }` — 20 dòng gần nhất                                                                    |
| `POST /ops/wallets/:accountId/adjust` | master    | thân `{ amount, reason, idempotencyKey }` → `{ balance, transaction }`                                            |

- `amount` nguyên khác 0, |amount| ≤ 1000 (`WALLET_ADJUST_LIMIT` trong `wallet.schema.ts`); `reason` 1–200 ký tự, cắt
  khoảng trắng. Tài khoản không có hay đã xoá → 404 `NOT_FOUND`; không phải master → 403 `FORBIDDEN`.
- Người dùng chỉ có `/me/*`, nên không có đường đọc ví người khác; không có route nạp hay rút (spec "Không có đường nạp
  hay rút" → 404 của router).
- `note` hiện cho người dùng: bàn vận hành ghi rõ dưới ô lý do "người dùng đọc được lý do này".

### 5. Kiểm tài khoản qua `identity`

Cổng `WalletIdentityPort` (`wallet.ports.ts`) — một hàm của `IdentityService` trả tài khoản còn dùng được hay không
(chọn hàm đọc có sẵn lúc apply; thiếu thì thêm một hàm đọc hẹp). Đây là chỗ gọi đồng bộ "hỏi Định danh người này là
ai" TK 30 đã cho. Tài khoản bị khoá vẫn được cấp Xu — chỉ không dùng được (không đăng nhập), và cấp sai thì master trừ lại.

### 6. Nhật ký

`appendAudit` cùng transaction: `action` `wallet.wallet.adjust`, `actorRole` `master`, `targetType` `account`,
`targetId` tài khoản, `details { amount, balanceAfter, transactionId, reason }`. Gửi lại cùng khoá (bước 1 của
`apply`) không ghi thêm dòng.

### 7. Thông báo N59 — nhóm "ví Xu"

- Enum `notification_category` thêm `wallet`, đứng cuối (nhóm thứ mười một, TK 24); mặc định bật như mọi nhóm, không
  "luôn bật".
- `notification.wallet-matrix.ts` nghe `wallet.balance.changed`: bỏ qua `product_purchase` (người dùng tự làm); còn lại
  một thông báo cá nhân có nhắc, ký "Ghim", không nêu master:
  - cấp: "Ghim cấp cho bạn 5 Xu · số dư 5 Xu";
  - trừ: "Ghim trừ 2 Xu trong ví · số dư 3 Xu";
  - hoàn: "Hoàn 4 Xu · số dư 7 Xu".

  Câu nhắc không có lý do (màn hình khoá ai cũng đọc — TK 24); lý do nằm ở dòng sổ cái trong app. `data`:
  `{ transactionId }` để app mở màn ví.

- Không bên nghe nào khác ở change này, nên `wallet` không có `wallet.events.ts`.

### 8. Hạn lưu

`WalletService.purgeAccount(accountId)`: một transaction `SET LOCAL ghim.purge = 'on'`, xoá dòng sổ cái rồi dòng ví.
`deletedAccountsStep` gọi nó ngay trước `identity.purgeDeletedAccount` — sau kiểm tạm giữ, nên tài khoản đang tạm giữ
giữ nguyên ví như giữ hồ sơ. `RetentionDeps` thêm `wallet: Pick<WalletService, 'purgeAccount'>`. Lượt cấp của master vẫn
còn trong nhật ký vận hành theo hạn của nhật ký.

## Risks / Trade-offs

- [Master gõ nhầm số lớn] → trần 1000 một lượt ở schema; sai thì trừ lại bằng một dòng ngược dấu — sổ cái giữ cả hai.
- [Khoá chống lặp do app sinh] → app sinh một khoá mỗi lần mở hộp cấp Xu, không mỗi lần bấm; khoá trùng với số khác thì
  409 chứ không cộng nhầm.
- [Xu không hết hạn, không mua bằng tiền] → số dư tồn không phải nợ ai; master trừ được khi cần.
- [Cổng `apply` chạy trong transaction của module khác] → bên gọi phải để lỗi của `apply` làm hỏng cả transaction (không
  nuốt lỗi); `add-promotions` test đúng chỗ này (thiếu Xu thì tin không đổi).

## Migration Plan

Deploy thường: `pnpm db:deploy` tạo hai bảng, một enum, thêm một giá trị enum — không đụng bảng có dữ liệu, không
backfill (ví lười). Rollback: bỏ route; bảng thừa vô hại.
