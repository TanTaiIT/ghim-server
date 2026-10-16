# Proposal

## Why

Phần cố ý hoãn của `fix-audit-listeners` (đợt 2 phần C, rà soát 15/10/2026): bộ phát outbox có thể xử lại một sự kiện
cũ **sau** sự kiện mới hơn (chạy lại khi một bên nghe khác hỏng, C1). Bên nghe của `listing`, `group`, `review` đã đối
chiếu trạng thái hiện tại; ma trận thông báo của nhóm thì vẫn viết câu theo payload của sự kiện. Hệ quả, ví dụ:

- nhóm bị khoá rồi mở khoá, lượt "khoá" xử lại → cả nhóm nhận "Nhóm «X» đang tạm khoá" khi nhóm đã mở;
- một người bị cấm rồi được gỡ cấm trước khi lượt cấm được báo → nhận "không vào lại nhóm này được" khi đã vào lại được;
- chủ nhóm đổi hai lần, lượt đổi đầu xử lại → điều hành viên nhận "«A» là chủ nhóm mới" khi chủ đã là người khác.

Các dòng bị ảnh hưởng: N3, N6, N12 (`group.owner.changed`), N10, N11, N13, N14, N26, N27, N28.

## What Changes

- Dòng ma trận của các sự kiện trên chỉ viết thông báo khi điều câu nói **còn đúng lúc gửi**:
  - N3, N6, N12: người nhận làm chủ vẫn đang là chủ;
  - N10: nhóm vẫn đang thiếu chủ; N11: nhóm không còn thiếu chủ;
  - N13: nhóm vẫn đang tạm khoá; N14: nhóm không tạm khoá, chưa đóng;
  - N26: người đó không còn là thành viên;
  - N27: người đó không còn là thành viên và vẫn bị cấm — đã được gỡ cấm thì nhận câu của N26;
  - N28: người đó không còn bị cấm.
- Báo hiệu realtime "nhóm của tôi đã đổi" vẫn gửi như cũ — app chỉ tải lại, không sai bao giờ.
- Ngữ cảnh ma trận thêm trạng thái nhóm, `isMember`, `isBanned` (cổng `group` đã có sẵn).

**Cố ý chưa làm**: ghi nhận từng bên nghe đã chạy ở bộ phát (cũng hoãn từ `fix-audit-listeners`) — chỉ giảm số lần
chạy lại, không đổi kết quả.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `notification/group-notices`: thêm "Thông báo theo trạng thái hiện tại của nhóm".

## Impact

- **Code**: `notification` (ma trận nhóm, ngữ cảnh, cổng `group`), dây nối trong `app.ts`.
- **Migration**: không.
