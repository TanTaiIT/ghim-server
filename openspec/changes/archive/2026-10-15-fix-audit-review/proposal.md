# Proposal

## Why

Đợt 3 phần B của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`): hàng chờ người duyệt. Đọc lại ở
HEAD f6222fc, chưa mục nào được sửa:

- **T1** — chuyển tin đã bị gỡ khỏi nhóm lên sàn chung thoát việc hàng 4 (nhóm chuyển lên staff).
- **T2** — người cho đạt tự hậu kiểm tin mình cho lên. Ứng viên lấy mẫu không ghi người đạt.
- **T3** — điều hành viên, chủ nhóm bị khoá vẫn được giao việc; nhóm thiếu chủ vẫn trả chủ cũ.
- **T4** — việc về tin của tài khoản đã xoá không bao giờ đóng, và master bị nhắc mỗi ngày mãi.
- **T5** — sự kiện đổi trạng thái tin tới trễ không kiểm phiên bản: việc mở trên tin nháp, hay việc mới bị huỷ.
- **T6** — một việc có thể ghi hai quyết định (bấm hai lần, đúng lúc việc bị chuyển master).
- **T7** — việc trên tin bị ẩn vẫn sinh, vẫn lấy mẫu. Người ngoài bị cấm, tin rời nhóm vì riêng tư hoá vẫn mang việc
  của nhóm.
- **T8** — đổi đơn vị con không cập nhật việc; thu hẹp tin vào nhóm bỏ mất đơn vị.
- **T9** — nhắc master mỗi giờ thay vì mỗi ngày, và N40 chỉ đếm việc vừa tới hạn.
- **L11** — việc bị chuyển master trả `TASK_NOT_CLAIMED` thay vì `TASK_REASSIGNED`.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026).

## What Changes

- **T1**: chuyển lên sàn chung khi tin còn việc chờ → 409 `PLACEMENT_LOCKED`, như sửa và gia hạn.
- **T2**: ứng viên lấy mẫu ghi người cho đạt / khôi phục (cột mới `approved_by`); lượt lấy mẫu loại người đó và tài
  khoản dùng chung máy với họ.
- **T3**: người xử của nhóm chỉ gồm điều hành viên, chủ nhóm có tài khoản đang hoạt động; nhóm thiếu chủ không có chủ.
- **T4**: xoá tài khoản huỷ mọi việc đang mở về tin của người đó; tin đã xoá tài khoản không sinh việc mới.
- **T5**: mọi lượt ghi việc theo sự kiện đổi trạng thái kiểm phiên bản tin (đọc trong lúc giữ khoá dòng tin) — sự kiện
  cũ trượt qua.
- **T6**: đóng việc có điều kiện (còn mở, đúng người giữ, chưa hết giờ, chưa chuyển); không đóng được thì 409 với mã nói
  rõ (`TASK_CLOSED`, `TASK_REASSIGNED`, `LISTING_CHANGED`, `TASK_NOT_CLAIMED`) và tin không đổi.
- **T7**:
  - dữ kiện tin cho `review` mang lý do tạm ẩn; tin đang ẩn không bị lấy mẫu;
  - tin rời nhóm hẳn chỉ còn việc chuyển lên staff;
  - nghe thêm `listing.listing.detached`, `group.ban.created`; gỡ cấm người ngoài thì sinh lại việc.
- **T8**: `review` nghe `group.member.unit_changed` và đưa việc theo đơn vị mới; vào lại nhóm thì tin lấy đơn vị hiện tại;
  thu hẹp tin vào nhóm ghi đơn vị.
- **T9**: con số mới `notification.reviewAlertMinutes` (1440 phút) cho cảnh báo N40, N41; N40 nêu tổng số việc đang quá
  hạn ở hàng master.
- **L11**: việc đã chuyển chỗ trả `TASK_REASSIGNED` trước khi xét người giữ.

**Cố ý chưa làm**: chống trùng thông báo gộp theo mọi sự kiện (chỉ theo sự kiện cuối như cũ) — nội dung thông báo đã
theo số của lượt mới nhất.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `listing/suspension`: thêm "Tin còn việc chờ người duyệt không chuyển lên sàn chung được".
- `review/queues`: thêm sáu requirement — người bị khoá, xoá tài khoản, theo trạng thái hiện tại, rời nhóm hẳn / bị
  cấm, theo đơn vị hiện tại, nhắc master.
- `review/task-handling`: thêm "Một việc một quyết định".
- `review/post-review`: thêm "Tin đang tạm ẩn không bị lấy mẫu".

## Impact

- **Code**: `review` (hàng chờ, quyết định, lịch, bên nghe), `listing` (chuyển lên sàn, khoá dòng cho `review`, dữ kiện
  tin, đơn vị khi vào nhóm và khi thu hẹp), `group` (`reviewersOf`), `notification` (ma trận N40–N42), bảng con số.
- **Migration**: cột `review_sample_candidates.approved_by` (uuid, nullable). Không mất dữ liệu.
