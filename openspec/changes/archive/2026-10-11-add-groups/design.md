# Design

> **Đã duyệt 11/10/2026** (bảng "Đã chốt" cuối file): kéo hộp thư và realtime lên đợt này; socket.io cho server;
> push lên điện thoại hoãn tới khi app làm; mọi thành viên được báo khi nhóm khoá, mở khoá, đóng; có tắt tiếng từng
> nhóm; các mục còn lại theo đề xuất.

## Context

- Đã có: `identity` (tài khoản, phiên, khoá / mở khoá / xoá phát sự kiện `identity.account.locked|unlocked|deleted`),
  `platform` (master, staff, bảng con số có phiên bản, nhật ký), `category`, outbox có lease và retry, pg-boss chạy
  việc theo lịch, mọi test chạy trên Postgres thật.
- Bảng con số đã có đủ 7 số của nhóm (`group.applicationExpiresDays` 21, `reapplyWaitDays` 7,
  `maxPendingApplications` 3, `inviteExpiresDays` 14, `ownershipTransferExpiresDays` 14, `codeLength` 6,
  `ownerlessMaxDays` 30).
- Thông báo (TK 24) đang xếp ở đợt 6 (`add-notifications`), sau nhắn tin. Realtime và dịch vụ đẩy thông báo chưa
  chọn. Yêu cầu ngày 11/10/2026: nhóm là module chủ chốt, và quản trị nhóm ↔ thành viên cần thông báo realtime
  (socket) và đẩy lên điện thoại (push) ngay từ lúc có nhóm.
- App là Expo 57 (`docs/Booking/ghim-app`), chưa có `expo-notifications` hay client socket.
- Hệ cũ (`docs/market`) dùng socket.io với phòng theo người (`user:<id>`) và phòng theo nhóm (`org:<id>:members`);
  bài học giữ lại: cắt socket khi khoá tài khoản, không báo người tự làm. Bài học bỏ: phòng theo nhóm nạp lúc bắt
  tay nên vào nhóm giữa phiên phải nối lại mới nghe được.

## Goals / Non-Goals

**Goals**

- Đủ mọi requirement trong 5 delta spec `group/*` và `identity/account-deletion` của change này.
- Mỗi chuyện xảy ra trong nhóm phát đúng một sự kiện outbox, đủ để thông báo (đợt 1) và tin đăng, hàng duyệt (đợt
  2, 4) nghe mà không phải sửa lại `group`.
- Một ma trận thông báo chốt được: chuyện nào báo ai, vào hộp thư hay đẩy lên điện thoại, gộp và giới hạn ra sao.
- Mọi tranh chấp đồng thời (hai người duyệt một đơn, nhận lời mời lúc nhóm đóng…) có một cơ chế chặn và một test DB.

**Non-Goals** (giữ như proposal): ảnh hưởng lên tin, huy hiệu trên tin, người ngoài đăng tin, T1 cho vai, gậy nặng
mất vai, cựu thành viên, dọn dữ liệu nhóm đóng. Ảnh đại diện nhóm (cần `media`, đợt 2).

## Decisions

### 1. Hai change, làm chung một lượt: `add-groups` và `add-notification-core` (mới)

Thông báo cho nhóm cần ba thứ chưa có: hộp thư, push, realtime. Chờ tới đợt 6 thì cả 5 đợt sống không có thông
báo nào; viết tạm trong `group` thì đợt 6 phải viết lại. **Đề xuất**: tách phần lõi của `add-notifications` thành
change mới `add-notification-core`, làm ngay sau `add-groups` trong cùng lượt (như `platform` + `category`):

| Phần                                                                                 | Change                               |
| ------------------------------------------------------------------------------------ | ------------------------------------ |
| Nhóm, thành viên, vai, huy hiệu, thông báo của nhóm (nội dung)                       | `add-groups`                         |
| Hộp thư, 9 nhóm bật tắt, tắt tiếng từng nhóm, realtime, ánh xạ `group.*` → thông báo | `add-notification-core` (đợt 1)      |
| Đẩy thông báo lên điện thoại (Expo Push Service, token gắn phiên)                    | hoãn tới khi app làm push (mục 15)   |
| Báo tin nhắn mới, không đẩy tin nhắn của hội thoại đang mở                           | `add-notifications` (đợt 6, thu hẹp) |
| Báo "tin mới trong nhóm", tin của bạn tạm ẩn vì nhóm                                 | `add-listings` (đợt 2)               |

`group` không gọi thẳng `notification`: nó ghi sự kiện vào outbox trong cùng transaction (TK 30), `notification`
nghe. Bỏ `notification` đi thì `group` vẫn chạy đúng. Cần sửa TK 29 (thứ tự xây) — xem mục "Sửa TK đi kèm".

### 2. Trả lời 15 câu hỏi mở của proposal (đề xuất)

| #   | Câu hỏi                                                                | Đề xuất                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Huy hiệu ở nhóm công khai · xét duyệt                                  | Theo TK 10: đủ bốn đường được xét (duyệt, lời mời, danh sách lớp, master giao). TK 10 cụ thể hơn bảng TK 9; sửa bảng TK 9 cho khớp.                                                                                                                                                                                                                          |
| 2   | Lời giao chủ lần đầu có hạn?                                           | Có, dùng chung `ownershipTransferExpiresDays` (14). Hết hạn thì nhóm vẫn chờ giao chủ, master giao lại.                                                                                                                                                                                                                                                      |
| 3   | Chuyển chủ: người nhận, chủ cũ, master giao đè                         | Người nhận phải là thành viên đủ điều kiện nhận vai. Chủ cũ thành thành viên thường (quyền tối thiểu; chủ mới bổ nhiệm lại nếu muốn). Master giao chủ mới cho nhóm đang có chủ không cần chủ cũ đồng ý (nguyên tắc 3), chủ cũ được báo.                                                                                                                      |
| 4   | Thiếu chủ: đề cử ai, có phải đồng ý, chỉ còn điều hành viên đơn vị con | "Lâu năm nhất" = sớm nhất theo ngày nhận vai điều hành viên cấp cả nhóm, hoà thì ngày vào nhóm; không có ai cấp cả nhóm thì lấy điều hành viên đơn vị con lâu năm nhất. Master xác nhận = gửi lời giao chủ (đề cử hoặc thành viên đủ điều kiện khác), người đó bấm đồng ý như lời giao thường. Chỉ tạm khoá ngay khi không còn điều hành viên nào ở mọi cấp. |
| 5   | Lúc thiếu chủ, master có bị chặn đổi cài đặt?                          | Không. Luật chặn chỉ áp cho người trong nhóm; master đứng ngoài (nguyên tắc 3).                                                                                                                                                                                                                                                                              |
| 6   | Nhóm khoá vì thiếu chủ quá hạn: mở khoá thế nào                        | Khoá do hệ thống (thiếu chủ quá hạn, hết điều hành viên) tự mở khi nhóm có chủ dùng được: chủ cũ được mở khoá, hoặc người nhận lời giao chủ của master. Master mở khoá tay nhóm chưa có chủ dùng được → 409 `GROUP_OWNER_REQUIRED`. Khoá do master thì chỉ master mở.                                                                                        |
| 7   | Đóng nhóm chờ giao chủ, khoá nhóm thiếu chủ                            | Được, thêm hai mũi tên vào sơ đồ TK 9: chờ giao chủ → đã đóng (master), thiếu chủ → tạm khoá (master).                                                                                                                                                                                                                                                       |
| 8   | Đơn vị con                                                             | Chỉ nhóm trường học, công ty. Chủ nhóm lập, đổi tên, xoá đơn vị trống (còn người → 409 `GROUP_UNIT_NOT_EMPTY`). Chủ và điều hành viên cả nhóm xếp người. Điều hành viên đơn vị chỉ quản lý thành viên đơn vị mình (gỡ, cấm, mời vào đơn vị, gửi thông báo cho đơn vị); không duyệt đơn (đơn không thuộc đơn vị nào).                                         |
| 9   | Danh sách lớp                                                          | Chủ nhóm và điều hành viên cả nhóm nạp danh sách email, mỗi email kèm đơn vị (tuỳ chọn). Chỉ lưu dấu băm HMAC của email chuẩn hoá — cùng khoá với `accounts.email_hash`, nên khớp người mà không giữ email thô. Người có tên vào được ngay và tự vào đơn vị ghi kèm. Không báo lại cho quản trị email nào đã khớp (khỏi dò email).                           |
| 10  | Lời mời theo tài khoản hay email; ai đổi mã                            | Mời bằng email chính xác của một tài khoản đã có; response giống hệt dù email có tài khoản hay không (không dò được). Người chưa có tài khoản: dùng danh sách lớp. Đổi mã nhóm: chủ nhóm và master (đúng spec).                                                                                                                                              |
| 11  | Cựu thành viên                                                         | Hoãn sang change sau; enum đường rời giữ chỗ `alumni` (TK 29: giữ chỗ trong dữ liệu).                                                                                                                                                                                                                                                                        |
| 12  | Riêng tư → công khai "báo trước"                                       | Đổi có hiệu lực ngay, mọi thành viên được báo trong cùng transaction. Lý do: không gì của thành viên lộ thêm (danh sách thành viên vẫn kín, tin "chỉ thành viên" giữ mức). Phương án nặng hơn (báo trước 72 giờ, huỷ được) ghi ở Risks. Công khai → riêng tư: "hiện tên" mặc định tắt.                                                                       |
| 13  | Đổi cách vào thì đơn, mã ra sao                                        | Xét duyệt → mở cửa: đơn đang chờ huỷ (không tự duyệt — tự duyệt sẽ trao đường vào "được duyệt" mà không ai xét), người xin được báo. Có mã → chỉ lời mời: mã huỷ, đơn đang chờ vẫn được xét. Chỉ lời mời → có mã: sinh mã mới.                                                                                                                               |
| 14  | Cấm người ngoài; gỡ cấm                                                | Cấm được người chưa từng là thành viên (người gửi tin vào nhóm ở đợt 2). Chủ, điều hành viên cả nhóm và master gỡ cấm được.                                                                                                                                                                                                                                  |
| 15  | Nhóm tạm khoá: lý do; ai làm được gì                                   | Master phải ghi lý do (hiện cho chủ và điều hành viên). Trong lúc khoá nhóm chỉ đọc: không vào, không duyệt, không đổi cài đặt, không gửi thông báo; chủ nhóm và master vẫn đóng được.                                                                                                                                                                       |

Thêm hai luật suy ra, cũng cần duyệt:

- **Điều hành viên không xử nhau**: điều hành viên không gỡ, cấm điều hành viên khác hay chủ nhóm; chủ nhóm bãi
  nhiệm trước rồi mới xử.
- **Mô tả nhóm**: thêm trường `description` (tuỳ chọn, tối đa 1000 ký tự, chủ nhóm sửa). TK không nhắc nhưng app
  cần một dòng giới thiệu ở hồ sơ nhóm.

### 3. Dữ liệu — `group` sở hữu 9 bảng

| Bảng                   | Cột chính                                                                                                                                                                                                                                                                                                                       | Ràng buộc                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups`               | `name`, `name_folded` (tìm không dấu), `description`, `kind`, `state`, `mode`, `target_mode` (lúc chuyển sang riêng tư), `allow_outsiders`, `show_name_on_marketplace`, `board_style`, `code`, `ownerless_since`, `nominee_id`, `locked_at`, `lock_cause`, `locked_reason`, `locked_by`, `closed_at`, `closed_by`, `created_by` | CHECK: `state` ↔ cột thời điểm (`locked` ↔ `locked_at`…); `allow_outsiders` chỉ ở chế độ công khai; `show_name…` chỉ ở riêng tư; `code` có ⇔ riêng tư · có mã và chưa đóng. Unique `code` khi khác null. |
| `group_units`          | `group_id`, `name`                                                                                                                                                                                                                                                                                                              | Unique (`group_id`, `name`)                                                                                                                                                                              |
| `group_members`        | `group_id`, `account_id`, `role` (member / moderator / owner), `moderator_unit_id`, `unit_id`, `joined_via`, `joined_at`, `role_since`                                                                                                                                                                                          | PK (`group_id`, `account_id`); **một chủ mỗi nhóm**: unique (`group_id`) WHERE `role = 'owner'`; CHECK `moderator_unit_id` chỉ khi `role = 'moderator'`                                                  |
| `group_bans`           | `group_id`, `account_id`, `banned_by`, `banned_at`                                                                                                                                                                                                                                                                              | PK (`group_id`, `account_id`)                                                                                                                                                                            |
| `group_join_requests`  | `group_id`, `account_id`, `status`, `created_at`, `expires_at`, `decided_at`, `decided_by`                                                                                                                                                                                                                                      | **Một đơn chờ mỗi cặp**: unique (`group_id`, `account_id`) WHERE `status = 'pending'`                                                                                                                    |
| `group_invitations`    | `group_id`, `account_id`, `unit_id`, `invited_by`, `status`, `created_at`, `expires_at`, `decided_at`                                                                                                                                                                                                                           | Unique (`group_id`, `account_id`) WHERE `status = 'pending'`                                                                                                                                             |
| `group_roster_entries` | `group_id`, `email_hash`, `unit_id`, `added_by`, `added_at`                                                                                                                                                                                                                                                                     | PK (`group_id`, `email_hash`)                                                                                                                                                                            |
| `group_owner_offers`   | `group_id`, `kind` (assignment / transfer), `from_account_id`, `to_account_id`, `status`, `created_at`, `expires_at`, `decided_at`                                                                                                                                                                                              | **Một lời giao chủ đang chờ mỗi nhóm**: unique (`group_id`) WHERE `status = 'pending'`                                                                                                                   |
| `group_announcements`  | `group_id`, `author_id`, `unit_id` (phạm vi), `body`, `created_at`                                                                                                                                                                                                                                                              | Index (`group_id`, `created_at`)                                                                                                                                                                         |

- **Chủ nhóm là một dòng `group_members` với `role = 'owner'`**, không có cột `owner_id` riêng — một nguồn duy nhất.
  Thiếu chủ không xoá dòng đó: chủ bị khoá vẫn là chủ trên giấy, `state = 'ownerless'` nói nhóm đang chờ. Chủ cũ
  được mở khoá thì chỉ cần đổi `state` lại.
- **Tạm mất vai không lưu**: tài khoản bị khoá không đăng nhập được (phiên bị thu hồi), nên không làm được gì. Chỉ
  chỗ cần đếm "điều hành viên còn dùng được" mới hỏi `identity` trạng thái tài khoản.
- **Quyền huy hiệu không lưu**: là hàm thuần của (`joined_via`, `mode`, `show_name…`, `state`) — "tính lại ngay"
  (spec badges) đúng theo cấu tạo, không có lượt tính lại nào để quên.
- FK `account_id` sang `accounts` (cascade khi xoá hẳn), như `staff_permissions`.

### 4. Trạng thái và đường chuyển

| Từ                                    | Sang                 | Ai                | Điều kiện / tác động                                                                     |
| ------------------------------------- | -------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| —                                     | chờ giao chủ         | master            | lập nhóm                                                                                 |
| chờ giao chủ                          | đang hoạt động       | người được giao   | nhận lời giao → thành chủ, đường vào "master giao"                                       |
| chờ giao chủ                          | đã đóng              | master            | **mới** (câu 7)                                                                          |
| đang hoạt động                        | đang chuyển riêng tư | chủ / master      | đổi sang riêng tư khi còn tin "nhóm công khai" (đợt 1 chưa có tin → xong ngay)           |
| đang chuyển riêng tư                  | đang hoạt động       | hệ thống          | tin "nhóm công khai" đã hạ hết                                                           |
| đang hoạt động                        | thiếu chủ            | hệ thống          | tài khoản chủ bị khoá, còn điều hành viên dùng được                                      |
| đang hoạt động                        | tạm khoá             | hệ thống          | tài khoản chủ bị khoá, không còn điều hành viên dùng được (`lock_cause = no_moderators`) |
| thiếu chủ                             | đang hoạt động       | hệ thống          | chủ cũ được mở khoá, hoặc người nhận lời giao của master                                 |
| thiếu chủ                             | tạm khoá             | hệ thống / master | quá 30 ngày (`ownerless_timeout`), hết điều hành viên, hoặc master khoá (**mới**)        |
| đang hoạt động                        | tạm khoá             | master            | kèm lý do (`lock_cause = master`)                                                        |
| tạm khoá                              | đang hoạt động       | master / hệ thống | master mở khoá (cần chủ dùng được); khoá do hệ thống tự mở khi có chủ dùng được (câu 6)  |
| đang hoạt động, đang chuyển, tạm khoá | đã đóng              | chủ / master      | vĩnh viễn; master đóng được mọi nhóm chưa đóng (cả thiếu chủ)                            |

Bảng này là một hàm thuần `group-state.calc.ts`: mọi thao tác hỏi nó trước, sai thì 409 `GROUP_STATE_CONFLICT`.

### 5. Vào nhóm

Thứ tự xét (TK 10) trong một hàm thuần, chạy trong transaction đã khoá cặp (nhóm, người — mục 9):

1. Nhóm không ở trạng thái nhận người (chờ giao chủ, tạm khoá, đã đóng, đang chuyển riêng tư) → 409.
2. Tài khoản master → 403. Đã là thành viên → 409 `ALREADY_MEMBER`. Bị cấm → 403 `GROUP_BANNED`.
3. Có lời mời còn hạn → vào, đường vào "lời mời". Có tên trong danh sách lớp → vào, "danh sách lớp".
4. Mở cửa → vào, "bấm tham gia". Xét duyệt / có mã (đúng mã) → tạo đơn. Chỉ lời mời → 403 `INVITATION_REQUIRED`.

Đơn: kiểm 7 ngày sau lần bị từ chối gần nhất (429 `JOIN_REQUEST_TOO_SOON` kèm thời điểm), tối đa 3 đơn chờ trên mọi
nhóm (409 `JOIN_REQUEST_LIMIT`), hết hạn 21 ngày. **Hạn được kiểm lúc thao tác** (đơn quá hạn chưa bị job quét vẫn
trả `JOIN_REQUEST_EXPIRED`); job chỉ đổi trạng thái và phát sự kiện để người xin được báo. Mã nhóm sinh bằng bộ chữ
Crockford không I/L/O/U (như mã tra cứu của `identity`), 6 ký tự, thử lại khi trùng.

### 6. Vai

- **Đủ điều kiện nhận vai** (chủ, điều hành viên): tài khoản `user`, đang hoạt động, đã xác nhận email, đang là
  thành viên (trừ lời giao lần đầu). Sai → 409 `GROUP_ROLE_INELIGIBLE` kèm lý do. Đợt 2 thêm "T1 trở lên", đợt 5
  thêm "không có gậy nặng" — cùng một hàm `roleEligibility`.
- **Lời giao chủ** (`group_owner_offers`) gộp ba đường: master giao lần đầu, chủ chuyển nhượng, master giao chủ mới
  (nhóm thiếu chủ hoặc đang có chủ). Nhận lời: dòng chủ cũ (nếu có) về `member`, người nhận thành `owner`, cùng một
  transaction với điều kiện `status = 'pending'` và trạng thái nhóm chưa đổi.
- **Thiếu chủ**: khi nghe `identity.account.locked` của một chủ nhóm → tính đề cử (câu 4), `state = 'ownerless'`,
  `ownerless_since = now`; không còn điều hành viên dùng được → tạm khoá luôn. Nghe `identity.account.unlocked` của
  chủ cũ → nhóm về đang hoạt động (hoặc tự mở khoá nếu khoá do hệ thống), huỷ lời giao của master đang chờ.

### 7. Huy hiệu

`badgeEligible(member, group)` trong `badges.calc.ts`: thành viên, nhóm chưa đóng, `joined_via` ∈ {được duyệt, lời
mời, danh sách lớp, master giao}, và (nhóm công khai · xét duyệt, hoặc nhóm riêng tư đã bật hiện tên). Tạm khoá
không đổi quyền — đợt 2 chỉ ẩn huy hiệu lúc hiển thị. Mỗi lần quyền có thể đổi (đổi chế độ, công tắc, rời, gỡ, cấm,
đóng), `group` phát `group.badge.rights_changed` để `listing` (đợt 2) gỡ huy hiệu khỏi tin.

### 8. Thông báo của nhóm (nội dung thuộc `group`, gửi đi thuộc `notification`)

- Chủ nhóm và điều hành viên cả nhóm gửi cho cả nhóm; điều hành viên đơn vị chỉ gửi cho đơn vị mình (câu 8).
- Văn bản thuần, 1–1000 ký tự, tối đa **5 thông báo mỗi nhóm mỗi ngày** (số mới cho TK 28). Nhóm tạm khoá, chờ
  giao chủ, đã đóng không gửi được; thiếu chủ thì điều hành viên vẫn gửi (việc hằng ngày).
- Lưu ở `group_announcements`, thành viên xem lại được trong nhóm (danh sách thông báo của nhóm). Bộ lọc cụm từ cấm
  thêm khi `add-screening` có (đợt 3).

### 9. Tranh chấp đồng thời

| Tình huống                                                         | Cơ chế                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Hai quản trị cùng duyệt / từ chối một đơn; duyệt lúc người xin rút | `UPDATE … WHERE status = 'pending'`; lượt thua 409 `CONFLICT`                              |
| Vào nhóm (mọi đường) đua với cấm, gỡ, lời mời bị thu hồi           | Khoá cặp: `pg_advisory_xact_lock` theo (nhóm, người) cho mọi thay đổi tư cách của người đó |
| Vào nhóm đua với đóng, khoá, đổi chế độ                            | Đường vào đọc nhóm `FOR SHARE`; đóng / khoá / đổi chế độ `FOR UPDATE`                      |
| Tối đa 3 đơn chờ khi gửi đơn song song vào nhiều nhóm              | `pg_advisory_xact_lock` theo người rồi mới đếm và ghi                                      |
| Hai lời giao chủ cùng lúc; nhận lời đua với huỷ                    | Unique một lời chờ mỗi nhóm; nhận / huỷ đều có điều kiện `status = 'pending'`              |
| Hai chủ trong một nhóm                                             | Partial unique `role = 'owner'` — DB chặn dù service sai                                   |
| Chủ cũ được mở khoá đúng lúc người được giao nhận lời              | Cả hai ghi có điều kiện trên `state` của nhóm; lượt sau thấy trạng thái mới và trả 409     |
| Bấm tham gia hai lần cùng lúc                                      | PK (`group_id`, `account_id`) → 409 `ALREADY_MEMBER`                                       |

Mỗi dòng có một test DB chạy hai lượt song song (khuôn của `code-attempts.db.test.ts`).

### 10. Nối với `identity` và `platform`

- **Chặn xoá tài khoản chủ nhóm**: `identity` không import `group`. `buildApp` truyền vào `identity` một cổng
  `ownership.ownsAnyGroup(accountId)` (như `PrivilegeSource` của `platform`); `softDelete` hỏi nó trước khi xoá →
  409 `ACCOUNT_DELETE_BLOCKED` "đang là chủ nhóm".
- **Bên nghe** (`group.events.ts`): `identity.account.locked` → thiếu chủ / tạm khoá; `identity.account.unlocked` →
  chủ cũ trở lại; `identity.account.deleted` → rời mọi nhóm (`member_left` lý do `account_deleted`), huỷ đơn, lời
  mời, lời giao chủ.
- **Ai là master**: cột `role` của tài khoản, đọc qua `identity.accountState` (đã có cho `platform`).
- **Nhật ký** (`audit_log`): mọi thao tác của master trên nhóm (TK 27 cam kết 3). Thao tác của chủ và điều hành viên
  không vào nhật ký hệ thống — chúng nằm trong chính dòng dữ liệu (`decided_by`, `banned_by`…).

### 11. Việc theo lịch (pg-boss)

| Việc                      | Lịch    | Làm gì                                                                                  |
| ------------------------- | ------- | --------------------------------------------------------------------------------------- |
| `group.expire-pending`    | mỗi giờ | Đơn quá 21 ngày, lời mời quá 14 ngày, lời giao chủ quá 14 ngày → hết hạn + phát sự kiện |
| `group.ownerless-timeout` | mỗi giờ | Thiếu chủ quá 30 ngày → tạm khoá (`ownerless_timeout`)                                  |

TK 26 ghi "mỗi ngày" cho thiếu chủ; chạy mỗi giờ để cam kết 24 lệch tối đa một giờ chứ không một ngày. Hạn luôn
được kiểm lại lúc thao tác, nên job trễ không làm sai kết quả, chỉ làm thông báo "hết hạn" tới muộn.

### 12. Sự kiện outbox của `group`

Tên theo dạng `<module>.<đối tượng>.<việc>` (kiểu `OutboxEventType`), danh sách gốc ở `group.outbox.ts`. Payload chỉ
chứa mã và trạng thái, không chứa văn bản (văn bản là việc của `notification`). Bên nghe phải chịu được nhận trùng.

| Sự kiện                                                 | Payload                                                                          | Ai nghe (đợt)                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `group.owner.offered`                                   | `groupId, offerId, kind, toAccountId, fromAccountId?`                            | notification (1)                          |
| `group.owner.offer_decided`                             | `… , outcome: accepted / declined / expired / cancelled`                         | notification (1)                          |
| `group.owner.changed`                                   | `groupId, previousOwnerId?, newOwnerId, cause`                                   | notification (1)                          |
| `group.ownerless.started`                               | `groupId, nomineeId?`                                                            | notification (1)                          |
| `group.ownerless.resolved`                              | `groupId, outcome: owner_returned / new_owner`                                   | notification (1)                          |
| `group.state.locked` · `group.state.unlocked`           | `groupId, cause, reason?`                                                        | notification (1), listing (2)             |
| `group.state.closed`                                    | `groupId, cancelledRequestAccountIds, cancelledInviteeIds`                       | notification (1), listing (2), review (4) |
| `group.mode.changed`                                    | `groupId, from, to`                                                              | notification (1), listing (2)             |
| `group.privatization.started` · `….completed`           | `groupId, targetMode`                                                            | listing (2)                               |
| `group.badge.rights_changed`                            | `groupId, accountId?` (vắng = cả nhóm)                                           | listing (2)                               |
| `group.member.joined`                                   | `groupId, accountId, via`                                                        | notification (1, chỉ realtime)            |
| `group.member.left`                                     | `groupId, accountId, reason: left / removed / banned / account_deleted`          | notification (1), listing (2), review (4) |
| `group.member.unit_changed`                             | `groupId, accountId, unitId?`                                                    | notification (1), listing (2)             |
| `group.moderator.changed`                               | `groupId, accountId, change: appointed / dismissed / scope, unitId?`             | notification (1)                          |
| `group.join_request.created`                            | `groupId, requestId, accountId`                                                  | notification (1)                          |
| `group.join_request.decided`                            | `… , outcome: approved / rejected / expired / cancelled / withdrawn, reapplyAt?` | notification (1)                          |
| `group.invitation.created` · `group.invitation.decided` | `groupId, invitationId, accountId, outcome?`                                     | notification (1)                          |
| `group.roster.matched`                                  | `groupId, accountIds`                                                            | notification (1)                          |
| `group.ban.created` · `group.ban.lifted`                | `groupId, accountId`                                                             | notification (1), listing (2)             |
| `group.announcement.posted`                             | `groupId, announcementId, unitId?, authorId`                                     | notification (1)                          |

### 13–16. Thông báo, realtime, push

Ma trận thông báo, kênh realtime, push (hoãn) và hộp thư nằm ở design của `add-notification-core` (duyệt cùng lượt
ngày 11/10/2026). `group` chỉ phát sự kiện ở mục 12.

### 17. Route (tiền tố `/api/v1`)

**App** — khách: `GET /groups?q=` (nhóm công khai đang hoạt động), `GET /groups/:id` (hồ sơ; nhóm riêng tư với người
ngoài chỉ có tên), `POST /groups/lookup-code`. Người dùng: `POST /groups/:id/join`, `POST /groups/:id/join-requests`,
`DELETE /groups/:id/join-requests/mine`, `POST /groups/:id/leave`, `GET /me/groups`, `GET /me/group-badges`,
`GET /me/group-invitations` (lời mời + danh sách lớp khớp), `POST /group-invitations/:id/accept|decline`,
`GET /me/group-owner-offers`, `POST /group-owner-offers/:id/accept|decline`, `GET /groups/:id/announcements`.
Quản trị nhóm (chủ, điều hành viên, master): `GET /groups/:id/members`, `PATCH /groups/:id/members/:accountId`
(đơn vị), `DELETE /groups/:id/members/:accountId`, `POST|DELETE /groups/:id/bans/:accountId`,
`GET /groups/:id/join-requests`, `POST /group-join-requests/:id/approve|reject`, `POST|DELETE /groups/:id/invitations`,
`PUT /groups/:id/roster`, `POST /groups/:id/announcements`. Chủ nhóm (và master): `PATCH /groups/:id/settings`,
`POST /groups/:id/code`, `POST|PATCH|DELETE /groups/:id/units`, `POST|PATCH|DELETE /groups/:id/moderators/:accountId`,
`POST|DELETE /groups/:id/owner-transfer`, `POST /groups/:id/close`.

**Bàn vận hành** (`requireMaster`): `POST /ops/groups`, `GET /ops/groups?state=` (lọc thiếu chủ theo hạn còn lại),
`GET /ops/groups/:id`, `POST /ops/groups/:id/owner-offers`, `POST /ops/groups/:id/lock|unlock`,
`POST /ops/groups/:id/close`. Master dùng chung route quản trị nhóm ở trên cho mọi việc của chủ nhóm.

**Thông báo** (`add-notification-core`): `GET /me/notifications?cursor=`, `GET /me/notifications/unread-count`,
`POST /me/notifications/read` (mã hoặc tất cả), `GET|PUT /me/notification-preferences`,
`PUT|DELETE /me/group-mutes/:groupId`, socket `/realtime`.

### Mã lỗi mới

Trong spec: `GROUP_STATE_CONFLICT`, `GROUP_MODE_CONFLICT`, `GROUP_BANNED`, `ALREADY_MEMBER`, `NOT_GROUP_MEMBER`,
`JOIN_REQUEST_EXPIRED`, `JOIN_REQUEST_TOO_SOON` (429), `JOIN_REQUEST_LIMIT`, `INVITATION_EXPIRED`,
`INVITATION_REQUIRED`, `GROUP_ROLE_INELIGIBLE`, `GROUP_OWNER_MUST_TRANSFER`. Thêm do design: `GROUP_OWNER_REQUIRED`
(mở khoá nhóm chưa có chủ dùng được), `GROUP_UNIT_NOT_EMPTY`, `ANNOUNCEMENT_LIMIT` (429).

### Sửa TK đi kèm (làm cùng change)

- **TK 9**: bảng chế độ — huy hiệu công khai · xét duyệt theo bốn đường của TK 10; sơ đồ thêm chờ giao chủ → đã
  đóng, thiếu chủ → tạm khoá; riêng tư → công khai: thành viên được báo ngay khi đổi.
- **TK 10**: luật chuyển chủ (người nhận là thành viên, chủ cũ về thành viên, master giao đè), đề cử thiếu chủ, khoá
  do hệ thống tự mở, đơn vị con, danh sách lớp bằng email băm, lời mời theo email không dò được, điều hành viên không
  xử nhau, nhóm khoá chỉ đọc, gỡ cấm, mô tả nhóm.
- **TK 24**: kênh realtime; nhắc theo bật tắt nhóm thông báo và tắt tiếng từng nhóm; luật nội dung câu nhắc (không
  lý do, không tên điều hành viên); gộp; điều hành viên đơn vị gửi thông báo cho đơn vị; mọi thành viên được báo khi
  nhóm khoá, mở, đóng.
- **TK 28**: `group.announcementsPerDay` 5, `group.announcementMaxLength` 1000, `notification.collapseAlertMinutes` 30.
- **TK 29**: hộp thư và realtime lên đợt 1 (sau nhóm); đẩy lên điện thoại làm khi app sẵn sàng; nhắn tin và báo tin
  nhắn giữ đợt 6.
- **CLAUDE.md** mục Stack: realtime = socket.io; push chưa chọn dịch vụ (đề xuất Expo).

## Risks / Trade-offs

- **Kéo thông báo lên đợt 1 làm đợt 1 dài thêm** (ước 15 task). Đổi lại: đợt 2–5 có sẵn đường báo, mỗi đợt chỉ thêm
  dòng vào ma trận thay vì để trống mọi câu "được báo".
- **Báo ngay khi riêng tư → công khai** thay vì báo trước một khoảng. Nếu bạn muốn thành viên có thời gian rời nhóm
  trước khi nhóm lộ ra tìm kiếm: thêm trường hẹn giờ (`public_switch_at`) + job áp dụng + nút huỷ, và số
  `group.publicNoticeHours` (đề xuất 72).
- **Gửi cho nhóm rất đông** (vài chục nghìn người): ghi hộp thư theo lô là việc của bên nghe outbox, không chặn
  request của người gửi. Trần 5 thông báo mỗi ngày giữ tổng lượng có hạn.
- **Socket một tiến trình**: đủ cho bản đầu (TK 30). Nhiều tiến trình cần adapter Postgres và chuyển `kick()` sang
  `NOTIFY` — ghi sẵn, chưa làm.
- **Chưa có push**: người không mở app chỉ thấy thông báo khi mở lại (hộp thư và số chưa đọc đã đúng). Khi app làm
  push, server thêm bên nghe đọc cờ `alert` — không phải sửa ma trận hay dữ liệu.
- **Thiếu chủ chạy theo sự kiện khoá tài khoản**: outbox giao muộn vài giây thì nhóm đổi trạng thái muộn vài giây;
  chủ bị khoá đã mất mọi phiên ngay nên không có thao tác nào lọt qua.

## Migration Plan

Một migration `init_group` (9 bảng, enum, CHECK, partial unique viết tay) cho `add-groups`; một migration
`init_notification` (bảng `notifications`, `notification_preferences`, `group_notification_mutes`) cho
`add-notification-core`. Không đổi dữ liệu có sẵn. Lùi: revert code, drop bảng mới.

## Đã chốt (11/10/2026)

| #   | Câu hỏi                        | Chốt                                                                  |
| --- | ------------------------------ | --------------------------------------------------------------------- |
| Q1  | Kéo thông báo lên đợt 1        | Có — `add-notification-core` làm cùng lượt                            |
| Q2  | Realtime                       | socket.io trên server; app làm sau                                    |
| Q3  | Push lên điện thoại            | Hoãn tới khi app làm; server mang sẵn cờ `alert`                      |
| Q4  | 15 câu hỏi mở và hai luật thêm | Theo đề xuất ở mục 2                                                  |
| Q5  | Ma trận                        | Mọi thành viên được báo khi nhóm khoá, mở khoá, đóng; gỡ, cấm có nhắc |
| Q6  | Riêng tư → công khai           | Báo ngay khi đổi                                                      |
| Q7  | Con số mới                     | 5 thông báo nhóm mỗi ngày, 1000 ký tự, nhắc gộp tối đa mỗi 30 phút    |
| Q8  | Tắt tiếng từng nhóm            | Có                                                                    |
| Q9  | Mặc định 8 nhóm tắt được       | Bật hết; "tin mới trong nhóm" quyết ở đợt 2                           |
