# Proposal

## Why

Chat của Ghim chỉ nhận chữ (design add-messaging mục 10, câu 8), nên người mua không gửi được ảnh vết xước để hỏi, người
bán không gửi được ảnh chụp thêm, người dùng không gửi được ảnh màn hình lỗi cho Hỗ trợ Ghim. Người dùng chốt ngày
25/10/2026: **tối đa 4 ảnh một tin nhắn**, trong hội thoại về một tin và hội thoại với đội (hỗ trợ, quản trị nhóm); ảnh qua
luật chất lượng như ảnh tin, không kiểm nội dung (quyết định 24/10/2026); chỉ hai bên thấy, người xử thấy khi hội thoại bị
báo; ảnh theo hạn lưu của tin nhắn.

Không thuộc đợt nào của TK 29. Không đụng cam kết nào ở TK 27.

## What Changes

- Ảnh có thêm loại chủ `conversation`: người ở trong hội thoại (qua app) xin tải ảnh cho hội thoại đó như xin tải ảnh cho
  tin của mình. Người ngoài, staff trên bàn vận hành nhận 404 như chủ không tồn tại.
- `POST /api/v1/me/conversations/:id/messages` nhận `{ body?, imageIds? }`: chữ, tối đa 4 ảnh, hay cả hai; không chữ không
  ảnh → 400. Ảnh phải do chính người gửi tải cho đúng hội thoại này và chưa gửi lần nào.
- Ảnh qua cùng luật chất lượng của ảnh tin (luật đang bật, ngưỡng của bảng con số), đo ngay trong lượt gửi: tin nhắn không
  chờ người, nên ảnh trúng là không gửi — 400 `MESSAGE_IMAGE_REJECTED` với câu sửa của tin đăng ("Ảnh 2 quá nhỏ…"). Ảnh hỏng
  luôn bị chặn. Không so trùng, không xét nội dung.
- Mọi chỗ trả tin nhắn có `images: [{ id, url }]`: hai bên, hàng hỗ trợ trên bàn vận hành, bản ghi hội thoại cho người xử.
  Tin chỉ có ảnh nhắc bằng "Đã gửi N ảnh".
- Hội thoại bị xoá hẳn (hạn lưu, nhóm đóng) kéo ảnh theo; lượt đối chiếu hằng tháng dọn ảnh của hội thoại đã mất.

**Cố ý không làm**: staff hỗ trợ gửi ảnh từ bàn vận hành (trả lời chỉ bằng chữ); ảnh trong đề nghị giá; video, tệp; xoá một
tin nhắn hay một ảnh đã gửi; kiểm nội dung ảnh (quyết định 24/10/2026).

## Capabilities

### New Capabilities

- `messaging/message-images`: gửi ảnh trong hội thoại — ai gửi, luật chất lượng, ai thấy, hạn lưu.

### Modified Capabilities

- `messaging/conversations`: tin nhắn là chữ, ảnh hay cả hai; tin rỗng là không chữ không ảnh.
- `media/image-storage`: hội thoại là một loại chủ ảnh.
- `media/image-cleanup`: hội thoại xoá hẳn thì ảnh đi theo.

## Impact

- **Code**: `media` (loại chủ mới, gắn thêm ảnh không bỏ ảnh cũ, đối chiếu theo mọi loại chủ có cổng), `messaging` (gửi
  ảnh, DTO, bản ghi, cổng chủ ảnh, xoá ảnh theo hội thoại), `screening` (cổng chất lượng ảnh tin nhắn), `notification`
  (câu nhắc tin chỉ có ảnh), `app.ts`.
- **API**: thân gửi tin nhắn thêm `imageIds`, `body` thành tuỳ chọn; tin nhắn và bản ghi thêm `images`. Không breaking cho
  client gửi `{ body }` như cũ.
- **Migration**: hai file — thêm giá trị enum riêng một file; cột `messages.image_ids` và CHECK viết lại. Không mất dữ liệu.
- **Tài liệu**: TK 24 (tin nhắn có ảnh), TK 25 (chủ ảnh); `docs/VIEC-DANG-DO.md` bỏ dòng "Ảnh trong tin nhắn"; CLAUDE.md
  thứ tự change.
