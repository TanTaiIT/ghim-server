# Tasks

**Đã duyệt 16/10/2026** — người dùng chọn hướng (a) "người đăng trước thắng" (design, ghi chú đầu file).

## 1. Máy duyệt

- [x] 1.1 `duplicateCandidates` nhận `before: { checkedAt, imageId }`: chỉ ứng viên kiểm xong trước, cùng mili giây thì
      mã ảnh nhỏ hơn; xác minh test DB: ứng viên trước / sau / cùng mili giây hai phía
- [x] 1.2 `conclusion.ts` (cổng của máy) và `facts.service.ts` (`duplicateMatches` cho người duyệt) truyền mốc của ảnh
      đang xét; xác minh test HTTP "Chủ ảnh sửa tin sau khi bị chép" (sharp và kho thật); test sẵn có dựng dấu ảnh
      cho mốc rõ (`markChecked` tăng dần theo thứ tự gọi, ảnh của tài khoản kia kiểm trước ở `review-desk`,
      `review-ports`)

## 2. Chạy khói, tài liệu, kiểm tra tích hợp

- [x] 2.1 `pnpm smoke:posting`: A sửa giá sau khi B chép ảnh vẫn qua — chạy trên dev 16/10/2026, 21 điều đúng
- [x] 2.2 `docs/VIEC-DANG-DO.md` (bỏ dòng chờ quyết ở mục 1, cập nhật mục 7), CLAUDE.md (đoạn change đã archive)
- [x] 2.3 `typecheck`, `lint`, `format:check`, `test:unit`, `spec:validate`, `build`; test HTTP / DB trên CI
