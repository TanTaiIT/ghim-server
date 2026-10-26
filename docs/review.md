# Người duyệt — hướng dẫn cho bàn vận hành và app

Máy duyệt chỉ giữ, hạn chế hay cho qua tin; mọi quyết định của **người** đi qua module `review`: một tin có tối đa
**một việc mở**, việc nằm trong một hàng, có hạn xử, và ai xử được thì server tính lúc đọc. Bàn vận hành (web) phục vụ
staff và master; app Ghim phục vụ điều hành viên và chủ nhóm xử việc của nhóm.

Hợp đồng đầy đủ: `openspec/specs/review/`; thiết kế ở `openspec/changes/archive/2026-10-15-add-review-queues/design.md`
và, cho báo cáo, `openspec/changes/archive/2026-10-16-add-reports/design.md`; gậy, khiếu nại ở `docs/strikes.md`. Luật nghiệp vụ ở TK 16, TK 17, TK 23.

## Hàng và hạn xử

| Hàng | Lý do (`reasons`)                                            | Hạn xử | Quá hạn thì                                                                          |
| ---- | ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------ |
| 0    | `machine_hold` — máy giữ tin                                 | 24 giờ | chuyển master; tin vẫn chờ duyệt                                                     |
| 1    | `report`, `report_severe` — báo cáo                          | 72 giờ | chuyển master; tạm ẩn giữ nguyên                                                     |
| 2    | `appeal`, `serious_strike`, `permanent_review` — việc về gậy | 7 ngày | khiếu nại gậy thường tự thắng; gậy nặng chuyển master; gậy nghiêm trọng vốn ở master |
| 3    | `machine_restricted` — máy hạn chế                           | 72 giờ | chuyển master; tin vẫn hiện hạn chế                                                  |
| 4    | `group_escalation` — nhóm chuyển lên                         | 72 giờ | chuyển master                                                                        |
| 5    | `sample_risk`, `sample_reviewer` — mẫu hậu kiểm              | 7 ngày | tự huỷ, đếm "bỏ sót"; tin không đổi                                                  |

Một việc gộp nhiều lý do thì nằm ở hàng nhỏ nhất và giữ hạn sớm nhất — hạn không bao giờ kéo dài. Quá hạn **không bao
giờ** tự mở hay tự gỡ tin. Việc ở hàng master quá 72 giờ thì master được nhắc (N40), nhắc lại mỗi ngày.

## Ai thấy việc nào (`level`)

Server tính bậc đang giữ việc theo chuỗi: `unit_moderators` (điều hành đơn vị của tin) → `group_moderators` (điều hành
cả nhóm) → `group_owner` → `category_staff` → `master`. Chuỗi nhóm chỉ áp cho tin trong nhóm ở hàng 0 khi danh mục để
nhóm duyệt, và ở hàng 5; việc còn lại đi staff của danh mục rồi master. Người đăng, tài khoản dùng chung máy với họ, và
(với hàng 4, mẫu người duyệt) người đã chuyển lên hay đã cho đạt, (với báo cáo) người đã báo không bao giờ thấy việc —
việc rơi xuống bậc kế tiếp. Báo cáo loại thường (`report`) về tin trong nhóm đi chuỗi nhóm; có lượt lừa đảo / hàng cấm
(`report_severe`) thì luôn về staff danh mục, điều hành nhóm không thấy. Việc về **một người** (`subjectKind:
"account"`, `listingId: null`) đi `safety_staff` (staff có việc `user_reports`) → `master`.
Việc về **một gậy** (`subjectKind: "strike"`, `strikeId`) đi `category_staff` của danh mục gậy → `master`; gậy không có danh
mục (master ra, từ báo cáo về người) và gậy nghiêm trọng đi thẳng master; người ra gậy, người nhận và máy của họ không
thấy — với master ra gậy nghiêm trọng, chỉ master kia thấy (`docs/strikes.md`).
Master xử được mọi việc. Việc ngoài phạm vi trả `404 NOT_FOUND` như việc không tồn tại.

## Bàn vận hành — `/api/v1/ops/review` (staff có danh mục hay việc an toàn, master)

| Route                                                    | Việc                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /tasks?queue=&atMaster=&page=`                      | Hàng chờ của tôi, hạn sớm trước; `atMaster=true` (master) chỉ việc ở bậc master                                                                                                                                                                                                                                                                                |
| `GET /tasks/{taskId}`                                    | Bối cảnh: tin như người đăng thấy (kể cả bản lưu của tin đã xoá — `listingDeleted`), điểm và luật máy đã trúng, mức và số tin sạch của người bán, ảnh trùng ở tài khoản khác, tài khoản dùng chung máy (không có mã máy), lý do nhóm chuyển lên, `reports` — 10 báo cáo gần nhất về tin và người (loại, số người báo, lúc từng lượt, kết quả; không có ai báo) |
| `POST /tasks/{taskId}/claim`                             | Nhận việc, giữ 10 phút                                                                                                                                                                                                                                                                                                                                         |
| `POST /tasks/{taskId}/decision`                          | Quyết định (xem dưới)                                                                                                                                                                                                                                                                                                                                          |
| `POST /listings/{listingId}/remove`                      | Gỡ thẳng tin sàn đang hiện không có việc mở — `{ reasonTemplateId }`                                                                                                                                                                                                                                                                                           |
| `POST /listings/{listingId}/restore`                     | Khôi phục tin sàn bị gỡ; ngày hiển thị chạy tiếp từ chỗ đã dừng                                                                                                                                                                                                                                                                                                |
| `GET /reason-templates`                                  | Lý do mẫu cho "sai sót" (master thấy cả lý do đã tắt)                                                                                                                                                                                                                                                                                                          |
| `POST /reason-templates`, `PATCH /reason-templates/{id}` | Master thêm, sửa câu, thứ tự, tắt / bật                                                                                                                                                                                                                                                                                                                        |
| `GET /stats/board`                                       | Master: việc mở theo hàng, quá hạn, việc ở bậc master quá hạn nhắc                                                                                                                                                                                                                                                                                             |
| `GET /stats/reviewers`                                   | Master: tỉ lệ bị lật theo người duyệt                                                                                                                                                                                                                                                                                                                          |
| `GET /stats/rules`                                       | Master: tỉ lệ máy quá tay theo luật, số lượt "máy quá tay"                                                                                                                                                                                                                                                                                                     |

Báo cáo gửi **từ hội thoại** (add-messaging) là báo cáo về người; chi tiết việc có thêm `conversations[]` — bản ghi hội thoại mà
lượt báo của báo cáo đang mở trỏ tới (tin, hai bên, tin nhắn theo thứ tự gửi kèm `images` — ảnh của tin nhắn, `flagged` = trúng cụm mơ hồ), đọc được kể cả khi hai
bên đã xoá phía mình; `reports[].entries[].conversationId` trỏ tới bản ghi. Luật nhắn tin ở `docs/messaging.md`.

## App — `/api/v1/groups/{groupId}/review` (điều hành viên, chủ nhóm)

`GET /tasks`, `GET /tasks/{taskId}`, `POST /tasks/{taskId}/claim`, `POST /tasks/{taskId}/decision` như trên nhưng chỉ
việc của nhóm ở bậc của mình. Chi tiết việc ở đây chỉ có báo cáo thường (`report`) về chính tin đó, mở hay đã đóng —
không có báo cáo lừa đảo / hàng cấm, báo cáo về người, báo cáo về tin khác; `conversations` luôn rỗng
(fix-group-task-report-scope). `POST /listings/{listingId}/detach` gỡ khỏi nhóm một tin không có việc mở (chủ nhóm,
điều hành cả nhóm, điều hành đơn vị của tin). `GET /reason-templates` trả lý do mẫu đang dùng.

## Báo cáo — app Ghim, `/api/v1` (người đã đăng nhập, đã xác nhận email)

| Route             | Việc                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /reports`   | `{ subject: { kind: "listing", listingId } \| { kind: "account", accountId }, category }` — 201 lượt mới, 200 khi mình đã báo đối tượng này trong báo cáo đang mở |
| `GET /me/reports` | Báo cáo tôi đã gửi: loại, `status` (`open` / `upheld` / `dismissed`), lúc báo, lúc có kết quả                                                                     |

- `category`: `fraud` (lừa đảo), `misinformation` (sai thông tin), `harassment` (quấy rối), `prohibited` (hàng cấm),
  `other` (khác). Không có lời mô tả tự do.
- Gửi kèm header `x-device-id` như lúc đăng tin: lượt báo không có mã máy vẫn vào hàng nhưng không tính ngưỡng tạm ẩn.
- Tin sàn bị 3 người (mức T1 trở lên, điểm báo cáo bình thường) từ 3 máy báo trong 24 giờ thì tạm ẩn lý do `reported`
  — người đăng thấy "tạm ẩn chờ người duyệt", người khác nhận 404. Chỉ quyết định của người gỡ cờ này; bác thì tin
  hiện lại không mất ngày. Tin trong nhóm không tự ẩn.
- Kết quả tới người báo trong hộp thư, nhóm `your_reports` (N46), không nêu hệ quả.

## Nhận việc

`claim` trả `{ taskId, claimExpiresAt, listingVersion }` (`listingVersion: null` với việc về một người). Trên hàng chờ, `claim.state` là `free`, `mine` hay `taken`
("đang có người xử" — ẩn nút Nhận). Quá 10 phút chưa quyết thì việc tự trở về hàng chờ; nhận lại để gia hạn. Mất vai
điều hành, mất quyền staff, bị khoá thì việc đang giữ trả về ngay.

## Quyết định

```json
{ "outcome": "pass", "machineJudgment": "machine_overreach" }
{ "outcome": "mistake", "reasonTemplateId": "…" }
{ "outcome": "detach", "platformViolation": true, "note": "Bán hàng giả" }
{ "outcome": "dismiss", "note": "Không thấy dấu hiệu vi phạm" }
{ "outcome": "keep", "report": { "verdict": "dismissed" } }
{ "outcome": "mistake", "reasonTemplateId": "…", "report": { "verdict": "upheld" } }
{ "outcome": "keep", "report": { "verdict": "upheld", "banFromGroup": true } }
{ "outcome": "violation", "strike": { "kind": "normal", "ruleArticleId": "…" } }
{ "outcome": "keep", "appeal": { "verdict": "won" } }
```

- `pass` — tin máy giữ lên bảng (bắt buộc `machineJudgment`: `machine_right` / `machine_overreach`, trừ việc có
  `groupManual: true` — máy đã cho qua, giữ chỉ vì nhóm bật duyệt tay; gửi kèm thì bị bỏ qua); tin đang hiện giữ
  nguyên, gỡ lý do hạn chế "máy".
- `mistake` — kèm lý do mẫu: tin chờ duyệt thành bị từ chối, tin đang hiện thành bị gỡ; người đăng thấy lý do. Không
  đổi gì trên tài khoản người đăng.
- `detach` — chỉ tin trong nhóm, chỉ điều hành, chủ nhóm, master. Kèm `platformViolation: true` thì bắt buộc `note` và
  sinh việc hàng 4 cho staff; tin rời nhóm ngay.
- `dismiss` — staff, master bác việc hàng 4; tin vẫn ngoài nhóm như nhóm đã quyết.
- `violation` — như `mistake` nhưng vì vi phạm: bắt buộc `strike { kind, ruleArticleId }`, người đăng nhận gậy ngay, tin không
  sửa / xoá được; cũng là nút "xác nhận" việc hàng 4. Chỉ staff danh mục, master. Báo cáo đúng (`keep` hay `violation`)
  cũng kèm được `strike`. Việc về gậy quyết bằng `appeal` / `serious` / `permanent` — `docs/strikes.md`.
- Việc có lý do báo cáo **bắt buộc** `report.verdict` (`upheld` đúng / `dismissed` bác) — đóng mọi lượt báo đã gộp,
  cộng / trừ điểm từng người báo, gỡ cờ tạm ẩn. `keep` = không đổi tin (bắt buộc với tin người đăng đã xoá và với việc
  về một người). Báo cáo đúng kèm `mistake` (gỡ tin — staff danh mục, master), `detach` (quản trị nhóm, master),
  `banFromGroup` (quản trị nhóm, master; không cấm được chủ nhóm), `lockAccount` (chỉ master). Cấm, khoá áp vài giây
  sau quyết định (qua outbox).

Kết quả trả `{ decisionId, outcome, listingState, reportVerdict, strikeId }` với `outcome` thật (`reject` hay `remove` thay
cho `mistake` / `violation`); `listingState: null` với việc về một người hay về gậy; `strikeId` = gậy vừa ra hay vừa quyết.

## Mã lỗi

| HTTP | `code`                | Khi nào — app làm gì                                                                                                               |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`    | Thiếu nhận định máy, thiếu hay dùng lý do mẫu đã tắt, chuyển lên thiếu lý do; vi phạm thiếu điều trích; nút không khớp việc về gậy |
| 403  | `FORBIDDEN`           | Không còn vai trên phạm vi lúc quyết; staff chọn gỡ khỏi nhóm; tin của mình; điều hành nhóm ra gậy; người ra gậy xét gậy mình      |
| 404  | `NOT_FOUND`           | Việc không có, hay ngoài phạm vi — bỏ khỏi danh sách                                                                               |
| 409  | `TASK_CLAIMED`        | Người khác đang giữ — tải lại hàng chờ                                                                                             |
| 409  | `TASK_NOT_CLAIMED`    | Chưa nhận hay đã quá 10 phút — nhận lại rồi quyết                                                                                  |
| 409  | `TASK_CLOSED`         | Việc đã có quyết định hay đã huỷ (tin sửa, rút, nhóm đóng, mẫu quá hạn)                                                            |
| 409  | `TASK_REASSIGNED`     | Việc đã chuyển master hay đổi người xử — bỏ khỏi danh sách                                                                         |
| 409  | `LISTING_CHANGED`     | Người đăng vừa sửa tin — tải lại bối cảnh, nhận lại rồi quyết                                                                      |
| 409  | `OUTCOME_NOT_ALLOWED` | Kết quả không hợp với việc (gỡ khỏi nhóm tin sàn, bác việc không chuyển lên)                                                       |
| 409  | `TASK_OPEN`           | Gỡ thẳng / gỡ khỏi nhóm thẳng tin đang có việc mở — xử qua việc đó                                                                 |
| 409  | `INVALID_TRANSITION`  | Khôi phục tin không bị gỡ                                                                                                          |
| 400  | `CANNOT_REPORT_SELF`  | Báo cáo chính mình hay tin của mình                                                                                                |
| 403  | `EMAIL_NOT_VERIFIED`  | Báo cáo khi chưa xác nhận email                                                                                                    |
| 403  | `REPORTING_SUSPENDED` | Đang mất quyền báo cáo — `details.reportAgainAt`                                                                                   |
| 429  | `REPORT_RATE_LIMITED` | Quá 10 báo cáo trong 60 phút — `details.retryAt`                                                                                   |

## Thông báo cho quản trị nhóm

N36 (change `add-trust-notices`): tin trong nhóm bị máy giữ mà việc vào hàng của quản trị nhóm thì những người đang xử
được việc đó nhận thông báo `group.review.pending`, nhóm "nhóm của bạn", có nhắc, `data { groupId }` — mở hàng chờ của
nhóm (`/groups/{groupId}/review/tasks`). Mỗi người một dòng gộp theo nhóm: chưa đọc thì câu cập nhật theo số tin đang
chờ **hiện tại** trong phạm vi của người đó ("«Lớp 12A1» có 3 tin chờ duyệt."), nhắc lại tối đa mỗi 30 phút. Không báo
việc do sàn duyệt (danh mục đặt `groupReview: platform`, trừ tin giữ vì nhóm bật duyệt tay — việc đó luôn về nhóm), không báo người đăng về tin của chính mình, không nêu lý do
máy giữ hay tên người đăng. Tắt tiếng nhóm thì thôi nhắc.

## Thông báo cho master

N40 việc ở hàng master quá hạn nhắc, N41 một nửa số việc đang chờ sắp chạm hạn trong 24 giờ, N42 hậu kiểm tuần trước
làm xong dưới 80% — nhóm "tài khoản" (luôn bật), mỗi loại một dòng chưa đọc, lượt sau cập nhật số trên dòng đó. Báo
người đăng về quyết định thuộc change `add-notifications`.
