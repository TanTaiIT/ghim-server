# Design

## Context

Động cơ: proposal.md — Why. Hiện trạng (archive `add-messaging`, `add-notifications`):

- Bảng tin nhắn chỉ có chữ (`body` NOT NULL, `flagged`); hội thoại là một cặp tin + người mua, cột "phía tôi" chọn theo
  vai mua / bán (`messaging.shared.ts`).
- Gửi tin = khoá dòng hội thoại, ghi tin nhắn, `touch` hoạt động và đếm tin của người mua (`buyer_messages` — dữ kiện
  "có người nhắn hỏi mua" của tin sạch), phát `messaging.message.sent` vào outbox trong cùng transaction.
- `notification` gộp tin nhắn theo khoá `conversation:<id>` (N47), đọc nội dung qua cổng `previewOf` của `messaging`.
- DTO hội thoại lấy tiêu đề tin qua cổng `listing.titles` và tên người kia qua `identity.accountSummaries`.

## Goals / Non-Goals

**Goals:**

- Đề nghị giá đi chung dòng thời gian, con trỏ, hạn lưu, bản ghi cho người xử báo cáo và thông báo với tin nhắn.
- "Một đề nghị đang chờ mỗi hội thoại" do DB giữ, kể cả khi hai lượt ghi chạy song song.
- DTO hội thoại đủ cho app vẽ đầu hội thoại và quyết định hiện nút trả giá, không gọi thêm route nào.

**Non-Goals:** xem proposal — Cố ý chưa làm. Không đụng `listing` ngoài một cổng đọc mới.

## Decisions

1. **Đề nghị giá là một loại tin nhắn, không phải bảng riêng.** Bảng riêng phải ghép hai luồng cho con trỏ, cho bản
   ghi gửi người xử báo cáo, cho hạn lưu, cho câu thông báo. Cột thêm vào `messages` (module `messaging` sở hữu):
   - enum `message_kind` (`text`, `offer`), cột `kind` NOT NULL DEFAULT `text`;
   - enum `offer_status` (`pending`, `accepted`, `declined`, `superseded`), cột `offer_status` NULL;
   - `offer_amount` BIGINT NULL (đồng, như giá tin), `offer_responded_at` TIMESTAMPTZ NULL;
   - CHECK viết tay `messages_kind_check`: `text` ⇒ ba cột đề nghị NULL và `body <> ''`; `offer` ⇒ `body = ''`,
     `offer_amount > 0`, `offer_status` NOT NULL, `offer_responded_at` NOT NULL đúng khi trạng thái là `accepted` hay
     `declined`;
   - partial unique viết tay `messages_one_pending_offer` ON `messages(conversation_id)` WHERE
     `offer_status = 'pending'`.

   `body` của đề nghị để rỗng thay vì cho NULL: mọi chỗ đọc chữ hiện có (bản ghi cho người xử, bộ lọc, câu thông báo)
   không phải học một nhánh NULL, còn CHECK chặn được tin nhắn chữ rỗng lọt qua đường đề nghị.

2. **Thay đề nghị cũ trong cùng transaction với dòng mới**, sau khi khoá dòng hội thoại như lượt gửi tin hiện có:
   `UPDATE … SET offer_status = 'superseded' WHERE conversation_id = $1 AND offer_status = 'pending'` rồi INSERT đề nghị
   mới. Khoá hội thoại đã xếp hàng hai lượt trả giá; partial unique là lớp cuối nếu có đường ghi nào quên khoá (test DB).
   Trả lời cũng khoá hội thoại rồi `UPDATE … WHERE id = $1 AND offer_status = 'pending'` — 0 dòng thì `409
OFFER_NOT_PENDING`, nên "chấp nhận đúng lúc trả giá mới" chỉ có một kết cục.
3. **Luật giá đọc từ tin lúc gửi, qua một cổng mới của `listing`: `offerTerms(listingId)`** → trạng thái hiển thị (đang
   hiển thị và không tạm ẩn), `negotiable`, `price`. Không chép giá vào hội thoại: người bán sửa giá thì lượt trả giá sau
   so với giá mới. Tin không còn (đã xoá) → `409 LISTING_NOT_LIVE`, cùng mã với đã bán / hết hạn: với người mua cả ba
   đều là "tin không còn bán". Thứ tự kiểm: tư cách (404) → master (403) → vai (`OFFER_BUYER_ONLY`) → bên kia đã rời
   (`CONVERSATION_CLOSED`) → chặn (`MESSAGING_BLOCKED`) → tin (`LISTING_NOT_LIVE`, `OFFERS_NOT_ACCEPTED`) → số tiền
   (`OFFER_ABOVE_PRICE`). Đúng thứ tự của lượt gửi tin hiện có, rồi mới tới luật riêng của đề nghị.
4. **Đề nghị tính như tin nhắn của người mua**: `touch` tăng `buyer_messages` và đẩy `last_activity_at` như tin chữ —
   tin sạch (TK 20) và thứ tự danh sách hội thoại không phải biết loại tin nhắn. Câu trả lời của người bán chỉ đẩy
   `last_activity_at` (hội thoại lên đầu danh sách của người mua, bỏ ẩn phía người mua như khi có tin mới) và không phải
   tin nhắn mới: số chưa đọc của hội thoại không đổi — người mua biết qua thông báo và realtime (mục 5).
5. **Sự kiện**: đề nghị mới phát `messaging.message.sent` như tin chữ (thông báo và realtime `message:new` dùng lại
   nguyên đường cũ; câu nhắc đọc `kind` qua `previewOf` để viết "Trả giá 12.000.000 ₫"). Câu trả lời phát sự kiện mới
   `messaging.offer.answered { conversationId, messageId, buyerId, status }`: `notification` viết dòng nhóm "tin nhắn"
   vào cùng khoá gộp `conversation:<id>` ("Người bán đã chấp nhận 12.000.000 ₫"), realtime gửi `message:updated {
conversationId, messageId }` cho người mua. Đề nghị bị thay không phát gì riêng.
6. **DTO**: tin nhắn thêm `kind` và `offer: { amount, status, respondedAt } | null`. Hội thoại thêm `listing.price`,
   `listing.negotiable`, `listing.state`, `listing.cover: { id, url } | null`, `counterpart.avatarUrl`, và cờ
   `canOffer` (= vai người mua ∧ `canSend` ∧ tin đang hiển thị, cho thương lượng, giá > 0). Dữ liệu tin lấy một lượt
   cho cả trang qua cổng `listing.conversationCards(ids)` (thay `titles`, cùng một lượt đọc); URL ảnh bìa ký như ảnh của
   tin ở route đọc tin. Tin `removed` không kèm ảnh bìa: ảnh của tin vi phạm không đi tiếp qua đường khác. Ảnh đại diện
   qua cổng `identity` trả URL đã ký theo lô — cùng cách `account.service` đang dựng `avatarUrl` cho hồ sơ.
7. **Route** (module `messaging`, chung preHandler "đã đăng nhập, đã xác nhận email" của route nhắn tin):
   `POST /me/conversations/{id}/offers { amount }` → `201` tin nhắn; `POST /me/conversations/{id}/offers/{messageId}/
accept` và `/decline` → `200` tin nhắn. `amount` dùng `priceSchema` (số nguyên đồng, như giá tin) với `min(1)`.

## Risks / Trade-offs

- [Người mua gửi dồn đề nghị để quấy người bán] → Mỗi đề nghị là một tin nhắn: gộp vào một dòng chưa đọc của hội thoại;
  người bán chặn được như với tin nhắn chữ. Chưa đặt hạn riêng — thêm con số khi có dữ liệu thật (cam kết 33).
- [App cũ chưa biết `kind: offer`] → App hiện chưa nối chat thật; trường thêm, không bỏ trường nào, nên client sinh từ
  tài liệu cũ vẫn đọc được tin nhắn chữ.
- [Giá tin đổi giữa lúc app hiện nút và lúc gửi] → Server so lúc gửi; app nhận `400 OFFER_ABOVE_PRICE` hay `409` và tải
  lại hội thoại.
- [Đổi cổng `titles` thành `conversationCards`] → `titles` chỉ có `messaging` dùng (kiểm lúc apply); đổi trong cùng
  change.

## Migration Plan

Một migration `add_price_offers`: hai enum, bốn cột (mặc định `text` cho mọi dòng cũ — không mất dữ liệu), CHECK và
partial unique viết tay trong SQL sinh ra. Đọc SQL trước khi áp (CLAUDE.md mục Migration). Production cần
`pnpm db:deploy:prod`. Rollback: revert code; cột thừa vô hại tới khi gỡ bằng migration mới.
