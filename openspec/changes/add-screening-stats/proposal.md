# Proposal

## Why

TK 25 giữ kết quả chấm điểm của máy 180 ngày rồi "gộp thành số liệu thống kê"; `add-data-retention` đã gộp vào bảng
`screening_run_stats`, và bản thô còn trong `screening_runs` — nhưng không route nào đọc, nên master không biết máy đang
cho qua bao nhiêu, giữ bao nhiêu, luật nào trúng nhiều (`docs/VIEC-DANG-DO.md` mục 8). Người dùng chốt ngày 25/10/2026:
**master** xem **theo tháng**, 12 tháng gần nhất — số lượt, tỉ lệ cho qua / giữ, dải điểm, 5 luật trúng nhiều nhất.

Không thuộc đợt nào của TK 29. Không đụng cam kết nào ở TK 27; số liệu không lộ gì về từng tin hay từng người (nguyên tắc
8 — cài đặt của máy không công khai, nhưng master vốn được xem).

## What Changes

- `GET /api/v1/ops/screening/stats?months=` (master, mặc định 12, tối đa 24): mỗi tháng số lượt đã kết luận, chia theo
  kết quả (cho qua đầy đủ, cho qua hạn chế, giữ cho người) và dải điểm (Thấp, Vừa, Cao); tháng không có lượt là số 0. Kèm 5
  luật trúng nhiều lượt nhất trong cả khoảng, có tên luật.
- Cộng hai nguồn: lượt còn chi tiết và số đã gộp khi hết hạn lưu — tháng tính như lúc gộp, nên hai nguồn khớp ở ranh giới.

**Cố ý không làm**: số theo ngày (đã có `GET /ops/stats/daily` cho bảng tổng quan); theo danh mục; cho staff xem; tỉ lệ
"máy đúng / máy quá tay" của người duyệt (thuộc `review`).

## Capabilities

### New Capabilities

- `screening/run-stats`: số liệu máy theo tháng cho master.

### Modified Capabilities

_(không có)_

## Impact

- **Code**: `screening` — hai truy vấn ở repository, `ops/stats.service.ts`, route trong `ops/ops.routes.ts`.
- **API**: thêm một route đọc. Không breaking.
- **Migration**: không.
- **Tài liệu**: TK 14 thêm đoạn "Số liệu của máy"; CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`.
- **Client** `ghim-app`: màn "Số liệu máy duyệt" ở mục "Thêm" của bàn vận hành, chỉ master.
