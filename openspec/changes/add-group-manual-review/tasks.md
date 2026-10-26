# Tasks

Duyệt 26/10/2026 (người dùng chọn "Chủ nhóm", "Theo luồng duyệt nhóm hiện có", "Vẫn về quản trị nhóm").

## 1. Server

- [x] 1.1 `schema.prisma`: enum `ScreeningCause` thêm `group_manual` (migration riêng `add_group_manual_review_enum`),
      `Group.manualReview`, `ReviewTask.groupManual` (`add_group_manual_review`)
- [x] 1.2 `group`: cài đặt `manualReview` (chủ nhóm, master), hồ sơ nhóm trả `manualReview`
- [x] 1.3 `listing`: lượt gửi mới / gửi lại (không phải từ "đang hiển thị") vào nhóm bật công tắc mang `groupManual` sang
      `screening`
- [x] 1.4 `screening`: lượt máy cho qua thành giữ `group_manual`; câu chờ của nhóm; không tính "bị giữ nhiều"
- [x] 1.5 `review`: cờ `groupManual` trên việc, chuỗi của nhóm cho việc đó, cho đạt không cần nhận định về máy, DTO
- [x] 1.6 Test: `decide.calc`, `review-route.calc`, HTTP `group-manual-review.http.test.ts`

## 2. Tài liệu

- [x] 2.1 TK 9, 13, 16, 17 + PDF; CLAUDE.md thứ tự change

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; công tắc "Duyệt tay mọi tin" trong cài đặt nhóm (chủ nhóm); dòng nhắc trên trang nhóm và màn
      đăng tin khi nhóm bật; bàn duyệt ẩn "máy đúng / quá tay" với việc `groupManual`, ghi "Nhóm duyệt tay"
- [x] 3.2 Thử trên máy ảo: chủ nhóm bật công tắc, thành viên thấy dòng nhắc, tin T3 gửi vào nhóm → chờ duyệt, chủ nhóm
      cho đạt không bị hỏi nhận định về máy → tin hiện

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-group-manual-review` sau khi gộp vào `main`.
