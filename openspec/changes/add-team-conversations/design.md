# Design

## Context

Động cơ: proposal.md — Why. Hiện trạng (archive `add-messaging`, `add-notifications`, `add-data-retention`; giả định
`add-price-offers` đã archive trước change này):

- Bảng `conversations` là một cặp tin + người mua: `listing_id`, `seller_id`, `buyer_id` NOT NULL, unique
  `(listing_id, buyer_id)`; cột "phía tôi" (`*_read_at`, `*_hidden_at`) chọn theo vai mua / bán qua `sideOf` /
  `otherOf` (`messaging.shared.ts`). FK sang tin đã bỏ ở `add-data-retention` — `messaging` không FK sang bảng của module
  khác.
- `group` đã có cổng cho bên ngoài: `managerIds` (chủ nhóm + điều hành viên đang giữ vai), `isBanned`, `findGroup`,
  `reviewersOf`; dọn nhóm đóng quá hạn qua `purgeDue` / `purgeClosed` của `ops`.
- Quyền staff theo phạm vi `OPS_SCOPES = ['support', 'user_reports', 'id_verification']`, preHandler
  `requireOps('support')`, treo quyền khi khoá / có gậy đã có (`platform/staff-permissions`).
- Thông báo tin nhắn (N47) gộp theo khoá `conversation:<id>`, người nhận là một tài khoản (`recipientId`).

## Goals / Non-Goals

**Goals:**

- Một bảng hội thoại, một bảng tin nhắn cho cả ba loại: con trỏ, hạn lưu, bản ghi cho người xử, bộ lọc, realtime dùng
  lại nguyên đường.
- "Một hội thoại hỗ trợ mỗi người", "một hội thoại mỗi người + nhóm" do DB giữ.
- Quyền của người trong đội tính theo hiện tại ở mỗi lượt gọi (mất vai là mất quyền ngay), không chép danh sách đội
  vào hội thoại.

**Non-Goals:** xem proposal — Cố ý chưa làm. Không đổi luật của hội thoại về tin.

## Decisions

1. **Thêm loại vào bảng hội thoại hiện có, không tách bảng.** Module `messaging` sở hữu mọi cột dưới đây.
   - enum `conversation_kind` (`listing`, `support`, `group`); cột `kind` NOT NULL DEFAULT `listing`;
   - `listing_id`, `seller_id` thành NULL được; cột mới `group_id` UUID NULL — không FK (như `listing_id`): nhóm do
     `group` sở hữu, dọn theo sự kiện (mục 7);
   - `team_pending_since` TIMESTAMPTZ NULL: lúc tin nhắn đầu tiên của người dùng mà đội chưa trả lời — đặt khi người dùng
     gửi và cột đang NULL, xoá khi người trong đội gửi. Là khoá sắp xếp của hàng hỗ trợ;
   - CHECK viết tay `conversations_kind_check`: `listing` ⇒ `listing_id`, `seller_id` NOT NULL, `group_id`,
     `team_pending_since` NULL; `support` ⇒ `listing_id`, `seller_id`, `group_id` NULL; `group` ⇒ `group_id` NOT NULL,
     `listing_id`, `seller_id` NULL;
   - partial unique viết tay `conversations_one_support` ON `(buyer_id)` WHERE `kind = 'support'` và
     `conversations_one_group` ON `(group_id, buyer_id)` WHERE `kind = 'group'`; unique `(listing_id, buyer_id)` cũ giữ
     nguyên (NULL không đụng nhau);
   - index `conversations_support_queue` ON `(team_pending_since NULLS LAST, last_activity_at DESC)` WHERE
     `kind = 'support'`; index `(group_id, last_activity_at)` WHERE `kind = 'group'` cho danh sách của quản trị.

   **Tên cột giữ nguyên, nghĩa mở rộng**: với hội thoại với một đội, `buyer_id` là người dùng, phía "seller" là cả đội —
   `seller_read_at` là đã đọc chung của đội (spec "Một người trong đội đọc là cả đội đã đọc"), `seller_hidden_at` luôn
   NULL (đội không xoá). Đổi tên cột là migration lớn cho mọi chỗ đọc mà không đổi hành vi nào; `sideOf` thành chỗ duy
   nhất biết nghĩa này — trả `'buyer'` cho người dùng, `'seller'` cho người trong đội.

2. **Ai là người trong đội — tính lúc gọi, qua cổng.** `messaging` không giữ danh sách đội:
   - hội thoại `group`: `group.managerIds(groupId)` chứa người gọi (cổng đã trả vai đang giữ, không gồm vai treo);
   - hội thoại `support`: chỉ qua route `/ops/support/*` với `requireOps('support')`; route của app không bao giờ coi
     staff là người trong đội hỗ trợ — đúng spec "Staff đi qua app" (404).

   `sideOf(row, actor)` thành async cho hai loại mới: `'buyer'` nếu là người dùng, `'seller'` nếu đang trong đội, `null`
   → `404` như người ngoài. Danh sách hội thoại của quản trị = hội thoại `group` của các nhóm họ đang quản trị, ghép vào
   `GET /me/conversations` theo cùng con trỏ `last_activity_at` — cần cổng mới `group.managedGroupIds(accountId)`.

3. **Mở hội thoại với đội** (`POST /me/support/conversation`, `POST /groups/{groupId}/conversation`): cùng preHandler
   "đã đăng nhập, đã xác nhận email" của route nhắn tin, cùng `assertCanMessage` (master 403). Nhóm: `findGroup` (không
   có → 404), xem được hồ sơ (theo luật của `GET /groups/{groupId}` — người ngoài nhóm riêng tư vẫn thấy tên), trạng
   thái `active` / `going_private` / `ownerless` (khác → `409 GROUP_NOT_ACTIVE`), `isBanned` → `403 GROUP_BANNED`,
   người gọi thuộc `managerIds` → `403 CANNOT_MESSAGE_OWN_GROUP`. Insert bắt `unique_violation` của partial unique thì
   đọc lại dòng đã có (hai lượt mở cùng lúc ra một) — không khoá người mở, vì không có hạn mức để giữ đúng. Không đếm vào
   `countOpenedSince` (đếm lọc `kind = 'listing'`).
4. **Gửi tin trong hội thoại với đội** — cùng `send` hiện có, khác ba chỗ: không xét chặn (`messaging/blocking`); bên
   kia "đã rời" chỉ áp khi người gửi là đội và người dùng đã xoá tài khoản (`409 CONVERSATION_CLOSED`); nhóm `closed`
   → `409 CONVERSATION_CLOSED` cho cả hai bên, người dùng đang bị cấm → `403 GROUP_BANNED` (người dùng) / `409
CONVERSATION_CLOSED` (quản trị). Bộ lọc cụm từ cấm áp cho mọi người gửi qua app; route `/ops/support/*/messages` bỏ
   qua bộ lọc (spec conversations). `touch` đặt / xoá `team_pending_since` theo phía gửi; `buyer_messages` chỉ tăng ở hội
   thoại `listing` (dữ kiện tin sạch).
5. **DTO**:
   - Hội thoại thêm `kind`; `listing` thành nullable; thêm `group: { id, name } | null`; `role` thêm `'team'` (người
     trong đội; người dùng của hội thoại với đội vẫn là `'buyer'` — giữ app hiện có khỏi nhánh mới);
   - `counterpart` thêm `kind: 'account' | 'support' | 'group_admins'`, `accountId` nullable (null khi bên kia là đội),
     `displayName` = "Hỗ trợ Ghim" / "Quản trị nhóm «tên nhóm»" — tên nhóm đọc lúc trả, nên đổi tên nhóm thì hội thoại
     cũ đổi theo;
   - tin nhắn thêm `fromMe`; `senderId` nullable — người dùng nhận `null` cho mọi tin của đội, người trong đội nhận mã
     người viết. Hội thoại về tin không đổi gì: `senderId` luôn có.
   - `canOffer` (từ `add-price-offers`) luôn false ngoài hội thoại `listing`.
6. **Bàn vận hành hỗ trợ** (module `messaging`, route `/ops/support/conversations`, `requireOps('support')`): danh sách
   theo `conversations_support_queue` (đang chờ trước, chờ lâu nhất trước; `?status=pending|all`), xem một hội thoại, tin
   nhắn theo con trỏ, gửi, đánh dấu đã đọc. Staff là người dùng của hội thoại (`buyer_id` = chính mình) → gửi `403
FORBIDDEN` (cam kết 1); hội thoại của chính mình vẫn hiện trong hàng để staff khác thấy. Mọi lượt gửi của staff vào
   nhật ký thao tác như thao tác ops khác — mã hội thoại và mã tin nhắn, không chứa nội dung (cam kết 31).
7. **Sự kiện, thông báo, realtime**:
   - `messaging.message.sent` mang thêm `kind` và `recipientIds` (thay `recipientId` đơn): hội thoại về tin = một người;
     người dùng → quản trị nhóm = `managerIds` lúc gửi trừ người gửi; đội → người dùng = người dùng; người dùng → hỗ trợ
     = rỗng (staff không nhận hộp thư). Payload cũ còn trong outbox lúc triển khai: bên nghe đọc `recipientId` khi không
     có `recipientIds`.
   - `notification`: nhóm `support` cho tin của Hỗ trợ Ghim, `messages` cho phần còn lại; tiêu đề là tên đội phía người
     dùng, "«tên nhóm» · tên người dùng" phía quản trị; khoá gộp vẫn `conversation:<id>` theo từng người nhận.
   - Realtime: `message:new` tới mọi người nhận ở trên; `support:pending { count }` tới mọi tài khoản đang mang quyền
     `support` sau mỗi lượt đổi `team_pending_since` của hội thoại hỗ trợ. Danh sách người nhận cần cổng mới của
     `platform` (`PrivilegeSource` hiện chỉ hỏi được từng tài khoản): `activeScopeHolders('support')` — chỉ quyền đang
     `active`, quyền treo không nhận. Đếm là `COUNT(*)` trên partial index — rẻ ở cỡ hàng hỗ trợ.
   - Nhóm bị dọn (`group` purge closed): bên nghe xoá hội thoại `group` của nhóm đó cùng tin nhắn — trừ hội thoại đang
     dính báo cáo / gậy / khiếu nại mở (luật giữ bằng chứng hiện có, cam kết 31).
8. **Hạn lưu**: điều kiện xoá hẳn hiện có (cả hai bên đã xoá, hoặc 1 năm không ai nhắn) giữ nguyên. Với hội thoại với
   đội, `seller_hidden_at` luôn NULL nên chỉ nhánh "1 năm không ai nhắn" áp — đúng ý "đội giữ lịch sử" mà không phải
   thêm luật.

## Risks / Trade-offs

- [A đã chặn B, B là điều hành viên nhóm X — B vẫn đọc và trả lời hội thoại A mở với quản trị X] → Đúng theo spec: bên
  kia là đội, và B trả lời dưới tên nhóm, A không thấy B. A dừng bằng cách xoá hội thoại; quấy rối thì người xử báo cáo
  thấy người viết từng tin (mã người gửi giữ trong DB). Báo cáo từ hội thoại với đội là change sau (proposal).
- [Quản trị một nhóm lớn bị dồn tin] → Gộp theo hội thoại, tắt tiếng nhóm "tin nhắn" được; chưa có hạn mức riêng — thêm
  con số khi có dữ liệu thật (cam kết 33).
- [`sideOf` thành async, gọi `group` ở mỗi lượt] → Một truy vấn `managerIds` mỗi lượt gọi hội thoại `group`; hội thoại
  về tin không đổi đường đi. Danh sách hội thoại gọi `managedGroupIds` một lần mỗi trang.
- [Đổi `recipientId` thành `recipientIds` trong payload outbox] → Bên nghe đọc cả hai dạng trong một bản phát hành;
  test với payload dạng cũ.
- [`listing`, `counterpart.accountId`, `senderId` thành nullable] → Client sinh từ tài liệu phải xử lý null; app hiện
  chưa nối chat thật nên không có bản cũ nào hỏng.

## Migration Plan

Một migration `add_team_conversations`: enum, cột `kind` (mặc định `listing` cho mọi dòng cũ), `group_id`,
`team_pending_since`, bỏ NOT NULL của `listing_id` / `seller_id`; CHECK, hai partial unique, hai partial index viết tay.
Không mất dữ liệu: dòng cũ thoả nhánh `listing` của CHECK. Đọc SQL trước khi áp; production cần `pnpm db:deploy:prod`.
Rollback: revert code khi chưa có hội thoại với đội nào; có rồi thì CHECK chặn đặt lại NOT NULL — xoá các dòng đó trước.
