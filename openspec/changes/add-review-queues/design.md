# Design

> Câu hỏi mở đã chốt 15/10/2026 (proposal, mục Impact — 17 câu, phương án A). Design này dựa trên code tại commit
> `7b8241c` (nhánh `add-listings`).

## Context

- Máy duyệt đã có (`add-screening`): kết luận một lượt chấm phát `screening.result.recorded`
  `{listingId, listingVersion, outcome: 'pass'|'hold', restrictMachine, rankAsListingId}`; rút tin về khi bật cụm từ
  cấm phát `screening.listing.recalled`; lưới an toàn phát `screening.listing.restricted` mỗi 5 phút cho tin đang
  hiện thiếu kết quả ảnh. Payload không mang điểm, dải, luật đã trúng — các thứ đó nằm ở `screening_runs`.
- `listing` đã có các mũi tên của người duyệt trong bảng trạng thái (`approve` pending→live, `reject`
  pending→rejected, `remove` live→removed, `restore` removed→live) và `ListingSystemService.review(input)` ghi có điều
  kiện theo `version`, nhưng chưa ai gọi, chưa nhận người quyết hay transaction của bên gọi, và `approve` hiện giữ
  nguyên lý do hạn chế `machine`. "Gỡ khỏi nhóm" có sẵn ở `onHideEvent(..., {kind: 'detached_by_group'})` nhưng chưa
  ai phát. `OpenWork.blocksPlacement` còn là bản tạm `noOpenWork`.
- `group`: vai ở `group_members` (`role`, `moderatorUnitId` null = cả nhóm), tin mang `groupId`, `unitId`; sự kiện
  `group.member.left|joined`, `group.ban.lifted`, `group.moderator.changed`, `group.owner.changed`,
  `group.state.closed`. `category_setting_versions.groupReview` (`group` | `platform`) quyết ai duyệt tin nhóm bị giữ.
- `platform`: quyền staff ở `staff_permissions` + `staff_category_grants`; **không phát sự kiện** khi cấp, thu, treo.
- `identity`: dấu máy chỉ ghi khi đăng tin (`device_posts`); chưa có hàm "tài khoản nào dùng chung máy với X".
- `notification`: hộp thư có sẵn, chưa có thông báo nào cho master; `trust`: số tin sạch chỉ đọc được trên bảng của
  chính người bán.
- Bảng con số đã khai sẵn nhóm "Hàng chờ" (`review.*`) và "Hậu kiểm" (`postcheck.*`).

## Decisions

### 1. Module `review` sở hữu việc và nhật ký quyết định

Module mới `src/modules/review/` — module duy nhất ghi quyết định của người (CLAUDE.md luật 11, 16, 17). Cụm:
`calc/` (định tuyến, gộp lý do, lấy mẫu, số liệu — thuần), `queue/` (sinh, gộp, huỷ việc theo sự kiện; job), `desk/`
(xem hàng chờ, nhận việc, quyết định — route bàn vận hành và route app cho điều hành nhóm), `stats/` (bảng tồn, tỉ lệ
bị lật, tỉ lệ máy quá tay). `review.ports.ts` là hợp đồng với module khác.

### 2. Bảng

| Bảng                       | Cột chính                                                                                                                                                                                                                                                                                                                                                          | Ràng buộc                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review_tasks`             | `listing_id`, `status` (`open`/`decided`/`cancelled`), `reasons review_reason[]`, `queue` (số hàng nhỏ nhất của lý do), `due_at`, `escalated_at` (đã chuyển master), `excluded_ids uuid[]`, `escalated_by`, `escalation_note`, `sampled_decision_id`, `claimed_by`, `claim_expires_at`, `claimed_version`, `reminded_at`, `close_cause`, `closed_at`, `created_at` | **partial unique** `(listing_id) WHERE status = 'open'`; CHECK: việc mở có ít nhất một lý do; `queue` 0–5; nhận việc đủ ba cột hoặc không cột nào |
| `review_decisions`         | `task_id` (null = gỡ / khôi phục trực tiếp), `listing_id`, `actor_id`, `actor_role`, `outcome`, `severity`, `reason_template_id`, `reason_text`, `machine_judgment`, `machine_outcome`, `machine_hits text[]`, `task_reasons`, `listing_state_after`, `poster_tier_after`, `overturns_decision_id`, `decided_at`                                                   | không chứa nội dung tin; FK `task_id` `ON DELETE RESTRICT`                                                                                        |
| `review_reason_templates`  | `text`, `active`, `sort`, `created_by`                                                                                                                                                                                                                                                                                                                             | migration nạp sáu lý do khởi đầu                                                                                                                  |
| `review_sample_candidates` | `listing_id`, `listing_version`, `went_live_at`, `approved_by`                                                                                                                                                                                                                                                                                                     | PK `(listing_id, listing_version)`                                                                                                                |

Enum `review_reason`: `machine_hold` (hàng 0), `machine_restricted` (3), `group_escalation` (4), `sample_risk`,
`sample_reviewer` (5) — `report` (1) và `appeal` (2) do `add-reports`, `add-strikes` thêm vào enum. `listings` thêm
cột `fault_reason` (lý do mẫu người đăng thấy), do `listing` ghi khi `review` gọi. Migration chỉ thêm, không mất dữ
liệu; CHECK viết tay theo mục Migration của CLAUDE.md.

### 3. Một tin một việc: upsert có gộp

Mọi lối sinh việc đi qua một câu SQL `INSERT … ON CONFLICT (listing_id) WHERE status = 'open' DO UPDATE` trong
repository: hợp lý do, `due_at = LEAST(cũ, mới)`, `queue = LEAST`. Hai lối sinh cùng lúc vẫn ra một việc (partial
unique làm trọng tài, có test DB). Bỏ lý do là `array_remove`; hết lý do thì cùng câu đó đóng việc
(`status = 'cancelled'`, `close_cause`). Hạn xử không bao giờ kéo dài.

### 4. Ai xử: tính lúc đọc, không lưu

Việc chỉ lưu phạm vi (tin sàn hay nhóm, `group_id`, `unit_id`, `category_id` đọc từ tin) và `excluded_ids`. Danh sách
người xử tính bằng hàm thuần `calc/route.calc.ts` từ: lý do có số hàng nhỏ nhất, `groupReview` của danh mục, người
dự tuyển (điều hành viên đơn vị, điều hành cả nhóm, chủ nhóm — chỉ khi nhóm còn cho điều hành; staff đang hoạt động
của danh mục; master), và `excluded_ids`. Chuỗi: đơn vị → cả nhóm → chủ nhóm → staff danh mục → master (TK 16); bậc
đầu tiên còn người không bị loại là bậc xử. `escalated_at` có giá trị thì chỉ master. Tính lúc đọc nên bổ nhiệm, bãi
nhiệm, cấp quyền staff có hiệu lực ngay mà không cần lượt "định tuyến lại".

`excluded_ids` tính lúc sinh hay gộp việc: người đăng + tài khoản dùng chung máy trong 180 ngày (`device_posts`,
`device.dataRetentionDays`); việc hàng 4 thêm người chuyển lên và tài khoản dùng chung máy với họ; mẫu người duyệt
thêm người đã cho đạt và tài khoản dùng chung máy với họ. Master không bao giờ bị loại.

### 5. Nhận việc

`POST …/claim`: một câu `UPDATE … WHERE id = ? AND status = 'open' AND (claimed_by IS NULL OR claim_expires_at <
now())` trả 0 hay 1 dòng — hai người nhận cùng lúc thì một người thắng (`TASK_CLAIMED`). Lưu `claimed_version` =
phiên bản tin lúc nhận. Quá hạn giữ thì coi như chưa ai nhận ngay khi đọc; job mỗi phút dọn cột cho gọn. Quyết định
kiểm lại theo thứ tự: việc còn mở (`TASK_CLOSED`) → còn vai trên phạm vi (`FORBIDDEN`) → đang nhận và chưa hết giờ
(`TASK_NOT_CLAIMED`) → vẫn nằm trong danh sách người xử, tức chưa chuyển master hay đổi người xử do gộp
(`TASK_REASSIGNED`) → phiên bản tin không đổi (`LISTING_CHANGED`) → kết quả hợp lệ với lý do và phạm vi
(`OUTCOME_NOT_ALLOWED`, `VALIDATION_ERROR`). Vai kiểm trước việc giữ: bãi nhiệm trả việc người đó đang nhận qua sự
kiện, nên kiểm việc giữ trước thì người bị bãi nhiệm nhận `TASK_NOT_CLAIMED` thay vì 403 spec đòi (đổi lúc code,
15/10/2026).

### 6. Quyết định ghi trong một transaction với tin

`listing` mở rộng `review(input)`: nhận `after(tx, listing)` để `review` ghi dòng nhật ký, đóng việc, sinh mẫu người
duyệt trong **cùng transaction** đổi trạng thái tin (mẫu như `media.attach(tx)`); `approve` gỡ lý do `machine` (câu
5); `reject`/`remove` ghi `fault_reason`. Thêm hai thao tác không đổi trạng thái: `confirmLive` (đạt hàng 3, 5 — gỡ
`machine`, kiểm `version`) và `detachByGroup` (gỡ khỏi nhóm — kiểm `version` rồi chạy `onHideEvent` sẵn có). Mọi lối
đều kiểm `version`; lệch → `LISTING_CHANGED`.

| Kết quả                 | Ai                          | Hàng / phạm vi                   | Lên tin                                                        |
| ----------------------- | --------------------------- | -------------------------------- | -------------------------------------------------------------- |
| đạt (`pass`)            | người xử                    | 0                                | `approve`, gỡ `machine`; bắt buộc nhận định máy                |
| đạt (`pass`)            | người xử                    | 3, 5                             | `confirmLive` (gỡ `machine`)                                   |
| từ chối / gỡ — sai sót  | người xử                    | 0 → `reject`, 3/5 → `remove`     | `fault = mistake`, `fault_reason`                              |
| gỡ khỏi nhóm (`detach`) | điều hành, chủ nhóm, master | tin trong nhóm                   | `detachByGroup`; kèm "trái quy định sàn" + lý do → việc hàng 4 |
| bác (`dismiss`)         | staff danh mục, master      | 4                                | không đổi                                                      |
| gỡ trực tiếp            | staff danh mục, master      | tin sàn đang hiện, không việc mở | `remove` (sai sót)                                             |
| khôi phục               | staff danh mục, master      | tin sàn bị gỡ                    | `restore`                                                      |

Kết quả "vi phạm" (gậy) và xác nhận hàng 4 có gậy để `add-strikes`.

### 7. Việc sinh, gộp, huỷ theo sự kiện

`review.events.ts` nghe outbox (bên nghe idempotent: gộp và bỏ lý do lặp lại vô hại). Việc sinh từ thay đổi trạng
thái của chính tin (`listing.state.changed`, ghi cùng transaction với tin), **không** từ `screening.result.recorded`:
`listing` và `review` cùng nghe sự kiện của máy thì không có thứ tự, nên đọc tin lúc nghe kết quả máy có thể còn thấy
trạng thái cũ (đổi lúc code, 15/10/2026).

| Sự kiện                                          | Việc                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `listing.state.changed` hold · recall            | thêm `machine_hold` (máy giữ lúc gửi, rút tin đang hiện về khi bật cụm từ cấm)                                 |
| `listing.state.changed` pass                     | bỏ `machine_hold`; tin mang lý do "máy" → thêm `machine_restricted`, không thì bỏ nó; ghi ứng viên lấy mẫu     |
| `screening.listing.restricted` (lưới an toàn)    | tin đang hiện → thêm `machine_restricted` (lặp mỗi 5 phút → gộp vô hại)                                        |
| `listing.listing.edited`                         | bỏ `sample_*` (câu 7)                                                                                          |
| `listing.state.changed` withdraw · sold · expire | huỷ việc (câu 8; tin không còn ở bảng thì không còn gì để xem)                                                 |
| `listing.state.changed` approve · restore        | ghi ứng viên lấy mẫu (tin người cho lên cũng được xét lấy mẫu theo rủi ro)                                     |
| `listing.listing.deleted`                        | huỷ việc                                                                                                       |
| `group.member.left`                              | bỏ `machine_hold` khỏi việc về tin của người đó trong nhóm (câu 9); trả việc người đó đang nhận nếu mất vai    |
| `group.member.joined`, `group.ban.lifted`        | tin chờ duyệt của người đó trong nhóm không có việc mở → thêm `machine_hold`, hạn mới                          |
| `group.state.closed`                             | bỏ `machine_hold`, `machine_restricted`, `sample_*` khỏi việc về tin của nhóm; `group_escalation` giữ (câu 10) |
| `group.moderator.changed`, `group.owner.changed` | trả việc đang nhận nếu người nhận mất quyền xử (câu 17)                                                        |
| `identity.account.locked`, `.deleted`            | trả việc người đó đang nhận                                                                                    |
| `platform.staff.changed` (**mới**)               | trả việc người đó đang nhận thuộc phần bị treo hay bị thu                                                      |

`platform` thêm sự kiện `platform.staff.changed {accountId}` khi cấp, đổi danh mục, thu, treo, gỡ treo (trong cùng
transaction của thao tác).

### 8. Cổng module khác cài cho `review`

`listing`: `reviewSubject(id)` (trạng thái, phiên bản, nơi đăng, nhóm, đơn vị, danh mục, người đăng), `forReviewer(id)`
(nội dung tin như người đăng thấy), `pendingInGroup(accountId, groupId)`, cùng `review`/`confirmLive`/`detachByGroup`.
`screening`: `runOf(listingId, version)` (kết quả, nguyên nhân, điểm, dải, mức, mã luật), `duplicateMatches(listingId)`
(tin, tài khoản có ảnh trùng — tính lại từ `image_checks`, không lưu). `identity`: `sharedDeviceAccounts(accountId,
since)`, `masterIds()`. `platform`: `activeStaffByCategory(ids)`. `group`: `reviewersOf(groupId)` (nhóm còn cho điều
hành không, chủ nhóm, điều hành viên kèm phạm vi). `trust`: `cleanCount(accountId)`. Ngược lại `review` cài
`OpenWork.blocksPlacement` cho `listing`: tin có việc mở thì không đổi nơi đăng (spec `listing/editing`).

### 9. Job (pg-boss, lịch trong code)

| Lịch     | Việc                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| mỗi phút | chuyển master việc hàng 0, 3, 4 quá hạn (`escalated_at`); huỷ mẫu hàng 5 quá hạn (`close_cause = expired`, đếm "bỏ sót"); dọn nhận việc hết giờ                                                                                      |
| mỗi giờ  | lấy mẫu từ `review_sample_candidates` (100% điểm 45–59, 20% T0–T1, 5% còn lại; bỏ tin đang có việc mở; xoá ứng viên); nhắc master việc ở hàng master quá 72 giờ, nhắc lại mỗi 24 giờ; cảnh báo một nửa số việc chạm hạn trong 24 giờ |
| mỗi tuần | thứ Hai 08:00: tỉ lệ hậu kiểm tuần trước dưới 80% thì cảnh báo master                                                                                                                                                                |

Mẫu người duyệt (5%) quay ngay lúc quyết "đạt", trong transaction quyết định — trừ master (câu 4). Số ngẫu nhiên tiêm
được để test. "Một nửa" và "24 giờ" của cảnh báo là hằng số trong code (TK 16 ghi, TK 28 không có).

### 10. Thông báo cho master

`review` phát `review.master.reminder`, `review.deadline.warning`, `review.postcheck.low`; `notification` thêm ma trận
N40–N42: người nhận là mọi master (cổng `masterIds`), nhóm "tài khoản" (luôn bật), có nhắc, gộp theo khoá để không
thêm dòng mỗi giờ. Báo người đăng về quyết định để `add-notifications` (proposal).

### 11. Route

Bàn vận hành `/api/v1/ops/review` (staff có danh mục, master; đều cần lớp thứ hai): hàng chờ của tôi, chi tiết việc
(bối cảnh: nội dung tin, điểm, luật, số tin sạch, tin trùng ảnh, tài khoản dùng chung máy — không mã máy), nhận,
quyết định, gỡ trực tiếp, khôi phục, lý do mẫu (master soạn, staff đọc), bảng tồn, tỉ lệ bị lật, tỉ lệ máy quá tay
(master). App `/api/v1/groups/:groupId/review` cho điều hành, chủ nhóm: hàng chờ của nhóm, chi tiết, nhận, quyết định
(đạt, sai sót, gỡ khỏi nhóm kèm "trái quy định sàn"), và gỡ khỏi nhóm trực tiếp khi tin không có việc mở.

Mã lỗi mới: `TASK_CLAIMED`, `TASK_NOT_CLAIMED`, `TASK_CLOSED`, `TASK_REASSIGNED`, `TASK_OPEN` (409), `LISTING_CHANGED`
(409), `OUTCOME_NOT_ALLOWED` (409). Việc ngoài phạm vi người hỏi trả 404 `NOT_FOUND` như việc không tồn tại.

## Risks / Trade-offs

- **Tính người xử lúc đọc** tốn vài truy vấn mỗi lượt xem hàng chờ (gom theo phạm vi, không theo từng việc). Quy mô
  giai đoạn đầu (vài trăm việc mở) chịu được; to hơn thì lưu bậc xử và tính lại theo sự kiện.
- **Ảnh trùng không lưu** "trùng với tin nào": màn xử việc tính lại, có thể khác lúc máy chấm nếu ảnh kia đã bị xoá.
- **Dùng chung máy chỉ thấy qua lượt đăng tin**: staff chưa từng đăng tin từ máy mình thì tài khoản phụ lọt (câu 2,
  việc dở).
- Test HTTP, DB chỉ chạy trên CI (máy dev không có Docker).

## Migration Plan

Một migration `init_review`: enum, bốn bảng, partial unique, CHECK viết tay, sáu lý do mẫu, cột
`listings.fault_reason`. Không mất dữ liệu; `db:drift` sạch. Tin đang `pending` từ trước (không có việc) được sinh
việc hàng 0 bằng một bước chạy một lần lúc khởi động module (`startup`), hạn 24 giờ kể từ lúc chạy.
