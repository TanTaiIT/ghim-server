# Proposal

## Why

Trang chủ hiện có dải "Tin nổi bật" (gói trả Xu và đẩy tin của người quản trị) rồi tới "Gần bạn" — mọi người cùng một
tỉnh thấy cùng một danh sách xếp theo vị trí lên bảng. Người mua đã lưu, đã hỏi, đã tìm "xe máy Honda" vẫn phải tự lọc
lại từ đầu mỗi lần mở app. Chủ dự án chốt 02/11/2026: thay "Gần bạn" bằng **"Gợi ý cho bạn"** theo lịch sử thao tác của
từng người; dải "Tin nổi bật" giữ nguyên vì người đăng đã trả Xu cho chỗ đó (`promotion/purchase`).

## What Changes

- **Lịch sử xem tin** và **lịch sử tìm kiếm** của người đã đăng nhập — dữ liệu cá nhân mới, server tự ghi khi người dùng
  mở một tin (không phải tin của mình) hay chạy một lượt tìm có từ khoá / bộ lọc; app không gửi sự kiện riêng. Hạn lưu
  90 ngày (con số), xoá ngay khi người dùng bấm "Xoá lịch sử" hay xoá tài khoản.
- **Công tắc "Gợi ý theo hoạt động"** trong Cài đặt (mặc định bật): tắt thì server thôi ghi lịch sử và mục gợi ý trả về
  như khách.
- **Gợi ý cho bạn** (`GET /api/v1/listings/suggestions`): tin trên sàn chung người xem thấy được ở mức đầy đủ, xếp theo
  mức khớp với hồ sơ quan tâm dựng từ năm nguồn — tin đã lưu, hội thoại / trả giá, tìm kiếm đã lưu, lịch sử xem, lịch sử
  tìm kiếm (danh mục, từ khoá, khoảng giá, khu vực). Bỏ tin của chính mình, tin đã lưu, tin đã hỏi.
- **Chưa có lịch sử** (khách, tài khoản mới, đã tắt công tắc): "được quan tâm nhiều gần bạn" — tin trong tỉnh người
  xem chọn ở trang chủ, xếp theo lượt lưu + lượt hỏi mua 14 ngày qua, mới trước khi bằng nhau.
- Dải "Tin nổi bật" không đổi.

**Cố ý không làm**: ghi lịch sử của khách (không có tài khoản để gắn, mà dấu thiết bị chỉ dùng chống lạm dụng — TK 8),
học máy / dịch vụ gợi ý ngoài, gợi ý trong nhóm, gửi thông báo đẩy "có tin hợp với bạn" (đã có tìm kiếm đã lưu).

**Mặc định đề xuất, chờ chủ dự án chốt**: hạn lưu 90 ngày · giữ tối đa 200 lượt xem và 100 lượt tìm gần nhất mỗi người ·
công tắc mặc định bật · gợi ý loại tin đã lưu và tin đã hỏi (đã biết rồi), giữ tin đã xem nhưng xếp thấp hơn.

## Capabilities

### New Capabilities

- `listing/activity-history`: ghi lịch sử xem và tìm kiếm, công tắc, xoá lịch sử.
- `listing/suggestions`: mục "Gợi ý cho bạn" — hồ sơ quan tâm, xếp hạng, trường hợp chưa có lịch sử.

### Modified Capabilities

- `ops/data-retention`: thêm hạn lưu lịch sử xem và tìm kiếm.
- `identity/profile`: công tắc "Gợi ý theo hoạt động" trên hồ sơ của tôi.

## Impact

- Server: hai bảng mới (`listing_views`, `search_history`), cột `accounts.personalized_suggestions`; ghi lịch sử ở
  `GET /listings/:id` và `GET /listings`; route mới `GET /listings/suggestions`, `DELETE /me/activity-history`;
  `PATCH /me` nhận công tắc; bước dọn mới ở `retention.service.ts`; con số `retention.activityDays`,
  `listing.suggestionPopularDays`.
- App: trang chủ theo bố cục mới (banner trượt ngang, dải nổi bật thẻ ảnh lớn, "Gợi ý cho bạn" lưới 2 cột), Cài đặt có
  công tắc và nút xoá lịch sử.
- TK: phần 25 thêm dòng hạn lưu; phần 15 (bảng tin) nêu mục gợi ý; TK 29 không đổi.
