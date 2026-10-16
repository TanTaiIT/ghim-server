# Tasks

**Đã duyệt 16/10/2026** — người dùng chọn đề xuất của cả năm câu hỏi mở (design, ghi chú đầu file).

## 1. `review` phát quyết định

- [x] 1.1 Sự kiện `review.listing.decided` trong cùng transaction với nhật ký quyết định: cho đạt tin chờ duyệt, từ
      chối, gỡ, khôi phục — qua việc lẫn thao tác trực tiếp; không cho hậu kiểm đạt, gỡ khỏi nhóm, bác; xác minh test
      HTTP: quyết định 409 `LISTING_CHANGED` không để lại sự kiện

## 2. `notification`

- [x] 2.1 N45 cho `review.listing.decided`: người ký, câu nhắc không lý do, `detail` lý do + sửa rồi gửi lại; xác minh
      unit test ma trận và test HTTP (staff đạt / từ chối / gỡ / khôi phục, quản trị nhóm từ chối, hậu kiểm đạt không
      báo)
- [x] 2.2 N43, N44 cho `listing.state.changed` mũi tên `hold`, `recall`: câu của máy qua cổng mới; xác minh test HTTP
      (máy giữ vì ảnh trùng với `screening` thật — câu chung, không nhắc ảnh trùng; máy rút về) và unit test

## 3. Tài liệu và kiểm tra tích hợp

- [x] 3.1 TK 24 (luật báo người đăng) + PDF; `docs/VIEC-DANG-DO.md` bỏ dòng mục 1; CLAUDE.md (bên nghe, đoạn change
      đã archive)
- [x] 3.2 `typecheck`, `lint`, `format:check`, `test:unit`, `spec:validate`, `build`; test HTTP / DB trên CI
