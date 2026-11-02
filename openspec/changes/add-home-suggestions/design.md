# Design

## Context

Bảng tin trang chủ là `GET /listings` (bề mặt `feed`, xếp theo `rank_at`) cộng dải `GET /listings/featured`. Server đã
giữ ba thứ cho biết một người quan tâm gì: tin đã lưu (`saved_listings`), tìm kiếm đã lưu (`saved_searches`), hội thoại
về tin (`conversations`, module `messaging`). Chưa có lịch sử xem tin hay lịch sử tìm kiếm. Mục "tin tương tự" theo
từng tin đã có (`/listings/:id/suggestions`) nhưng không theo người.

## Goals / Non-Goals

**Goals**: mục "Gợi ý cho bạn" khác nhau theo từng người, giải thích được (không hộp đen), chạy được trên Postgres hiện
có không thêm dịch vụ; người dùng tắt và xoá được lịch sử của mình.

**Non-Goals**: học máy, tính trước theo lịch (gợi ý tính khi đọc), gợi ý cho khách theo thiết bị, gợi ý trong nhóm,
thông báo đẩy.

## Decisions

### 1. Thuộc module `listing`, đọc hội thoại qua cổng

Gợi ý đọc chủ yếu bảng của `listing` (tin, tin đã lưu, tìm kiếm đã lưu, cột hiển thị), nên đặt ở
`listing/read/suggestion.service.ts` cùng repository `listing/activity/activity.repository.ts`. Hai thứ ngoài `listing`
đi qua cổng nối muộn trong `app.ts` (như `trust`): `messaging` trả mã tin người đó đã hỏi và đếm lượt hỏi mua mỗi tin
(`messaging/buyer-interest.repository.ts`, cùng chỗ với dữ kiện "có người hỏi mua" của tin sạch); `identity` trả công
tắc và tỉnh nhà của hồ sơ.

### 2. Dữ liệu

- `listing_views (account_id, listing_id, view_count, last_viewed_at)`, khoá chính `(account_id, listing_id)`, chỉ mục
  `(account_id, last_viewed_at DESC)`. Một dòng mỗi cặp — mở lại tin chỉ tăng đếm và dời mốc.
- `search_history (id, account_id, q_folded, category_id, province_code, price_min, price_max, searched_at)`, chỉ mục
  `(account_id, searched_at DESC)`. Từ khoá lưu dạng đã gấp dấu (như `search_folded` của tin) — không giữ nguyên văn.
- `accounts.personalized_suggestions BOOLEAN NOT NULL DEFAULT true`.
- Trần mỗi người: 200 lượt xem, 100 lượt tìm gần nhất — xoá phần cũ hơn ngay lúc ghi (một câu `DELETE … IN (… OFFSET
n)` theo chỉ mục), không chờ việc nền.

### 3. Ghi lịch sử — phía server, không cần app gửi sự kiện

- Xem: `GET /listings/:id` của người đã đăng nhập, khác chủ tin, công tắc đang bật, tin xem được → upsert
  `listing_views`. Ghi sau khi đã dựng DTO (gói `get` / `feed` ở `listing.service.ts`), lỗi ghi chỉ log — xem tin không
  bao giờ hỏng vì lịch sử.
- Tìm: `GET /listings` có từ khoá hoặc ít nhất một bộ lọc (danh mục, tỉnh, khoảng giá), trang đầu (không có con trỏ),
  cùng điều kiện người dùng → thêm một dòng `search_history`; trùng y hệt lượt cuối trong 10 phút thì chỉ dời mốc.
- Tắt công tắc: thôi ghi; lịch sử cũ giữ tới khi người dùng xoá hay hết hạn — tắt không phải xoá (Cài đặt nói rõ).

### 4. Hồ sơ quan tâm — tính khi đọc

Lịch sử xem và tìm kiếm trong 90 ngày (cũng là hạn lưu của chúng); tin đã lưu và tin đã hỏi lấy 100 tin mới nhất mỗi
nguồn, không cắt theo ngày — còn lưu, còn hội thoại là còn quan tâm. Mỗi nguồn một trọng số:

| Nguồn                      | Trọng số | Góp                                 |
| -------------------------- | -------- | ----------------------------------- |
| Hội thoại về tin           | 4        | danh mục, giá, tỉnh của tin         |
| Tin đã lưu                 | 3        | danh mục, giá, tỉnh của tin         |
| Tìm kiếm đã lưu            | 2        | danh mục, từ khoá, khoảng giá, tỉnh |
| Lịch sử tìm kiếm           | 2        | danh mục, từ khoá, khoảng giá, tỉnh |
| Lịch sử xem (đếm tối đa 3) | 1        | danh mục, giá, tỉnh của tin         |

Ra: tối đa 5 danh mục kèm tỉ trọng, tối đa 10 từ khoá gần nhất, khoảng giá mỗi danh mục (trung vị giá đã quan tâm × 0,5
→ × 1,6), tối đa 3 tỉnh (tỉnh nhà của hồ sơ trước). Không có danh mục và từ khoá nào → coi như chưa có lịch sử (mục 6).

### 5. Ứng viên và xếp hạng

- Ứng viên: bề mặt `feed` (sàn chung, hiển thị đầy đủ, người xem thấy được — `visibleWhere`), không phải tin của mình,
  không nằm trong tin đã lưu hay đã hỏi; thuộc các danh mục quan tâm **hoặc** khớp một từ khoá; 300 tin mới nhất theo
  `rank_at`.
- Tin của mình, tin đã lưu, tin đã hỏi bị loại với mọi người đã đăng nhập — cả khi đã tắt công tắc, cả ở phần mục 6.
- Điểm (tính trong `listing/calc/suggestion.calc.ts`, hàm thuần có test): `0,5 × tỉ trọng danh mục + 0,2 × khớp từ khoá + 0,15 ×
hợp khoảng giá + 0,1 × cùng tỉnh quan tâm + 0,05 × độ mới (giảm dần theo 14 ngày) − 0,2 nếu đã xem trong 7 ngày`.
  Bằng điểm thì `rank_at` mới trước, rồi `id`.
- Trang: 20 tin; con trỏ là vị trí trong danh sách đã xếp (`offset`), danh sách tính lại mỗi trang — vài tin có thể đổi
  chỗ giữa hai trang khi có tin mới, chấp nhận được cho một mục khám phá. Hết 300 ứng viên mà còn chỗ → bù bằng mục 6,
  bỏ tin trùng.

### 6. Chưa có lịch sử — "được quan tâm nhiều gần bạn"

Khách, tài khoản chưa có tín hiệu, hay đã tắt công tắc: tin bề mặt `feed` trong tỉnh truyền lên (`provinceCode` của bộ
lọc trang chủ; trống là toàn quốc), điểm = lượt lưu + 2 × lượt hỏi mua trong `listing.suggestionPopularDays` ngày (khởi đầu 14),
bằng nhau thì `rank_at` mới trước. Đếm trên 300 tin mới nhất của tỉnh để câu truy vấn có trần.

### 7. API

- `GET /api/v1/listings/suggestions?provinceCode=&cursor=` (phiên tuỳ chọn) → `{ items: ListingDto[], nextCursor,
personalized: boolean }`. `personalized` để app đổi dòng phụ ("Dựa trên tin bạn đã xem, lưu và tìm" / "Được quan tâm
  nhiều gần bạn").
- `PATCH /api/v1/me` nhận `personalizedSuggestions: boolean`; `GET /me` trả trường này.
- `DELETE /api/v1/me/activity-history` → 204, xoá cả lịch sử xem lẫn tìm của mình.

### 8. Hạn lưu và xoá tài khoản

- `retention.activityDays` (khởi đầu 90): bước dọn hằng ngày xoá lượt xem và lượt tìm cũ hơn hạn.
- Xoá tài khoản: lịch sử xoá ngay ở bước xoá (không chờ 90 ngày như tin) — nó chỉ phục vụ chính người đó.

### 9. App

Trang chủ theo ảnh mẫu chủ dự án gửi 02/11/2026, màu theme teal: hero + danh mục giữ nguyên; banner đơn "Đăng tin miễn
phí" thành **banner trượt ngang** (Đăng tin miễn phí → đăng tin; Đẩy tin bằng Xu → Tin của tôi); dải "Tin nổi bật" thành
**thẻ ảnh lớn trượt ngang** (giá, tiêu đề, khu vực trên ảnh); "Gợi ý cho bạn" là **lưới 2 cột** (ảnh, nhãn tình trạng,
tiêu đề 2 dòng, giá + "Thương lượng", khu vực · thời gian), nút "Xem thêm" tải trang kế. Cài đặt: công tắc + "Xoá lịch sử
xem và tìm kiếm" (hỏi lại trước khi xoá).

## Risks / Trade-offs

- Dữ liệu cá nhân mới → hạn lưu ngắn, công tắc tắt được, xoá được, không lộ cho ai khác (không route nào đọc lịch sử của
  người khác, kể cả bàn vận hành). Rà soát pháp lý TK 29 còn mở cũng phải xét hai bảng này.
- Ghi ở đường đọc làm mỗi lượt mở tin thêm một câu ghi: một upsert theo khoá chính, lỗi chỉ log.
- Tính gợi ý khi đọc: ~4 câu truy vấn có trần (300 ứng viên). Khi chậm thì cache theo người vài phút — chưa làm.
- Xếp theo `offset` có thể lặp / sót một tin giữa hai trang khi bảng tin đổi — chấp nhận.

## Migration Plan

Một migration: hai bảng, một cột (mặc định `true`). Không dữ liệu cũ để chuyển; lịch sử bắt đầu ghi từ lúc deploy, nên
những ngày đầu phần lớn người dùng rơi vào mục 6 cho tới khi có tín hiệu (tin đã lưu và hội thoại cũ vẫn dùng được ngay).
