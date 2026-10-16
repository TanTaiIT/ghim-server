# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án, theo tiêu chí chạy ổn với lượng lớn người dùng;
> phương án ghi sẵn ở `docs/VIEC-DANG-DO.md` mục 0, làm ngày 16/10/2026.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục T17, T18, T19, đọc lại ở d48cc73.
- Khoá đang dùng trong `group.repository.ts`: khoá người xin (`lockRequester`, advisory), khoá cặp (`lockPair`,
  advisory theo nhóm + người), dòng nhóm (`groupStateFor`: `FOR SHARE` khi vào nhóm, `FOR UPDATE` khi đóng / khoá / đổi
  chế độ / giao chủ), và khoá dòng ngầm của `UPDATE` trên đơn xin, lời mời, lời giao chủ, thành viên, lệnh cấm.
- `insertMember` tự lấy khoá cặp rồi `FOR SHARE` dòng nhóm. Lấy lại khoá mà transaction đã giữ không phải chờ (advisory
  lock xếp chồng, `FOR SHARE` sau `FOR SHARE` / `FOR UPDATE` của chính mình là no-op), nên người gọi được khoá trước.

## Decisions

### 1. Thứ tự khoá (T18)

Mọi transaction của `group` lấy khoá theo thứ tự: **R** khoá người xin → **P** khoá cặp → **G** dòng nhóm → **I** lời mời
→ **J** đơn xin → **O** lời giao chủ → **M, B** thành viên, lệnh cấm. Bảy chỗ ngược thứ tự và cách sửa:

| Transaction          | Trước                                       | Sau                                                            |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `acceptOwnerOffer`   | G (update) → nhận O → P                     | đọc O không khoá → P → G (update) → nhận O có điều kiện → M, B |
| `decideJoinRequest`  | nhận J → P → G                              | đọc J không khoá → P → G (share) → nhận J có điều kiện → M     |
| `acceptInvitation`   | nhận I → P → G                              | đọc I không khoá → P → G (share) → nhận I có điều kiện → M, J  |
| `removeMember` (cấm) | P → G → M → B → J → I                       | P → G → I → J → M → B                                          |
| `closeGroup`         | G → J → I → O                               | G → I → J → O                                                  |
| `cancelPendingFor`   | J → I → O                                   | I → J → O                                                      |
| `expireDue`          | J → I → O                                   | I → J → O                                                      |
| `createInvitation`   | P → I (khoá G ngầm qua khoá ngoại khi chèn) | P → G (share) → I                                              |

- "Nhận có điều kiện" giữ nguyên: `updateMany … WHERE status = 'pending' AND expires_at > now` — 0 dòng là đã có người xử
  hay đã hết hạn (`'gone'`). Đọc trước không khoá chỉ để biết nhóm, người; điều kiện thật kiểm lúc nhận.
- `insertMember` giữ nguyên: nó lấy lại P và G mà người gọi đã giữ — không chờ.
- **Lưới an toàn**: adapter-pg đổi cả 40P01 (deadlock) lẫn 40001 (không xếp được thứ tự) thành mã Prisma **P2034**.
  `error-handler` map P2034 → 409 `CONFLICT` "Thao tác đang chen với một thao tác khác — thử lại". Lượt quét theo hạn
  (`expireDue`) cập nhật nhiều dòng một lúc vẫn có thể khoá khác thứ tự với một lượt người dùng — hiếm; job tự chạy lại
  lượt sau, người dùng nhận 409 nhờ lưới này (Risks).

### 2. Nhận làm chủ khi đang bị cấm (T17)

`acceptOwnerOffer`, nhánh người nhận chưa là thành viên: `groupBan.deleteMany` trả `count > 0` thì thêm sự kiện
`group.ban.lifted` (`{ groupId, accountId }`) **trước** `group.member.joined`. Bên nghe của `listing` đối chiếu trạng
thái hiện tại (`fix-audit-listeners`) nên thứ tự sự kiện không quyết định kết quả; đặt trước cho đúng chuyện đã xảy ra.

### 3. Lời mời "mù" (T19)

- **Schema** `group_invitations`:
  - `account_id` cho phép trống — dòng không ai nhận được;
  - `email_hash text NOT NULL` — HMAC email đã chuẩn hoá, cùng khoá với `accounts.email_hash` (`identity.emailHashOf`);
  - `email_hint text NOT NULL` — email đã che, như câu báo của `identity` (`a***@mien.vn`);
  - unique lời mời đang chờ đổi từ (`group_id`, `account_id`) sang (`group_id`, `email_hash`) `WHERE status = 'pending'`.
- **Migration** (SQL viết tay một phần): thêm hai cột nullable → backfill từ `accounts` (`email_hash`, che `email`) →
  `SET NOT NULL` → `account_id DROP NOT NULL` → đổi unique. Không mất dữ liệu.
- **Mời** (`invite`): luôn tính `emailHash`, `emailHint`; tìm tài khoản; người nhận được là tài khoản có thật, không phải
  master, không phải chính người mời, chưa là thành viên — còn lại `accountId = null`. Ghi trong khoá P (theo tài khoản
  nếu có, không thì theo dấu băm) → G share → I:
  - còn lời mời chờ cùng dấu băm: đổi `unit_id` theo lượt mời mới (giữ hạn cũ), trả lời mời đó;
  - không: tạo dòng; chỉ phát `group.invitation.created` khi có người nhận.
- **Danh sách**: `GET /groups/:groupId/invitations` (phân trang) trả `id`, `emailHint`, `unitId`, `createdAt`,
  `expiresAt` — không có mã tài khoản. Quyền: chủ, điều hành viên, master; điều hành viên đơn vị chỉ thấy lời mời của
  đơn vị mình (như quyền thu hồi). Dòng mù và dòng thật không phân biệt được.
- **Người dùng thấy lời mời của mình** (`myInvitations`), nhận lời, hết hạn, thu hồi: chỉ đụng dòng có `account_id`; dòng
  mù hết hạn, bị thu hồi, bị huỷ khi đóng nhóm như thường, sự kiện của dòng mù không mang người nhận (`accountId: null`)
  và bên nghe bỏ qua.
- **Danh sách người bị cấm**: `GET /groups/:groupId/bans` (phân trang) trả `accountId`, `displayName`, `bannedAt`,
  `bannedBy`. Quyền như gỡ cấm: chủ, điều hành viên cả nhóm, master.

## Risks / Trade-offs

- `expireDue` cập nhật hàng loạt theo hạn có thể khoá dòng khác thứ tự với lượt của người dùng → deadlock hiếm; lưới 409
  và lượt job kế tiếp xử.
- Lời mời mù chiếm một dòng cho mỗi lượt mời email lạ. Route mời chưa có trần riêng: chỉ người có vai trong nhóm mời
  được, mỗi email một dòng chờ mỗi nhóm (unique), dòng hết hạn sau 14 ngày. Thấy bị lạm dụng thì thêm trần mời theo
  ngày ở một change sau.
- `email_hint` lộ ký tự đầu và miền của email người quản lý tự gõ — đúng thứ người quản lý đã biết.
