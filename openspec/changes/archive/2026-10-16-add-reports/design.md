# Design

> **Đã duyệt 16/10/2026.** Người dùng giao tech lead chọn phương án ("cứ clear report hết giúp tôi"), theo tiêu chí chạy
> ổn với lượng lớn người dùng. Mười bốn câu hỏi mở của proposal được trả lời ở mục 11.

## Context

- Hàng chờ có từ `add-review-queues`: một tin một việc mở, lý do → hàng, chuỗi chuyển tiếp, nhận việc 10 phút, quá hạn
  chuyển master, nhắc master, luật không xử việc của mình, nhật ký quyết định. Hàng 1 (báo cáo, hạn 72 giờ —
  `review.reportHours`) đã khai trong TK 16 nhưng chưa có lý do nào.
- Con số đã có trong bảng cấu hình: `report.perHour`, `report.autoHide*`, `report.score*`, `report.loseRightDays`.
- Staff "việc an toàn" là scope `user_reports` (`OPS_SCOPES`). `trust` đã có `voidByReport` chưa ai gọi.
- Việc hiện chỉ gắn với **tin** (`review_tasks.listing_id` bắt buộc). TK 16 nói việc "về tin hay về người", và hàng 2
  (khiếu nại gậy, `add-strikes`) cũng là việc về người — mở rộng việc cho một tài khoản là nền dùng lại được.

## Goals / Non-Goals

**Goals:** gửi báo cáo về tin và về người; gộp; ai xử; đúng / bác và hệ quả; tạm ẩn tự động; điểm báo cáo; báo cáo sống
qua xoá tin, xoá tài khoản, đóng nhóm.

**Non-Goals:** gậy (`add-strikes`), báo cáo từ hội thoại (`add-messaging`), đẩy lên điện thoại (`add-notifications` —
thông báo kết quả vào hộp thư thì có, vì hộp thư đã có), giữ bằng chứng quá hạn lưu (`add-data-retention`).

## Decisions

### 1. Dữ liệu

- `reports` — một **báo cáo** (đối tượng đang bị báo): `subject_kind` (`listing` | `account`), `listing_id?`,
  `account_id` (người bị báo; với tin là người đăng lúc mở), `status` (`open` | `upheld` | `dismissed`), `severe`
  (có lượt lừa đảo / hàng cấm), `auto_hidden_at?`, `low_priority` (mọi lượt đều của người điểm thấp), `task_id?`,
  `decision_id?`, `decided_at?`, `created_at`. Partial unique: một báo cáo mở mỗi tin, một báo cáo mở mỗi tài khoản (với
  `subject_kind = 'account'`).
- `report_entries` — một **lượt báo**: `report_id`, `reporter_id`, `category` (`fraud` | `misinformation` |
  `harassment` | `prohibited` | `other`), `device_hash?`, `counts_for_hide` (đủ điều kiện ngưỡng lúc báo), `created_at`.
  Unique (`report_id`, `reporter_id`) — báo lại không thêm người.
- `reporter_scores` — `account_id` PK, `score` (mặc định 0), `suspended_until?`.
- `review_tasks`: `listing_id` thành nullable, thêm `account_id` (việc về người); CHECK đúng một trong hai; partial
  unique một việc mở mỗi tài khoản. CHECK nhận việc nới: `claimed_version` chỉ bắt buộc với việc về tin.
- `review_decisions`: `listing_id`, `listing_state_after` nullable; thêm `account_id`, `report_id`, `report_verdict`.
- Enum: `review_reason` + `report`, `report_severe`; `review_outcome` + `keep` (không đổi tin); `listing_hide_reason` +
  `reported`; `review_close_cause` không đổi.

### 2. Gửi báo cáo

- `POST /reports` `{ subject: { kind: 'listing', listingId } | { kind: 'account', accountId }, category }`, header
  `x-device-id` tuỳ (không có thì lượt báo không tính ngưỡng tạm ẩn). `GET /me/reports` — báo cáo của tôi.
- Thứ tự kiểm: master → 403; email chưa xác nhận → 403 `EMAIL_NOT_VERIFIED`; đang mất quyền → 403
  `REPORTING_SUSPENDED` kèm ngày; đối tượng không thấy được → 404 (tin: `canView` của `listing`; người: hồ sơ công khai
  còn — tài khoản đã xoá là 404); tự báo → 400 `CANNOT_REPORT_SELF`; quá 10 lượt trong 60 phút → 429
  `REPORT_RATE_LIMITED` kèm lúc báo tiếp được.
- Ghi trong một transaction có khoá advisory theo đối tượng (`report:<kind>:<id>`): tìm báo cáo mở, chưa có thì mở;
  thêm lượt báo (trùng người → không thêm, trả 200 thay vì 201); `severe ||= lượt mới nghiêm trọng`; tính `low_priority`.
- Rồi đưa lý do vào việc: tin → `queue.addReason(listingId, report | report_severe)` (lượt nghiêm trọng thay `report`
  bằng `report_severe`), người báo và máy của họ vào danh sách loại trừ; người → việc về tài khoản (mục 4). Sau cùng xét
  ngưỡng tạm ẩn (mục 6).

### 3. Lý do và định tuyến

- `report` và `report_severe` cùng hàng 1. Việc về tin trong nhóm đi theo chuỗi của nhóm khi có `report` mà **không**
  có `report_severe`; có `report_severe` thì luôn về staff danh mục (TK 23). Điều hành viên đang giữ việc lúc lượt
  nghiêm trọng tới: việc đổi bậc, quyết sẽ nhận 409 `TASK_REASSIGNED` như mọi việc chuyển chỗ.
- Việc về tài khoản: bậc `safety_staff` (staff đang hoạt động có scope `user_reports`, trừ người bị loại) → master.
  Người bị báo, máy của họ và người báo bị loại.
- Hàng chờ xếp việc báo cáo `low_priority` (chỉ còn lý do báo cáo) sau mọi việc khác cùng hàng.

### 4. Việc về người

- `queue.addAccountReason(accountId, input)` như `addReason` nhưng khoá dòng việc theo tài khoản; phạm vi không có
  danh mục, nhóm.
- Bàn vận hành: viewer mang thêm `scopes`; staff `user_reports` thấy việc về người. Chi tiết việc về người: hồ sơ
  (tên, trạng thái, ngày tham gia), mức tin cậy, tài khoản dùng chung máy, báo cáo liên quan.
- Nhận việc về người không có phiên bản tin.

### 5. Báo cáo sống qua xoá, rút, đóng

- `queue.cancel` (xoá tin, rút về nháp, đã bán, hết hạn, người đăng xoá tài khoản) chỉ bỏ lý do không phải báo cáo; còn
  `report` / `report_severe` thì việc vẫn mở.
- Đóng nhóm: lý do báo cáo không nằm trong `CLOSED_GROUP_REASONS` nên ở lại; nhóm đóng thì không còn bậc nhóm, việc tự
  về staff danh mục.
- `listing` thêm cổng `reportSubject` / `archivedForReviewer`: tin kể cả đã xoá (bản lưu), cờ `deleted`. Quyết định trên
  tin đã xoá chỉ có `keep`.

### 6. Tạm ẩn tự động

- Sau mỗi lượt báo vào tin **sàn chung** đang hiển thị: trong 24 giờ gần nhất có ≥ 3 lượt `counts_for_hide` từ ≥ 3 máy
  khác nhau (một người một lượt nên đủ máy là đủ người) → `auto_hidden_at = now`.
- `counts_for_hide` lúc báo: có dấu máy, mức ≥ T1, điểm ≥ −3.
- Chặn lần thứ hai: quyết định gần nhất của người về tin là "bác" một báo cáo đã từng tự ẩn → không tự ẩn nữa, tới khi
  có quyết định khác của người về tin.
- `listing` giữ cờ `reported` theo đối chiếu: sự kiện `review.report.hide_changed` → `listing` hỏi `openWork.reportHidden`
  rồi đặt / gỡ lý do `reported` (theo trạng thái hiện tại, chạy lại vô hại). Ẩn không đổi trạng thái, dừng ngày như mọi
  lý do tạm ẩn; sửa tin không gỡ cờ.

### 7. Quyết định

- Việc có lý do báo cáo: body bắt buộc `report: { verdict: 'upheld' | 'dismissed', banFromGroup?, lockAccount? }` —
  thiếu → 400. `outcome` vẫn nói chuyện xảy ra với tin: `keep` (không đổi tin), `mistake` (gỡ — staff danh mục, master),
  `detach` (gỡ khỏi nhóm — điều hành nhóm, master); việc có cả máy giữ thì `pass` / `mistake` như cũ.
- `dismissed` chỉ đi với `keep` (hay `pass` khi có máy giữ). Hệ quả ngoài quyền → 403, không đổi gì: `banFromGroup`
  (điều hành nhóm, master; tin trong nhóm; người đăng không phải chủ nhóm), `lockAccount` (master).
- Trong transaction quyết định: đổi tin (nếu có), đóng việc, đóng báo cáo, ghi nhật ký (kèm `report_id`,
  `report_verdict`), cộng / trừ điểm từng người báo, phát `review.report.decided` (người báo, kết quả, hệ quả) và
  `review.report.hide_changed` nếu báo cáo đã tự ẩn.
- Hệ quả cấm / khoá đi qua outbox: bên nghe của `review` gọi `group.banFromReport`, `identity.lockFromReport` (bỏ qua
  nếu đã cấm / đã khoá / đã xoá), và `trust.voidByReport` khi báo cáo đúng về tin. Quyền đã kiểm lúc quyết.
- Việc gộp máy giữ và báo cáo: máy giữ xử như cũ, kết quả báo cáo ghi kèm.

### 8. Điểm báo cáo

- Đóng báo cáo: mỗi lượt báo bị bác −1, đúng +1 (`upsert`, cùng transaction). Điểm sau khi trừ < −6 →
  `suspended_until = decided_at + 30 ngày` (bị bác tiếp khi vẫn dưới −6 thì gia hạn tiếp). Hết hạn thì báo được, điểm
  không đặt lại — báo đúng mới kéo điểm lên.

### 9. Thông báo cho người báo (N46)

- `review.report.decided` → mỗi người báo một dòng hộp thư nhóm `your_reports`, không nhắc: "Báo cáo của bạn về «X»
  đã được xử: có vi phạm / không vi phạm." Không nêu hệ quả, không nêu người khác.

### 10. Giấu danh tính

- Người bị báo, người đăng: không DTO nào có người báo. Người xử: thấy loại, số người báo, thời điểm từng lượt — không
  thấy ai báo. Người báo: chỉ thấy lượt của mình và kết quả.

### 11. Trả lời câu hỏi mở của proposal

1. Báo cáo đúng về tin đã bán / hết hạn: không có "gỡ" (TK 18); vẫn xác nhận đúng được, kèm hệ quả khác.
2. Báo cáo sau khi tài khoản đã xoá: không nhận — hồ sơ và tin đã 404. Báo cáo mở từ trước thì vẫn xử (spec).
3. Nhóm đóng: báo cáo mọi loại về tin trong nhóm vẫn mở (cam kết 25 thắng TK 10); không còn bậc nhóm nên về staff danh
   mục. Không huỷ nên không cần báo người báo hay đổi điểm.
4. "Một lần giữa hai quyết định": bất kỳ quyết định nào của người về tin (kể cả gỡ, khôi phục trực tiếp) mở lại khả năng
   tự ẩn.
5. Báo cáo đúng không bắt buộc kèm hệ quả. Cờ tạm ẩn gỡ theo mọi quyết định — muốn tin biến mất thì chọn gỡ.
6. Báo cáo đúng về tin đã xoá, tin của tài khoản đã xoá: chỉ `keep`; khoá tài khoản đã xoá không áp.
7. Người chưa xác nhận email không báo cáo được (403 `EMAIL_NOT_VERIFIED`) — tài khoản rác bị dọn sau 7 ngày, không nên
   có tiếng nói.
8. Báo lại cùng đối tượng khi còn mở: 200, không đổi gì.
9. Người đã báo không xử báo cáo đó (cùng máy của họ).
10. Người xử không thấy danh tính người báo; không có lời mô tả tự do (năm loại cố định để thống kê); báo cáo liên quan
    gồm cả báo cáo đã đóng (10 báo cáo gần nhất).
11. Điểm không đặt lại sau 30 ngày; bị bác tiếp khi vẫn dưới −6 thì tính thêm 30 ngày từ lần bác đó. Báo cáo gộp chỉ
    xếp cuối khi **mọi** lượt đều của người điểm thấp.
12. Lượt báo không có dấu máy không tính ngưỡng.
13. Đúng: chỉ tin sàn tự ẩn; tin trong nhóm, kể cả "nhóm công khai", không.

## Risks / Trade-offs

- Hệ quả cấm / khoá chạy sau commit qua outbox — vài giây sau quyết định. Đổi lại quyết định và hệ quả không bao giờ lệch
  nhau khi một bước hỏng.
- Ngưỡng tạm ẩn tính trên lượt của báo cáo đang mở; lượt của báo cáo đã đóng không cộng dồn.
- Thêm cột `account_id` vào việc: mọi đường đọc việc phải chịu `listing_id` null — test hàng chờ cũ chạy lại đủ.
