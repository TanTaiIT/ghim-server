# Design

> Duyệt cùng `add-groups` ngày 11/10/2026. Bối cảnh, lý do kéo lên đợt 1 và các câu hỏi đã chốt nằm ở design của
> `add-groups` (mục 1 và bảng "Đã chốt"); file này giữ phần riêng của thông báo.

## Context

TK 24 chốt hộp thư trong app, 9 nhóm thông báo bật tắt được và thông báo của nhóm; TK 26 xếp "gửi thông báo" vào
việc chạy ngay khi có chuyện. Ngày 11/10/2026 phần lõi được kéo lên đợt 1 để nhóm báo được cho thành viên ngay;
push lên điện thoại hoãn tới khi app làm. Các module phát sự kiện vào outbox; `notification` nghe, quyết báo ai, ghi
hộp thư và đẩy realtime.

## Goals / Non-Goals

**Goals**: hộp thư, số chưa đọc, đánh dấu đã đọc; bật tắt 9 nhóm và tắt tiếng từng nhóm quyết cờ nhắc; realtime
bằng socket.io; mọi dòng N1–N30 của ma trận dưới đây.

**Non-Goals**: push lên điện thoại (mục 3); báo tin nhắn mới và không đẩy hội thoại đang mở (`add-notifications`,
đợt 6); "tin mới trong nhóm" và các dòng N31–N36 (đợt 2, 4); hạn lưu 90 ngày (`add-data-retention`).

## Decisions

### 1. Ma trận thông báo — chuyện nào báo ai

Quy ước: **Hộp thư** = vào hộp thư trong app (TK 24, mọi thông báo đều vào). **Nhắc** = hiện lên màn hình: banner
trong app qua realtime ngay đợt này, push lên điện thoại khi có (mục 3) — chỉ khi người nhận bật nhóm thông báo đó
và không tắt tiếng nhóm gửi. Mọi thông báo vào hộp thư đều đi kèm một sự kiện
realtime tới các phiên đang mở của người nhận. "Quản trị nhóm" = chủ nhóm và điều hành viên cả nhóm. Nhóm thông báo
theo 9 nhóm của TK 24: **NCB** = nhóm của bạn, **TBN** = thông báo của nhóm, **TMN** = tin mới trong nhóm, **TĐB** =
tin đăng của bạn.

**Luật chung**

1. Không báo người tự làm chuyện đó.
2. Quyết định xử lý (từ chối đơn, gỡ, cấm) ký tên **"Quản trị nhóm «tên nhóm»"**, không nêu điều hành viên nào —
   tránh trả đũa cá nhân, và đúng với việc nhóm quyết định như một tập thể.
3. Không lộ chuyện tài khoản của người khác: nhóm thiếu chủ chỉ nói "nhóm tạm thời chưa có chủ", không nói chủ bị
   khoá.
4. Câu nhắc không chứa lý do cấm, lý do khoá, nội dung báo cáo: màn hình khoá ai cũng đọc được. Lý do (nếu có) chỉ
   nằm trong app, và lý do khoá nhóm chỉ chủ nhóm, điều hành viên thấy.
5. Thông báo không phải quyền: bấm vào luôn tải trạng thái hiện tại (lời mời đã bị thu hồi thì app nói "lời mời
   không còn hiệu lực"), nên không cần thông báo "đã thu hồi".
6. Chuyện lặp lại theo nhóm (đơn mới, tin mới, việc chờ duyệt) được **gộp**: chưa đọc thì cập nhật thông báo cũ
   ("3 đơn mới") thay vì thêm dòng, và nhắc có trần theo khoảng thời gian.

**Đợt 1 (`add-groups` + `add-notification-core`)**

| #   | Chuyện                                                        | Ai nhận                                  | Nhóm | Hộp thư | Nhắc                       | Câu nhắc mẫu                                                                         |
| --- | ------------------------------------------------------------- | ---------------------------------------- | ---- | ------- | -------------------------- | ------------------------------------------------------------------------------------ |
| N1  | Master giao chủ (lần đầu, nhóm thiếu chủ, giao đè)            | người được giao                          | NCB  | ✓       | ✓ cần làm                  | Bạn được giao làm chủ nhóm «X». Đồng ý trước 24/10.                                  |
| N2  | Chủ nhóm gửi lời chuyển chủ                                   | người nhận                               | NCB  | ✓       | ✓ cần làm                  | «Lan» muốn chuyển quyền chủ nhóm «X» cho bạn. Đồng ý trước 24/10.                    |
| N3  | Lời giao / chuyển chủ được nhận                               | chủ cũ (nếu có); điều hành viên          | NCB  | ✓       | chủ cũ ✓                   | «Minh» đã nhận làm chủ nhóm «X».                                                     |
| N4  | Lời chuyển chủ bị từ chối                                     | chủ nhóm đã gửi                          | NCB  | ✓       | ✓                          | Lời chuyển chủ nhóm «X» đã bị từ chối.                                               |
| N5  | Lời giao / chuyển chủ hết hạn                                 | chủ nhóm đã gửi (chuyển nhượng)          | NCB  | ✓       | —                          | —                                                                                    |
| N6  | Master giao chủ mới cho nhóm đang có chủ, được nhận           | chủ cũ                                   | NCB  | ✓       | ✓                          | Quản trị Ghim đã giao quyền chủ nhóm «X» cho người khác. Bạn vẫn là thành viên.      |
| N7  | Được bổ nhiệm điều hành viên                                  | người đó                                 | NCB  | ✓       | ✓                          | Bạn là điều hành viên của «X» (phụ trách lớp 12A1).                                  |
| N8  | Bị bãi nhiệm                                                  | người đó                                 | NCB  | ✓       | ✓                          | Bạn không còn là điều hành viên của «X».                                             |
| N9  | Đổi phạm vi điều hành viên                                    | người đó                                 | NCB  | ✓       | —                          | —                                                                                    |
| N10 | Nhóm sang thiếu chủ                                           | mọi điều hành viên                       | NCB  | ✓       | ✓                          | Nhóm «X» tạm thời chưa có chủ. Việc hằng ngày vẫn tiếp tục.                          |
| N11 | Chủ cũ trở lại                                                | chủ cũ; điều hành viên                   | NCB  | ✓       | chủ cũ ✓                   | Bạn tiếp tục là chủ nhóm «X».                                                        |
| N12 | Có chủ mới sau thiếu chủ                                      | điều hành viên                           | NCB  | ✓       | —                          | —                                                                                    |
| N13 | Nhóm tạm khoá (master, quá hạn thiếu chủ, hết điều hành viên) | mọi thành viên (lý do chỉ quản trị thấy) | NCB  | ✓       | ✓                          | Nhóm «X» đang tạm khoá. Mở app để xem chi tiết.                                      |
| N14 | Mở khoá                                                       | mọi thành viên                           | NCB  | ✓       | ✓                          | Nhóm «X» đã mở khoá.                                                                 |
| N15 | Nhóm đóng                                                     | mọi thành viên trừ người đóng            | NCB  | ✓       | ✓                          | Nhóm «X» đã đóng.                                                                    |
| N16 | Nhóm đóng — đơn của bạn bị huỷ (TK 10)                        | người có đơn đang chờ                    | NCB  | ✓       | ✓                          | Đơn vào «X» đã huỷ vì nhóm đã đóng.                                                  |
| N17 | Nhóm đóng — lời mời bị huỷ (TK 10)                            | người có lời mời còn hạn                 | NCB  | ✓       | ✓                          | Lời mời vào «X» đã huỷ vì nhóm đã đóng.                                              |
| N18 | Riêng tư → công khai (TK 9 "báo trước")                       | mọi thành viên trừ người đổi             | NCB  | ✓       | ✓                          | Nhóm «X» giờ là nhóm công khai. Tin «chỉ thành viên» của bạn vẫn chỉ thành viên xem. |
| N19 | Xét duyệt → mở cửa: đơn đang chờ bị huỷ                       | người xin                                | NCB  | ✓       | ✓                          | «X» giờ bấm Tham gia là vào — đơn của bạn không cần duyệt nữa.                       |
| N20 | Đơn xin vào mới                                               | quản trị nhóm                            | NCB  | ✓ gộp   | ✓ ≤ 1 lần / 30 phút / nhóm | «X» có 3 đơn xin vào đang chờ duyệt.                                                 |
| N21 | Đơn được duyệt                                                | người xin                                | NCB  | ✓       | ✓                          | Bạn đã là thành viên «X».                                                            |
| N22 | Đơn bị từ chối                                                | người xin                                | NCB  | ✓       | ✓                          | Quản trị nhóm «X» chưa duyệt đơn của bạn. Bạn gửi lại được từ 18/10.                 |
| N23 | Đơn hết hạn (21 ngày)                                         | người xin                                | NCB  | ✓       | —                          | —                                                                                    |
| N24 | Lời mời mới                                                   | người được mời                           | NCB  | ✓       | ✓ cần làm                  | Bạn được mời vào «X». Lời mời còn hạn tới 24/10.                                     |
| N25 | Có tên trong danh sách lớp (lúc nạp, tài khoản đã có)         | người đó                                 | NCB  | ✓       | ✓                          | Bạn có tên trong danh sách thành viên của «X». Mở để vào nhóm.                       |
| N26 | Bị gỡ khỏi nhóm                                               | người đó                                 | NCB  | ✓       | ✓                          | Bạn không còn là thành viên «X».                                                     |
| N27 | Bị cấm khỏi nhóm                                              | người đó                                 | NCB  | ✓       | ✓                          | Bạn không còn là thành viên «X» và không vào lại nhóm này được.                      |
| N28 | Được gỡ cấm                                                   | người đó                                 | NCB  | ✓       | —                          | —                                                                                    |
| N29 | Được xếp vào đơn vị con                                       | người đó                                 | NCB  | ✓       | —                          | —                                                                                    |
| N30 | Thông báo của nhóm                                            | thành viên trong phạm vi, trừ người gửi  | TBN  | ✓       | ✓                          | Tiêu đề «X», nội dung = 100 ký tự đầu của thông báo                                  |

**Cố ý không báo**: nhóm vừa được lập (chưa có ai), có người bấm tham gia / tự rời / nhận lời mời (nhóm đông thì
thành tiếng ồn — quản trị xem số thành viên trong app), lời mời bị thu hồi hay hết hạn (luật 5), đổi mã nhóm, đổi
kiểu bảng tin, đổi "nhận tin người ngoài". Công khai → riêng tư và đổi cách vào chỉ ảnh hưởng tới **tin** — báo ở đợt
2 cho đúng người đăng tin bị ảnh hưởng.

**Đợt sau — `group` đã phát đủ sự kiện, chỉ thêm dòng vào ma trận**

| #   | Chuyện                                                                     | Ai nhận                     | Nhóm | Hộp thư | Nhắc                       | Change              |
| --- | -------------------------------------------------------------------------- | --------------------------- | ---- | ------- | -------------------------- | ------------------- |
| N31 | Tin mới hiện đầy đủ trên bảng tin nhóm                                     | thành viên trừ người đăng   | TMN  | ✓ gộp   | ✓ ≤ 1 lần / 2 giờ / nhóm   | `add-listings`      |
| N32 | Tin của bạn tạm ẩn / hiện lại vì nhóm khoá, mở, bạn rời nhóm               | người đăng                  | TĐB  | ✓ gộp   | —                          | `add-listings`      |
| N33 | Tin của người ngoài rời nhóm (sang riêng tư, đóng): 30 ngày chuyển lên sàn | người đăng                  | TĐB  | ✓       | ✓                          | `add-listings`      |
| N34 | Tin "nhóm công khai" hạ về "chỉ thành viên"                                | người đăng                  | TĐB  | ✓ gộp   | —                          | `add-listings`      |
| N35 | Huy hiệu bị gỡ khỏi tin của bạn                                            | người đăng                  | TĐB  | ✓ gộp   | —                          | `add-listings`      |
| N36 | Tin trong nhóm máy giữ chờ duyệt                                           | quản trị nhóm trong phạm vi | NCB  | ✓ gộp   | ✓ ≤ 1 lần / 30 phút / nhóm | `add-review-queues` |

**Realtime không kèm thông báo** (chỉ để app tải lại đúng màn, không vào hộp thư):

| Sự kiện socket                  | Gửi tới                          | Khi nào                                            |
| ------------------------------- | -------------------------------- | -------------------------------------------------- |
| `notification:new` / `:updated` | người nhận                       | mỗi dòng ma trận (thêm mới hoặc gộp)               |
| `notification:unread`           | người nhận                       | số chưa đọc đổi (nhận mới, đọc trên máy khác)      |
| `me:groups-changed`             | người có tư cách hay vai vừa đổi | vào, rời, bị gỡ, cấm, đổi vai, nhóm khoá, mở, đóng |
| `group:pending`                 | quản trị nhóm                    | số đơn chờ đổi (gửi, rút, duyệt, hết hạn)          |

### 2. Realtime — socket.io

- **Vì sao socket.io**: client cho React Native ổn định, tự nối lại, có phòng; hệ cũ đã dùng nên đội quen; ngày chạy
  nhiều tiến trình có `@socket.io/postgres-adapter` (LISTEN/NOTIFY của Postgres, không cần Redis). Đã duyệt cài
  `socket.io` (server) và `socket.io-client` (chỉ devDependency, để test nối thật); app cài client sau.
- Gắn vào cùng HTTP server của Fastify, đường dẫn `/realtime`, chỉ `websocket` (không long-polling).
- **Xác thực lúc bắt tay**: access token trong `auth`, kiểm JWT rồi `resolveActor` như mọi request (phiên bị thu
  hồi, hết hạn, tài khoản khoá → từ chối). Socket vào phòng `user:<accountId>` và `session:<sessionId>`. **Chỉ có
  phòng theo người** — không phòng theo nhóm, nên vào nhóm giữa phiên không phải nối lại; thông báo nhóm gửi tới
  từng người nhận đã tính sẵn.
- **Chiều server → app thôi**: app làm gì cũng qua HTTP, quyền chỉ kiểm ở một chỗ. `notification:new` mang đúng
  dòng hộp thư kèm cờ `alert` (app hiện banner khi `alert`); các sự kiện khác chỉ mang mã và số đếm, dữ liệu chi
  tiết app tải bằng HTTP.
- **Cắt socket**: hết hạn access token thì server tự ngắt, app nối lại bằng token mới (client socket.io gọi hàm lấy
  token mỗi lần nối); khoá, xoá tài khoản, đổi hay đặt lại mật khẩu, đặt lại lớp thứ hai → ngắt phòng người; phiên
  bị thu hồi (đăng xuất, đăng xuất máy khác, dùng lại refresh token, bị đẩy ra vì quá trần phiên) → ngắt phòng phiên.
  `identity` gọi thẳng cổng `sessionsRevoked` ngay sau khi ghi xong, **không qua outbox**: outbox chậm tới một vòng
  10 giây, mà đây là cắt quyền; mất một lệnh ngắt (tiến trình chết giữa chừng) thì socket vẫn tự đóng lúc token hết
  hạn và bắt tay lại sẽ bị `resolveActor` từ chối. Ngày chạy nhiều tiến trình, adapter của socket.io đưa lệnh ngắt
  phòng tới mọi tiến trình.
- Realtime là kênh **báo hiệu**, không phải nguồn sự thật: mất kết nối thì app gọi lại số chưa đọc và hộp thư khi
  nối lại.

### 3. Push — hoãn tới khi app làm (quyết 11/10/2026)

Đợt này server chưa lưu token, chưa gửi push. Mỗi thông báo đã mang cờ `alert` (đã tính bật tắt nhóm thông báo,
tắt tiếng nhóm, trần nhắc), nên ngày làm push chỉ thêm một bên nghe đọc cờ đó. Thiết kế giữ sẵn cho ngày đó:

- Expo Push Service (app là Expo): server gọi HTTP `https://exp.host/--/api/v2/push/send` bằng `fetch`, không thêm
  package; cần tài khoản Expo / EAS, khoá FCM v1 và APNs.
- Token gắn với **phiên** (cột trên `sessions`, `identity` sở hữu): phiên thu hồi hay hết hạn thì máy tự hết nhận;
  một token chỉ thuộc một phiên — máy đăng nhập tài khoản khác thì token chuyển sang phiên mới, máy dùng chung
  không hiện thông báo của tài khoản trước.
- Job pg-boss gửi theo lô 100, đọc biên nhận sau 15 phút, `DeviceNotRegistered` thì xoá token. Không ghi token vào
  log.

### 4. Hộp thư, gộp, độ trễ

- Bảng `notifications` (`notification` sở hữu): `recipient_id`, `category`, `type`, `title`, `body`, `data` (jsonb:
  mã nhóm, link sâu), `group_id` (thông báo thuộc một nhóm — để tắt tiếng), `collapse_key`, `count`, `alert`,
  `alerted_at`, `read_at`, `source_event_id`, `created_at`, `updated_at`. Unique (`source_event_id`,
  `recipient_id`) → outbox giao trùng không sinh hai thông báo. Văn bản sinh lúc ghi từ mẫu trong code.
- **Gộp**: sự kiện có `collapse_key` (vd `group:<id>:join-requests`) mà người nhận còn thông báo chưa đọc cùng khoá
  → cập nhật dòng đó (`count + 1`, câu mới, `updated_at`); chỉ nhắc lại khi `alerted_at` cũ hơn
  `notification.collapseAlertMinutes` (30).
- **Cờ `alert`** = dòng ma trận có nhắc, người nhận bật nhóm thông báo đó (TK 24), không tắt tiếng nhóm gửi, và
  chưa chạm trần gộp. Hộp thư luôn nhận, bất kể cờ.
- **Tắt tiếng từng nhóm** (bảng `group_notification_mutes`: người, nhóm): thông báo thuộc nhóm đó vẫn vào hộp thư
  nhưng không nhắc. Áp cho mọi thông báo mang `group_id` trừ chuyện về chính tư cách của người đó (được duyệt, bị
  gỡ, bị cấm, lời mời, lời giao chủ, vai) — tắt tiếng một nhóm ồn không được làm người ta lỡ việc của chính mình.
- **Gửi cho cả nhóm**: lấy người nhận qua cổng của `group` theo trang 1000 người, mỗi trang một câu `INSERT … SELECT
unnest(…)` (khuôn đã đo ở danh sách email dùng một lần: 96 nghìn dòng 0,6 giây).
- **Độ trễ**: bộ phát outbox đang quét 10 giây một lần — chậm cho realtime. Thêm `outbox.kick()`: app gọi sau mỗi request
  ghi (hook `onResponse` cho mọi method trừ GET/HEAD — không bắt từng service nhớ gọi), bộ phát chạy ngay (gộp các
  lần gọi sát nhau); vòng 10 giây giữ làm lưới an toàn cho sự kiện của việc nền.
  Một tiến trình thì gọi trong bộ nhớ là đủ; nhiều tiến trình thì chuyển sang `NOTIFY` của Postgres.
- Hạn lưu thông báo 90 ngày (TK 25) do `add-data-retention` dọn, như mọi hạn lưu khác.

### 5. Module và ranh giới

- `notification` sở hữu `notifications`, `notification_preferences`, `group_notification_mutes`. Người nhận của
  một sự kiện nhóm lấy qua cổng của `group` (`memberIds`, `managerIds`) — không đọc bảng của `group`.
- Ánh xạ sự kiện → thông báo là một bảng trong code (`notification.matrix.ts`): mỗi dòng ma trận một mục, test duyệt
  qua đủ các dòng.
- Cổng realtime (`src/common/realtime/`) là hạ tầng dùng chung như outbox: `notification` gọi `emitToUser`; nhắn
  tin (đợt 6) dùng lại.

### Mã lỗi mới

`NOTIFICATION_GROUP_ALWAYS_ON` (đã có trong spec `preferences`).

## Risks / Trade-offs

- **Chưa có push**: người không mở app chỉ thấy thông báo khi mở lại. Ngày làm push chỉ thêm một bên nghe đọc cờ
  `alert`.
- **Socket một tiến trình** (TK 30): nhiều tiến trình cần `@socket.io/postgres-adapter` và `kick()` qua `NOTIFY`.
- **Bên nghe outbox ghi hộp thư cho nhóm đông**: vài giây cho vài chục nghìn dòng, không chặn request của người gửi.

## Migration Plan

Migration `init_notification`: `notifications`, `notification_preferences`, `group_notification_mutes`. Không đổi
dữ liệu có sẵn.
