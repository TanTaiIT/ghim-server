# Người duyệt — hướng dẫn cho bàn vận hành và app

Máy duyệt chỉ giữ, hạn chế hay cho qua tin; mọi quyết định của **người** đi qua module `review`: một tin có tối đa
**một việc mở**, việc nằm trong một hàng, có hạn xử, và ai xử được thì server tính lúc đọc. Bàn vận hành (web) phục vụ
staff và master; app Ghim phục vụ điều hành viên và chủ nhóm xử việc của nhóm.

Hợp đồng đầy đủ: `openspec/specs/review/`; thiết kế ở `openspec/changes/archive/2026-10-15-add-review-queues/design.md`.
Luật nghiệp vụ ở TK 16, TK 17.

## Hàng và hạn xử

| Hàng | Lý do (`reasons`)                               | Hạn xử | Quá hạn thì                         |
| ---- | ----------------------------------------------- | ------ | ----------------------------------- |
| 0    | `machine_hold` — máy giữ tin                    | 24 giờ | chuyển master; tin vẫn chờ duyệt    |
| 3    | `machine_restricted` — máy hạn chế              | 72 giờ | chuyển master; tin vẫn hiện hạn chế |
| 4    | `group_escalation` — nhóm chuyển lên            | 72 giờ | chuyển master                       |
| 5    | `sample_risk`, `sample_reviewer` — mẫu hậu kiểm | 7 ngày | tự huỷ, đếm "bỏ sót"; tin không đổi |

Một việc gộp nhiều lý do thì nằm ở hàng nhỏ nhất và giữ hạn sớm nhất — hạn không bao giờ kéo dài. Quá hạn **không bao
giờ** tự mở hay tự gỡ tin. Việc ở hàng master quá 72 giờ thì master được nhắc (N40), nhắc lại mỗi ngày.

## Ai thấy việc nào (`level`)

Server tính bậc đang giữ việc theo chuỗi: `unit_moderators` (điều hành đơn vị của tin) → `group_moderators` (điều hành
cả nhóm) → `group_owner` → `category_staff` → `master`. Chuỗi nhóm chỉ áp cho tin trong nhóm ở hàng 0 khi danh mục để
nhóm duyệt, và ở hàng 5; việc còn lại đi staff của danh mục rồi master. Người đăng, tài khoản dùng chung máy với họ, và
(với hàng 4, mẫu người duyệt) người đã chuyển lên hay đã cho đạt không bao giờ thấy việc — việc rơi xuống bậc kế tiếp.
Master xử được mọi việc. Việc ngoài phạm vi trả `404 NOT_FOUND` như việc không tồn tại.

## Bàn vận hành — `/api/v1/ops/review` (staff có danh mục, master; cần lớp thứ hai)

| Route                                                    | Việc                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /tasks?queue=&atMaster=&page=`                      | Hàng chờ của tôi, hạn sớm trước; `atMaster=true` (master) chỉ việc ở bậc master                                                                                                               |
| `GET /tasks/{taskId}`                                    | Bối cảnh: tin như người đăng thấy, điểm và luật máy đã trúng, mức và số tin sạch của người bán, ảnh trùng ở tài khoản khác, tài khoản dùng chung máy (không có mã máy), lý do nhóm chuyển lên |
| `POST /tasks/{taskId}/claim`                             | Nhận việc, giữ 10 phút                                                                                                                                                                        |
| `POST /tasks/{taskId}/decision`                          | Quyết định (xem dưới)                                                                                                                                                                         |
| `POST /listings/{listingId}/remove`                      | Gỡ thẳng tin sàn đang hiện không có việc mở — `{ reasonTemplateId }`                                                                                                                          |
| `POST /listings/{listingId}/restore`                     | Khôi phục tin sàn bị gỡ; ngày hiển thị chạy tiếp từ chỗ đã dừng                                                                                                                               |
| `GET /reason-templates`                                  | Lý do mẫu cho "sai sót" (master thấy cả lý do đã tắt)                                                                                                                                         |
| `POST /reason-templates`, `PATCH /reason-templates/{id}` | Master thêm, sửa câu, thứ tự, tắt / bật                                                                                                                                                       |
| `GET /stats/board`                                       | Master: việc mở theo hàng, quá hạn, việc ở bậc master quá hạn nhắc                                                                                                                            |
| `GET /stats/reviewers`                                   | Master: tỉ lệ bị lật theo người duyệt                                                                                                                                                         |
| `GET /stats/rules`                                       | Master: tỉ lệ máy quá tay theo luật, số lượt "máy quá tay"                                                                                                                                    |

## App — `/api/v1/groups/{groupId}/review` (điều hành viên, chủ nhóm)

`GET /tasks`, `GET /tasks/{taskId}`, `POST /tasks/{taskId}/claim`, `POST /tasks/{taskId}/decision` như trên nhưng chỉ
việc của nhóm ở bậc của mình. `POST /listings/{listingId}/detach` gỡ khỏi nhóm một tin không có việc mở (chủ nhóm,
điều hành cả nhóm, điều hành đơn vị của tin). `GET /reason-templates` trả lý do mẫu đang dùng.

## Nhận việc

`claim` trả `{ taskId, claimExpiresAt, listingVersion }`. Trên hàng chờ, `claim.state` là `free`, `mine` hay `taken`
("đang có người xử" — ẩn nút Nhận). Quá 10 phút chưa quyết thì việc tự trở về hàng chờ; nhận lại để gia hạn. Mất vai
điều hành, mất quyền staff, bị khoá thì việc đang giữ trả về ngay.

## Quyết định

```json
{ "outcome": "pass", "machineJudgment": "machine_overreach" }
{ "outcome": "mistake", "reasonTemplateId": "…" }
{ "outcome": "detach", "platformViolation": true, "note": "Bán hàng giả" }
{ "outcome": "dismiss", "note": "Không thấy dấu hiệu vi phạm" }
```

- `pass` — tin máy giữ lên bảng (bắt buộc `machineJudgment`: `machine_right` / `machine_overreach`); tin đang hiện giữ
  nguyên, gỡ lý do hạn chế "máy".
- `mistake` — kèm lý do mẫu: tin chờ duyệt thành bị từ chối, tin đang hiện thành bị gỡ; người đăng thấy lý do. Không
  đổi gì trên tài khoản người đăng.
- `detach` — chỉ tin trong nhóm, chỉ điều hành, chủ nhóm, master. Kèm `platformViolation: true` thì bắt buộc `note` và
  sinh việc hàng 4 cho staff; tin rời nhóm ngay.
- `dismiss` — staff, master bác việc hàng 4; tin vẫn ngoài nhóm như nhóm đã quyết.

Kết quả trả `{ decisionId, outcome, listingState }` với `outcome` thật (`reject` hay `remove` thay cho `mistake`).

## Mã lỗi

| HTTP | `code`                | Khi nào — app làm gì                                                         |
| ---- | --------------------- | ---------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`    | Thiếu nhận định máy, thiếu hay dùng lý do mẫu đã tắt, chuyển lên thiếu lý do |
| 403  | `FORBIDDEN`           | Không còn vai trên phạm vi lúc quyết; staff chọn gỡ khỏi nhóm; tin của mình  |
| 404  | `NOT_FOUND`           | Việc không có, hay ngoài phạm vi — bỏ khỏi danh sách                         |
| 409  | `TASK_CLAIMED`        | Người khác đang giữ — tải lại hàng chờ                                       |
| 409  | `TASK_NOT_CLAIMED`    | Chưa nhận hay đã quá 10 phút — nhận lại rồi quyết                            |
| 409  | `TASK_CLOSED`         | Việc đã có quyết định hay đã huỷ (tin sửa, rút, nhóm đóng, mẫu quá hạn)      |
| 409  | `TASK_REASSIGNED`     | Việc đã chuyển master hay đổi người xử — bỏ khỏi danh sách                   |
| 409  | `LISTING_CHANGED`     | Người đăng vừa sửa tin — tải lại bối cảnh, nhận lại rồi quyết                |
| 409  | `OUTCOME_NOT_ALLOWED` | Kết quả không hợp với việc (gỡ khỏi nhóm tin sàn, bác việc không chuyển lên) |
| 409  | `TASK_OPEN`           | Gỡ thẳng / gỡ khỏi nhóm thẳng tin đang có việc mở — xử qua việc đó           |
| 409  | `INVALID_TRANSITION`  | Khôi phục tin không bị gỡ                                                    |

## Thông báo cho master

N40 việc ở hàng master quá hạn nhắc, N41 một nửa số việc đang chờ sắp chạm hạn trong 24 giờ, N42 hậu kiểm tuần trước
làm xong dưới 80% — nhóm "tài khoản" (luôn bật), mỗi loại một dòng chưa đọc, lượt sau cập nhật số trên dòng đó. Báo
người đăng về quyết định thuộc change `add-notifications`.
