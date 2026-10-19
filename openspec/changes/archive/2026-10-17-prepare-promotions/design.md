# Design

> **Đã duyệt 17/10/2026.** Chủ dự án duyệt bước 0 của `docs/KE-HOACH-GOI-DAY-TIN.md` ("commit trước và tiến hành").

## Context

- Bảng tin xếp `first_live_at desc, id desc` (bốn index từng phần: sàn chung, danh mục, tìm kiếm, nhóm); con trỏ trang là
  cặp (`firstLiveAt`, `id`). `nextClock` đặt `firstLiveAt = rankAt ?? now` lúc lên bảng lần đầu — tham số `rankAt` là vị
  trí của tin cũ khi tin trùng của chính mình lên bảng (`add-screening`), nên `first_live_at` đang kiêm luôn vị trí.
- Spec `listing/display-period` đã nói sửa và gia hạn không đổi vị trí; `screening-decision.http.test.ts` kiểm tin trùng
  kế thừa `firstLiveAt` của tin cũ.

## Goals / Non-Goals

**Goals:** cột vị trí riêng với index và con trỏ đi theo; hạn nổi bật trong DTO; hợp đồng phí; không đổi một hành vi nào
người dùng thấy.

**Non-Goals:** mọi luật của gói, ví, dải nổi bật (change sau); tách nghĩa "lần đầu lên bảng" khỏi lượt kế thừa (mục 1).

## Decisions

### 1. `rank_at` chép đúng `first_live_at`, kể cả khi kế thừa

`ListingClock` thêm `rankAt`; lúc lên bảng lần đầu `firstLiveAt = rankAt ?? now` **và** `rankAt = rankAt ?? now` — hai cột
bằng nhau ở mọi tin hôm nay (migration chép `rank_at = first_live_at`). Giữ `first_live_at` kế thừa như cũ vì N31 ("tin
MỚI lên bảng" đọc `firstLive`), `priceSamples`, hạn lưu tin hết hạn đều đọc cột đó và đã có test; tách nghĩa là việc của
`add-promotions` khi `rank_to_top` làm hai cột lệch nhau. CHECK `listings_rank_check: (rank_at IS NULL) = (first_live_at
IS NULL)` giữ hai cột đi cùng nhau tới lúc đó.

### 2. Xếp hạng và con trỏ theo `rank_at`

`orderBy('live')`, `afterCursor` và `liveKey` của trang đọc `rankAt`; bốn index bảng tin đổi cột đầu. `first_live_at` không
còn index riêng cho bảng tin — chỗ đọc còn lại (`priceSamples`, hạn lưu) lọc theo khoảng, không cần.

### 3. `featuredUntil` trong DTO, không có `rankAt`

Người xem cần biết tin có nổi bật không (app dựng dải từ đầu, hôm nay rỗng); vị trí xếp hạng là chuyện nội bộ của bảng
tin, không lộ. Index từng phần `listings_featured_idx WHERE featured_until IS NOT NULL` tạo sẵn — rỗng, không tốn gì.

### 4. Phí ở bảng uy tín, luật phí ở `listing`

`listing/calc/fee.calc.ts` → `postingFee(): { amount: 0, currency: 'xu' }` — một chỗ duy nhất, ngày bật đổi hàm (và thêm
luật hoàn ở `add-wallet`). `trust` đưa vào `quota.fee` của `GET /me/trust` qua cổng `ListingFactsService.postingFee` — app
đọc hạn mức ở đó trước khi soạn tin, nên "Miễn phí" hiện cùng chỗ với "còn N chỗ". Lượt gửi không trả phí: khi phí > 0,
lượt gửi sẽ trả dòng sổ cái — hợp đồng của `add-wallet`.

### 5. Không thêm nhóm thông báo "ví Xu" bây giờ

TK 24 chốt chín nhóm; enum thêm giá trị là migration riêng rẻ bất cứ lúc nào; thêm sớm chỉ làm bảng bật tắt hiện một nhóm
chưa có gì. Làm ở `add-wallet`.

## Risks / Trade-offs

- Hai cột bằng nhau trông thừa trong 1–2 đợt tới; cái giá của việc đổi index khi bảng còn trống rẻ hơn nhiều lần đổi khi
  có dữ liệu thật.
- Dữ liệu nền của test phải ghi cả hai cột: `liveListing` của `tests/listing-helpers.ts` tự chép `rankAt` từ `firstLiveAt`.
