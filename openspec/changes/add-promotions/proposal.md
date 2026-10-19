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
- `rank_to_top` đặt lại vị trí xếp hạng; `featured` đặt hạn nổi bật; dải "Tin nổi bật" ở đầu bảng tin, danh mục, bảng
  tin nhóm; tin nổi bật hết hạn tự rời dải. Tin tạm ẩn hay hạn chế không vào dải dù còn hạn.
- Hoàn Xu phần chưa hưởng khi khiếu nại thắng / ân xá; không hoàn khi tin bị gỡ vì vi phạm.
- Thông báo cho người đăng: đã áp gói, nổi bật sắp hết.

**Cố ý chưa làm**: `extend_expiry` (gia hạn đang miễn phí — kế hoạch câu 3), tự động đẩy theo lịch cho người bán chuyên
(câu 6), chủ nhóm tắt gói trong nhóm mình (câu 5 — chốt rồi mới viết).

## Capabilities

### New Capabilities

- `promotion/catalog`: gói đẩy tin do master soạn.
- `promotion/purchase`: mua gói, điều kiện, trừ Xu, hoàn, thời gian chờ.

### Modified Capabilities

- `listing/visibility`: "Vị trí trên bảng tin" — gói `rank_to_top` đổi vị trí; thêm "Tin nổi bật".
- `notification/listing-notices`: thêm thông báo về gói.

## Impact

- Module `promotion` (mới): `promotion_products`, `promotion_purchases`; route app `GET /promotions/products`,
  `POST /listings/:id/promotions`; route bàn vận hành `/ops/promotions/products`. Gọi `wallet.apply(tx)` và cổng
  `listing.applyPromotion(tx)` trong cùng transaction.
- `listing`: `rank_at`, `featured_until` được ghi lần đầu; việc theo lịch dọn hạn nổi bật đã qua; dải nổi bật ở ba bảng
  tin; `first_live_at` tách khỏi vị trí (N31, hạn lưu vẫn đọc `first_live_at`).
- Con số mới nhóm "Đẩy tin": `promotion.featuredStripSize`, `promotion.bumpCooldownHours`, `promotion.minTier`,
  `promotion.maxBumpsPerDay`, `promotion.refundOnAppealWin`.
- Phụ thuộc: `prepare-promotions`, `add-wallet` archive trước.
- **Câu hỏi mở**: kế hoạch mục 7 (giá, mức tối thiểu, hoàn, nhóm, dải nổi bật ở đâu).
