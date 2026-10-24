# Proposal

## Why

Luật "không ai, trừ master, xử việc của tài khoản dùng chung máy với mình" (TK 16) hiện chỉ biết hai tài khoản chung
máy qua **lượt đăng tin** (`device_posts`). Staff hay điều hành viên chưa từng đăng tin từ máy mình thì tài khoản phụ
của họ lọt lưới — việc dở ghi ở `docs/VIEC-DANG-DO.md` mục 1 từ design `add-review-queues` (Risks). Luật "người hỏi
mua dùng chung máy với người bán không tính" (TK 20) có cùng lỗ hổng. Người dùng chốt làm ngày 24/10/2026.

## What Changes

- Đăng nhập thành công từ app có gửi mã máy (`x-device-id`) SHALL ghi một **dấu đăng nhập** (máy, tài khoản, lần đầu,
  lần gần nhất) — bảng mới `device_logins`, tách khỏi `device_posts`.
- "Dùng chung thiết bị" cho luật xung đột lợi ích của `review` và luật người hỏi mua của `messaging` đọc **cả hai**
  nguồn: hai tài khoản từng đăng tin **hoặc đăng nhập** từ cùng một máy trong 180 ngày.
- Ba đánh dấu gian lận của `identity/device-registry` (tài khoản thứ tư, máy của tài khoản bị khoá, máy của tài khoản
  có gậy) **giữ nguyên**: vẫn chỉ tính lượt đăng tin — điện thoại cũ qua tay nhiều chủ, đăng nhập không nói lên ai
  đang dùng máy để đăng.
- Dấu đăng nhập xoá theo cùng hạn lưu dữ liệu thiết bị (`device.dataRetentionDays`).
- `ghim-app` gửi `x-device-id` khi đăng nhập như khi gửi tin.

**Cố ý không làm**: ghi dấu lúc xem tin hay làm mới phiên; ghi cho web (bàn vận hành đã nằm trong app).

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `identity/device-registry`: requirement "Ghi dấu thiết bị khi đăng tin" nói rõ dấu đăng nhập không nuôi đánh dấu;
  thêm requirement "Ghi dấu thiết bị khi đăng nhập".
- `review/conflict-of-interest`: "dùng chung thiết bị" tính cả dấu đăng nhập; thêm scenario tài khoản phụ chỉ đăng
  nhập trên máy của staff.

## Impact

- **Code**: `identity` (schema header, `openSession`, repository, hạn lưu), `ops/retention` (đếm), `common/schemas`
  (schema header mã máy dùng chung với `listing`).
- **API**: `POST /auth/login`, `POST /auth/google` nhận header tuỳ chọn `x-device-id`. Không breaking.
- **Migration**: bảng `device_logins`.
- **Tài liệu**: TK 8 (dấu thiết bị còn dùng ở đâu), `docs/VIEC-DANG-DO.md` mục 1, CLAUDE.md.
- **Client** `ghim-app`: `api.login` gửi `deviceHeaders()`.
