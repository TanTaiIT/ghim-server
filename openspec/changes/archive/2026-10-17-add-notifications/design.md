# Design

> **Đã duyệt 17/10/2026.** Người dùng chọn phương án đẩy: **Expo Push Service qua HTTP, làm cả ba phần**, tài khoản
> Expo / EAS và khoá FCM, APNs tạo sau khi app sẵn sàng — server chỉ gửi khi có token đăng ký. Ba câu hỏi mở còn lại
> của proposal trả lời ở mục 7.

## Context

- Hộp thư, chín nhóm, tắt tiếng, realtime, cờ `alert` tính lúc ghi — đã có (`add-notification-core`); thiết kế push
  giữ sẵn ở design mục 3 của change đó. Thông báo "tin mới trong nhóm" (N31) đã làm ở `add-listings`
  (`notification.listing-matrix.ts`, test `notification-listing.db.test.ts`); delta `group-announcements` của change
  này chỉ đưa requirement đó vào spec.
- `messaging` phát `messaging.message.sent { conversationId, messageId, listingId, senderId, recipientId }` không mang
  nội dung; `realtime` đã báo `message:new`. Chưa có thông báo nào vào hộp thư cho tin nhắn, chưa có token điện thoại.

## Goals / Non-Goals

**Goals:** thông báo "tin nhắn" cho bên nhận (gộp theo hội thoại, nhắc mỗi tin); token đẩy gắn phiên đăng nhập; gửi
push qua Expo cho thông báo có `alert`, trừ máy đang mở đúng hội thoại; đọc biên nhận, quên token máy đã gỡ app.

**Non-Goals:** thông báo nào khác (mọi dòng ma trận đã có), ảnh / âm thanh riêng cho push, thống kê gửi.

## Decisions

### 1. Thông báo tin nhắn (ma trận `messaging`)

- `messaging.message.sent` → một dòng cho `recipientId`: nhóm `messages`, `type = messaging.message.received`, tiêu đề
  = tên người gửi, nội dung = 100 ký tự đầu của tin nhắn (qua cổng `messaging.previewOf(messageId)` — `notification`
  không đọc bảng `messages`, TK 30), `data = { conversationId, messageId, listingId }`, `personal`, `alertable`.
- Gộp theo hội thoại: `collapse.key = conversation:<id>`, dòng chưa đọc cập nhật "«Tên» gửi N tin nhắn mới." —
  nhưng **nhắc mỗi tin** (`collapse.alertEvery`): trần 30 phút của dòng gộp là cho chuyện lặp lại của nhóm, không
  cho hội thoại đang trò chuyện. Người gửi không có trong người nhận; tin bị chặn hay bị cụm cấm không có sự kiện.

### 2. Token đẩy (`identity` sở hữu)

- `sessions.push_token` (text, unique từng phần): `PUT /me/push-token { token }` gắn token Expo
  (`ExponentPushToken[…]`) vào **phiên hiện tại** — token đang ở phiên khác thì chuyển sang (máy đăng nhập tài khoản
  khác không hiện thông báo của tài khoản trước); `DELETE /me/push-token` gỡ. Phiên thu hồi (đăng xuất, khoá, đổi mật
  khẩu) hay hết hạn thì máy tự hết nhận: người gửi chỉ lấy token của phiên còn sống (`identity.pushTargets`).
- `identity.forgetPushToken(token)`: Expo báo `DeviceNotRegistered` → xoá token khỏi phiên.

### 3. Gửi push (`notification`)

- Cổng `PushSender { send(messages) → tickets; receipts(ids) }` ở `common/push/expo-push.ts`: gọi
  `EXPO_PUSH_URL` (mặc định `https://exp.host/--/api/v2/push/send`, biên nhận ở `…/getReceipts`) bằng `fetch`, lô
  100, header `Authorization: Bearer EXPO_ACCESS_TOKEN` nếu có. Không package mới. Test dùng bản giả.
- Lúc ghi thông báo, dòng có `alert = true` xếp việc `notification.push { notificationIds }` (pg-boss, thử lại 3 lần).
  Handler: token của phiên còn sống của người nhận; dòng mang `data.conversationId` thì bỏ phiên đang mở đúng hội
  thoại đó (mục 4); gửi; ticket lỗi `DeviceNotRegistered` → quên token ngay; ticket ok ghi `push_tickets` (mã ticket,
  phiên, token). Job `notification.push-receipts` mỗi 15 phút đọc biên nhận của ticket ≥ 15 phút, quên token máy
  `DeviceNotRegistered`, xoá ticket đã có biên nhận hay quá 24 giờ. Không ghi token vào log.
- Push mang `title`, `body` như hộp thư (câu nhắc đã không chứa lý do khoá / cấm / nội dung báo cáo) và `data` để app
  mở đúng màn (`notificationId`, `type`, mã của dòng).

### 4. Đang mở đúng hội thoại (`messaging` sở hữu)

- `conversation_presences (session_id PK, conversation_id, expires_at)`: `PUT /me/conversations/{id}/viewing` ghi
  phiên hiện tại đang mở hội thoại (hiệu lực 10 phút — app gọi lại khi còn mở), `DELETE …/viewing` xoá. Qua HTTP vì
  app không gửi gì lên socket (spec realtime) và trạng thái phải thấy được từ mọi tiến trình.
- `messaging.viewingSessions(conversationId)` trả phiên còn hiệu lực; chỉ **máy đó** không nhận push; máy khác của cùng
  người vẫn nhận (mục 7, câu 1). Hộp thư và realtime không đổi — chúng theo người, không theo máy.

### 5. Dữ liệu và migration

- `sessions.push_token` + unique từng phần; `push_tickets` (`id` text PK = mã ticket Expo, `session_id`, `token`,
  `created_at`, index `created_at`); `conversation_presences` (FK `sessions`, `conversations` cascade; index
  `conversation_id`). Không mất dữ liệu, không SQL tay ngoài CREATE do Prisma sinh.
- Biến môi trường mới, đều tuỳ chọn: `EXPO_PUSH_URL`, `EXPO_ACCESS_TOKEN`.

### 6. Ai nghe gì

| Bên                          | Nghe / gọi                                        | Làm                                                     |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| `notification`               | `messaging.message.sent`                          | dòng "tin nhắn" (mục 1) → push nếu nhắc                 |
| `notification` (job)         | `notification.push`, `notification.push-receipts` | gửi Expo, quên token hỏng                               |
| `notification` → `identity`  | `pushTargets`, `forgetPushToken`                  | cổng, nối thẳng (`identity` dựng trước)                 |
| `notification` → `messaging` | `previewOf`, `viewingSessions`                    | cổng, nối thẳng (`messaging` dựng trước `notification`) |

### 7. Trả lời câu hỏi mở của proposal

1. Nhiều máy, đang mở hội thoại trên một máy: chỉ máy đó không hiện; máy khác vẫn hiện — mỗi máy một phiên, một token.
2. Hộp thư gộp theo hội thoại (một dòng chưa đọc mỗi hội thoại, đếm số tin), nhưng nhắc mỗi tin.
3. "Tin mới trong nhóm" đã chốt ở `add-listings` (N31: chỉ tin hiện đầy đủ, không báo lượt sửa / gia hạn, gộp 120
   phút); change này chỉ đưa requirement vào spec `group-announcements`.

## Risks / Trade-offs

- Presence 10 phút: app chết mà không gửi `DELETE` thì máy đó lỡ push tin nhắn của hội thoại ấy tối đa 10 phút;
  hộp thư và realtime vẫn có.
- Expo chưa có tài khoản thì `send` trả lỗi cho mọi token — job thử lại 3 lần rồi bỏ; không chặn ghi hộp thư vì push
  là việc nền sau commit.
