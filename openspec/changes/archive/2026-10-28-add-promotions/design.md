# Design

## Context

- Chốt 28/10/2026 (kế hoạch mục 7): Xu chỉ do master cấp (`add-wallet`, đã archive), gói là cách phân phát lượt đẩy tin có
  giới hạn. Bộ khởi đầu "Đẩy lên đầu" 1 Xu, "Nổi bật 3 ngày" 2 Xu, "Nổi bật 7 ngày" 4 Xu; từ T1; 3 lượt mỗi người mỗi
  ngày; chủ nhóm tắt được gói trong nhóm; hoàn đủ khi khiếu nại thắng / ân xá; dải nổi bật nhiều hơn trần thì lấy ngẫu
  nhiên.
- Đã có sẵn từ `add-admin-boost`: `listings.rank_at`, `featured_until`, `last_bumped_at`; đường ghi
  `listing.repository.boost(id, decide)` (một câu `UPDATE` không tăng `version`, không đổi `updated_at`); `boostBlock`,
  `activeFeaturedUntil` ở `listing/calc/boost.calc.ts`; dải nổi bật `GET /listings/featured`,
  `GET /groups/:groupId/listings/featured` (`repository.featured`, hạn gần hết trước); con số `promotion.featuredStripSize`,
  `promotion.bumpCooldownHours`, `promotion.featuredMaxDays`.
- Đã có từ `add-wallet`: `WalletLedgerPort.apply(tx, entry)` — trừ Xu trong transaction của bên gọi, khoá chống lặp có tiền
  tố nguồn (`purchase:<accountId>:<khoá app>`, `refund:<purchaseId>`), 409 `INSUFFICIENT_BALANCE` làm hỏng cả transaction;
  `replay(entry)` sau P2002.
- Hạ tầng: `appendAudit(tx, …)`, outbox, ma trận thông báo theo module, `startup` của module (mẫu `ensureRuleArticles`),
  `jobs.schedule` (mẫu `listing.jobs.ts`), `requireMaster`, `trust.tierOf`, `trust` giữ `postingLockedUntil` (409
  `POSTING_LOCKED` ở `trust.quota.service`).
- TK 30: chỉ `listing` đổi cột của tin; gói trừ Xu và áp hiệu ứng trong cùng một giao dịch — chỗ gọi đồng bộ thứ năm.

## Goals / Non-Goals

**Goals:**

- Một lượt mua = một transaction: áp hiệu ứng lên tin (ghi có điều kiện theo phiên bản) + trừ Xu + dòng lượt mua; bất kỳ
  bước nào ném là không gì đổi, Xu không mất.
- Catalog master soạn, bộ khởi đầu chèn ở bước khởi động khi bảng trống, không xoá gói.
- Dải nổi bật lấy ngẫu nhiên khi nhiều hơn trần — áp cho cả tin người quản trị đặt nổi bật (một dải, một luật).
- Hoàn đủ giá gói nổi bật còn hạn khi tin hiện lại nhờ khiếu nại thắng / ân xá; không hoàn trường hợp khác.
- Chủ nhóm tắt gói trong nhóm; người quản trị nhóm vẫn đẩy miễn phí.

**Non-Goals:**

- Nạp tiền, doanh thu, hoá đơn; `extend_expiry`; đẩy theo lịch (chốt 28/10/2026).
- Trần số lượt cho người quản trị (`listing/boosting` không đổi).
- Hoàn phần chưa hưởng theo tỉ lệ — hoàn đủ là quyết định sản phẩm.
- Việc nền đổi trạng thái lượt mua đã hết hạn: hạn đọc so với bây giờ, như `featured_until`.

## Decisions

### 1. Module `promotion` riêng, dựng sau `listing` và `wallet`, trước `notification`

`src/modules/promotion/`: `promotion.module.ts`, `promotion.routes.ts` (người đăng + bàn vận hành), `promotion.service.ts`,
`promotion.repository.ts`, `promotion.schema.ts`, `promotion.ports.ts`, `promotion.events.ts` (bên nghe hoàn Xu),
`promotion.jobs.ts` (nhắc sắp hết hạn), `promotion.outbox.ts`, `calc/purchase.calc.ts` (luật mua thuần: đủ điều kiện,
thời gian chờ, trần ngày, lý do từ chối), `calc/catalog.calc.ts` (gói hợp lệ: `featured` phải có thời hạn, giá ≥ 1).
`promotion` gọi `listing`, `wallet`, `trust`, `group` qua cổng; không module nào gọi ngược `promotion` trừ `notification`
(nghe sự kiện) và `ops` (hạn lưu). Thứ tự `buildApp`: sau `wallet`, trước `notification`; `moduleList` thêm
`promotion.module`.

_Đã cân nhắc_: đặt lượt mua trong `listing` — `listing` đã quá cỡ (bốn mặt, LOC cap), và catalog, hoàn Xu, trần ngày là
luật của gói, không của tin.

### 2. Dữ liệu

```prisma
enum PromotionEffect { rank_to_top featured  @@map("promotion_effect") }
enum PromotionScope  { marketplace group both  @@map("promotion_scope") }
enum PromotionPurchaseStatus { applied refunded  @@map("promotion_purchase_status") }

/// CHECK promotion_products_duration_check: (effect = 'featured') = (duration_days IS NOT NULL)
/// CHECK promotion_products_price_check: price >= 1; cooldown_hours >= 0; sort >= 0
model PromotionProduct {
  id            String          @id @default(dbgenerated("uuidv7()")) @db.Uuid
  code          String          @unique                      // rank_to_top, featured_3d, featured_7d — master đặt, không đổi
  name          String
  description   String?
  effect        PromotionEffect
  durationDays  Int?            @map("duration_days")        // chỉ featured, 1..promotion.featuredMaxDays
  cooldownHours Int             @map("cooldown_hours")       // giữa hai lần mua cùng gói cho cùng tin
  price         Int                                          // Xu
  minTier       TrustTier       @map("min_tier")
  scope         PromotionScope
  active        Boolean         @default(true)
  sort          Int             @default(0)
  createdBy     String          @map("created_by") @db.Uuid
  createdAt     DateTime        @map("created_at") @db.Timestamptz(3)
  updatedAt     DateTime        @map("updated_at") @db.Timestamptz(3)
  @@map("promotion_products")
}

/// Bản chụp gói lúc mua (master sửa gói sau không đổi lượt đã mua). CHECK promotion_purchases_expiry_check:
/// (effect = 'featured') = (expires_at IS NOT NULL). TRIGGER promotion_purchases_immutable như sổ cái: chỉ
/// reminded_at, refunded_at, refund_transaction_id, status đổi được; DELETE chỉ khi ghim.purge = 'on'.
model PromotionPurchase {
  id                  String                  @id @default(dbgenerated("uuidv7()")) @db.Uuid
  listingId           String                  @map("listing_id") @db.Uuid
  accountId           String                  @map("account_id") @db.Uuid
  groupId             String?                 @map("group_id") @db.Uuid      // tin của nhóm — tắt gói sau không đụng lượt đã mua
  productId           String                  @map("product_id") @db.Uuid
  productCode         String                  @map("product_code")
  effect              PromotionEffect
  durationDays        Int?                    @map("duration_days")
  price               Int
  walletTransactionId String                  @map("wallet_transaction_id") @db.Uuid
  appliedAt           DateTime                @map("applied_at") @db.Timestamptz(3)
  expiresAt           DateTime?               @map("expires_at") @db.Timestamptz(3)
  remindedAt          DateTime?               @map("reminded_at") @db.Timestamptz(3)
  refundedAt          DateTime?               @map("refunded_at") @db.Timestamptz(3)
  refundTransactionId String?                 @map("refund_transaction_id") @db.Uuid
  status              PromotionPurchaseStatus @default(applied)
  idempotencyKey      String                  @unique @map("idempotency_key")
  @@index([listingId, appliedAt(sort: Desc)])
  @@index([accountId, appliedAt(sort: Desc)])
  @@index([expiresAt], where: raw("status = 'applied' AND effect = 'featured' AND reminded_at IS NULL"), map: "promotion_purchases_remind_idx")
  @@map("promotion_purchases")
}
```

- `Group.allowPromotions Boolean @default(true) @map("allow_promotions")` — cài đặt của chủ nhóm, cùng đường
  `PATCH /groups/:id/settings` và hồ sơ nhóm như `manualReview`.
- Không có trạng thái `expired` trong DB: gói hết hạn = `expires_at <= now`, đọc lúc hỏi — không việc nền đổi trạng thái.
- Migration `add_promotions`: hai enum mới trong file riêng không cần (bảng mới, enum dùng ngay trong cùng transaction là
  được — chỉ `ADD VALUE` vào enum có sẵn mới phải tách); CHECK và trigger viết tay; `pnpm db:drift` sạch.
- Bộ khởi đầu: `ensureProducts()` ở `startup` của module — bảng trống thì chèn ba gói (scope `both`, `minTier` T1,
  `cooldownHours` = `promotion.bumpCooldownHours` lúc chèn), `createdBy` = master đầu tiên hay mã hệ thống như
  `ensureRuleArticles` làm; có gói rồi thì không đụng.

### 3. Lượt mua — một transaction

`POST /listings/:id/promotions { productCode, idempotencyKey }`, người đăng:

1. **Ngoài transaction** (đọc, không khoá): tin là của mình và chưa xoá (404 / 403 như `ownedBy`); gói đang bật, đúng
   phạm vi (`marketplace` cho tin sàn, `group` cho tin nhóm, `both` cả hai) — sai → 404 `NOT_FOUND`; mức
   `trust.tierOf` ≥ `minTier` → 409 `TRUST_TIER_TOO_LOW` "cần mức T1"; `trust` đang tạm khoá đăng tin → 409
   `POSTING_LOCKED`; tin nhóm mà nhóm tắt gói → 409 `GROUP_PROMOTIONS_OFF`; lượt mua đã có cùng khoá
   `purchase:<accountId>:<khoá app>` → trả lại (200).
2. **Trong transaction** (`promotion.repository.purchase`):
   - `pg_advisory_xact_lock(hashtextextended('promotion:' || accountId, 0))` — xếp hàng mọi lượt mua của một người, để
     trần ngày và thời gian chờ đếm đúng khi bấm song song.
   - Thời gian chờ: lượt mua gần nhất cùng `productCode` cho tin này, `appliedAt + cooldownHours > now` → 429
     `PROMOTION_COOLDOWN` (`details.retryAt`). Trần ngày: đếm lượt `applied` của người này trong ngày Việt Nam
     (`SHOP_TIME_ZONE`) ≥ `promotion.maxBumpsPerDay` → 429 `PROMOTION_DAILY_LIMIT` (`details.retryAt` = 0h ngày mai).
   - `listing.applyPromotion(tx, { listingId, version, effect, until })` — cổng mới của `listing`: khoá dòng tin, tin
     phải đúng `version` app gửi (lệch → 409 `CONFLICT`), `boostBlock` null (không → 409 `LISTING_NOT_PROMOTABLE` với
     câu của `boostBlock`), rồi cùng câu `UPDATE` của `repository.boost` (tách phần trong transaction thành
     `applyBoostIn(tx, …)` để `boost` và `applyPromotion` dùng chung). `rank_to_top` đặt `rank_at = last_bumped_at = now`
     — thời gian chờ của gói là của gói (câu 2 trên), không đụng `bumpRetryAt` của người quản trị? **Có đụng**: cùng cột
     `last_bumped_at`, nên người quản trị đẩy xong thì người đăng mua "đẩy lên đầu" vẫn được (luật gói chỉ xét lượt mua),
     còn người quản trị thì phải chờ 24 giờ — chấp nhận, ghi ở spec `listing/boosting` không đổi.
   - `wallet.apply(tx, { accountId, amount: -price, type: 'product_purchase', refs: { listingId, purchaseId, productCode },
idempotencyKey })` — thiếu Xu ném 409 `INSUFFICIENT_BALANCE`, cả transaction quay lui (tin đã `UPDATE` cũng quay lui).
   - `INSERT promotion_purchases` (id sinh trước để đưa vào `refs`), `appendEvents` `promotion.purchase.applied`
     `{ purchaseId, listingId, accountId, productCode, effect, expiresAt }`.
3. P2002 trên `idempotency_key` của lượt mua (hai lượt cùng khoá song song): bắt sau khi quay lui, đọc lại theo khoá, trả
   lượt cũ — như `wallet.service.adjust`.

Thứ tự "áp tin trước, trừ Xu sau" cố ý: lỗi hay gặp nhất là tin không hợp lệ (rẻ, không cần ví); thiếu Xu là bước cuối
và quay lui cả lượt. Không ghi nhật ký vận hành: người dùng tự làm, sổ cái và lượt mua đã là bản ghi.

**Gói trong nhóm chỉ xếp lại bảng tin nhóm đó** không cần code riêng: tin nơi đăng `members_only` / `group_public`
không nằm trong bảng tin sàn chung (`visibleWhere`), nên `rank_at` của nó chỉ có tác dụng ở bảng tin nhóm. Test khẳng định.

### 4. Dải nổi bật lấy ngẫu nhiên

`listing.repository.featured` đổi: lấy tới `FEATURED_POOL` (100) mã tin có `featured_until > now` theo `visibleWhere`,
xáo (Fisher–Yates) rồi lấy `promotion.featuredStripSize`, đọc lại đủ dòng theo mã. Ít hơn trần thì trả hết. Áp cho cả tin
người quản trị đặt nổi bật — spec `listing/visibility` MODIFIED ở change này; test `admin-boost.http.test.ts` "hơn 6 tin"
sửa theo (gọi nhiều lần, hợp các lần phủ đủ 8 tin; mỗi lần đúng 6 tin khác nhau).

### 5. Hoàn Xu — bên nghe

`promotion.events.ts` nghe `listing.state.changed`: `arrow === 'appealWin'` (khiếu nại thắng) và lượt khôi phục do ân xá
(`trust` ân xá → `listing` khôi phục với `arrow: 'restore'`; payload cần phân biệt với khôi phục của staff — thêm
`cause: 'amnesty' | 'staff'` vào payload của `restore` lúc apply, thiếu thì `review`/`trust` bổ sung). Với mỗi lượt mua
`applied`, `effect = featured`, `expiresAt > now`, chưa hoàn: một transaction `wallet.apply(tx, { amount: +price, type:
'refund', refs: { listingId, purchaseId, productCode }, idempotencyKey: 'refund:<purchaseId>' })` + cập nhật
`refundedAt`, `refundTransactionId`, `status = refunded`. Khoá `refund:<purchaseId>` là khoá tự nhiên: sự kiện phát lại
không hoàn hai lần. `rank_to_top` không hoàn (hiệu ứng tức thì, không có phần còn lại). Tin bị gỡ vì vi phạm mà gậy chạy
hết hạn, tin tạm ẩn vì người đăng: không có sự kiện nào trên → không hoàn.

### 6. API

| Route                                  | Ai         | Trả                                                                                                                                 |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /listings/:id/promotions`         | người đăng | `{ products: [{ code, name, description, effect, durationDays, price, minTier, purchasable, reason, retryAt }], running, balance }` |
| `POST /listings/:id/promotions`        | người đăng | thân `{ productCode, idempotencyKey }` → lượt mua `{ id, productCode, effect, price, appliedAt, expiresAt, status }`                |
| `GET /ops/promotions/products`         | master     | mọi gói kể cả đã tắt                                                                                                                |
| `POST /ops/promotions/products`        | master     | tạo gói (`code` 2–32 `[a-z0-9_]`, trùng → 409)                                                                                      |
| `PATCH /ops/promotions/products/:code` | master     | sửa tên, mô tả, thời hạn, chờ, giá, mức, phạm vi, bật tắt, thứ tự — không đổi `code`, `effect`                                      |

- `purchasable` + `reason` tính bằng `purchase.calc` từ cùng dữ kiện lượt mua dùng (mức, khoá đăng tin, nhóm tắt, trạng
  thái tin, thời gian chờ, trần ngày) — app hiện lý do thay vì ẩn gói (spec catalog "Chưa đủ mức").
- `running` = lượt mua `featured` còn hạn của tin (gói, `expiresAt`) hay null; `OwnListingDto` thêm `promotion` cùng dạng
  cho màn "Tin của tôi" (`listing` hỏi `promotion` qua cổng? — không: `listing` dựng trước; thay vào đó app gọi
  `GET /listings/:id/promotions` khi mở tin của mình; `OwnListingDto` giữ `featuredUntil` là đủ).
- Mọi thao tác catalog: `appendAudit` `promotion.product.create` / `promotion.product.update`, `details` chỉ mã và số.

### 7. Con số — nhóm "Đẩy tin"

`promotion.minTier` 1 (0–3, số thứ tự mức T0–T3), `promotion.maxBumpsPerDay` 3 (min 0 = tắt mua), `promotion.featuredReminderHours`
24 (nhắc trước khi hết nổi bật). Đã có: `featuredStripSize`, `bumpCooldownHours`, `featuredMaxDays` (trần `durationDays`
của gói). `config-keys.test` cập nhật số khoá.

### 8. Thông báo N60, N61 — nhóm "tin đăng của bạn"

`notification.promotion-matrix.ts`:

- N60 `promotion.purchase.applied` → chủ tin, có nhắc, ký "Ghim": `featured` → "«Tiêu đề» nổi bật tới ngày dd/mm";
  `rank_to_top` → "«Tiêu đề» đã được đẩy lên đầu bảng tin". Không nêu số Xu. `data { listingId, purchaseId }`.
- N61 `promotion.purchase.expiring` → "«Tiêu đề» sắp hết nổi bật — hết ngày dd/mm", có nhắc, một lần mỗi lượt mua.

`promotion.jobs.ts`: `promotion.remind-expiring` mỗi giờ — lượt `applied`, `featured`, `reminded_at IS NULL`,
`expires_at <= now + featuredReminderHours` và `> now`: đặt `reminded_at` (ghi có điều kiện `reminded_at IS NULL`) rồi phát
sự kiện cùng transaction.

### 9. Hạn lưu

Lượt mua theo hạn lưu của tài khoản như sổ cái (kế hoạch 4.6): `promotion.purgeAccount(accountId)` trong
`deletedAccountsStep` ngay cạnh `wallet.purgeAccount` (transaction `SET LOCAL ghim.purge = 'on'`). Tin xoá hẳn không kéo
lượt mua theo (dòng trỏ `listing_id` không FK) — lượt mua là bản ghi của người, đi cùng người.

## Risks / Trade-offs

- [Người đăng và người quản trị cùng cột `last_bumped_at`] → người quản trị thấy "đẩy lại được từ …" sau khi người đăng
  mua "đẩy lên đầu" — đúng luật 24 giờ một tin; ngược lại người đăng mua được ngay sau khi người quản trị đẩy (thời gian
  chờ của gói chỉ đếm lượt mua) — hiếm và vô hại.
- [Dải ngẫu nhiên] → hai lần tải liên tiếp khác nhau; app không giữ thứ tự dải giữa hai lần làm mới. Test ngẫu nhiên: gọi
  N lần, kiểm hợp phủ đủ — không kiểm thứ tự.
- [Trần ngày đếm theo ngày Việt Nam] → 0h là mốc; người mua 3 lượt lúc 23h được mua tiếp lúc 0h — chấp nhận, `retryAt`
  nói rõ.
- [Sự kiện khôi phục thiếu `cause`] → nếu `restore` của staff và của ân xá không phân biệt được, hoàn nhầm cho tin staff
  khôi phục vì "gỡ sai" — mà tin gỡ sai cũng đáng hoàn (người đăng không gây ra). Chấp nhận hoàn cả hai; ghi ở spec nếu
  lúc apply chọn vậy.
- [Master tắt gói đang có lượt chạy] → lượt mua giữ bản chụp, chạy tới hết hạn; danh sách người đăng không còn gói đó.

## Migration Plan

Deploy thường: `prisma migrate deploy` tạo hai bảng, ba enum, một cột nhóm `allow_promotions` mặc định `true` — không
backfill. Bộ gói khởi đầu chèn ở lần khởi động đầu (idempotent). Rollback: bỏ route và module; bảng thừa vô hại; dải nổi
bật quay về "hạn gần hết trước" nếu bỏ cả phần 4.
