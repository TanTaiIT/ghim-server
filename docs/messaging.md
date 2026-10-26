# Nhắn tin — hướng dẫn cho app

Ba loại hội thoại (TK 24, chốt 18/10/2026):

- **Về một tin** — người mua hỏi người bán ngay trên một tin: mỗi **tin + người mua** là đúng một hội thoại, hai bên là
  người mua và người đăng tin. Chỉ lượt **mở hội thoại mới** xét tin (đang hiển thị, mình xem được); hội thoại đã mở thì
  nhắn tiếp được dù tin đã bán, hết hạn, bị gỡ, tạm ẩn hay một bên rời nhóm.
- **Với Hỗ trợ Ghim** — mỗi người dùng một hội thoại; staff hỗ trợ trả lời từ bàn vận hành.
- **Với quản trị một nhóm** — mỗi người dùng một hội thoại với mỗi nhóm; chủ nhóm và mọi điều hành viên đang giữ vai
  cùng thấy, trả lời ngay trong app.

Hai loại sau là hội thoại **với một đội** (mục cuối). Hợp đồng đầy đủ: `openspec/specs/messaging/`; thiết kế ở
`openspec/changes/archive/2026-10-17-add-messaging/design.md`, `…-add-price-offers/`, `…-add-team-conversations/`;
ảnh trong tin nhắn ở `openspec/changes/archive/2026-10-26-add-message-images/`.

## Ai được nhắn

Đã đăng nhập **và** đã xác nhận email (`403 EMAIL_NOT_VERIFIED`). Tài khoản master không nhắn tin (`403 FORBIDDEN`) —
người làm master dùng tài khoản cá nhân. Không nhắn cho tin của chính mình (`403 CANNOT_MESSAGE_OWN_LISTING`), không
nhắn quản trị nhóm mình đang quản trị (`403 CANNOT_MESSAGE_OWN_GROUP`).

## Route — `/api/v1`

| Route                                                   | Việc                                                                                                                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /listings/{listingId}/conversation`               | Mở hội thoại về tin — `201` hội thoại mới, `200` hội thoại đã có (kể cả đã xoá phía mình: hiện lại với đủ lịch sử, không tính hạn mức)                                                                    |
| `POST /me/support/conversation`                         | Mở hội thoại với Hỗ trợ Ghim — `201` lần đầu, `200` hội thoại cũ (bỏ ẩn phía mình)                                                                                                                        |
| `POST /groups/{groupId}/conversation`                   | Mở hội thoại với quản trị nhóm — `201` / `200`; ai xem được hồ sơ nhóm (kể cả người ngoài nhóm riêng tư) là nhắn được                                                                                     |
| `GET /me/conversations?cursor&limit`                    | Hội thoại của tôi, hoạt động gần nhất trước; gồm hội thoại với quản trị của các nhóm tôi đang quản trị; không có hội thoại đã xoá phía mình                                                               |
| `GET /me/conversations/{id}`                            | Một hội thoại                                                                                                                                                                                             |
| `GET /me/conversations/{id}/messages`                   | Tin nhắn, **mới trước**; `cursor` đi về quá khứ                                                                                                                                                           |
| `POST /me/conversations/{id}/messages`                  | `{ body?, imageIds? }` — chữ tới 2000 ký tự, tối đa 4 ảnh, hay cả hai (không chữ không ảnh → `400`) → `201` tin nhắn (mục Ảnh)                                                                            |
| `POST /me/conversations/{id}/offers`                    | `{ amount }` số nguyên đồng, từ 1 tới giá đăng → `201` tin nhắn loại `offer` đang chờ; chỉ người mua của hội thoại về tin; đề nghị đang chờ trước đó thành `superseded` (mục Trả giá)                     |
| `POST /me/conversations/{id}/offers/{messageId}/accept` | Người bán chấp nhận đề nghị đang chờ → `200` tin nhắn; chỉ ghi nhận, tin không đổi; `…/decline` từ chối                                                                                                   |
| `POST /me/conversations/{id}/read`                      | Đã đọc tới giờ → `204`; `unreadCount` của hội thoại về 0 (phía đội: cho cả đội)                                                                                                                           |
| `DELETE /me/conversations/{id}`                         | Xoá khỏi danh sách của tôi → `204`; bên kia vẫn thấy đủ; bên kia nhắn tiếp thì hiện lại. Người trong đội không xoá được (`403 FORBIDDEN`)                                                                 |
| `POST /me/conversations/{id}/reports`                   | `{ category }` (`fraud` / `misinformation` / `harassment` / `prohibited` / `other`) — báo cáo **bên kia** của hội thoại về tin, kèm hội thoại làm bằng chứng; luật như `POST /reports` (`docs/review.md`) |
| `PUT /me/conversations/{id}/viewing`                    | Máy này đang mở hội thoại → `204`; tin nhắn của nó không đẩy lên máy này trong 10 phút — gọi lại khi còn mở; `DELETE …/viewing` khi đóng (`docs/realtime.md`)                                             |
| `POST /me/blocks`                                       | `{ accountId }` → `204` (lặp lại vô hại); `DELETE /me/blocks/{accountId}` gỡ; `GET /me/blocks` danh sách người tôi đã chặn                                                                                |

Hội thoại:

```ts
{
  id: string;
  kind: 'listing' | 'support' | 'group';
  listing: {
    id: string;
    title: string | null; // null khi tin đã xoá
    price: number | null; // null khi tin đã xoá
    negotiable: boolean;
    state: ListingState; // tin đã xoá hẳn theo hạn lưu: 'removed'
    cover: { id: string; url: string } | null; // ảnh đầu; null khi tin đã xoá hay bị gỡ
  } | null; // chỉ hội thoại về tin
  group: { id: string; name: string } | null; // chỉ hội thoại với quản trị nhóm; tên đọc lúc trả
  role: 'buyer' | 'seller' | 'team'; // người dùng của hội thoại với một đội là 'buyer'; người trong đội là 'team'
  counterpart: {
    kind: 'account' | 'support' | 'group_admins';
    accountId: string | null; // null khi bên kia là đội
    displayName: string | null; // tên đội: "Hỗ trợ Ghim" / "Quản trị nhóm «tên nhóm»"
    avatarUrl: string | null; // null khi chưa đặt ảnh, đã rời, hay bên kia là đội
    gone: boolean; // bên kia đã xoá tài khoản
    activity: { online: boolean; lastActiveAt: string | null } | null; // mục Trạng thái hoạt động
  };
  lastMessage: Message | null;
  unreadCount: number;
  locked: boolean; // có chặn giữa hai bên (chỉ hội thoại về tin) — cùng cờ cho cả hai, không nói ai chặn
  canSend: boolean;
  canOffer: boolean; // người mua của hội thoại về tin, canSend, tin đang hiển thị, cho thương lượng, giá > 0
  createdAt: string;
  lastActivityAt: string;
}
```

Tin nhắn:

```ts
{
  id: string;
  conversationId: string;
  senderId: string | null; // người dùng nhận null cho tin của đội — không biết ai trong đội viết
  fromMe: boolean;
  kind: 'text' | 'offer';
  body: string; // đề nghị giá và tin chỉ có ảnh để rỗng — đọc offer / images
  images: { id: string; url: string }[]; // theo thứ tự gửi; [] khi không có ảnh
  offer: {
    amount: number;
    status: 'pending' | 'accepted' | 'declined' | 'superseded';
    respondedAt: string | null; // có khi đã chấp nhận / từ chối
  } | null;
  createdAt: string;
}
```

## Trả giá

Chốt 18/10/2026 (TK 24, change `add-price-offers`): chỉ **người mua** gửi giá, người bán chấp nhận hoặc từ chối. Chỉ
trong hội thoại về tin (hội thoại với một đội → `409 OFFERS_NOT_ACCEPTED`).

- Gửi được khi tin đang hiển thị (không tạm ẩn), cho thương lượng, giá > 0; giá trả từ 1 đồng tới giá đăng. Tin không
  còn bán thì vẫn nhắn chữ được, chỉ không trả giá.
- Mỗi hội thoại **một đề nghị đang chờ**: đề nghị mới làm đề nghị đang chờ thành `superseded` (không có thông báo riêng).
- Trả lời chỉ với đề nghị `pending`, khi tin còn hiển thị; mỗi đề nghị trả lời một lần.
- **Chấp nhận chỉ là ghi nhận**: trạng thái tin, giá đăng, chỗ trên bảng tin không đổi; người mua khác vẫn trả giá được.
- Đề nghị tính như một tin nhắn của người mua: hội thoại lên đầu danh sách, tính "có người nhắn hỏi mua" của tin sạch,
  không tính hạn mức hội thoại mới. Câu trả lời không phải tin nhắn mới (số chưa đọc không đổi) — người mua biết qua
  thông báo và `message:updated`.

## Trạng thái hoạt động

Chốt 18/10/2026 (TK 24, change `add-activity-status`). `counterpart.activity` chỉ có ở **hội thoại về tin**, khi không
có chặn, bên kia chưa rời Ghim, và **cả hai bên** đang bật công tắc — tắt là hai chiều: không ai thấy của mình, mình cũng
không thấy của ai. Còn lại là `null`; hồ sơ công khai, tin, nhóm, hội thoại với một đội không bao giờ có.

- `online`: bên kia đang có kết nối realtime — app chỉ nối khi đang mở (`docs/realtime.md`), nên là "đang mở app".
- `lastActiveAt`: lần cuối kết nối mở hay kết nối cuối cùng đóng, làm tròn xuống phút; `null` khi quá
  `messaging.activityVisibleDays` ngày (giá trị khởi đầu 7) hay chưa từng nối. Đang online thì vẫn có mốc gần nhất —
  app chỉ đọc khi `online = false`.
- Công tắc: `GET /me` → `showActivity` (mặc định `true`); `PATCH /me { showActivity }`. Xoá tài khoản xoá luôn mốc.
- Không đẩy realtime khi bên kia vừa online / vừa thoát: app đọc lại khi mở hội thoại và khi có `message:new`.

## Hạn mức hội thoại mới

Mỗi ngày (ngày lịch giờ Việt Nam) mở tối đa 10 / 20 / 50 / 100 hội thoại mới về tin theo mức T0 / T1 / T2 / T3 (bảng
con số `quota.newConversationsPerDay*`). Chỉ lượt mở **thành công** được đếm: mở lại hội thoại đã có, trả lời, lượt bị
từ chối, hội thoại với một đội không tính; người bán nhận bao nhiêu hội thoại cũng không bị trừ. Hết lượt → `429
NEW_CONVERSATION_LIMIT` kèm `details.retryAt` = 00:00 ngày mai.

## Bộ lọc cụm từ cấm

Tin nhắn qua đúng bộ lọc của tin đăng (`screening/banned-phrases`) — kể cả tin quản trị nhóm trả lời thay nhóm: trúng
cụm **mức chắc đang bật** → `409 MESSAGE_NOT_ALLOWED` với câu chung, không nêu cụm, tin không được lưu; cụm **mơ hồ**
đang bật → tới nơi như thường (người xử báo cáo thấy dấu); cụm **chạy thử** → như không có. Không gậy, không đổi mức tin
cậy (cam kết 5). Tin staff hỗ trợ gửi từ bàn vận hành **không** qua bộ lọc: staff cần nhắc đúng cụm lừa đảo để cảnh báo.

## Ảnh trong tin nhắn

Chốt 25/10/2026 (TK 24, change `add-message-images`): mỗi tin nhắn **tối đa 4 ảnh**, kèm chữ hay không, ở mọi loại hội
thoại; đề nghị giá không kèm ảnh.

1. Xin quyền tải như ảnh tin (`docs/media.md`) với `ownerKind: "conversation"`, `ownerId` = mã hội thoại. Chỉ người đang
   ở trong hội thoại qua app xin được (người dùng, bên kia của hội thoại về tin, người đang giữ vai quản trị nhóm); người
   ngoài nhận `404` như hội thoại không tồn tại.
2. Gửi `POST /me/conversations/{id}/messages` kèm `imageIds` theo thứ tự muốn hiện. Ảnh phải do chính mình tải cho đúng
   hội thoại này và chưa gửi lần nào, sai → `400 IMAGE_NOT_IN_STORAGE`. Mọi luật gửi khác (chặn, bên kia đã rời, nhóm đóng)
   áp như tin chữ.
3. Ảnh được đo **ngay trong lượt gửi** bằng các luật chất lượng **đang bật** của máy duyệt (`docs/screening.md`) — tin
   nhắn không chờ người duyệt, nên ảnh trúng là không gửi: `400 MESSAGE_IMAGE_REJECTED` với câu sửa của tin đăng ("Ảnh 2
   quá nhỏ. Thay bằng ảnh chụp rõ hơn."), `details.rule` là mã luật. Ảnh không mở được luôn bị chặn; luật chạy thử như
   không có. Không so trùng, không kiểm nội dung.

Ảnh chỉ tới tay người đọc được hội thoại: hai bên, cả đội của hội thoại với một đội, và người xử khi hội thoại đi kèm một
báo cáo. Staff hỗ trợ trả lời trên bàn vận hành **chỉ bằng chữ**. Hội thoại bị xoá hẳn (hạn lưu,
nhóm đóng — `docs/retention.md`) thì ảnh của nó bị xoá khỏi kho cùng lượt.

## Chặn

Chặn áp cả hai chiều và mọi hội thoại về tin của hai người: không bên nào mở hội thoại mới, hội thoại cũ ngừng nhận tin
(`403 MESSAGING_BLOCKED`, cùng câu cho cả hai), tin nhắn cũ vẫn đọc được, `locked: true` ở cả hai phía. Người bị chặn
không được báo gì. Gỡ chặn thì nhắn lại được (trừ khi bên kia cũng chặn). Chặn **không** áp cho hội thoại với một đội.

## Hội thoại với một đội

Chốt 18/10/2026 (TK 24, change `add-team-conversations`). Bên kia là cả đội: ai trong đội cũng đọc và trả lời, **một
người đọc là cả đội đã đọc**. Người dùng chỉ thấy tên đội — "Hỗ trợ Ghim", "Quản trị nhóm «tên nhóm»" — và `senderId:
null` cho tin của đội; người trong đội thấy ai viết. Không tính hạn mức, chặn không áp vào, không trả giá, chưa báo cáo
được (`409 CONVERSATION_NOT_REPORTABLE`), chỉ người dùng xoá được ở phía mình; đội nhắn tiếp thì hội thoại hiện lại.

- **Hỗ trợ Ghim**: người dùng nhận trả lời ở nhóm thông báo "hỗ trợ". Staff không nhận hộp thư cho từng tin — hàng trên
  bàn vận hành là chỗ của họ. Người dùng đã xoá tài khoản: staff vẫn đọc, không gửi được (`409 CONVERSATION_CLOSED`).
- **Quản trị nhóm**: chủ nhóm và mọi điều hành viên **đang giữ vai** (không treo vì khoá tài khoản hay gậy nặng) thấy hội
  thoại trong `GET /me/conversations` (`role: 'team'`, `counterpart` là người dùng), trả lời bằng route nhắn tin thường,
  nhận thông báo "tin nhắn" tiêu đề "«tên nhóm» · tên người dùng". Mất vai là mất quyền vào ngay (`404`); người nhận vai
  sau thấy cả tin cũ. Mở mới: nhóm phải đang hoạt động (`409 GROUP_NOT_ACTIVE` khi đã đóng, tạm khoá, chờ chủ đầu tiên),
  không bị cấm (`403 GROUP_BANNED`). Nhóm đóng → chỉ còn để đọc với cả hai bên (`409 CONVERSATION_CLOSED`); người dùng bị
  cấm → người dùng gửi `403 GROUP_BANNED`, quản trị gửi `409 CONVERSATION_CLOSED`.

### Bàn vận hành hỗ trợ — `/api/v1/ops/support`, quyền staff `support`

| Route                                              | Việc                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /ops/support/conversations?status&page&limit` | Hàng: đang chờ đội trả lời trước, chờ lâu nhất trước; `status=pending` chỉ hội thoại đang chờ                                                            |
| `GET /ops/support/conversations/{id}`              | Một hội thoại hỗ trợ (`role: 'team'`, `counterpart` là người dùng)                                                                                       |
| `GET /ops/support/conversations/{id}/messages`     | Tin nhắn, mới trước, kèm `senderId` của staff đã viết và ảnh người dùng gửi                                                                              |
| `POST /ops/support/conversations/{id}/messages`    | `{ body }` chỉ chữ (kèm `imageIds` → `400 VALIDATION_ERROR`) → `201`, ký "Hỗ trợ Ghim"; không qua bộ lọc cụm; hội thoại của chính mình → `403 FORBIDDEN` |
| `POST /ops/support/conversations/{id}/read`        | Đã đọc cho cả đội → `204` (hội thoại vẫn "đang chờ" tới khi có người trả lời)                                                                            |

Mỗi lượt trả lời vào nhật ký thao tác (`messaging.support.reply`, mã hội thoại và mã tin nhắn, không nội dung).
Realtime `support:pending { count }` tới mọi staff đang mang quyền `support` khi số hội thoại đang chờ đổi.

## Realtime

Người nhận đang nối socket (`docs/realtime.md`) nhận `message:new { conversationId, messageId }` — chỉ báo hiệu, app tải
lại hội thoại qua HTTP. Người bán trả lời đề nghị giá thì người mua nhận `message:updated { conversationId, messageId }`:
tải lại tin nhắn đó. Mỗi tin nhắn cũng vào hộp thư của bên nhận (nhóm "tin nhắn" — tin của Hỗ trợ Ghim thì nhóm "hỗ
trợ" —, một dòng chưa đọc mỗi hội thoại, nhắc mỗi tin; tin chỉ có ảnh ghi "Đã gửi N ảnh") và đẩy lên máy đã cho phép, trừ máy đang mở đúng hội thoại
(add-notifications).

## Mã lỗi

| HTTP | `code`                        | Khi nào                                                                                         |
| ---- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| 403  | `EMAIL_NOT_VERIFIED`          | Chưa xác nhận email                                                                             |
| 403  | `CANNOT_MESSAGE_OWN_LISTING`  | Nhắn cho tin của mình                                                                           |
| 403  | `CANNOT_MESSAGE_OWN_GROUP`    | Quản trị nhắn quản trị nhóm mình                                                                |
| 403  | `GROUP_BANNED`                | Bị cấm khỏi nhóm — mở hội thoại hay gửi tin cho quản trị nhóm đó                                |
| 403  | `MESSAGING_BLOCKED`           | Có chặn giữa hai bên — mở mới hay gửi tin                                                       |
| 403  | `OFFER_BUYER_ONLY`            | Người bán gửi đề nghị giá                                                                       |
| 403  | `OFFER_SELLER_ONLY`           | Người mua trả lời đề nghị của chính mình                                                        |
| 403  | `FORBIDDEN`                   | Master nhắn tin; người trong đội xoá hội thoại của đội; staff trả lời hội thoại hỗ trợ của mình |
| 400  | `OFFER_ABOVE_PRICE`           | Giá trả cao hơn giá đăng                                                                        |
| 400  | `VALIDATION_ERROR`            | Tin nhắn không chữ không ảnh, quá 4 ảnh, quá 2000 ký tự                                         |
| 400  | `IMAGE_NOT_IN_STORAGE`        | Ảnh chưa tải xong, không phải mình tải cho hội thoại này, hay đã gửi trong tin nhắn trước       |
| 400  | `MESSAGE_IMAGE_REJECTED`      | Ảnh trúng luật chất lượng đang bật hay không mở được — câu nêu ảnh thứ mấy, `details.rule`      |
| 404  | `NOT_FOUND`                   | Không có hội thoại / tin / nhóm, mình không phải một bên, hay tin mình không xem được           |
| 409  | `GROUP_NOT_ACTIVE`            | Mở hội thoại mới với quản trị nhóm đã đóng, đang tạm khoá hay chờ chủ đầu tiên                  |
| 409  | `LISTING_NOT_LIVE`            | Mở hội thoại mới với tin đã bán, hết hạn; trả giá hay trả lời khi tin không còn hiển thị        |
| 409  | `OFFERS_NOT_ACCEPTED`         | Tin không cho thương lượng, hay cho tặng; trả giá trong hội thoại với một đội                   |
| 409  | `OFFER_NOT_PENDING`           | Trả lời đề nghị đã thay, đã chấp nhận hay đã từ chối                                            |
| 409  | `CONVERSATION_CLOSED`         | Gửi tin khi bên kia đã xoá tài khoản; nhóm đã đóng; quản trị nhắn người đang bị cấm             |
| 409  | `CONVERSATION_NOT_REPORTABLE` | Báo cáo từ hội thoại với một đội                                                                |
| 409  | `MESSAGE_NOT_ALLOWED`         | Tin nhắn trúng cụm từ cấm mức chắc                                                              |
| 429  | `NEW_CONVERSATION_LIMIT`      | Hết lượt hội thoại mới trong ngày — `details.retryAt`                                           |
