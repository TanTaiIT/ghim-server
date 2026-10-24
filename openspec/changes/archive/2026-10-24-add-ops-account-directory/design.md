# Design

## Context

`accounts` thuộc `identity`; mức tin cậy và cảnh cáo thuộc `trust` (`tierOf`, `struckAccounts`, `strikePointsOf` đã là
cổng). Khoá / mở khoá đã có ở `identity/ops` (`/ops/accounts/:id/lock|unlock`, master). `ops` là nơi ghép số liệu
liên module (`add-ops-daily-stats`). Danh sách của bàn vận hành dùng `paginationQuerySchema` + `paginated()` của
`common/schemas/pagination`.

## Goals / Non-Goals

**Goals**: tìm nhanh một người theo tên / email; thấy ngay trạng thái và mức rủi ro; trang hồ sơ biết trạng thái khoá.

**Non-Goals**: tìm theo số điện thoại, theo nhóm; tìm không dấu theo tên; xem tài khoản đã xoá; bất kỳ thao tác ghi
nào mới.

## Decisions

### 1. Ai được xem

`requireOps('support')`: master và staff có việc hỗ trợ — chính những người đang tra mã đánh dấu và trả lời hỗ trợ.
Staff danh mục không cần danh bạ: hồ sơ người đăng mở từ việc duyệt. Email hiện cho cả hai vai vì hỗ trợ cần email để
đối chiếu với thư người dùng gửi.

### 2. Tìm ở `identity`, ghép ở `ops`

`identity.searchAccounts({ q, status, skip, take })` trả trang `{ rows, total }` trên `accounts` (`status <> deleted`,
`display_name ILIKE %q%` hoặc `email_normalized LIKE %q%` chữ thường, `created_at DESC`); `identity.accountCard(id)`
trả một dòng hay `null`. `ops` ghép `trust.tierOf` từng dòng (đọc mức đã lưu, rẻ) và `trust.struckAccounts(ids)` (một
lượt cho cả trang); thẻ chi tiết thêm `trust.strikePointsOf`.

Phương án bị loại: route đặt trong `identity/ops` và gọi ngược `trust` — `trust` phụ thuộc `identity` nên sẽ thành vòng.

### 3. Hình dạng một dòng

`{ id, displayName, email, role, status, createdAt, lockedAt, lockedReason, tier, struck }`; thẻ chi tiết thêm
`strikePoints`. `status` là enum `account_status` trừ `deleted` (TK 7). Không có dấu băm, không có mã máy.

## Risks / Trade-offs

- **`ILIKE %q%` không dùng chỉ mục**: bảng tài khoản còn nhỏ; khi cần thì thêm chỉ mục trigram, không đổi API.
- **Tên có dấu**: gõ "Binh" không ra "Bình". Ghi rõ trong app ("gõ đúng dấu hoặc tìm theo email"); cột tên bỏ dấu là
  việc sau nếu cần.

## Migration Plan

Không migration. Deploy server rồi app `npm run api:sync`.
