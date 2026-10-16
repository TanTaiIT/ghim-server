# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án ("tiếp giúp tôi"), theo tiêu chí chạy ổn với lượng
> lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục T1–T9, L11, đọc lại ở f6222fc.
- `review` sở hữu việc, quyết định, ứng viên lấy mẫu; `listing` sở hữu tin; `group` trả lời ai xử việc của nhóm.

## Decisions

### 1. Phiên bản tin trong mọi lượt ghi việc (T5)

- `listing.lockForReview(tx, id)` vẫn `FOR KEY SHARE` dòng tin, nhưng nay trả `{ version, state }`. Lượt đổi tin giữ
  `FOR UPDATE`, nên giá trị đọc được đứng yên cho tới khi lượt ghi việc xong.
- `onOpenTask` truyền giá trị đó cho lượt ghi. `addReason`, `dropReasons`, `cancel` nhận `expect` tuỳ chọn
  (`version`, và `states` khi cần). Lệch thì không ghi gì.
- Theo mũi tên của `listing.state.changed`:

  | Mũi tên                                  | Điều kiện để ghi                     |
  | ---------------------------------------- | ------------------------------------ |
  | `hold`, `recall`                         | đúng phiên bản và tin đang chờ duyệt |
  | `pass`, `withdraw`, `markSold`, `expire` | đúng phiên bản                       |

### 2. Đóng việc có điều kiện (T6, L11)

- `closeDecided(tx, { id, actorId, claimedVersion, escalatedAt, now })`: `updateMany` trên việc còn mở, đúng người
  giữ, chưa hết giờ, đúng `claimedVersion`, `escalatedAt` không đổi.
- 0 dòng thì đọc lại việc trong `tx` rồi ném (lượt đổi tin quay lui theo):
  - việc không còn mở → 409 `TASK_CLOSED`;
  - `escalatedAt` đổi → 409 `TASK_REASSIGNED`;
  - còn lại → 409 `TASK_NOT_CLAIMED`.
- Lượt "đạt" thứ hai trên tin chờ duyệt vấp phiên bản tin trước (`LISTING_CHANGED`). Bắt lỗi đó, đọc lại việc: việc
  không còn mở thì trả `TASK_CLOSED`.
- L11: `!allowed → TASK_REASSIGNED` xét ngay sau vai, trước khi xét người giữ.

### 3. Người cho đạt không tự hậu kiểm (T2)

- Cột `review_sample_candidates.approved_by` (uuid, nullable, không khoá ngoại — như `review_decisions.actor_id`).
- Quyết "đạt" tin chờ duyệt, hay khôi phục, ghi ứng viên kèm người quyết **trong transaction đổi tin**. Bên nghe
  `wentLive` tới sau chỉ upsert không đổi gì.
- `drawSamples` loại `approved_by` (cùng tài khoản dùng chung máy) khỏi việc mẫu.

### 4. Người xử của nhóm (T3)

`reviewersOf`:

- điều hành viên lấy từ `usableModerators` (tài khoản đang hoạt động);
- chủ nhóm `null` khi nhóm thiếu chủ hay tài khoản chủ không hoạt động.

Định tuyến tính lúc đọc, nên mọi chỗ dùng (`roleOn`, hàng nhóm, thao tác trực tiếp) theo luôn.

### 5. Xoá tài khoản (T4)

- Bên nghe `identity.account.deleted`: việc mở mà người đó nằm trong `excludedIds` (người đăng luôn ở đó) và tin là
  của họ → huỷ `listing_deleted`, rồi trả việc họ đang giữ như cũ.
- `addReason` thôi khi tin mang `account_deleted`.

### 6. Tin bị ẩn (T7)

- `ReviewSubject.hideReasons`.
- `drawSamples`, mẫu hậu kiểm người duyệt bỏ tin đang ẩn.
- `addReason` thôi khi tin đã rời nhóm hẳn, trừ `group_escalation`.
- Bên nghe mới:
  - `listing.listing.detached` → bỏ lý do của nhóm (như nhóm đóng) khỏi việc của tin đã rời nhóm hẳn;
  - `group.ban.created` → đang bị cấm thì bỏ `machine_hold` của mọi tin chờ duyệt của người đó trong nhóm.
- `onMemberBack` (vào lại, gỡ cấm) với người ngoài: sinh lại việc cho tin chờ duyệt không còn bị ẩn vì lý do của nhóm.

### 7. Đơn vị (T8)

- `review` nghe `group.member.unit_changed`: việc mở về tin của người đó trong nhóm lấy lại phạm vi từ tin. Bên nghe
  của `listing` chạy trước trong cùng sự kiện, nên tin đã mang đơn vị mới.
- Vào nhóm: `listing` đồng bộ đơn vị hiện tại sau lượt đối chiếu thành viên.
- Sửa không qua máy thu hẹp tin vào nhóm: ghi đơn vị mà `lockPlacement` trả.

### 8. Nhắc master (T9)

- Con số mới `notification.reviewAlertMinutes` = 1440 (TK 16 "nhắc lại mỗi ngày"); N40–N42 dùng nó làm khoảng cảnh báo
  của dòng gộp.
- N40 mang tổng số việc ở hàng master đã quá `review.remindMasterHours`, phát khi có việc tới hạn nhắc trong lượt.

### 9. Chuyển lên sàn chung (T1)

`move.service`: sau kiểm `NOT_MOVABLE`, `openWork.blocksPlacement` → 409 `PLACEMENT_LOCKED`. Việc nhóm cũ trên tin
rời nhóm hẳn đã bị bỏ (mục 6), nên chỉ việc chuyển lên staff còn chặn.

## Migration

`fix_audit_review`: `ALTER TABLE review_sample_candidates ADD COLUMN approved_by uuid` — Prisma sinh, không SQL tay.

## Risks / Trade-offs

- **Tin cũ thiếu đơn vị** (thu hẹp trước bản sửa) được ghi đơn vị ở lượt đổi đơn vị hay vào nhóm kế tiếp.
- **Bên nghe đơn vị dựa vào thứ tự bên nghe trong một sự kiện** (`listing` trước `review`). Thứ tự này cố định theo
  `moduleList`; xử lại cũng chạy lại cả hai theo đúng thứ tự.
