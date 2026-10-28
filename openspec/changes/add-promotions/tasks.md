# Tasks

Câu hỏi mở chốt 28/10/2026 (kế hoạch mục 7). Thiết kế ở `design.md`; dùng `WalletLedgerPort.apply` của `add-wallet` (đã
archive 28/10/2026) và đường ghi `listing/boost` của `add-admin-boost`.

## 1. Dữ liệu và con số

- [x] 1.1 Kiểm `DATABASE_URL` của `.env.development` trỏ DB dev (tên kết thúc `_dev`) trước mọi lệnh migration — sai thì
      dừng, báo người dùng
- [x] 1.2 `schema.prisma`: enum `PromotionEffect`, `PromotionScope`, `PromotionPurchaseStatus`; `PromotionProduct`,
      `PromotionPurchase` (design 2, index nhắc hết hạn); `Group.allowPromotions` mặc định `true`; migration
      `add_promotions` (`migrate diff` → file tay), thêm CHECK `promotion_products_duration_check`,
      `promotion_products_price_check`, `promotion_purchases_expiry_check` và trigger `promotion_purchases_immutable`
      (chỉ `reminded_at`, `refunded_at`, `refund_transaction_id`, `status` đổi được; DELETE khi `ghim.purge = 'on'`);
      `pnpm db:drift` sạch
- [x] 1.3 `config-keys.ts`: `promotion.minTier` 1 (0–3), `promotion.maxBumpsPerDay` 3 (min 0),
      `promotion.featuredReminderHours` 24; `tests/config-keys.test.ts` số khoá
- [x] 1.4 Test DB `tests/promotion.db.test.ts`: `featured` thiếu thời hạn bị CHECK; sửa cột khác ngoài bốn cột cho phép bị
      trigger chặn; xoá không có `ghim.purge` bị chặn; khoá chống lặp trùng vấp unique

## 2. `listing` và `group` — cổng cho gói

- [x] 2.1 `listing.repository`: tách phần trong transaction của `boost` thành `applyBoostIn(tx, id, decide)`; `boost` gọi
      nó. `listing/boost/boost.service.ts` thêm `applyPromotion(tx, { listingId, version, effect, until })`: khoá dòng, lệch
      `version` → 409 `CONFLICT`, `boostBlock` → 409 `LISTING_NOT_PROMOTABLE`, rồi cùng câu `UPDATE`; export qua
      `ListingService`; `listing.ports.ts` khai `PromotionListingPort`
- [x] 2.2 `listing.repository.featured` lấy ngẫu nhiên khi nhiều hơn trần (design 4, `FEATURED_POOL` 100); sửa test
      `admin-boost.http.test.ts` "hơn 6 tin" thành gọi nhiều lần, hợp phủ đủ, mỗi lần đúng 6 tin khác nhau
- [x] 2.3 `group`: `allowPromotions` trong `groupSettingsBodySchema`, `groupProfileSchema`, `toProfile`,
      `updateSettings` (chủ nhóm / master, nhật ký `group.settings.update` như mọi cài đặt); test cài đặt + hồ sơ

## 3. Module `promotion`

- [x] 3.1 `promotion.schema.ts`: DTO gói (người đăng, bàn vận hành), thân tạo / sửa gói (`code` 2–32 `[a-z0-9_]`,
      `featured` bắt buộc `durationDays` 1..`promotion.featuredMaxDays` — kiểm ở service vì trần là con số), thân mua
      (`productCode`, `idempotencyKey` 8–64), DTO lượt mua, tên sự kiện `PROMOTION_EVENTS`
- [x] 3.2 `calc/catalog.calc.ts` (gói hợp lệ, bộ khởi đầu `STARTER_PRODUCTS`), `calc/purchase.calc.ts` (`purchaseBlock`:
      phạm vi, mức, khoá đăng tin, nhóm tắt, `boostBlock`, thời gian chờ → `retryAt`, trần ngày theo ngày Việt Nam →
      `retryAt` 0h hôm sau) + unit test mọi nhánh
- [x] 3.3 `promotion.repository.ts`: `listProducts`, `findProduct(code)`, `createProduct`, `updateProduct` (nhật ký cùng
      transaction), `ensureProducts` (chèn khi trống), `findPurchaseByKey`, `lastPurchaseOf(listingId, productCode)`,
      `purchasesToday(accountId, dayStart)`, `purchase(tx, …)` (advisory lock theo người, chèn lượt, phát
      `promotion.purchase.applied`), `runningOf(listingId)`, `refundable(listingId, now)`, `markRefunded(tx, …)`,
      `claimExpiring(now, before)` (ghi có điều kiện `reminded_at IS NULL`), `purgeAccount`
- [x] 3.4 `promotion.ports.ts`: `PromotionListingPort` (`applyPromotion`, `ownedBy`/đọc tin của mình), `PromotionWalletPort`
      (`apply`, `replay`, `balanceOf`), `PromotionTrustPort` (`tierOf`, `postingLockedUntil`), `PromotionGroupPort`
      (`findGroup` → `allowPromotions`)
- [x] 3.5 `promotion.service.ts`: `productsFor(actor, listingId)` (gói + `purchasable` / `reason` / `retryAt`, `running`,
      `balance`), `purchase(actor, listingId, body)` đúng thứ tự design 3 (ngoài transaction → trong transaction: lock →
      chờ / trần → `applyPromotion` → `wallet.apply` → chèn → sự kiện; bắt P2002 rồi đọc lại theo khoá), `refundOnRestore`
      (design 5), `remindExpiring(now)`, `opsProducts`, `createProduct`, `updateProduct`, `purgeAccount`
- [x] 3.6 `promotion.routes.ts` (5 route design 6, mã lỗi khai trong schema response), `promotion.events.ts` (nghe
      `listing.state.changed` arrow `appealWin` và `restore`; thiếu `cause` trong payload `restore` thì thêm ở `listing` /
      `review` / `trust`, hoặc chọn hoàn cả hai và ghi vào spec), `promotion.jobs.ts` (`promotion.remind-expiring` mỗi
      giờ), `promotion.outbox.ts`, `promotion.module.ts` (`startup: ensureProducts`)
- [x] 3.7 Nối `buildApp`: repository vào `Repositories` + `tests/test-app.ts`, module sau `wallet` trước `notification`,
      `app.modules.promotion`, `moduleList`; `ops` nhận `promotion.purgeAccount` cạnh `wallet`; `pnpm run typecheck`
- [x] 3.8 Test HTTP `tests/promotion.http.test.ts`: mọi scenario của `promotion/catalog` và `promotion/purchase` — bộ khởi
      đầu chèn một lần, master sửa giá rồi khởi động lại không chèn thêm, `featured` thiếu thời hạn 400, tắt gói đang có
      lượt chạy; T1 xem gói cho tin sàn / T0 thấy lý do; mua thành công (ví −1, dòng sổ cái `refs`, đứng đầu bảng tin),
      gửi lại cùng khoá 200 cùng lượt, tin hạn chế / chờ duyệt 409 `LISTING_NOT_PROMOTABLE` không trừ Xu, 3 điểm gậy 409
      `POSTING_LOCKED`, T0 409 `TRUST_TIER_TOO_LOW`, thiếu Xu 409 `INSUFFICIENT_BALANCE` tin không đổi, phiên bản lệch 409
      `CONFLICT` không trừ, chờ 2 giờ 429 `PROMOTION_COOLDOWN`, lượt thứ tư 429 `PROMOTION_DAILY_LIMIT`, hai lượt song song
      sát trần chỉ một thành công, nhóm tắt 409 `GROUP_PROMOTIONS_OFF`, tin nhóm đẩy chỉ đổi bảng tin nhóm, khiếu nại thắng
      hoàn 4 Xu một lần dù sự kiện phát lại, gỡ vì vi phạm không hoàn, `running` và `featuredUntil` của tin mình

## 4. Thông báo N60, N61

- [x] 4.1 `notification.promotion-matrix.ts` (nhóm `your_listings`, ký "Ghim", không số Xu), đăng ký trong
      `notification.service` và `notification.module`; test thuần ma trận + test HTTP (mua gói → thông báo có nhắc; job nhắc
      sắp hết hạn một lần mỗi lượt mua, chạy lại không nhắc lại)

## 5. Tài liệu

- [x] 5.1 TK 19 (gói: đã ghi 28/10/2026 — đối chiếu lại với code, lệch thì hỏi người dùng), TK 28 (ba con số mới),
      TK 29 bước 8; `docs/KE-HOACH-GOI-DAY-TIN.md` lộ trình bước 1 xong; `docs/VIEC-DANG-DO.md` mục 1 và mục 8; CLAUDE.md
      (module `promotion`, bảng module, `buildApp`, thứ tự change); `docs/review.md` / `docs/strikes.md` nếu nhắc tới hoàn Xu
- [x] 5.2 Proposal `add-promotions`: ghi quyết định về `cause` của `restore` (3.6) nếu đổi so với design — không đổi: hoàn Xu bám mũi tên
      `appealWin` (khiếu nại thắng lẫn ân xá đều qua `restoreAfterStrike`); `restore` của staff không hoàn

## 6. `ghim-app`

- [x] 6.1 `npm run api:sync`; hàm trong `src/api/promotion.ts` (người đăng) và `ops-admin.ts` (catalog), query key, hook;
      test api
- [x] 6.2 Tin của tôi: nút "Đẩy tin" trên thẻ tin đang hiển thị (đã bỏ khi làm `add-admin-boost` — đưa lại, mở bảng gói:
      mỗi gói giá, thời hạn, mua được không kèm lý do; số dư; xác nhận → mua, khoá chống lặp sinh một lần mỗi lần mở bảng;
      lỗi qua toast với `retryAt` khi chờ); chi tiết tin của mình nêu gói đang chạy; thông báo N60 / N61 mở tin
- [x] 6.3 Cài đặt nhóm: công tắc "Cho thành viên dùng gói đẩy tin" (chủ nhóm); bàn vận hành: màn `app/ops/promotions.tsx`
      thành danh sách gói (tạo, sửa, bật tắt, chỉ master) thay chỗ giữ "Chưa có API"
- [x] 6.4 Thử trên máy ảo: master cấp 5 Xu → người đăng mua "Đẩy lên đầu" cho tin đang hiện → tin lên đầu, ví còn 4, thông
      báo "đã được đẩy lên đầu"; mua lại ngay → báo mốc; T0 thấy gói kèm "cần mức T1"

## 7. Kiểm tra tích hợp

- [x] 7.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift`, `pnpm run spec:validate` (ghim-server); `npm run check`
      (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-promotions` sau khi gộp vào `main`. Sau đó `openspec/changes/` không còn change chờ;
  kế hoạch `docs/KE-HOACH-GOI-DAY-TIN.md` khép lại ở bước 1 (không có bước 2, 3 — chốt 28/10/2026).
