# Proposal

## Why

Nhóm hiện không mang vị trí (TK 9, 10): người dùng chỉ tìm nhóm **theo tên**, không lọc được
"nhóm ở Đà Nẵng". Trong khi tin đăng đã có tỉnh/thành từ đầu (TK 11), nhóm thì chưa, nên không có
đường khám phá nhóm theo khu vực để từ đó mở bảng tin của nhóm. Chủ dự án yêu cầu gắn tỉnh/thành
cho nhóm (chốt 05/11/2026) để bộ lọc có thể chọn nhóm theo tỉnh rồi xem tin trong nhóm đó —
phần "tin của một nhóm" đã lấy được sẵn qua bảng tin nhóm, nên change này chỉ lo phần nhóm gắn
tỉnh + lọc nhóm theo tỉnh.

Đây là phần **mở rộng ngoài phạm vi TK 29 hiện tại** (TK chưa có mục tỉnh cho nhóm); chủ TK nên
thêm một dòng vào TK 9 khi duyệt. Change không tự sửa TK.

## What Changes

- Nhóm có thêm **tỉnh/thành tùy chọn** (`null` = nhóm toàn quốc, không gắn tỉnh). Chỉ cấp
  **tỉnh/thành**, không tới phường/xã.
- **Lập nhóm** (chỉ master) nhận thêm tỉnh/thành tùy chọn.
- **Chủ nhóm hoặc master** đổi hoặc gỡ tỉnh/thành của nhóm về sau, như sửa mô tả nhóm.
- **Tìm nhóm công khai** nhận thêm bộ lọc theo tỉnh/thành (kết hợp với tìm theo tên đang có);
  không truyền tỉnh thì kết quả như cũ.
- **Hồ sơ nhóm** trả về tỉnh/thành của nhóm để app hiển thị và để đổ vào bộ lọc.
- Cố ý **KHÔNG** làm trong change này: không ràng buộc tin đăng vào nhóm phải cùng tỉnh với nhóm
  (tin giữ tỉnh riêng của tin); không đổi luồng đăng tin; không đổi bảng tin chung / tìm kiếm sàn
  chung; không thêm phường/xã cho nhóm; không bắt buộc nhóm phải có tỉnh.

## Capabilities

### New Capabilities

<!-- Không có capability mới: tỉnh nhóm là thuộc tính nhỏ, gắn vào các capability nhóm sẵn có. -->

### Modified Capabilities

- `group/group-lifecycle`: requirement "Master lập nhóm" nhận thêm tỉnh/thành tùy chọn lúc lập
  nhóm (thiếu thì nhóm không gắn tỉnh).
- `group/group-modes`: thêm requirement "Tỉnh/thành của nhóm" (chủ nhóm hoặc master đặt / đổi /
  gỡ, người ngoài và điều hành viên không được); và mở rộng "Ai tìm thấy nhóm" — tìm nhóm công
  khai lọc được theo tỉnh/thành, hồ sơ nhóm trả về tỉnh/thành.

## Impact

- **DB**: thêm cột nullable `groups.province_code` (FK → `provinces.code`, `ON DELETE SET NULL`),
  theo đúng mẫu `accounts.home_province_code`. Migration thêm cột, không mất dữ liệu, không SQL
  viết tay. Nhóm đang có giữ `null`.
- **API** (`group` module): `POST /groups` (lập nhóm) và đường sửa cài đặt nhóm nhận `provinceCode`
  tùy chọn; `GET /groups` (tìm nhóm) nhận query `provinceCode` tùy chọn; `GET /groups/:groupId`
  (hồ sơ nhóm) trả thêm `province`.
- **App `ghim-app`**: ô chọn tỉnh/thành khi lập/sửa nhóm; bộ lọc tỉnh ở màn tìm/khám phá nhóm, để
  chọn nhóm theo tỉnh rồi mở bảng tin nhóm (dùng `GET /groups/:groupId/listings` sẵn có).
- **Không đụng**: module `listing` (bảng tin, đăng tin, visibility), `review`, `screening`.
