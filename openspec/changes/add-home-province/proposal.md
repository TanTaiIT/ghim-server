# Proposal

## Why

TK 11 viết khu vực "dùng để lọc và tìm đồ gần mình", nhưng server không biết người dùng ở đâu: mục "Gần bạn" ở trang chủ
`ghim-app` là toàn quốc và ô tìm kiếm ghi cứng "TP.HCM" (`docs/VIEC-DANG-DO.md` mục 8). Người dùng chốt ngày 25/10/2026:
người dùng tự chọn tỉnh/thành của mình, không bắt buộc, **riêng tư** — chỉ để app xếp "Gần bạn" và đặt sẵn bộ lọc khi tìm,
không hiện cho ai khác.

Không thuộc đợt nào của TK 29. Không đụng cam kết nào ở TK 27.

## What Changes

- Hồ sơ của tôi có `homeProvinceCode` (mã tỉnh, hay null); `PATCH /me` đặt hay bỏ (`null`). Mã tỉnh không có → 400
  `VALIDATION_ERROR`.
- Hồ sơ công khai không có trường này. Xoá tài khoản thì xoá theo như mọi thông tin cá nhân.

**Cố ý không làm**: chọn tới phường / xã (người dùng chọn chỉ tỉnh); tự đoán tỉnh từ vị trí hay địa chỉ IP; server tự lọc
bảng tin theo tỉnh (app gửi `provinceCode` như một bộ lọc thường — bảng tin không đổi luật).

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `identity/profile`: thêm "Tỉnh/thành của tôi".

## Impact

- **Code**: `identity` (cột, `PATCH /me`, hồ sơ của tôi, xoá thông tin khi xoá tài khoản); `identity` hỏi `region` qua
  cổng để kiểm mã tỉnh — `app.ts` dựng `region` trước `identity`.
- **API**: thêm một trường vào hồ sơ của tôi và `PATCH /me`. Không breaking.
- **Migration**: một cột nullable `accounts.home_province_code`, khoá ngoại tới `provinces` (`ON DELETE SET NULL`). Không
  mất dữ liệu.
- **Tài liệu**: TK 11 dòng "Khu vực"; CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`.
- **Client** `ghim-app`: Cài đặt có "Khu vực của tôi"; "Gần bạn" và ô tìm kiếm ở trang chủ theo tỉnh đã chọn.
