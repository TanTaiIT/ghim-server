# Realtime và hộp thư thông báo — hướng dẫn cho app

Server đẩy thông báo qua **socket.io**. Kênh này chỉ để **báo hiệu**: mọi thứ app thấy trên socket đều đọc lại
được qua HTTP, nên mất kết nối không mất dữ liệu — nối lại xong thì tải lại số chưa đọc. App **không gửi gì lên**
socket; mọi thao tác (đọc, bật tắt, tắt tiếng) đi qua HTTP.

Hợp đồng đầy đủ: `openspec/specs/notification/` (`realtime`, `inbox`, `preferences`, `group-notices`,
`group-announcements`); ma trận N1–N30 ở design mục 1 của `openspec/changes/archive/2026-10-11-add-notification-core/`.

## Nối

| Mục       | Giá trị                                                                                |
| --------- | -------------------------------------------------------------------------------------- |
| URL       | gốc của API (cùng host, cùng cổng với `/api/v1`)                                       |
| `path`    | `/realtime`                                                                            |
| Transport | **chỉ `websocket`** — phải khai, mặc định của client là polling trước và sẽ bị từ chối |
| Xác thực  | access token trong `auth.token` (không phải header)                                    |
| Thư viện  | `socket.io-client` 4.x                                                                 |

```ts
import { io } from 'socket.io-client';

const socket = io(API_ORIGIN, {
  path: '/realtime',
  transports: ['websocket'],
  // Hàm, không phải object: mỗi lần nối lại client gọi lại để lấy token mới nhất.
  auth: (cb) => cb({ token: getAccessToken() }),
});
```

Không có phòng theo nhóm: vào hay rời nhóm giữa chừng **không** phải nối lại. Server tự tính ai nhận gì.

## Khi nào server cắt kết nối

| Tình huống                                                                                                       | App thấy                                    | App làm                                               |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| Access token hết hạn                                                                                             | `disconnect`, lý do `io server disconnect`  | làm mới token qua HTTP rồi `socket.connect()`         |
| Token sai, phiên đã thu hồi, tài khoản bị khoá — lúc bắt tay                                                     | `connect_error`, `message = 'UNAUTHORIZED'` | làm mới token; làm mới cũng hỏng thì về màn đăng nhập |
| Đăng xuất, đăng xuất máy khác, bị đẩy khỏi phiên, đổi / đặt lại mật khẩu, tài khoản bị khoá hay xoá — giữa chừng | `disconnect`, lý do `io server disconnect`  | như trên; HTTP sẽ trả 401 / 403 cho biết vì sao       |

`io server disconnect` là lần duy nhất client socket.io **không tự nối lại** — app phải gọi `socket.connect()`.
Lỗi mạng thì client tự nối lại như thường.

**Sau mỗi lần nối được** (kể cả lần đầu): gọi `GET /api/v1/me/notifications/unread-count`, và tải lại hộp thư nếu
đang mở — sự kiện phát lúc mất kết nối không được gửi bù.

## Sự kiện server → app

| Sự kiện                | Payload                                          | Ý nghĩa                                                                                                                                                        |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification:new`     | `{ notification: Notification, alert: boolean }` | Dòng mới trong hộp thư                                                                                                                                         |
| `notification:updated` | `{ notification: Notification, alert: boolean }` | Dòng gộp chưa đọc vừa cập nhật (vd "3 đơn xin vào") — thay dòng cùng `id`, đưa lên đầu                                                                         |
| `notification:unread`  | `{ count: number }`                              | Số chưa đọc mới — sau khi có thông báo, và sau mỗi lần đánh dấu đã đọc (tới **mọi máy** của tài khoản, nên đọc trên điện thoại thì máy tính bảng cũng giảm số) |
| `me:groups-changed`    | `{ groupId: string }`                            | Tư cách hay vai của bạn ở nhóm này vừa đổi (vào, rời, bị gỡ, đổi đơn vị, làm chủ…) — tải lại "nhóm của tôi"                                                    |
| `group:pending`        | `{ groupId: string, joinRequests: number }`      | Chỉ quản trị nhóm: số đơn xin vào đang chờ                                                                                                                     |

`Notification` giống hệt một phần tử của `GET /me/notifications`:

```ts
{
  id: string;            // uuid
  category: 'your_groups' | 'group_announcements' | …;  // 9 nhóm của TK 24
  type: string;          // vd 'group.join_request.approved' — app chọn icon, màn mở theo type
  title: string;         // tên nhóm với chuyện của nhóm
  body: string;          // câu hiện cho người dùng, đã đủ nghĩa
  detail: string | null; // chỉ người được xem mới có (vd lý do khoá nhóm cho chủ nhóm) — không bao giờ nằm trong body
  data: Record<string, string | null>;  // mã để mở đúng màn: groupId, offerId, invitationId, announcementId…
  groupId: string | null;
  count: number;         // > 1 khi là dòng gộp
  readAt: string | null;
  createdAt: string;
  updatedAt: string;     // dòng gộp nổi lên theo thời điểm này
}
```

## Cờ `alert` — khi nào làm phiền người dùng

Mọi thông báo đều vào hộp thư. `alert` chỉ quyết **có hiện banner / rung / tiếng** hay không:

- `alert: true` → hiện banner. `alert: false` → chỉ cập nhật hộp thư và số chưa đọc, im lặng.
- Server đã tính sẵn, app **không tự tính lại**:
  - dòng ma trận có nhắc hay không (vd đơn hết hạn thì không nhắc);
  - người dùng tắt nhóm thông báo đó (nhóm "tài khoản" luôn bật);
  - người dùng tắt tiếng nhóm này — **trừ** chuyện về chính tư cách của họ (bị gỡ, bị cấm, đơn được duyệt, lời mời,
    lời giao chủ, đổi vai): tắt tiếng một nhóm ồn không được làm người ta lỡ việc của mình;
  - dòng gộp chỉ nhắc lại sau 30 phút (con số `notification.collapseAlertMinutes`).
- Push lên điện thoại chưa làm (design mục 3). Ngày có push, push cũng chỉ gửi khi `alert` là `true`.

## HTTP đi kèm

Tất cả cần `Authorization: Bearer <access token>`, dưới `/api/v1`:

| Route                                        | Làm gì                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /me/notifications?page=&limit=`         | Hộp thư, mới cập nhật trước                                                   |
| `GET /me/notifications/unread-count`         | `{ count }`                                                                   |
| `POST /me/notifications/read`                | `{ ids: [...] }` hoặc `{ all: true }` → `{ marked }`; mã của người khác → 404 |
| `GET /me/notification-preferences`           | 9 nhóm với `enabled`, và `mutedGroupIds`                                      |
| `PUT /me/notification-preferences/:category` | `{ enabled }` — tắt nhóm "tài khoản" → 400 `NOTIFICATION_GROUP_ALWAYS_ON`     |
| `PUT /me/group-mutes/:groupId`               | Tắt tiếng một nhóm — không phải thành viên → 409 `NOT_GROUP_MEMBER`           |
| `DELETE /me/group-mutes/:groupId`            | Bật lại tiếng                                                                 |

Swagger (`/docs`, môi trường dev) có schema đầy đủ, tag **Notifications**.
