# Proposal

## Why

Tab "Người dùng" của bàn vận hành trong `ghim-app` chỉ có hồ sơ giấy tờ; mục "Tất cả" ghi "Chưa có API": không có cách
nào tìm một người theo tên hay email, và trang hồ sơ một người (`/ops/user/[id]`) không biết tài khoản đó đang khoá
hay không nên hiện cả hai nút Khoá / Mở khoá rồi để server từ chối (`docs/VIEC-DANG-DO.md` mục 8). Người dùng chốt
phạm vi ngày 24/10/2026: master và staff có việc hỗ trợ tìm theo tên hiển thị / email, thấy trạng thái, mức tin cậy,
cảnh cáo; khoá / mở khoá vẫn là của master như cũ.

## What Changes

- `GET /api/v1/ops/accounts?q=&status=&page=&limit=` (master, staff có việc hỗ trợ): tài khoản chưa xoá, mới nhất
  trước; `q` khớp tên hiển thị (không phân biệt hoa thường) hoặc email chuẩn hoá (chứa chuỗi); `status` lọc đang hoạt
  động / chưa xác nhận email / đang khoá. Mỗi dòng: mã, tên, email, vai, trạng thái, ngày tạo, lúc khoá + lý do, mức tin
  cậy, có cảnh cáo đang tính hay không.
- `GET /api/v1/ops/accounts/:id` (cùng quyền): một tài khoản như trên kèm điểm vi phạm đang tính; không có hay đã xoá → 404.
- `ops` ghép từ cổng của `identity` (tìm và đọc thẻ tài khoản) và `trust` (mức, cảnh cáo) — không đọc bảng của ai.
- `ghim-app`: mục "Tất cả" thành ô tìm + danh sách; trang hồ sơ người dùng đọc thẻ tài khoản để hiện trạng thái, email,
  mức tin cậy và chỉ nút Khoá hay Mở khoá đúng trạng thái.

**Cố ý không làm**: tìm không dấu theo tên (tài khoản không có cột tên đã bỏ dấu; email không dấu sẵn); liệt kê tài
khoản đã xoá; sửa hồ sơ người khác từ bàn vận hành.

## Capabilities

### New Capabilities

- `ops/account-directory`: danh bạ tài khoản cho bàn vận hành.

### Modified Capabilities

_(không có)_

## Impact

- **Code**: `identity` (cổng tìm / đọc thẻ), `ops` (service, schema, route), `trust` chỉ dùng cổng có sẵn.
- **API**: thêm hai route đọc dưới `/ops/accounts`. Không breaking (`/ops/accounts/:id/lock|unlock` giữ nguyên).
- **Migration**: không.
- **Tài liệu**: `docs/VIEC-DANG-DO.md` mục 8, CLAUDE.md thứ tự change.
- **Client** `ghim-app`: `npm run api:sync`, tab Người dùng, trang hồ sơ người dùng.
