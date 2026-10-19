# Proposal

## Why

TK 29 hoãn "gói đẩy tin, tin nổi bật" và "ví Xu, phí đăng tin" nhưng TK 30 đòi **giữ chỗ trong dữ liệu ngay từ đầu**:
vị trí xếp hạng (`rankAt`), hạn nổi bật (`featuredUntil`), phí bằng 0 — "để ngày bật không phải chuyển đổi dữ liệu".
Hệ mới chưa có ba thứ đó: bảng tin đang xếp theo `first_live_at` (cột kiêm hai nghĩa: lần đầu lên bảng và vị trí),
DTO tin không có hạn nổi bật, app không biết phí là bao nhiêu. Bản kế hoạch `docs/KE-HOACH-GOI-DAY-TIN.md` (17/10/2026)
chọn làm phần giữ chỗ **bây giờ**, khi bảng `listings` còn trống: đổi index của bảng tin trên bảng có dữ liệu thật là
lượt đổi index lớn nhất của hệ, và thêm trường vào DTO sau khi app đã phát hành là một lần buộc người dùng cập nhật.

## What Changes

- Tin có **vị trí xếp hạng** riêng (`rank_at`): đặt lúc lên bảng lần đầu, tin trùng của chính mình kế thừa vị trí tin
  cũ như hôm nay; bảng tin sàn chung, danh mục, bảng tin nhóm và con trỏ trang xếp theo vị trí này. `first_live_at` giữ
  nguyên nghĩa và giá trị — hành vi người dùng thấy **không đổi**.
- DTO tin mang `featuredUntil` (hạn nổi bật) — luôn trống tới khi có gói.
- Bảng uy tín cho biết **phí một lượt đăng tin**: hiện `0 Xu` (TK 29 "phí hiện bằng 0, app hiện Miễn phí"); luật phí
  nằm một chỗ để ngày bật chỉ đổi hàm.

**Cố ý chưa làm** (bước 1, 2 của kế hoạch — change `add-wallet`, `add-promotions`, `add-topup` nằm chờ trong
`openspec/changes/`): ví, catalog gói, mua gói, dải nổi bật, nhóm thông báo "ví Xu" (TK 24 đang chốt chín nhóm; thêm giá
trị enum là một migration riêng, rẻ bất cứ lúc nào, và thêm trước thì bảng bật tắt của người dùng hiện một nhóm trống).

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `listing/visibility`: thêm "Vị trí trên bảng tin" — vị trí xếp hạng là một thuộc tính riêng của tin, hạn nổi bật trống.
- `trust/seller-dashboard`: thêm "Phí đăng tin" — bảng uy tín cho biết phí một lượt đăng (0 Xu).

## Impact

- `listing`: cột `rank_at`, `featured_until`; bốn index bảng tin chuyển sang `rank_at`; CHECK `listings_rank_check`;
  đồng hồ (`display-period.calc`) đặt `rankAt` cùng lúc với `firstLiveAt`; hàm phí thuần `calc/fee.calc.ts`.
- `trust`: bảng uy tín hỏi `listing.postingFee()` qua cổng dữ kiện, thêm `quota.fee`.
- Migration `prepare_promotions`: thêm cột, chép `rank_at = first_live_at`, đổi index, thêm CHECK. Không mất dữ liệu;
  API chỉ thêm trường.
- Không đổi TK: phần TK cho gói đẩy tin là bản nháp ở phụ lục của `docs/KE-HOACH-GOI-DAY-TIN.md`, chủ TK duyệt rồi mới
  vào `docs/THIET-KE-HE-THONG.md`.
