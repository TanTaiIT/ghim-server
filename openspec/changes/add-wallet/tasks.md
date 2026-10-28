# Tasks

Câu hỏi mở chốt 28/10/2026 (kế hoạch mục 7): không thanh toán online, ví mở bằng 0, chỉ master cấp miễn phí, người
dùng xin qua Hỗ trợ Ghim. Thiết kế ở `design.md`.

## 1. Dữ liệu

- [ ] 1.1 Kiểm `DATABASE_URL` của `.env.development` trỏ DB dev (tên kết thúc `_dev`) trước mọi lệnh migration — sai thì
      dừng, báo người dùng
- [ ] 1.2 `schema.prisma`: `Wallet`, `WalletTransaction`, enum `WalletTransactionType` (`admin_adjust`,
      `product_purchase`, `refund`), quan hệ ngược trên `Account`; `--create-only --name add_wallet`, đọc SQL sinh ra, thêm
      tay CHECK `wallets_balance_check`, `wallet_transactions_amount_check`, `wallet_transactions_balance_check` và trigger
      `wallet_transactions_immutable` (theo mẫu `audit_log_immutable`; DELETE chỉ khi `ghim.purge = 'on'`), comment `///`
      ở model; `pnpm db:migrate`, `pnpm db:drift` ra "No difference detected"
- [ ] 1.3 Migration riêng `add_wallet_notification_category`: `ALTER TYPE notification_category ADD VALUE 'wallet'`;
      enum `NotificationCategory` trong schema thêm `wallet` cuối danh sách
- [ ] 1.4 Test DB `tests/wallet.db.test.ts`: số dư âm bị CHECK chặn, `amount = 0` bị chặn, sửa dòng sổ cái bị trigger chặn,
      xoá dòng sổ cái không có `ghim.purge` bị chặn và có thì được, khoá chống lặp trùng vấp unique

## 2. Module `wallet` (`wallet/ledger`)

- [ ] 2.1 `wallet.schema.ts`: DTO ví, dòng sổ cái, trang con trỏ, thân cấp Xu (`amount` nguyên khác 0, |amount| ≤
      `WALLET_ADJUST_LIMIT` 1000, `reason` 1–200, `idempotencyKey` 8–64 `[A-Za-z0-9_-]`), tên sự kiện `WALLET_EVENTS`
- [ ] 2.2 `wallet.repository.ts`: `apply(tx, entry)` đúng bốn bước của design 3 (tìm khoá → cộng `ON CONFLICT` / trừ có
      điều kiện → ghi dòng → `appendEvents`), `findByKey`, `balanceOf`, `transactionsOf` (con trỏ `createdAt`, `id`),
      `purgeAccount` (`SET LOCAL ghim.purge = 'on'`)
- [ ] 2.3 `wallet.ports.ts`: `WalletLedgerPort` (`apply` cho `add-promotions`), `WalletIdentityPort` (tài khoản còn dùng
      được — chọn hàm đọc có sẵn của `IdentityService`, thiếu thì thêm một hàm đọc hẹp ở `identity`)
- [ ] 2.4 `wallet.service.ts`: `myWallet`, `myTransactions`, `opsWallet`, `adjust(actor, accountId, body)` — một
      transaction: kiểm tài khoản (404) → `apply` với khoá `adjust:<masterId>:<khoá app>` → `appendAudit`
      (`wallet.wallet.adjust`); bắt `P2002` sau khi transaction quay lui thì đọc lại theo khoá và trả dòng cũ;
      `purgeAccount`
- [ ] 2.5 `wallet.routes.ts` + `wallet.module.ts`: `GET /me/wallet`, `GET /me/wallet/transactions`
      (`authenticate`), `GET /ops/wallets/:accountId`, `POST /ops/wallets/:accountId/adjust` (`authenticate` +
      `requireMaster`); lỗi 400 / 403 `FORBIDDEN` / 404 `NOT_FOUND` / 409 `INSUFFICIENT_BALANCE` / 409
      `IDEMPOTENCY_CONFLICT` khai trong schema response
- [ ] 2.6 Nối `buildApp`: repository vào `Repositories` và `tests/test-app.ts`, service vào `AppServices`, dựng sau
      `identity`, trước `ops`, thêm vào `moduleList`; `pnpm run typecheck`
- [ ] 2.7 Test HTTP `tests/wallet.http.test.ts` (app.inject): mọi scenario của spec `wallet/ledger` — tài khoản mới 0 Xu
      và lịch sử rỗng, master cấp rồi người dùng đọc lịch sử mới trước với số dư sau từng dòng và lý do, trừ quá số dư 409
      ví không đổi, staff và người dùng thường gọi cấp 403, người dùng không có đường đọc ví người khác, master xem ví,
      gửi lại cùng khoá trả cùng dòng (tuần tự và song song — bọc repository giữ hai lượt ở đúng điểm), cùng khoá khác số
      409 `IDEMPOTENCY_CONFLICT`, hai lượt trừ song song vượt số dư chỉ một thành công, tài khoản đã xoá 404, dòng nhật ký
      vận hành, không có route nạp / rút (404), tổng các dòng bằng số dư
- [ ] 2.8 CLAUDE.md: module `wallet` trong cây thư mục, bảng module (sở hữu `wallets`, `wallet_transactions`; đường ghi
      duy nhất `apply`), danh sách module và `repositories` của `buildApp`; thứ tự change đánh dấu `add-wallet`

## 3. Thông báo N59 (`notification/preferences`)

- [ ] 3.1 `notification.schema.ts`: nhóm `wallet` trong danh sách nhóm và thứ tự bật tắt; `notification.wallet-matrix.ts`
      nghe `wallet.balance.changed` theo design 7 (bỏ qua `product_purchase`, câu cấp / trừ / hoàn, ký "Ghim", không lý do);
      đăng ký ma trận trong `notification.module.ts`
- [ ] 3.2 Test HTTP: master cấp Xu → `deliverAll` → người nhận có một thông báo nhóm "ví Xu" nêu số Xu và số dư mới, có
      nhắc; tắt nhóm "ví Xu" thì vẫn vào hộp thư nhưng không nhắc; lượt `product_purchase` ghi thẳng qua `apply` không sinh
      thông báo; `GET /me/notification-preferences` có nhóm mới, mặc định bật

## 4. Hạn lưu

- [ ] 4.1 `ops/retention.service.ts`: `RetentionDeps.wallet` (`purgeAccount`), gọi trong `deletedAccountsStep` ngay
      trước `identity.purgeDeletedAccount` (sau kiểm tạm giữ); nối trong `ops.module.ts` / `buildApp`
- [ ] 4.2 Test: tài khoản đã xoá quá hạn có ví → lượt dọn xoá ví và sổ cái; tài khoản đang tạm giữ → ví còn nguyên;
      nhật ký vận hành của lượt cấp vẫn còn

## 5. Tài liệu

- [ ] 5.1 `docs/VIEC-DANG-DO.md`: dòng "Gói đẩy tin, ví Xu" (mục 1) và mục 8 ghi ví đã có, còn `add-promotions`
- [ ] 5.2 TK đã có phần ví từ 28/10/2026 (phần 6, 19, 24, 28, 30) — đối chiếu lại với code lúc làm xong; lệch thì hỏi
      người dùng, không tự sửa một bên

## 6. `ghim-app`

- [ ] 6.1 `npm run api:sync`; hàm ví trong `src/api/client.ts` (người dùng) và `src/api/ops.ts` (master), query key trong
      `keys.ts`, hook trong `src/queries/**`, nhãn nhóm thông báo "Ví Xu"; test api theo mẫu `*.test.ts` đang có
- [ ] 6.2 Màn "Ví Xu" (route mới trong khối `Stack.Protected` cần đăng nhập — HARD#17): số dư, lịch sử mới trước (loại,
      số Xu ±, số dư sau, lý do), nút "Nhắn Hỗ trợ Ghim để xin Xu" mở hội thoại hỗ trợ; lối vào từ tab Cá nhân (dòng "Ví Xu
      · N Xu"); bấm thông báo N59 mở màn này
- [ ] 6.3 Bàn vận hành, chỉ master: khối "Ví Xu" ở `app/ops/user/[id].tsx` — số dư, 20 dòng gần nhất, hộp cấp / trừ Xu
      (số, lý do kèm dòng "người dùng đọc được lý do này", khoá chống lặp sinh một lần mỗi lần mở hộp); lối từ hội thoại
      hỗ trợ `app/ops/thread/[id].tsx` sang hồ sơ người đó nếu chưa có; màn `app/ops/promotions.tsx` bỏ chữ "doanh thu"
- [ ] 6.4 Thử trên máy (bản build EAS hay máy ảo): master cấp 5 Xu cho một tài khoản → máy người đó nhận thông báo "Ghim
      cấp cho bạn 5 Xu", màn Ví Xu hiện 5 Xu và dòng lý do; master trừ quá số dư → báo lỗi, số dư không đổi

## 7. Kiểm tra tích hợp

- [ ] 7.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift`, `pnpm run spec:validate` (ghim-server — test cần Postgres
      chạy trên CI qua PR, máy này chạy `pnpm test:unit`); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-wallet` sau khi gộp vào `main`, rồi tới `add-promotions` (design và tasks viết lúc đó,
  dùng `WalletLedgerPort.apply`).
