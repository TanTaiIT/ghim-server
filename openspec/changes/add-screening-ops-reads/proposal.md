# Proposal

## Why

Bàn vận hành của `ghim-app` làm năm việc của máy duyệt mà server đã có route ghi (cụm từ cấm, danh sách trắng ảnh, luật
riêng theo danh mục, ngưỡng dải theo danh mục, từ khoá danh mục — người dùng yêu cầu 26/10/2026). Hai chỗ thiếu đường đọc:
từ khoá chỉ có lệnh thay cả bộ, nên app không biết bộ đang dùng để sửa trên đó; danh sách trắng chỉ trả mã ảnh, nên người
xử không nhìn thấy ảnh mẫu nào đang được miễn.

Không thuộc đợt nào của TK 29. Không đụng cam kết nào ở TK 27.

## What Changes

- `GET /api/v1/ops/screening/categories/:categoryId/keywords` (master, staff của danh mục): bộ từ khoá đang dùng, đã bỏ
  dấu như lúc so. Danh mục không có → 404.
- Mỗi mục của `GET /api/v1/ops/screening/whitelist` (và kết quả thêm) có `url`: đường xem ảnh nguồn, `null` khi ảnh đó
  đã bị dọn khỏi kho — mục vẫn chặn ảnh trùng bằng dHash đã lưu.

**Cố ý không làm**: tải ảnh mẫu từ máy của staff (ảnh thêm vào danh sách trắng vẫn là ảnh đã có trong kho, thường là ảnh
của tin đang xử); lịch sử từ khoá.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `screening/image-checks`: danh sách trắng xem được kèm ảnh nguồn.
- `screening/rule-management`: thêm yêu cầu đọc / thay từ khoá suy ra danh mục.

## Impact

- **Code**: `screening` — repository `keywordsOf`, `lists.service` (`keywordsOf`, `url` của mục danh sách trắng), cổng
  media thêm `viewUrl` / `ownersOf`, một route đọc.
- **API**: một route đọc mới; một trường mới trong mục danh sách trắng. Không breaking.
- **Migration**: không.
