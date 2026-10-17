# Design

> **Đã duyệt 17/10/2026.** Người dùng giao tech lead chọn phương án ("tiến hành add-messaging luôn"), theo tiêu chí
> chạy ổn với lượng lớn người dùng. Mười một câu hỏi mở của proposal được trả lời ở mục 10; kênh realtime chốt ở mục 7.

## Context

- Người mua hỏi người bán ngay trên một tin (TK 24). Đã có: tin và luật "ai thấy một tin" (`listing/visibility`,
  `canView` + bề mặt `link`), mức tin cậy và bảng con số hạn mức (`quota.newConversationsPerDayT0..T3` đã khai, chưa
  code nào đọc), bộ lọc cụm từ cấm trong bộ nhớ của `screening` (`rules.current().matcher`), báo cáo về tin / về người
  với việc hàng 1 của `review`, kênh socket.io chỉ chiều server → app (`common/realtime`), cổng `BuyerInterest` của
  `trust` đang là bản tạm `noBuyerInterest`.
- Module `messaging` chưa có. CLAUDE.md luật 11: chỉ `messaging` ghi hội thoại, tin nhắn, chặn; báo cáo vẫn do
  `review` ghi.

## Goals / Non-Goals

**Goals:** mở hội thoại từ tin (một tin + một người mua = một hội thoại), gửi / đọc tin nhắn, hạn mức hội thoại mới mỗi
ngày theo mức, bộ lọc cụm từ cấm cho tin nhắn, chặn người (hai chiều, không lộ ai chặn), xoá hội thoại / xoá tài khoản
chỉ ẩn phía mình, báo cáo từ hội thoại kèm bản ghi cho người xử, dữ kiện "có người nhắn hỏi mua" cho tin sạch, báo
hiệu realtime tin nhắn mới.

**Non-Goals:** thông báo hộp thư / đẩy điện thoại khi có tin nhắn (`add-notifications`), xoá hẳn và tạm giữ bằng
chứng (`add-data-retention`), ảnh trong tin nhắn, chỉnh sửa / thu hồi tin nhắn, trạng thái "đang gõ".

## Decisions

### 1. Dữ liệu (`messaging` sở hữu)

- `conversations`: `id`, `listing_id` (FK `listings`, cascade), `seller_id`, `buyer_id` (FK `accounts`, cascade),
  `created_at`, `last_activity_at` (= `created_at` lúc mở, đổi theo mỗi tin nhắn — khoá con trỏ của danh sách),
  `last_message_at?`, `buyer_messages` (số tin nhắn đã tới của người mua — dữ kiện "có người nhắn hỏi mua"),
  `buyer_hidden_at?`, `seller_hidden_at?` (xoá phía mình), `buyer_read_at?`, `seller_read_at?`. Unique
  `(listing_id, buyer_id)` — hai lượt mở cùng lúc chạm unique, lượt thua đọc lại. CHECK tay
  `conversations_parties_check: buyer_id <> seller_id`. Index `(buyer_id, last_activity_at)`,
  `(seller_id, last_activity_at)`, `(listing_id)`.
- `messages`: `id`, `conversation_id` (FK, cascade), `sender_id` (FK `accounts`, cascade), `body` (≤ 2000 ký tự),
  `flagged` (trúng cụm mơ hồ đang bật — chỉ người xử thấy), `created_at`. Index `(conversation_id, created_at, id)`.
- `account_blocks`: `blocker_id`, `blocked_id` (FK `accounts`, cascade), `created_at`; PK `(blocker_id, blocked_id)`,
  index `(blocked_id)`, CHECK tay `account_blocks_self_check: blocker_id <> blocked_id`.
- `report_entries.conversation_id?` (`review` sở hữu): lượt báo gửi từ hội thoại trỏ tới hội thoại làm bằng chứng —
  đặt trên lượt báo, không trên báo cáo, vì báo cáo gộp nhiều người báo từ nhiều hội thoại khác nhau. Index.
- Migration không mất dữ liệu; hai CHECK viết tay (ghi `///` trên model). Test DB: unique cặp, hai CHECK.

### 2. Mở hội thoại

- `POST /listings/{listingId}/conversation` (đăng nhập + email đã xác nhận; master → 403 `FORBIDDEN`). Tin lấy qua cổng
  `listings.reportTarget(actor, id)` (đã có: `canView` bề mặt `link`, người đăng luôn thấy tin mình): không có → 404;
  chủ tin là mình → 403 `CANNOT_MESSAGE_OWN_LISTING`; đã có hội thoại của cặp này → 200 trả hội thoại cũ (bỏ ẩn
  phía mình nếu đã xoá) — **trước** mọi kiểm tra trạng thái tin, vì hội thoại cũ không bị cắt; `state ≠ live` → 409
  `LISTING_NOT_LIVE`; đang tạm ẩn (`visible = false` dù `live`) → 404 (tin tạm ẩn người ngoài không thấy); chặn giữa
  hai người → 403 `MESSAGING_BLOCKED`.
- Hạn mức: trong transaction, khoá advisory theo người mở (`messaging-open:<buyerId>`), đếm hội thoại đã mở từ 00:00
  giờ Việt Nam hôm nay (`startOfDayVN`), so với `quota.newConversationsPerDay<T>` của mức hiện tại (`trust.tierOf`);
  đủ → 429 `NEW_CONVERSATION_LIMIT` kèm `details.retryAt` = 00:00 ngày mai. Lượt bị từ chối không tạo dòng nên
  không tính; người bán không bị trừ.
- Phát `messaging.conversation.opened { conversationId, listingId, buyerId, sellerId }` cùng transaction.

### 3. Gửi, đọc

- `POST /me/conversations/{id}/messages { body }` — hai bên; người ngoài 404. Thứ tự kiểm: là bên của hội thoại →
  bên kia còn tài khoản (đã xoá → 409 `CONVERSATION_CLOSED`) → không bị chặn (403 `MESSAGING_BLOCKED`) → bộ lọc cụm từ
  cấm. Ghi tin nhắn, cập nhật `last_activity_at`, `last_message_at`, `buyer_messages` (nếu người gửi là người mua),
  **bỏ ẩn phía người nhận** (hội thoại hiện lại với đủ lịch sử — mục 10 câu 5). Phát `messaging.message.sent
{ conversationId, messageId, listingId, senderId, recipientId }` cùng transaction — không mang nội dung.
- `GET /me/conversations` (con trỏ theo `last_activity_at`, bỏ hội thoại đã ẩn phía mình): mỗi dòng có tin, bên kia
  (`displayName` null + `gone: true` khi đã xoá tài khoản), tin nhắn cuối, `unreadCount` (tin của bên kia sau
  `*_read_at` của mình), `locked` (có chặn — cùng một cờ cho cả hai bên, không nêu ai chặn), `canSend`.
- `GET /me/conversations/{id}`; `GET /me/conversations/{id}/messages` (con trỏ, mới trước); `POST
/me/conversations/{id}/read` (204, ghi `*_read_at`); `DELETE /me/conversations/{id}` (204, ghi `*_hidden_at`).
- Hội thoại đã mở không hỏi lại trạng thái tin: tin đã bán, hết hạn, bị gỡ, tạm ẩn, người đăng xoá tin, một bên rời
  nhóm — đều gửi tiếp (TK 24; mục 10 câu 7). Tiêu đề tin trong DTO lấy qua `listings.titles` — tin đã xoá thì `null`.

### 4. Bộ lọc cụm từ cấm

- `screening` thêm cổng `phraseVerdict(text)` cạnh `hiddenNames`: cùng `matcher` của phiên bản luật hiện hành;
  `blocked` = trúng cụm mức chắc đang bật; `flagged` = trúng cụm mơ hồ đang bật; cụm chạy thử không đổi gì (spec
  banned-phrases).
- `blocked` → 409 `MESSAGE_NOT_ALLOWED` với câu chung "Tin nhắn có nội dung không được phép trên Ghim", không lưu, không
  nêu cụm. `flagged` → gửi như thường, dòng tin nhắn mang `flagged = true` cho người xử thấy trong bản ghi. Không
  gọi `trust`, không sinh việc: cam kết 5.

### 5. Chặn

- `POST /me/blocks { accountId }` (204, lặp lại vô hại; chặn mình → 400 `VALIDATION_ERROR`; không có tài khoản hay đã
  xoá → 404), `DELETE /me/blocks/{accountId}` (204), `GET /me/blocks` (phân trang: `accountId`, `displayName`,
  `blockedAt`). Có gỡ chặn và danh sách (mục 10 câu 4) — không có thì người chặn nhầm không tự sửa được.
- "Bị chặn" = tồn tại dòng theo **một trong hai chiều**. Mở mới và gửi tin → 403 `MESSAGING_BLOCKED` cùng câu "Hội thoại
  này không nhận tin nhắn" cho cả hai; DTO cả hai thấy `locked: true`. Đọc tin cũ vẫn được. Không phát sự kiện nào về
  việc chặn (người bị chặn không được báo).

### 6. Xoá

- Xoá hội thoại = ghi `*_hidden_at` phía mình. Bên kia nhắn tiếp → bỏ ẩn phía mình (mục 3). Bấm nhắn lại từ tin → bỏ
  ẩn, 200, không tính hạn mức.
- `identity.account.deleted` → `messaging` ghi `*_hidden_at` cho mọi hội thoại phía người đó (chạy lại vô hại). Bên
  kia vẫn đọc; gửi vào hội thoại có bên kia đã xoá → 409 `CONVERSATION_CLOSED` (mục 10 câu 6).

### 7. Realtime

- Dùng kênh socket.io đã có (`Realtime.emitToUser`), không thêm thư viện. Bên nghe của chính `messaging` cho
  `messaging.message.sent` phát `message:new { conversationId, messageId }` tới người nhận — chỉ báo hiệu, app tải lại
  qua HTTP (như `notification:new`). Tin nhắn của hội thoại đang mở, hộp thư, đẩy điện thoại là `add-notifications`.

### 8. Báo cáo từ hội thoại

- `POST /me/conversations/{id}/reports { category }` — bên của hội thoại; người ngoài 404; chặn không cản. `messaging`
  kiểm tư cách rồi gọi cổng `review.reportFromConversation(actor, { accountId: bên kia, category, conversationId },
deviceId)` — `review` vẫn là nơi duy nhất ghi báo cáo. Báo cáo là **báo cáo về người** (mục 10 câu 10): lượt báo
  mang `conversation_id`; gộp theo luật báo cáo về người; đi `safety_staff` → master; không tính ngưỡng tạm ẩn tin.
- Chi tiết việc (`GET /ops/review/tasks/{id}`, cả việc về tin lẫn về người) thêm `conversations[]`: bản ghi của mọi
  hội thoại mà lượt báo của báo cáo **đang mở** trỏ tới — qua cổng `messaging.transcripts(ids)` (tin, hai bên, tin nhắn
  theo thứ tự gửi kèm `flagged`), không phụ thuộc hai bên đã xoá. `relatedReportSchema.entries[].conversationId`.
- Master không đọc hội thoại nào khác (mục 10 câu 9).

### 9. Dữ kiện tin sạch

- `trust.buyerInterest.hasInquiry(listingId)` nối muộn sang `messaging.hasInquiry`: có hội thoại của tin với
  `buyer_messages ≥ 1` mà người mua không dùng chung máy với người bán (`identity.sharedDeviceAccounts(sellerId,
since 180 ngày)` — TK 20 "người hỏi mua dùng chung máy với người bán không tính"). Mở hội thoại mà chưa nhắn gì
  không tính; tin nhắn bị chặn vì cụm cấm không được lưu nên không tính (mục 10 câu 11).

### 10. Trả lời câu hỏi mở của proposal

1. Cụm cấm trong tin nhắn: mức chắc đang bật → không gửi (409 `MESSAGE_NOT_ALLOWED`, câu chung); mơ hồ đang bật → tới
   người nhận, đánh dấu cho người xử; chạy thử → như không có. Không giữ chờ ai (TK 16 không có hàng cho tin nhắn).
2. "Mỗi ngày" = ngày lịch giờ Việt Nam; 429 kèm 00:00 ngày mai.
3. Hai chỗ gọi đồng bộ thêm: `trust.tierOf` (đọc mức đã tính) và `screening.phraseVerdict` (bộ so trong bộ nhớ) — chỉ
   đọc, không ghi chéo; sao chép mức và danh sách cụm vào `messaging` qua sự kiện là nhân đôi trạng thái mà không
   bớt được lượt gọi nào. Ghi vào CLAUDE.md luật 12.
4. Có gỡ chặn và danh sách người đã chặn. Không giấu hẳn: hai bên thấy cùng cờ "không nhận tin nhắn"; giả vờ gửi được
   sẽ làm người bị chặn chờ hồi âm mãi — tệ hơn cho cả hai.
5. Hội thoại đã xoá phía mình mà có tin mới, hay mình nhắn lại từ tin: hiện lại với đủ lịch sử, không tính hạn mức.
6. Bên kia đã xoá tài khoản: đọc được, không gửi được (409 `CONVERSATION_CLOSED`), tên hiện "người dùng đã rời"
   (`displayName: null`, `gone: true`). Bên kia bị khoá: vẫn gửi được — họ đọc sau khi mở khoá.
7. Tin bị gỡ, tạm ẩn, bị xoá, bên kia bị khoá: hội thoại đã mở đều tiếp tục; chỉ lượt mở mới xét tin.
8. Chỉ chữ, 1–2000 ký tự; có mốc đã đọc theo bên (`unreadCount`, `POST …/read`). Ảnh để sau (cần kiểm ảnh).
9. Master không đọc mọi hội thoại — chỉ bản ghi đi kèm báo cáo đang mở, trên màn xử việc.
10. Báo cáo từ hội thoại = báo cáo về người (hành vi trong hội thoại là của người, tin có thể đã bán), staff việc an
    toàn / master xử, không tính ngưỡng tạm ẩn; lượt báo mang mã hội thoại.
11. "Có người nhắn hỏi mua" tính khi người mua đã gửi được ít nhất một tin nhắn; tin bị chặn không tính; người mua
    chung máy với người bán không tính.

## Risks / Trade-offs

- Dòng hội thoại giữ các cột "phía tôi" theo vai mua / bán thay vì bảng thành viên riêng: ít join, nhưng mọi chỗ đọc
  phải chọn đúng cột theo vai — gom vào một hàm `sideOf(conversation, accountId)`.
- `unreadCount` đếm bằng một truy vấn gộp theo trang (≤ 20 hội thoại) — đủ cho app; không lưu bộ đếm để khỏi lệch.
- Bản ghi cho người xử cắt ở 500 tin nhắn gần nhất; hội thoại dài hơn hiếm và vẫn đủ bằng chứng.
