# Design

> **Đã duyệt 16/10/2026.** Người dùng giao tech lead chọn phương án ("làm tiếp"), theo tiêu chí chạy ổn với lượng lớn
> người dùng.

## Context

- Nguồn: `openspec/changes/archive/2026-10-15-fix-audit-listeners/proposal.md` mục "Cố ý chưa làm"; ma trận
  `src/modules/notification/notification.matrix.ts`.
- Bên nghe thông báo chạy sau commit của sự kiện; tới lúc nó chạy, trạng thái có thể đã đi tiếp. Thông báo đã ghi thì
  không rút lại được (hộp thư, nhắc) — chặn ở lúc viết là chỗ duy nhất.

## Decisions

### 1. Đối chiếu ở dòng ma trận, không ở bộ phát

- Mỗi dòng biết câu của nó nói gì, nên tự hỏi đúng điều cần còn đúng. Bộ phát không biết nghĩa của sự kiện.
- Ngữ cảnh ma trận: `group()` trả thêm `state`; thêm `isMember(groupId, accountId)`, `isBanned(groupId, accountId)`.
  Cổng `NotificationGroupPort` thêm `isBanned` (`group.service` đã có).

### 2. Luật từng dòng

| Dòng        | Sự kiện                         | Viết khi                                                |
| ----------- | ------------------------------- | ------------------------------------------------------- |
| N3, N6, N12 | `group.owner.changed`           | chủ hiện tại là `newOwnerId`                            |
| N10         | `group.ownerless.started`       | nhóm đang `ownerless`                                   |
| N11         | `group.ownerless.resolved`      | nhóm không còn `ownerless`                              |
| N13         | `group.state.locked`            | nhóm đang `locked`                                      |
| N14         | `group.state.unlocked`          | nhóm không `locked`, không `closed`                     |
| N26         | `group.member.left` (`removed`) | người đó không còn là thành viên                        |
| N27         | `group.member.left` (`banned`)  | không còn là thành viên và vẫn bị cấm; gỡ cấm rồi → N26 |
| N28         | `group.ban.lifted`              | người đó không bị cấm                                   |

- Báo hiệu realtime (`me:groups-changed`) giữ nguyên: nó chỉ bảo app tải lại, đúng ở mọi thứ tự.

### 3. Chuyện xảy ra nhanh hơn bộ phát

- Khoá rồi mở khoá trong vài giây, trước khi bộ phát chạy: thành viên chỉ nhận "đã mở khoá". Chấp nhận — câu đó đúng
  với trạng thái hiện tại, và "đang tạm khoá" lúc đó là sai.
- Cấm rồi gỡ cấm nhanh: người đó nhận "không còn là thành viên" rồi "được gỡ cấm" — đúng cả hai.

## Risks / Trade-offs

- Mỗi dòng thêm một hai lượt đọc (`findGroup`, `isMember`, `isBanned`) — các dòng này hiếm (đổi chủ, khoá, cấm), không
  đáng kể.
