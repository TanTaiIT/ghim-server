# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án ("commit và làm tiếp"), theo tiêu chí chạy ổn với
> lượng lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục C1, cùng bản kê mọi bên nghe đã đăng ký ngày 15/10/2026 (bên nghe nào lệch
  khi xử lại, bên nào đã bất biến, bên nào một chiều).
- CLAUDE.md luật 12 vốn đòi bên nghe không dựa vào thứ tự giữa các sự kiện. Bản sửa này làm code đúng luật đó.
- Bên nghe một chiều thì xử lại vô hại: xoá tài khoản, đóng nhóm, gỡ khỏi nhóm, riêng tư hoá. Không đổi.

## Decisions

### 1. `listing`: đọc trạng thái trong lô, sau khi khoá dòng

`applyBatch` có thêm `prepare?: () => Promise<C>`, chạy **trong** transaction của mỗi lô, ngay sau
`SELECT … FOR UPDATE`. Kết quả của nó đi vào `compute(rows, ctx)` và `events(changed, ctx)`. Mỗi lô đọc lại.

Vì sao đủ:

- Mọi thay đổi đối chiều đều ghi sự kiện của nó cùng transaction với thay đổi.
- Mọi bên nghe đối chiếu đều đọc sau khi đã giữ khoá dòng.

Vậy với mỗi dòng, bên ghi sau cùng đã thấy mọi thay đổi trước nó; thay đổi nào tới sau thì phát sự kiện mới và được
đối chiếu lại.

Phạm vi chọn dòng **không** thu hẹp theo lý do đang mang (bỏ `carrying(...)` ở chiều gỡ). Câu chọn mã tin chạy trước
khi khoá, nên chọn hẹp có thể bỏ sót dòng mà bên nghe kia sắp đổi. Phạm vi rộng đều có index:

- `{ ownerId }` — bị chặn bởi hạn mức tin;
- `{ groupId }`, `{ ownerId, groupId }`;
- `{ categoryId }` — danh mục hiếm khi bật / tắt.

`cascade.reconcileHide(where, decide, groupId)`: `decide()` đọc trạng thái hiện tại và trả sự kiện tạm ẩn đúng chiều
(hoặc `null` = lô không đổi). Phần còn lại dùng lại phép tính có sẵn (`applyHideEvent`, đồng hồ hiển thị, N32 / N33).
N32 chỉ phát cho dòng thật sự đổi.

| Sự kiện                                | Đọc (cổng có sẵn hay mới) | Chiều                                                                                                                         |
| -------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `identity.account.locked` / `unlocked` | `identity.accountState`   | đang `locked` → đặt "tài khoản bị khoá"; khác → gỡ                                                                            |
| `group.state.locked` / `unlocked`      | `groups.findGroup`        | `state = 'locked'` → đặt; khác → gỡ                                                                                           |
| `group.ban.created` / `lifted`         | `groups.isBanned` (mới)   | đang bị cấm → đặt; khác → gỡ                                                                                                  |
| `group.member.left` / `joined`         | `groups.membersAmong`     | đang là thành viên → gỡ "đã rời", "bị gỡ"; không còn → chỉ lượt **rời** đặt, theo lý do và công tắc người ngoài trong sự kiện |
| `category.status.changed`              | `categories.statusOf`     | đang tắt → đặt; đang bật → gỡ; danh mục không có → thôi                                                                       |
| `group.member.unit_changed`            | `groups.memberUnit` (mới) | ghi đơn vị hiện tại; không còn là thành viên → thôi                                                                           |
| `trust.tier.changed`                   | `trust.tierOf`            | gỡ "tài khoản mới" chỉ khi mức hiện tại khác T0                                                                               |

Lượt rời giữ công tắc "nhận tin người ngoài" chụp lúc rời: đổi công tắc không phát sự kiện, và spec suspension ghim
cách hiểu đó. Còn một ca hiếm: rời, vào lại, rồi rời lần nữa với công tắc khác, và lượt rời đầu được xử lại sau cùng.
Khi đó tin "nhóm công khai" có thể ẩn quá tay tới lượt vào lại kế tiếp. Chấp nhận và ghi ở Risks.

### 2. `group`, `platform`, `review`: chặn ở đầu bên nghe

Các bên nghe này đổi một nhóm, một gói quyền hay một việc, hiếm và nhỏ. Chúng đọc trạng thái hiện tại ở đầu lượt rồi
thôi nếu đã khác chiều:

- `group.onAccountLocked`: tài khoản không còn `locked` → thôi. `onAccountUnlocked`: không `active` → thôi, để không
  trả nhóm cho chủ đang bị khoá hay đã xoá.
- `platform.suspendStaffForLock`: tài khoản không còn `locked` → thôi. Trả quyền vẫn là việc tay của master (spec).
- `review`:
  - `onMemberLeft`: người đó đang là thành viên → thôi;
  - `onMemberBack`: không là thành viên, hay đang bị cấm → thôi;
  - khoá tài khoản: không còn `locked` → không trả việc.

Còn một khe nhỏ giữa lượt đọc và lượt ghi, khi hai bên nghe của một cặp chạy song song trong vài mili giây. Bản sửa
đóng ca chính: lượt xử lại tới trễ vài giây tới cả giờ sau.

Cổng mới của `group`: `isBanned(groupId, accountId)` và `memberUnit(groupId, accountId)` (`undefined` = không là
thành viên).

## Risks / Trade-offs

- **Khoá / mở khoá nhóm lớn**: mỗi chiều đi qua mọi tin của nhóm (lô 500, mỗi lô một lượt đọc nhóm), thay vì chỉ tin
  đang mang lý do. Chỉ dòng đổi mới được ghi. Đánh đổi lấy tính đúng khi chạy song song.
- **Kết nối**: lượt đọc trạng thái chạy trong lúc transaction của lô còn mở, nên mỗi lô giữ thêm một kết nối trong
  chốc lát.
- **Rời, vào, rời với công tắc khác** (mục 1): tin "nhóm công khai" có thể ẩn quá tay tới lượt vào lại kế tiếp — hiếm,
  không mất dữ liệu.
