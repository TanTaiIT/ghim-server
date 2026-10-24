# Proposal

## Why

Trang chủ bàn vận hành của `ghim-app` có ô "Hôm nay" đang ghi "Chưa có API": master muốn thấy mỗi ngày có bao nhiêu
tin gửi, bao nhiêu tin lên bảng, bao nhiêu người mới, máy giữ bao nhiêu và người duyệt từ chối bao nhiêu — con số để
biết sàn hôm nay ra sao, không phải để xử việc (`docs/VIEC-DANG-DO.md` mục 8). Server hiện chỉ có bảng tồn việc và tỉ
lệ bị lật (`/ops/review/stats/*`). Người dùng chốt làm ngày 24/10/2026 ("làm việc tiếp theo").

## What Changes

- `GET /api/v1/ops/stats/daily?days=N` (master; `days` 1–90, mặc định 7): một dòng mỗi ngày theo **giờ Việt Nam**,
  hôm nay trước và tính cả hôm nay đang dở — tài khoản tạo mới, lượt gửi máy duyệt, tin lên bảng lần đầu, kết quả máy
  (đầy đủ / hạn chế / giữ), quyết định của người về tin (đạt / từ chối — từ chối gồm từ chối, gỡ, vi phạm). Ngày không
  có gì là dòng toàn 0.
- `ops` không đọc bảng của module khác: mỗi module mở một cổng đếm theo ngày (`identity`, `listing`, `screening`,
  `review`), `ops` ghép lại (TK 29 đợt 7, CLAUDE.md luật 12).
- `ghim-app`: ô "Hôm nay" của trang chủ bàn vận hành hiện số hôm nay và bảng 7 ngày; staff vẫn thấy câu "chỉ master".

**Cố ý không làm**: doanh thu đẩy tin (chưa có gói đẩy tin — `prepare-promotions` mới giữ chỗ); số theo danh mục
(lượt máy không lưu danh mục); lưu sẵn số liệu (master hỏi thưa, tính lúc hỏi như `/ops/review/stats/*`).

## Capabilities

### New Capabilities

- `ops/daily-stats`: bảng số theo ngày cho master.

### Modified Capabilities

_(không có)_

## Impact

- **Code**: `ops` (service, calc, schema, route), cổng đếm ở `identity`, `listing`, `screening`, `review`,
  `common/time` (khoá ngày Việt Nam).
- **API**: thêm `GET /ops/stats/daily`. Không breaking.
- **Migration**: không.
- **Tài liệu**: `docs/VIEC-DANG-DO.md` mục 8, CLAUDE.md thứ tự change.
- **Client** `ghim-app`: `npm run api:sync`, ô "Hôm nay" ở trang chủ bàn vận hành.
