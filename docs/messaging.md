# Nhắn tin — hướng dẫn cho app

Người mua hỏi người bán ngay trên một tin: mỗi **tin + người mua** là đúng một hội thoại, hai bên là người mua và người
đăng tin. Chỉ lượt **mở hội thoại mới** xét tin (đang hiển thị, mình xem được); hội thoại đã mở thì nhắn tiếp được dù
tin đã bán, hết hạn, bị gỡ, tạm ẩn hay một bên rời nhóm (TK 24). Hợp đồng đầy đủ: `openspec/specs/messaging/`; thiết kế
ở `openspec/changes/archive/2026-10-17-add-messaging/design.md`.

## Ai được nhắn

Đã đăng nhập **và** đã xác nhận email (`403 EMAIL_NOT_VERIFIED`). Tài khoản master không nhắn tin (`403 FORBIDDEN`) —
người làm master dùng tài khoản cá nhân. Không nhắn cho tin của chính mình (`403 CANNOT_MESSAGE_OWN_LISTING`).

## Route — `/api/v1`

| Route                                     | Việc                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /listings/{listingId}/conversation` | Mở hội thoại — `201` hội thoại mới, `200` hội thoại đã có (kể cả đã xoá phía mình: hiện lại với đủ lịch sử, không tính hạn mức)                                                      |
| `GET /me/conversations?cursor&limit`      | Hội thoại của tôi, hoạt động gần nhất trước; không có hội thoại đã xoá phía mình                                                                                                     |
| `GET /me/conversations/{id}`              | Một hội thoại                                                                                                                                                                        |
| `GET /me/conversations/{id}/messages`     | Tin nhắn, **mới trước**; `cursor` đi về quá khứ                                                                                                                                      |
| `POST /me/conversations/{id}/messages`    | `{ body }` 1–2000 ký tự, chỉ chữ → `201` tin nhắn                                                                                                                                    |
| `POST /me/conversations/{id}/read`        | Đã đọc tới giờ → `204`; `unreadCount` của hội thoại về 0                                                                                                                             |
| `DELETE /me/conversations/{id}`           | Xoá khỏi danh sách của tôi → `204`; bên kia vẫn thấy đủ; bên kia nhắn tiếp thì hiện lại                                                                                              |
| `POST /me/conversations/{id}/reports`     | `{ category }` (`fraud` / `misinformation` / `harassment` / `prohibited` / `other`) — báo cáo **bên kia**, kèm hội thoại làm bằng chứng; luật như `POST /reports` (`docs/review.md`) |
| `POST /me/blocks`                         | `{ accountId }` → `204` (lặp lại vô hại); `DELETE /me/blocks/{accountId}` gỡ; `GET /me/blocks` danh sách người tôi đã chặn                                                           |

Hội thoại:

```ts
{
  id: string;
  listing: {
    id: string;
    title: string | null;
  } // title null khi tin đã xoá
  role: 'buyer' | 'seller';
  counterpart: {
    accountId: string;
    displayName: string | null;
    gone: boolean;
  } // gone = bên kia đã xoá tài khoản
  lastMessage: Message | null;
  unreadCount: number;
  locked: boolean; // có chặn giữa hai bên — cùng cờ cho cả hai, không nói ai chặn
  canSend: boolean; // !locked && !gone
  createdAt: string;
  lastActivityAt: string;
}
```

## Hạn mức hội thoại mới

Mỗi ngày (ngày lịch giờ Việt Nam) mở tối đa 10 / 20 / 50 / 100 hội thoại mới theo mức T0 / T1 / T2 / T3 (bảng con số
`quota.newConversationsPerDay*`). Chỉ lượt mở **thành công** được đếm: mở lại hội thoại đã có, trả lời, lượt bị từ chối
không tính; người bán nhận bao nhiêu hội thoại cũng không bị trừ. Hết lượt → `429 NEW_CONVERSATION_LIMIT` kèm
`details.retryAt` = 00:00 ngày mai.

## Bộ lọc cụm từ cấm

Tin nhắn qua đúng bộ lọc của tin đăng (`screening/banned-phrases`): trúng cụm **mức chắc đang bật** → `409
MESSAGE_NOT_ALLOWED` với câu chung, không nêu cụm, tin không được lưu; cụm **mơ hồ** đang bật → tới nơi như thường
(người xử báo cáo thấy dấu); cụm **chạy thử** → như không có. Không gậy, không đổi mức tin cậy (cam kết 5).

## Chặn

Chặn áp cả hai chiều và mọi hội thoại của hai người: không bên nào mở hội thoại mới, hội thoại cũ ngừng nhận tin
(`403 MESSAGING_BLOCKED`, cùng câu cho cả hai), tin nhắn cũ vẫn đọc được, `locked: true` ở cả hai phía. Người bị chặn
không được báo gì. Gỡ chặn thì nhắn lại được (trừ khi bên kia cũng chặn).

## Realtime

Người nhận đang nối socket (`docs/realtime.md`) nhận `message:new { conversationId, messageId }` — chỉ báo hiệu, app tải
lại hội thoại qua HTTP. Dòng hộp thư và đẩy lên điện thoại là `add-notifications`.

## Mã lỗi

| HTTP | `code`                       | Khi nào                                                                        |
| ---- | ---------------------------- | ------------------------------------------------------------------------------ |
| 403  | `EMAIL_NOT_VERIFIED`         | Chưa xác nhận email                                                            |
| 403  | `CANNOT_MESSAGE_OWN_LISTING` | Nhắn cho tin của mình                                                          |
| 403  | `MESSAGING_BLOCKED`          | Có chặn giữa hai bên — mở mới hay gửi tin                                      |
| 404  | `NOT_FOUND`                  | Không có hội thoại / tin, mình không phải một bên, hay tin mình không xem được |
| 409  | `LISTING_NOT_LIVE`           | Mở hội thoại mới với tin đã bán, hết hạn                                       |
| 409  | `CONVERSATION_CLOSED`        | Gửi tin khi bên kia đã xoá tài khoản                                           |
| 409  | `MESSAGE_NOT_ALLOWED`        | Tin nhắn trúng cụm từ cấm mức chắc                                             |
| 429  | `NEW_CONVERSATION_LIMIT`     | Hết lượt hội thoại mới trong ngày — `details.retryAt`                          |
