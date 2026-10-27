# Proposal

## Why

TK 29 hoãn "gói đẩy tin, tin nổi bật"; `prepare-promotions` đã giữ chỗ (vị trí xếp hạng riêng, hạn nổi bật, phí) và
`add-wallet` cho ví. Change này bật tính năng: người đăng trả Xu để tin lên đầu bảng hoặc vào dải nổi bật trong một thời
gian, theo đúng ba luật của TK (không mở tin, không đổi vị trí ngoài đường này, nói rõ lý do từ chối). Thiết kế chi tiết và
câu hỏi mở ở `docs/KE-HOACH-GOI-DAY-TIN.md` mục 4, 7.

## What Changes

- Catalog gói do master soạn: mã, tên, hiệu ứng (`rank_to_top` · `featured`), thời hạn, thời gian chờ, giá Xu, mức tin
  cậy tối thiểu, phạm vi (sàn chung, nhóm), bật tắt.
- Người đăng mua gói cho tin của mình: chỉ tin đang hiển thị đầy đủ, không tạm ẩn, không trong thời gian chờ, khi không
  đang tạm khoá đăng tin; trừ Xu và áp hiệu ứng trong một lượt — thiếu Xu thì không áp, tin đổi giữa chừng thì không
  trừ.
- `rank_to_top` đặt lại vị trí xếp hạng; `featured` đặt hạn nổi bật — cùng đường ghi, cùng dải "Tin nổi bật" với đẩy tin
  của người quản trị đã có (`add-admin-boost`, `listing/boosting`).
- Hoàn Xu phần chưa hưởng khi khiếu nại thắng / ân xá; không hoàn khi tin bị gỡ vì vi phạm.
- Thông báo cho người đăng: đã áp gói, nổi bật sắp hết.

**Cố ý chưa làm**: `extend_expiry` (gia hạn đang miễn phí — kế hoạch câu 3), tự động đẩy theo lịch cho người bán chuyên
(câu 6), chủ nhóm tắt gói trong nhóm mình (câu 5 — chốt rồi mới viết).

## Capabilities

### New Capabilities

- `promotion/catalog`: gói đẩy tin do master soạn.
- `promotion/purchase`: mua gói, điều kiện, trừ Xu, hoàn, thời gian chờ.

### Modified Capabilities

- `listing/visibility`: "Vị trí trên bảng tin", "Hạn nổi bật của một tin" — thêm gói trả Xu bên cạnh đẩy tin của người
  quản trị (viết lại 27/10/2026 trên spec sau `add-admin-boost`; dải nổi bật đã có, không thêm requirement).
- `notification/listing-notices`: thêm thông báo về gói.

## Impact

- Module `promotion` (mới): `promotion_products`, `promotion_purchases`; route app `GET /promotions/products`,
  `POST /listings/:id/promotions`; route bàn vận hành `/ops/promotions/products`. Gọi `wallet.apply(tx)` và cổng
  `listing.applyPromotion(tx)` trong cùng transaction.
- `listing`: cổng `applyPromotion(tx)` đi chung đường ghi của `listing/boost` (`rank_at`, `featured_until`,
  `last_bumped_at` và dải nổi bật đã có từ `add-admin-boost`; hạn đã qua đọc như null nên không cần việc theo lịch).
- Con số nhóm "Đẩy tin": dùng lại `promotion.featuredStripSize`, `promotion.bumpCooldownHours`,
  `promotion.featuredMaxDays` (đã có từ `add-admin-boost`); thêm `promotion.minTier`,
  `promotion.maxBumpsPerDay`, `promotion.refundOnAppealWin`.
- Phụ thuộc: `prepare-promotions`, `add-wallet` archive trước.
- **Câu hỏi mở**: kế hoạch mục 7 (giá, mức tối thiểu, hoàn, nhóm, dải nổi bật ở đâu).
