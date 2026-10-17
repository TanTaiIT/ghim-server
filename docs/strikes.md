# Gậy — hướng dẫn cho app và bàn vận hành

Gậy là hình phạt do **người** (staff danh mục, master) ra khi quyết một việc ở mức **vi phạm**; máy không bao giờ ra
gậy. Chỉ `trust` ghi gậy; mọi hệ quả (hạn chế tin, trần mức, khoá, treo quyền, mất vai) do module khác nghe sự kiện của
`trust` mà áp. Hợp đồng đầy đủ: `openspec/specs/trust/{strikes,appeals,amnesty,serious-strikes}`; thiết kế ở
`openspec/changes/archive/2026-10-17-add-strikes/design.md`. Luật nghiệp vụ ở TK 21, TK 22.

## Ba loại gậy

| Loại      | Điểm | Hết hạn  | Ai quyết                              | Khiếu nại                                |
| --------- | ---- | -------- | ------------------------------------- | ---------------------------------------- |
| `normal`  | 1    | 90 ngày  | staff danh mục, master                | trong app, 14 ngày, xét trong 7 ngày     |
| `severe`  | 2    | 180 ngày | staff danh mục, master                | trong app, 14 ngày; quá hạn xét → master |
| `serious` | 0    | không    | ra: staff, master · quyết: chỉ master | kênh hỗ trợ không đăng nhập, 30 ngày     |

Mỗi gậy ghi người ra, **điều trích** trong quy định sàn (`ruleCode`, `ruleText` — bản trích lúc ra, master sửa điều
sau không đổi gậy đã ra), ngày ra, ngày hết. Điểm gậy = tổng điểm gậy còn hiệu lực; đọc là đúng ngay khi tới hạn. Gậy
đã huỷ (`cancelled`) còn trong lịch sử nhưng không tính.

## Hệ quả theo điểm

| Điểm                      | Hệ quả                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ≥ 1                       | Mức tin cậy tối đa T1; tin lên bảng / hiện lại mang lý do hạn chế `strike` (gỡ khi về 0); máy dùng hàng "có gậy"       |
| ≥ 2                       | Mọi tin đang hiện mang `strike_wave` (rời bảng tin, gợi ý; vẫn tìm bằng từ khoá, hồ sơ, link) — gỡ khi về dưới 2       |
| ≥ 3                       | Tạm khoá đăng tin: gửi mới, gia hạn, chuyển lên sàn → `403 POSTING_LOCKED` kèm `details.until`; sửa, bán, xoá vẫn được |
| gậy nặng còn hiệu lực     | Tạm mất vai chủ nhóm / điều hành viên (`403 GROUP_ROLE_SUSPENDED`); chủ nhóm → nhóm thiếu chủ; không tự xoá tài khoản  |
| bất kỳ gậy (kể cả thường) | Quyền staff treo ngay; hết hạn **không** tự trả (master trả); bị huỷ mà không còn gậy nào thì trả tự động              |
| gậy nghiêm trọng          | Khoá tài khoản ngay, lý do = điều trích; chỉ master quyết; mở khoá thường → `409 LOCKED_BY_STRIKE`                     |
| T3                        | Đòi không nhận gậy nào trong 90 ngày gần nhất, kể cả gậy đã hết hạn (gậy đã huỷ coi như chưa có)                       |

Gậy đi theo **email**: tài khoản mới tạo (email hay Google) bằng email của tài khoản đã xoá còn gậy hiệu lực kế thừa
gậy đó; đổi email thì gậy theo cả hai. Email của tài khoản khoá vĩnh viễn bị chặn đăng ký (`403 EMAIL_BANNED`) tới khi
master gỡ khoá.

## App — `/api/v1` (người đã đăng nhập)

| Route                          | Việc                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me/trust`                | Bảng uy tín thêm `strikes[]` (gậy còn hiệu lực và lịch sử), `strikePoints`, `postingLockedUntil`                                                                |
| `GET /me/strikes`              | Lịch sử gậy: `kind`, `status`, `points`, `inForce`, `ruleCode`, `ruleText`, `issuedAt`, `expiresAt`, `remainingDays`, `appealable`, `appealUntil`, `appeal`     |
| `POST /me/strikes/{id}/appeal` | `{ statement }` — 201; gậy thường / nặng, trong 14 ngày, một lần. Lỗi: `APPEAL_WINDOW_CLOSED`, `APPEAL_ALREADY_USED`, `APPEAL_VIA_SUPPORT`, `STRIKE_NOT_ACTIVE` |

Kênh hỗ trợ (không đăng nhập, rate limit như đăng nhập) cho người bị khoá vì gậy nghiêm trọng:
`POST /support/serious-appeal/code { email }` — luôn 200 (gửi mã khi email đúng là tài khoản đang khoá vì gậy chưa
quyết); `POST /support/serious-appeal { email, code, statement }` — 201 trả `ruleText`, `issuedAt`, `appealUntil`; mã
sai → `401 UNAUTHORIZED` không lộ gì; quá 30 ngày → `409 APPEAL_WINDOW_CLOSED`; lần hai → `409 APPEAL_ALREADY_USED`.

## Bàn vận hành — `/api/v1/ops/trust` (cần lớp thứ hai)

| Route                                       | Ai     | Việc                                                                                                           |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `GET /accounts/{accountId}/strikes`         | staff  | Lịch sử gậy của một người                                                                                      |
| `POST /accounts/{accountId}/amnesty`        | master | `{ strikeIds[], reason }` — huỷ gậy thường / nặng kèm lý do; khiếu nại đang chờ đóng theo; tin đi kèm hiện lại |
| `POST /strikes/{id}/comments`               | staff  | `{ body }` — nhận xét vào hồ sơ gậy nghiêm trọng chưa quyết; người ra gậy không ghi được                       |
| `POST /strikes/{id}/lift`                   | master | Gỡ khoá vĩnh viễn ngoài kỳ xem lại: mở khoá, email hết bị chặn                                                 |
| `GET /rule-articles`, `POST`, `PATCH /{id}` | master | Quy định sàn để trích (`code`, `title`, `text`, `active`, `sort`); bộ khởi đầu Q1–Q6 chèn khi bảng trống       |

**Ra gậy** đi qua quyết định của `review` (`POST /ops/review/tasks/{id}/decision`), không có route riêng:

```json
{ "outcome": "violation", "strike": { "kind": "normal", "ruleArticleId": "…" } }
{ "outcome": "violation", "report": { "verdict": "upheld" }, "strike": { "kind": "severe", "ruleArticleId": "…" } }
{ "outcome": "keep", "report": { "verdict": "upheld" }, "strike": { "kind": "serious", "ruleArticleId": "…" } }
```

`violation` = từ chối (tin chờ duyệt) hay gỡ (tin đang hiện) vì vi phạm — tin không sửa để gửi lại
(`409 LISTING_UNDER_VIOLATION`), không tự xoá được (`409 LISTING_DELETE_BLOCKED`) tới khi khiếu nại thắng hay ân xá.
Điều hành nhóm không có nút này (`403`). Kết quả trả thêm `strikeId`.

**Việc về gậy** (`subjectKind: "strike"`, hàng 2, hạn 7 ngày) hiện trên bàn vận hành như mọi việc; chi tiết việc có
`strike` (hồ sơ: điều trích, người nhận, lời khiếu nại, nhận xét kèm tên staff) và `seller.strikes` (lịch sử gậy của
người bán — có ở mọi việc). Quyết:

```json
{ "outcome": "keep", "appeal": { "verdict": "won" } }
{ "outcome": "keep", "serious": { "decision": "permanent" } }
{ "outcome": "keep", "permanent": { "decision": "lift" } }
```

- `appeal` (lý do `appeal`): staff khác của danh mục gậy, hay master; gậy do master ra thì master tự xét; gậy từ báo
  cáo về người thì master. Người ra gậy, người nhận, máy của họ → `403`. Thắng → gậy huỷ, tin đi kèm hiện lại với số
  ngày còn lại lúc gỡ. Gậy thường quá 7 ngày không ai xét → **tự thắng**; gậy nặng → chuyển master, vẫn tính điểm.
- `serious` (lý do `serious_strike`, mở ngay lúc ra gậy): chỉ master, khác người ra gậy — `permanent` (khoá vĩnh viễn,
  chặn email, xem lại sau 2 năm), `downgrade` (thành gậy nặng, hạn 180 ngày từ ngày ra, mở khoá), `cancel` (huỷ, mở
  khoá, tin được trả lại số ngày đã mất trong lúc khoá). Không tự mở khoá; quá 72 giờ nhắc master mỗi ngày (N40).
- `permanent` (lý do `permanent_review`, job hằng ngày sau 2 năm): `keep` (xem lại sau 2 năm nữa) / `lift`.

## Mã lỗi riêng

| HTTP | `code`                    | Khi nào                                                            |
| ---- | ------------------------- | ------------------------------------------------------------------ |
| 403  | `POSTING_LOCKED`          | Điểm gậy ≥ 3 — `details.until` là ngày gửi lại được                |
| 403  | `EMAIL_BANNED`            | Đăng ký / Google bằng email của tài khoản khoá vĩnh viễn           |
| 403  | `GROUP_ROLE_SUSPENDED`    | Thao tác vai nhóm khi đang có gậy nặng                             |
| 409  | `LISTING_UNDER_VIOLATION` | Sửa tin bị từ chối / gỡ vì vi phạm                                 |
| 409  | `LISTING_DELETE_BLOCKED`  | Xoá tin bị từ chối / gỡ vì vi phạm                                 |
| 409  | `ACCOUNT_DELETE_BLOCKED`  | Tự xoá tài khoản khi đang có gậy nặng (cũng dùng cho đang bị khoá) |
| 409  | `LOCKED_BY_STRIKE`        | Mở khoá thường tài khoản đang khoá vì gậy nghiêm trọng             |
| 409  | `APPEAL_WINDOW_CLOSED`    | Khiếu nại quá hạn (14 ngày; 30 ngày với gậy nghiêm trọng)          |
| 409  | `APPEAL_ALREADY_USED`     | Mỗi gậy khiếu nại một lần                                          |
| 409  | `APPEAL_VIA_SUPPORT`      | Khiếu nại gậy nghiêm trọng trong app — đi kênh hỗ trợ              |
| 409  | `STRIKE_NOT_ACTIVE`       | Khiếu nại / ân xá gậy đã hết hiệu lực                              |
| 409  | `STRIKE_NOT_PENDING`      | Quyết / nhận xét gậy nghiêm trọng đã quyết                         |

## Việc theo lịch và sự kiện

`trust.strikes-expire` (mỗi giờ, phút 5): gậy tới hạn → `expired`, phát `trust.strike.expired` + `trust.strike.standing`.
`trust.permanent-review` (00:45 hằng ngày): khoá vĩnh viễn tới kỳ → `trust.strike.review_due` → `review` mở việc.
`trust.strike.standing { accountId, points, active, severe }` phát sau **mọi** thay đổi — bên nghe hỏi lại `trust`
rồi đối chiếu, không tin payload. Con số: `strike.*`, `trust.t3NoStrikeDays`, `review.appealDays` trong bảng con số.
