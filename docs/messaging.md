# Nhắn tin — hướng dẫn cho app

Người mua hỏi người bán ngay trên một tin: mỗi **tin + người mua** là đúng một hội thoại, hai bên là người mua và người
đăng tin. Chỉ lượt **mở hội thoại mới** xét tin (đang hiển thị, mình xem được); hội thoại đã mở thì nhắn tiếp được dù
tin đã bán, hết hạn, bị gỡ, tạm ẩn hay một bên rời nhóm (TK 24). Hợp đồng đầy đủ: `openspec/specs/messaging/`; thiết kế
ở `openspec/changes/archive/2026-10-17-add-messaging/design.md`.

## Ai được nhắn

Đã đăng nhập **và** đã xác nhận email (`403 EMAIL_NOT_VERIFIED`). Tài khoản master không nhắn tin (`403 FORBIDDEN`) —
người làm master dùng tài khoản cá nhân. Không nhắn cho tin của chính mình (`403 CANNOT_MESSAGE_OWN_LISTING`).

## Route — `/api/v1`

| Route                                                   | Việc                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /listings/{listingId}/conversation`               | Mở hội thoại — `201` hội thoại mới, `200` hội thoại đã có (kể cả đã xoá phía mình: hiện lại với đủ lịch sử, không tính hạn mức)                                                      |
| `GET /me/conversations?cursor&limit`                    | Hội thoại của tôi, hoạt động gần nhất trước; không có hội thoại đã xoá phía mình                                                                                                     |
| `GET /me/conversations/{id}`                            | Một hội thoại                                                                                                                                                                        |
| `GET /me/conversations/{id}/messages`                   | Tin nhắn, **mới trước**; `cursor` đi về quá khứ                                                                                                                                      |
| `POST /me/conversations/{id}/messages`                  | `{ body }` 1–2000 ký tự, chỉ chữ → `201` tin nhắn                                                                                                                                    |
| `POST /me/conversations/{id}/offers`                    | `{ amount }` số nguyên đồng, từ 1 tới giá đăng → `201` tin nhắn loại `offer` đang chờ; chỉ người mua; đề nghị đang chờ trước đó thành `superseded` (mục Trả giá)                     |
| `POST /me/conversations/{id}/offers/{messageId}/accept` | Người bán chấp nhận đề nghị đang chờ → `200` tin nhắn; chỉ ghi nhận, tin không đổi; `…/decline` từ chối                                                                              |
| `POST /me/conversations/{id}/read`                      | Đã đọc tới giờ → `204`; `unreadCount` của hội thoại về 0                                                                                                                             |
| `DELETE /me/conversations/{id}`                         | Xoá khỏi danh sách của tôi → `204`; bên kia vẫn thấy đủ; bên kia nhắn tiếp thì hiện lại                                                                                              |
| `POST /me/conversations/{id}/reports`                   | `{ category }` (`fraud` / `misinformation` / `harassment` / `prohibited` / `other`) — báo cáo **bên kia**, kèm hội thoại làm bằng chứng; luật như `POST /reports` (`docs/review.md`) |
| `PUT /me/conversations/{id}/viewing`                    | Máy này đang mở hội thoại → `204`; tin nhắn của nó không đẩy lên máy này trong 10 phút — gọi lại khi còn mở; `DELETE …/viewing` khi đóng (`docs/realtime.md`)                        |
| `POST /me/blocks`                                       | `{ accountId }` → `204` (lặp lại vô hại); `DELETE /me/blocks/{accountId}` gỡ; `GET /me/blocks` danh sách người tôi đã chặn                                                           |

Hội thoại:

```ts
{
  id: string;
  listing: {
    id: string;
    title: string | null; // null khi tin đã xoá
    price: number | null; // null khi tin đã xoá
    negotiable: boolean;
    state: ListingState; // tin đã xoá hẳn theo hạn lưu: 'removed'
    cover: { id: string; url: string } | null; // ảnh đầu; null khi tin đã xoá hay bị gỡ
  };
  role: 'buyer' | 'seller';
  counterpart: {
    accountId: string;
    displayName: string | null;
    avatarUrl: string | null; // null khi chưa đặt ảnh hay đã rời
    gone: boolean;
  } // gone = bên kia đã xoá tài khoản
  lastMessage: Message | null;
  unreadCount: number;
  locked: boolean; // có chặn giữa hai bên — cùng cờ cho cả hai, không nói ai chặn
  canSend: boolean; // !locked && !gone
  canOffer: boolean; // người mua, canSend, tin đang hiển thị, cho thương lượng, giá > 0
  createdAt: string;
  lastActivityAt: string;
}
```

Tin nhắn:

```ts
{
  id: string;
  conversationId: string;
  senderId: string;
  kind: 'text' | 'offer';
  body: string; // đề nghị giá để rỗng — đọc offer
  offer: {
    amount: number;
    status: 'pending' | 'accepted' | 'declined' | 'superseded';
    respondedAt: string | null; // có khi đã chấp nhận / từ chối
  } | null;
  createdAt: string;
}
```

## Trả giá

Chốt 18/10/2026 (TK 24, change `add-price-offers`): chỉ **người mua** gửi giá, người bán chấp nhận hoặc từ chối.

- Gửi được khi tin đang hiển thị (không tạm ẩn), cho thương lượng, giá > 0; giá trả từ 1 đồng tới giá đăng. Tin không
  còn bán thì vẫn nhắn chữ được, chỉ không trả giá.
- Mỗi hội thoại **một đề nghị đang chờ**: đề nghị mới làm đề nghị đang chờ thành `superseded` (không có thông báo riêng).
- Trả lời chỉ với đề nghị `pending`, khi tin còn hiển thị; mỗi đề nghị trả lời một lần.
- **Chấp nhận chỉ là ghi nhận**: trạng thái tin, giá đăng, chỗ trên bảng tin không đổi; người mua khác vẫn trả giá được.
- Đề nghị tính như một tin nhắn của người mua: hội thoại lên đầu danh sách, tính "có người nhắn hỏi mua" của tin sạch,
  không tính hạn mức hội thoại mới. Câu trả lời không phải tin nhắn mới (số chưa đọc không đổi) — người mua biết qua
  thông báo và `message:updated`.

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
lại hội thoại qua HTTP. Người bán trả lời đề nghị giá thì người mua nhận `message:updated { conversationId, messageId }`:
tải lại tin nhắn đó. Mỗi tin nhắn cũng vào hộp thư của bên nhận (nhóm "tin nhắn", một dòng chưa đọc mỗi hội thoại,
nhắc mỗi tin) và đẩy lên máy đã cho phép, trừ máy đang mở đúng hội thoại (add-notifications).

## Mã lỗi

| HTTP | `code`                       | Khi nào                                                                                  |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| 403  | `EMAIL_NOT_VERIFIED`         | Chưa xác nhận email                                                                      |
| 403  | `CANNOT_MESSAGE_OWN_LISTING` | Nhắn cho tin của mình                                                                    |
| 403  | `MESSAGING_BLOCKED`          | Có chặn giữa hai bên — mở mới hay gửi tin                                                |
| 403  | `OFFER_BUYER_ONLY`           | Người bán gửi đề nghị giá                                                                |
| 403  | `OFFER_SELLER_ONLY`          | Người mua trả lời đề nghị của chính mình                                                 |
| 400  | `OFFER_ABOVE_PRICE`          | Giá trả cao hơn giá đăng                                                                 |
| 409  | `OFFERS_NOT_ACCEPTED`        | Tin không cho thương lượng, hay cho tặng                                                 |
| 409  | `OFFER_NOT_PENDING`          | Trả lời đề nghị đã thay, đã chấp nhận hay đã từ chối                                     |
| 404  | `NOT_FOUND`                  | Không có hội thoại / tin, mình không phải một bên, hay tin mình không xem được           |
| 409  | `LISTING_NOT_LIVE`           | Mở hội thoại mới với tin đã bán, hết hạn; trả giá hay trả lời khi tin không còn hiển thị |
| 409  | `CONVERSATION_CLOSED`        | Gửi tin khi bên kia đã xoá tài khoản                                                     |
| 409  | `MESSAGE_NOT_ALLOWED`        | Tin nhắn trúng cụm từ cấm mức chắc                                                       |
| 429  | `NEW_CONVERSATION_LIMIT`     | Hết lượt hội thoại mới trong ngày — `details.retryAt`                                    |
