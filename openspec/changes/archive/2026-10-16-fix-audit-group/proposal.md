# Proposal

## Why

Đợt 3 phần A3 của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`): nhóm. Đọc lại ở HEAD d48cc73,
chưa mục nào được sửa:

- **T17** — master giao chủ cho một người đang bị cấm khỏi nhóm, người đó nhận: lệnh cấm bị xoá mà không phát sự kiện
  gỡ cấm. Tin của người đó trong nhóm còn mang lý do ẩn "bị cấm" mãi; gỡ cấm thì trả 404 vì không còn lệnh nào.
- **T18** — các transaction của nhóm khoá dòng không cùng thứ tự: duyệt đơn và nhận lời mời khoá đơn / lời mời trước
  rồi mới khoá nhóm, còn đóng nhóm, đổi chế độ khoá nhóm trước rồi mới huỷ đơn / lời mời; nhận lời giao chủ khoá nhóm
  rồi mới khoá cặp (nhóm, người), mọi chỗ khác ngược lại. Hai lượt chen nhau thì Postgres huỷ một lượt vì deadlock và
  người dùng nhận 500 — trái requirement "Xung đột khi ghi đồng thời" (409, không 500).
- **T19** — app không có cách xem lời mời đang chờ và danh sách người bị cấm: mời gửi nhầm thì không thu hồi được (route
  thu hồi cần mã lời mời mà không đâu trả ra), người bị cấm không còn hiện ở danh sách nào nên requirement "Gỡ cấm" không
  làm được trên app. Mời lại cùng người với đơn vị khác thì bị bỏ lặng lẽ.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026); phương án ghi sẵn ở `docs/VIEC-DANG-DO.md` mục 0.

## What Changes

- **T17**: người nhận làm chủ đang bị cấm thì lệnh cấm được gỡ **như gỡ cấm** — phát sự kiện gỡ cấm trước sự kiện vào
  nhóm, nên tin của người đó hết lý do ẩn "bị cấm".
- **T18**: một thứ tự khoá cho mọi transaction của nhóm — khoá người xin → khoá cặp (nhóm, người) → dòng nhóm → lời mời →
  đơn xin → lời giao chủ → thành viên, lệnh cấm. Duyệt đơn, nhận lời mời, nhận lời giao chủ đọc dòng không khoá, khoá
  cặp và nhóm trước, rồi mới nhận có điều kiện. Lưới an toàn: Postgres huỷ một lượt vì deadlock hay không xếp được thứ
  tự thì người dùng nhận **409 `CONFLICT`** "thử lại", không phải 500.
- **T19**:
  - `GET /groups/:groupId/invitations` — lời mời đang chờ: email đã che (`a***@miền`), đơn vị, lúc mời, hạn. Điều hành
    viên đơn vị chỉ thấy lời mời của đơn vị mình.
  - `GET /groups/:groupId/bans` — người bị cấm: tên hiển thị, lúc cấm, người cấm; quyền như gỡ cấm.
  - **Lời mời "mù"**: mời email nào cũng ghi một dòng lời mời — kể cả email chưa có tài khoản, đã là thành viên, là
    master hay chính người mời (những dòng đó không ai nhận được, hết hạn như thường). Danh sách vì thế giống hệt nhau
    bất kể email có tài khoản hay không, giữ lời hứa "không ai dò được email nào đã có tài khoản" (TK 10).
  - Mời lại cùng email khi lời mời cũ còn chờ: đổi đơn vị của lời mời đó theo lượt mời mới, thay vì bỏ lặng lẽ.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `group/membership`: thêm "Mời lại khi lời mời còn chờ", "Danh sách lời mời đang chờ",
  "Danh sách người bị cấm".
- `group/group-roles`: thêm "Nhận làm chủ khi đang bị cấm".
- `http/api-contract`: "Xung đột khi ghi đồng thời" — hai lượt ghi chờ nhau cũng trả 409.

## Impact

- **Code**: `group` (repository: thứ tự khoá, nhận lời giao chủ, lời mời mù, danh sách; service `invite`, hai route
  đọc), `src/common/errors/error-handler.ts` (mã Prisma của deadlock).
- **Migration**: có — `group_invitations` thêm `email_hash`, `email_hint`, `account_id` cho phép trống, unique lời mời
  đang chờ theo (nhóm, dấu băm email). Backfill từ `accounts`, không mất dữ liệu.
- **API**: thêm hai route đọc; `POST /groups/:groupId/invitations` vẫn trả 204 như cũ.
