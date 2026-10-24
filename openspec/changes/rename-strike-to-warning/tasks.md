# Tasks

**Đã duyệt 24/10/2026** — cách gọi và phạm vi chốt 22/10/2026 (proposal, mục Why); bảng chữ ở design mục 1.

## 1. TK và tài liệu

- [x] 1.1 TK: đổi chữ theo bảng đối chiếu trong toàn văn bản; phần 21 "Cảnh cáo", phần 22 "Khiếu nại, ân xá, vi phạm
      nghiêm trọng"; từ điển thêm "Cảnh cáo — trong spec và code gọi là gậy / `strike`"; sinh lại PDF; xác minh
      `grep -c "gậy"` trong TK chỉ còn dòng từ điển và `pdftotext` của PDF có các tiêu đề mới
- [x] 1.2 CLAUDE.md: một dòng thuật ngữ (chữ hiển thị "cảnh cáo", spec / code "gậy" / `strike`); `docs/strikes.md`,
      `docs/realtime.md`: ghi chữ người dùng thấy cạnh thuật ngữ kỹ thuật; xác minh `pnpm run format:check`

## 2. Chữ do server trả ra

- [x] 2.1 Câu lỗi và nhãn theo bảng đối chiếu — `group` (tạm mất vai), `identity` (xoá tài khoản bị chặn, khoá vì vi
      phạm nghiêm trọng), `listing` (tin là hồ sơ vi phạm), `platform` (lý do treo quyền), `review` (câu lỗi bàn vận
      hành, lỗi kiểm tra "chọn loại cảnh cáo"), `screening` (nhãn trùng thiết bị), `trust` (khiếu nại, tạm khoá đăng
      tin); mã lỗi giữ nguyên; xác minh test HTTP kiểm câu đang có (sửa câu mong đợi) và delta
      `identity/account-deletion` ("đang có cảnh cáo nặng")
- [x] 2.2 N49–N58 theo bảng đối chiếu, N49 thêm câu "Đủ N điểm vi phạm thì tạm dừng đăng tin mới." (N từ
      `strike.postingLockFromPoints`); delta `notification/trust-notices` của change này (tên nhóm, ngưỡng); xác minh
      unit test ma trận và test HTTP thông báo
- [x] 2.3 Quét lại: không còn chữ "gậy" trong chuỗi người dùng hay bàn vận hành đọc (chỉ còn comment, Swagger, tên kỹ
      thuật); xác minh bằng grep có ghi danh sách ngoại lệ trong mô tả commit

## 3. `ghim-app`

- [x] 3.1 Nhãn bàn vận hành (`app/ops/**`) theo bảng đối chiếu; xác minh `npm run typecheck`, `npm run lint`,
      `npm test`
- [x] 3.2 Bài Trợ giúp "Cảnh cáo là gì?" (design mục 4); xác minh trên máy ảo: mở Trợ giúp thấy bài, mở một thông báo
      cảnh cáo thấy chữ mới

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm run spec:validate` (ghim-server); `npm run check` phần
      typecheck / lint / test (ghim-app); thử lại trên hai máy ảo: nhận cảnh cáo, khiếu nại, ân xá hiện chữ mới
