# Tasks

Duyệt 25/10/2026 (người dùng chọn "Tối đa 4 ảnh / tin").

## 1. Server

- [x] 1.1 `schema.prisma`: enum `ImageOwnerKind` thêm `conversation` (migration riêng `add_message_images_enum`),
      `Message.imageIds` + CHECK viết lại (`add_message_images`)
- [x] 1.2 `media`: loại chủ `conversation` qua cổng `ImageOwnership`; `attach` chế độ thêm (không bỏ ảnh cũ, ảnh đã gắn không
      gắn lại); lượt đối chiếu dọn ảnh của mọi loại chủ có cổng
- [x] 1.3 `screening`: cổng `messageImageIssue` — luật chất lượng đang bật, ảnh hỏng luôn chặn, câu sửa của tin đăng
- [x] 1.4 `messaging`: gửi ảnh, DTO `images`, bản ghi cho người xử, hàng hỗ trợ; staff trả lời chỉ chữ; cổng chủ ảnh; hội
      thoại xoá hẳn kéo ảnh theo
- [x] 1.5 `notification`: tin chỉ có ảnh nhắc "Đã gửi N ảnh"
- [x] 1.6 Test HTTP mọi scenario của `messaging/message-images` (`messaging-images.http.test.ts`)

## 2. Tài liệu

- [x] 2.1 TK 24 (tin nhắn có ảnh), TK 25 (chủ ảnh) + PDF; `docs/VIEC-DANG-DO.md`; CLAUDE.md thứ tự change

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; khung chat chọn tối đa 4 ảnh, tải với chủ là hội thoại, bong bóng hiện ảnh, bấm xem lớn
- [x] 3.2 Thử trên máy ảo: người mua gửi ảnh kèm chữ, người bán thấy và gửi riêng ảnh lại

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-message-images` sau khi gộp vào `main`, sau `add-help-content`.
