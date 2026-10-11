# Proposal

## Why

Rà soát lần hai ngày 11/10/2026 tìm ra hai chỗ hành vi chưa đúng ý TK, và một chỗ hợp đồng HTTP còn bỏ ngỏ.

**Đọc công khai không cho giữ lại.** App mở lên là đọc danh sách danh mục và khu vực (TK 11). Khu vực chỉ đổi
khi phát hành phần mềm mới, danh mục và mẫu thông tin rất ít đổi, phiên bản mẫu đã phát hành không bao giờ
đổi — nhưng response không nói gì về việc giữ lại, nên mỗi lần mở app là một lượt đọc DB. Ngược lại, response có dữ liệu cá nhân (hồ sơ,
phiên đăng nhập, bàn vận hành) cũng không cấm giữ lại: proxy hay trình duyệt dùng chung có thể giữ một bản.

**Xoá tài khoản không thu quyền staff.** TK 5: tài khoản bị khoá thì quyền staff tự treo. Tài khoản bị xoá thì
chưa có luật: quyền vẫn "đang hiệu lực" trong danh sách staff dù người đó không đăng nhập được nữa và không
quay lại được (TK 7: xoá là ẩn 90 ngày rồi xoá hẳn).

Đợt 1 theo TK 29. Cam kết ở TK 27 liên quan: **28** (người không còn dùng được tài khoản thì không giữ quyền
staff — mở rộng từ "bị khoá" sang "bị xoá").

## What Changes

- **Mặc định không cho giữ lại**: mọi response của API cấm app, trình duyệt và proxy giữ lại, trừ khi route
  cho phép tường minh.
- **Khu vực**: danh sách tỉnh, phường và kết quả tìm khu vực cho phép giữ lại tối đa **một ngày**.
- **Danh mục và mẫu**: danh sách danh mục đang bật và mẫu hiện hành cho phép giữ lại tối đa **5 phút** — master
  tắt danh mục hay phát hành mẫu thì app thấy chậm nhiều nhất 5 phút; phiên bản mẫu đã phát hành cho phép giữ
  lại **mãi**.
- **Xoá tài khoản thì thu hẳn quyền staff** (không treo — tài khoản đã xoá không quay lại được). Requirement
  "Chỉ master cấp và sửa quyền staff" sửa câu chữ để không mâu thuẫn: staff không thu quyền ai **qua bàn vận
  hành**; xoá tài khoản là một đường khác, do hệ thống làm.
- TK 5 thêm câu tương ứng (sửa trong cùng change).

**Cố ý chưa làm**: kiểm lại bằng ETag (cần thêm package hoặc tự tính, mà vẫn phải đọc DB để tính); cache phía
server — giữ lại ở app và CDN đã đủ cho tải hiện tại.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `http/api-contract`: thêm requirement "Mặc định không cho giữ lại response".
- `category/regions`: thêm requirement "Khu vực cho phép giữ lại một ngày".
- `category/category-catalog`: thêm requirement "Danh mục và mẫu cho phép giữ lại có hạn".
- `platform/staff-permissions`: thêm requirement "Tài khoản bị xoá thì quyền staff bị thu"; sửa câu chữ
  requirement "Chỉ master cấp và sửa quyền staff".

## Impact

- `src/app.ts` (hook mặc định), một helper header cache dùng chung, route công khai của `category`,
  `platform.events.ts`, `platform.service.ts`,
  `platform.repository.ts`.
- TK 5. Không migration, không thêm package.
- Client: app nên tôn trọng header cache (thư viện HTTP mặc định đã làm).
