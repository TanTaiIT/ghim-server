# Proposal

## Why

Màn "Trợ giúp & hỗ trợ" của `ghim-app` là dữ liệu mẫu cuối cùng còn lại trong app: 13 câu hỏi / đáp viết cứng, có câu sai
so với TK (hứa "tích xanh" khi xác minh giấy tờ — TK 7 chỉ lưu kết quả; giới thiệu đẩy tin — TK 29 còn hoãn). Server không
có chỗ giữ nội dung trợ giúp. Người dùng chốt ngày 25/10/2026: **master** soạn chủ đề và câu hỏi / đáp trên bàn vận hành,
ai cũng đọc được (kể cả khách), khởi tạo sẵn bằng nội dung đang có trong app.

Không thuộc đợt nào của TK 29. Không đụng cam kết nào ở TK 27.

## What Changes

- `GET /api/v1/help/topics` (không cần đăng nhập): các chủ đề theo thứ tự master xếp, mỗi chủ đề có tên và danh sách câu
  hỏi / đáp.
- Master: `POST /api/v1/ops/help/topics` (thêm, đứng cuối), `PUT /api/v1/ops/help/topics/:id` (sửa cả chủ đề),
  `DELETE /api/v1/ops/help/topics/:id`, `PUT /api/v1/ops/help/order` (sắp lại bằng mã mọi chủ đề; danh sách vừa đổi → 409).
  Mỗi lượt ghi vào nhật ký vận hành.
- Migration nạp sẵn bốn chủ đề từ dữ liệu mẫu của app, sửa cho khớp TK: phần lớn tin máy cho qua ngay (TK 13), xác minh
  giấy tờ không cho huy hiệu nào (TK 7); bỏ chủ đề "Đẩy tin & gói" (TK 29 hoãn).

**Cố ý không làm**: staff soạn trợ giúp; tìm trong trợ giúp; nhiều ngôn ngữ; lịch sử phiên bản nội dung (nhật ký vận hành
ghi ai sửa lúc nào, không giữ bản cũ).

## Capabilities

### New Capabilities

- `platform/help-content`: nội dung trợ giúp — đọc công khai, master soạn.

### Modified Capabilities

_(không có)_

## Impact

- **Code**: `platform` — bảng `help_topics`, repository, cụm `help/` (service, route), nối trong `platform.module.ts`.
- **API**: một route đọc công khai, bốn route master. Không breaking.
- **Migration**: một bảng mới, câu `INSERT` viết tay nạp nội dung khởi đầu. Không mất dữ liệu.
- **Tài liệu**: TK 6 (bảng quyền), TK 24 (đoạn "Trợ giúp"); CLAUDE.md thứ tự change.
- **Client** `ghim-app`: màn trợ giúp đọc server (bỏ `mock.ts`, `mock-data.ts`); bàn vận hành có màn "Trợ giúp" cho master.
