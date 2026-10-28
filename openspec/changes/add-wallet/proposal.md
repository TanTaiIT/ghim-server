# Proposal

## Why

TK 29 hoãn "ví Xu và phí đăng tin"; `docs/KE-HOACH-GOI-DAY-TIN.md` (17/10/2026) chọn bật theo bước, và ví là bước 1:
không có ví thì không bán được gói đẩy tin (`add-promotions`). Hệ cũ đã xây ví dưới dạng **sổ cái**
(`docs/market/docs/rules/xu-wallet.decision.md`) và đã đo: số dư là cache của sổ cái, mọi biến động một đường ghi có khoá
chống lặp. Change này mang luật đó sang hệ mới.

Chủ dự án chốt 28/10/2026 (kế hoạch mục 7): **không có thanh toán online** — Xu không mua bằng tiền. Ví mới mở bằng 0, ai
cần Xu nhắn Hỗ trợ Ghim và **master cấp miễn phí**. Không có tiền đi qua nên không có doanh thu, không hoá đơn, không cần
giấy phép trung gian thanh toán; Xu chỉ là lượt dùng gói do master phân phát.

## What Changes

- Mỗi tài khoản có một ví Xu, mở bằng 0 (không tặng Xu khai trương); số dư không âm; mọi biến động là một dòng sổ cái
  không sửa không xoá, mang loại (`admin_adjust` · `product_purchase` · `refund`), số sau giao dịch, tham chiếu (tin, lượt
  mua) và khoá chống lặp.
- Người dùng xem số dư và lịch sử của mình; ví trong app chỉ cách xin thêm Xu (nhắn Hỗ trợ Ghim).
- **Chỉ master** cấp hay trừ Xu, kèm lý do bắt buộc, vào nhật ký. Staff đọc tin xin Xu ở Hỗ trợ Ghim thì chuyển cho master.
- Thông báo nhóm "ví Xu" (nhóm thứ mười — TK 24 cần cập nhật) khi ví biến động do người khác làm.
- Xu không quy đổi ra tiền, không có hạn sử dụng.

**Cố ý không làm**: nạp tiền (VietQR, mua trong app) — bỏ khỏi lộ trình 28/10/2026; phí đăng tin bằng Xu; gói đẩy tin
(`add-promotions`).

## Capabilities

### New Capabilities

- `wallet/ledger`: ví và sổ cái Xu, đường ghi duy nhất, quyền xem, cấp tay của master.

### Modified Capabilities

- `notification/preferences`: thêm nhóm "ví Xu".

## Impact

- Module `wallet` (mới): bảng `wallets`, `wallet_transactions`; route `GET /me/wallet`, `GET /me/wallet/transactions`,
  `POST /ops/wallets/:accountId/adjust` (master). Sự kiện `wallet.balance.changed` cho `notification`.
- Enum `notification_category` thêm `wallet` (migration riêng vì ADD VALUE).
- Hạn lưu: không có tiền nên sổ cái không phải chứng từ kế toán — theo hạn lưu của tài khoản; lượt cấp Xu của master vẫn
  còn trong nhật ký bất biến theo hạn của nhật ký.
- App: màn Ví Xu (số dư, lịch sử, cách xin thêm Xu); bàn vận hành: cấp / trừ Xu cho một tài khoản.
- **Câu hỏi mở**: không còn — kế hoạch mục 7 đã chốt 28/10/2026.
