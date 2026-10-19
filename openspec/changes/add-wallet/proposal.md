# Proposal

## Why

TK 29 hoãn "ví Xu và phí đăng tin"; `docs/KE-HOACH-GOI-DAY-TIN.md` (17/10/2026) chọn bật theo ba bước, và ví là bước 1:
không có ví thì không bán được gói đẩy tin (`add-promotions`), và phí đăng tin ngày nào bật cũng trừ từ đây. Hệ cũ đã
xây ví dưới dạng **sổ cái** (`docs/market/docs/rules/xu-wallet.decision.md`) và đã đo: số dư là cache của sổ cái, mọi
biến động một đường ghi có khoá chống lặp, Xu một chiều. Change này mang luật đó sang hệ mới, **chưa nạp tiền thật** —
Xu chỉ do master cấp, đủ để đo người dùng có dùng gói không trước khi quyết thu tiền (`add-topup`).

## What Changes

- Mỗi tài khoản có một ví Xu; số dư không âm; mọi biến động là một dòng sổ cái không sửa không xoá, mang loại
  (`topup` · `post_fee` · `product_purchase` · `refund` · `promo_grant` · `admin_adjust`), số sau giao dịch, tham chiếu
  (tin, lượt mua, lượt nạp) và khoá chống lặp.
- Người dùng xem số dư và lịch sử của mình; master cấp hay trừ Xu kèm lý do, vào nhật ký.
- Thông báo nhóm "ví Xu" (nhóm thứ mười — TK 24 cần cập nhật) khi ví biến động do người khác làm.
- Xu một chiều: không đổi ngược ra tiền, không có hạn sử dụng.

**Cố ý chưa làm**: nạp tiền (`add-topup`), phí đăng tin > 0 (đổi `postingFee` + luật hoàn — change riêng khi quyết), gói
đẩy tin (`add-promotions`).

## Capabilities

### New Capabilities

- `wallet/ledger`: ví và sổ cái Xu, đường ghi duy nhất, quyền xem, cấp tay của master.

### Modified Capabilities

- `notification/preferences`: thêm nhóm "ví Xu".

## Impact

- Module `wallet` (mới, đợt "bật phí"): bảng `wallets`, `wallet_transactions`; route `GET /me/wallet`, `GET /me/wallet/transactions`,
  `POST /ops/wallets/:accountId/adjust` (master). Sự kiện `wallet.balance.changed` cho `notification`.
- Enum `notification_category` thêm `wallet` (migration riêng vì ADD VALUE).
- Hạn lưu: sổ cái là chứng từ, giữ theo luật kế toán, không theo hạn 90 ngày của tài khoản — cần luật sư xác nhận (rà soát
  pháp lý TK 29); `ops` không dọn hai bảng này.
- **Câu hỏi mở** (kế hoạch mục 7): Xu một chiều và điều khoản sử dụng; thời hạn giữ sổ cái; có tặng Xu khai trương không,
  bao nhiêu.
