# Tasks

## 1. Dữ liệu

- [x] 1.1 `schema.prisma`: enum `message_kind`, `offer_status`; cột `kind`, `offer_amount`, `offer_status`,
      `offer_responded_at` của `messages` (design mục 1). Migration `add_price_offers` thêm tay CHECK
      `messages_kind_check` và partial unique `messages_one_pending_offer`; đọc SQL sinh ra trước khi áp
- [x] 1.2 Test DB: tin nhắn chữ rỗng bị CHECK chặn; đề nghị thiếu số tiền / số tiền 0 / có chữ bị chặn; hai đề nghị
      `pending` cùng hội thoại bị partial unique chặn; trả lời không có `offer_responded_at` bị chặn. Xác minh:
      `pnpm db:drift` không lệch

## 2. Trả giá và trả lời

- [x] 2.1 Luật giá đọc qua cổng `listing.conversationCards` (trạng thái hiển thị, `negotiable`, `price` — design mục 3)
      và service trả giá trong `messaging`:
      thứ tự kiểm của design mục 3, thay đề nghị đang chờ trong transaction (mục 2), `touch` tính như tin của người mua
      (mục 4), phát `messaging.message.sent`
- [x] 2.2 Service trả lời: khoá hội thoại, chỉ người bán, chỉ đề nghị `pending` của đúng hội thoại, tin còn hiển thị;
      phát `messaging.offer.answered`
- [x] 2.3 Route `POST /me/conversations/{id}/offers`, `…/offers/{messageId}/accept`, `…/decline`; DTO tin nhắn có
      `kind`, `offer` (design mục 6, 7); tài liệu OpenAPI khai Bearer bắt buộc
- [x] 2.4 Test HTTP mọi scenario của `messaging/price-offers` (trả giá, giá ngoài khoảng, tin không thương lượng / cho
      tặng / đã bán / hết hạn / tạm ẩn / đã xoá, một đề nghị đang chờ, hai đề nghị cùng lúc, trả lời mọi nhánh, chấp nhận
      đúng lúc trả giá mới, chấp nhận chỉ ghi nhận, người ngoài, chặn, bên kia đã rời, hạn mức, tin sạch)

## 3. Thẻ hội thoại

- [x] 3.1 Cổng `listing.conversationCards` (`titles` giữ cho `notification`) (tiêu đề, giá, `negotiable`, trạng thái, ảnh bìa đã ký — tin
      `removed` không có ảnh bìa, tin đã xoá thì cả ba để trống); cổng `identity` trả URL ảnh đại diện theo lô
- [x] 3.2 DTO hội thoại thêm `listing.price`, `listing.negotiable`, `listing.state`, `listing.cover`,
      `counterpart.avatarUrl`, `canOffer` (design mục 6)
- [x] 3.3 Test HTTP mọi scenario của "Hội thoại cho biết tin và người kia"; test cũ của danh sách hội thoại vẫn xanh

## 4. Thông báo và realtime

- [x] 4.1 `notification` (bảng câu tin nhắn): câu nhắc của đề nghị nêu số tiền; sự kiện `messaging.offer.answered` viết
      dòng nhóm "tin nhắn" vào khoá gộp của hội thoại cho người mua; người gửi không nhận gì
- [x] 4.2 Bên nghe realtime: `message:updated { conversationId, messageId }` cho người mua khi đề nghị được trả lời
- [x] 4.3 Test mọi scenario của "Báo đề nghị giá và câu trả lời" (người bán nhận, người mua nhận, đề nghị bị thay không
      báo, realtime)

## 5. Tài liệu

- [x] 5.1 `docs/messaging.md`: route trả giá, trường mới của hội thoại và tin nhắn, mã lỗi mới, sự kiện
      `message:updated`; `docs/realtime.md` thêm `message:updated`
- [x] 5.2 CLAUDE.md: trạng thái module `messaging`; TK 24 đã thêm luật trả giá trong lượt soạn change này — kiểm khớp
      với spec lần cuối

## 6. Kiểm tra tích hợp

- [x] 6.1 `pnpm run check` (gồm test DB, Docker ở máy này), `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`

## Workflow follow-up

- Archive trước `add-team-conversations` (change đó sửa requirement mà change này thêm).
- Repo `ghim-app`: `npm run api:sync`, nối màn chat và nút trả giá.
