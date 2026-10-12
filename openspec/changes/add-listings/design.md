# Design

> **Đã duyệt 12/10/2026**: mọi đề xuất D1–D12 ở bảng cuối file. Thiết kế chung với `add-trust-tiers` và
> `add-screening` (chốt 12/10/2026): file này để sẵn chỗ cắm cho hai phần đó (mục 7, 8); code và archive theo thứ
> tự tin đăng → mức tin cậy → máy duyệt.

## Context

- Đã có: `identity`, `platform` (bảng con số có phiên bản), `category` (mẫu thông tin có phiên bản, trần giá, danh
  sách khu vực), `group`, `media` (kho ảnh, `resolve` trước transaction, `attach(tx)` trong transaction),
  `notification` (hộp thư, realtime, ma trận N31–N35 đã chừa sẵn cho change này), outbox có lease và retry,
  pg-boss.
- Bảng con số đã có `listing.visibleDays` 30, `remindBeforeDays` 7, `renewWindowDays` 7, `renewExtendDays` 30,
  `maxImages` 6, cùng `quota.*`, `trust.*`, `screening.*` cho hai change sau.
- Còn thiếu ở module khác, change này thêm (mục 10, 11): `group` chưa có cửa khoá nhóm cho lượt đăng tin, đếm tin
  "nhóm công khai" **trước** khi khoá nhóm (`group.admin.service.ts` `updateSettings` — lỗ hổng của cam kết 22),
  sự kiện rời nhóm chưa mang công tắc "nhận tin người ngoài"; `category` chưa phát sự kiện bật / tắt, chưa có hàm
  kiểm khu vực và kiểm giá trị theo mẫu; `media` chỉ cấp quyền tải cho hồ sơ, chưa chép ảnh;
  `identity.recordListingSubmission` có sẵn nhưng chưa ai gọi và chưa có đường nhận mã máy; HTTP chỉ có phân
  trang theo trang.
- Docker chưa cài trên máy làm: test DB chạy ở CI.

## Goals / Non-Goals

**Goals**

- Đủ mọi requirement trong 9 delta spec `listing/*`, `group/badges`, `identity/profile` của change này.
- Trạng thái tin chỉ đổi qua một bảng mũi tên thuần; cờ tạm ẩn và lý do hạn chế là hai cột riêng (luật 13).
- Một hàm duy nhất quyết ai thấy một tin, và câu SQL của mọi danh sách được test là khớp với hàm đó (luật 25).
- `add-trust-tiers`, `add-screening`, `add-review-queues`, `add-reports`, `add-strikes` cắm vào mà không phải sửa
  bảng hay mũi tên của `listing` — chỉ nối cổng và bên nghe.
- Mọi tranh chấp đồng thời có một cơ chế chặn và một test DB.

**Non-Goals** (giữ như proposal): hạn mức, cách tính T0–T3 (`add-trust-tiers`); máy chấm điểm, cổng cứng, kiểm ảnh
(`add-screening`); việc của người duyệt, báo cáo, gậy, khiếu nại; nhắn tin; hạn lưu dữ liệu; "Lưu tin".

## Decisions

### 1. Nháp là chính dòng tin

Một tin là **một dòng `listings` từ lúc tạo nháp tới hết đời**, trạng thái `draft` là trạng thái đầu của vòng đời
(TK 18). Hệ quả:

- Mã tin không đổi khi gửi, nên ảnh tải cho nháp thuộc ngay về tin (`owner = listing`, đúng `media` "một ảnh một
  chủ suốt đời") mà không phải đổi chủ lúc gửi.
- Bấm Đăng hai lần là ghi có điều kiện `draft → checking` trên **cùng một dòng** (mục 5), không có bước "chép nháp
  ra tin" để đua.

_Thay thế đã cân nhắc_: bảng `listing_drafts` riêng, gửi thì chép sang `listings` — bị loại vì ảnh phải đổi chủ
(trái `media`) và vì "rút về nháp" (chờ duyệt → nháp) lại phải chép ngược.

### 2. Dữ liệu — `listing` sở hữu 3 bảng

| Bảng                   | Cột chính                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ràng buộc                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listings`             | `owner_id`, `state` (8 giá trị), `version`, `placement` (`marketplace` / `group_public` / `members_only`, nháp được để trống), `group_id`, `unit_id`, `category_id`, `template_version`, `attributes` jsonb, `title`, `description`, `price` BigInt, `negotiable`, `delivery`, `show_phone`, `province_code`, `ward_code`, `image_ids uuid[]` (thứ tự = thứ tự ảnh, phần tử đầu là ảnh bìa), `badge_group_id`, `hide_reasons` (mảng enum), `restrictions` (mảng enum), `first_live_at`, `expires_at`, `clock_remaining_ms`, `shown_ms`, `shown_since`, `renewal` (`early` / `expired`), `fault` (`mistake` / `violation`), `left_group_at`, `moved_from_listing_id`, `reminded_for`, `search_folded`, `created_at`, `updated_at`, `deleted_at` | CHECK: `price >= 0`; `placement = 'marketplace'` ⇔ `group_id IS NULL` (khi đã chọn nơi đăng); khác nháp thì có nơi đăng, tiêu đề, giá, danh mục, ít nhất 1 ảnh; `badge_group_id` chỉ khi `marketplace`; không có cùng lúc `expires_at` và `clock_remaining_ms`; chưa từng lên bảng thì cả hai trống; `fault` chỉ ở `rejected` / `removed`. Unique `moved_from_listing_id` khi khác null. |
| `listing_submissions`  | `listing_id`, `account_id`, `kind` (`submit` / `resubmit` / `renew_early` / `renew_expired` / `move`), `from_version`, `at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Unique (`listing_id`, `from_version`) — một phiên bản chỉ gửi được một lần. Index (`account_id`, `at`) cho nhịp gửi của `trust` và lượt gửi dồn của `screening`.                                                                                                                                                                                                                         |
| `listing_badge_blocks` | `listing_id`, `group_id`, `removed_by`, `removed_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | PK (`listing_id`, `group_id`): huy hiệu nhóm đã gỡ khỏi tin này thì không gắn lại.                                                                                                                                                                                                                                                                                                       |

`reminded_for` = `expires_at` đã nhắc: nhắc đúng một lần cho mỗi hạn, gia hạn đổi hạn thì tự được nhắc lại.

Vì sao mảng chứ không bảng con:

- `image_ids uuid[]`: thứ tự là dữ liệu (ảnh bìa), so trước / sau khi sửa là so hai mảng; mọi ảnh đã có dòng ở
  `images` với chủ là tin, nên mảng chỉ giữ thứ tự, không giữ quyền.
- `hide_reasons`, `restrictions` là **tập** lý do (luật 13), mỗi tin vài phần tử. Để trên chính dòng tin thì bảng
  tin chỉ cần `hide_reasons = '{}' AND restrictions = '{}'` trong một partial index, không `NOT EXISTS` sang bảng
  khác ở câu đọc nóng nhất. Một lý do gắn với nhóm thì nhóm là `group_id` của chính tin — tin chỉ thuộc một nhóm.

`version` tăng khi **nội dung, nơi đăng hay trạng thái** đổi — không tăng khi hệ thống đặt / gỡ lý do tạm ẩn, lý do
hạn chế hay tự gỡ huy hiệu. Lý do: kết quả máy và quyết định của người ghi có điều kiện theo phiên bản (luật 16);
nhóm bị khoá giữa chừng không được làm hỏng việc đang mở của người duyệt.

Index (partial, khai bằng `partialIndexes`):

- Bảng tin sàn chung: (`first_live_at` desc, `id` desc) WHERE `state = 'live' AND placement = 'marketplace' AND
hide_reasons = '{}' AND restrictions = '{}' AND deleted_at IS NULL`; thêm một bản có `category_id` đứng đầu.
- Tìm kiếm sàn chung (gồm tin hạn chế): như trên nhưng không có điều kiện `restrictions`.
- Bảng tin nhóm: (`group_id`, `first_live_at` desc, `id` desc) WHERE `state = 'live' AND hide_reasons = '{}' AND
deleted_at IS NULL`.
- Việc nền: (`expires_at`) WHERE `state = 'live' AND expires_at IS NOT NULL`. Bên nghe: (`group_id`),
  (`category_id`), (`badge_group_id`), (`owner_id`, `updated_at` desc) WHERE `deleted_at IS NULL`.

### 3. Trạng thái và mũi tên — `listing.calc.ts`

| Bên                 | Mũi tên         | Từ → sang                                                                                   |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| người đăng          | gửi             | nháp → đang kiểm                                                                            |
| người đăng          | rút về          | chờ duyệt → nháp                                                                            |
| người đăng          | sửa             | chờ duyệt / đang hiển thị → đang kiểm; bị từ chối / bị gỡ → đang kiểm nếu `fault = mistake` |
| người đăng          | gia hạn         | hết hạn → đang kiểm                                                                         |
| người đăng          | gia hạn sớm     | đang hiển thị → đang kiểm, trong `renewWindowDays` cuối                                     |
| người đăng          | đánh dấu đã bán | đang hiển thị / hết hạn → đã bán                                                            |
| máy                 | cho qua · giữ   | đang kiểm → đang hiển thị · đang kiểm → chờ duyệt                                           |
| máy                 | rút về chờ      | đang hiển thị → chờ duyệt                                                                   |
| hệ thống            | hết hạn         | đang hiển thị → hết hạn                                                                     |
| người duyệt         | đạt · từ chối   | chờ duyệt → đang hiển thị · chờ duyệt → bị từ chối                                          |
| người duyệt         | gỡ · khôi phục  | đang hiển thị → bị gỡ · bị gỡ → đang hiển thị                                               |
| người xét khiếu nại | thắng           | bị từ chối / bị gỡ → đang hiển thị                                                          |

`transition(state, arrow, side)` là hàm thuần: trả trạng thái mới hoặc lỗi `INVALID_TRANSITION`. Unit test chạy
**cả bảng 8 trạng thái × 16 mũi tên × 5 bên**, nên mọi mũi tên không có cũng được test (luật 13). Sửa nháp không
phải mũi tên (lưu nháp giữ nguyên `draft`). Sửa ở đang kiểm, đã bán, và sửa không kèm gia hạn ở hết hạn → 409
`INVALID_TRANSITION`.

Người khác đi mũi tên của người đăng: thấy được tin → 403 `FORBIDDEN`; không thấy (nháp, chờ duyệt…) → 404
`NOT_FOUND`, không lộ tin có tồn tại.

### 4. Sửa tin — `edit.calc.ts`

`classifyEdit(before, after, membership)` so **giá trị** (không so ô được gửi) và trả: có qua máy không, kiểu đổi nơi
đăng (`widen` / `narrow` / `regroup` / không), kiểu đổi huy hiệu (`attach` / `detach` / không).

| Qua máy lại                                                                                                                            | Áp dụng ngay, không đổi trạng thái                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| tiêu đề, mô tả, giá, danh mục, `image_ids` (cả thứ tự), `attributes`, tỉnh, phường, đổi sang nhóm khác, mở rộng nơi đăng, gắn huy hiệu | thu hẹp về một nhóm mình là thành viên, bỏ huy hiệu, `negotiable`, `delivery`, `show_phone` |

- Thu hẹp vào nhóm mình **không** là thành viên là "chuyển vào nhóm theo luật người ngoài" → qua máy, kiểm như gửi
  mới (spec editing).
- Nơi đăng mới chạy lại đủ luật nơi đăng của mục 5 (bước 4–5).
- Khoá nơi đăng (`PLACEMENT_LOCKED`) khi tin đang chờ duyệt, hoặc khi cổng `OpenWork.blocksPlacement(listingId)`
  trả đúng — cổng này `add-review-queues` / `add-reports` nối vào; đợt này luôn trả sai.
- Thu hẹp về "chỉ thành viên" gỡ lý do `new_account` ngay trong cùng lượt ghi.
- Sửa nhận `version` app đang có; khác `version` hiện tại → 409 `CONFLICT` (app tải lại). Hai người cùng sửa không
  có, nhưng hai thiết bị của một người thì có.
- Mẫu thông tin: sửa kiểm `attributes` theo `template_version` **tin đang mang** (chốt 12/10/2026).

### 5. Gửi tin

Thứ tự kiểm (rẻ trước, cố định để lỗi trả về luôn như nhau):

1. Tin là của người gửi và chưa xoá (không thì 404).
2. Trạng thái: `draft` → tiếp tục; đã gửi từ đúng phiên bản app nêu (dòng `listing_submissions` có
   `from_version` = `version` của request) → **200 với tin hiện tại**, không tính thêm lượt gửi; khác → 409
   `INVALID_TRANSITION`.
3. Tài khoản master → 403; chưa xác nhận email → 403 `EMAIL_NOT_VERIFIED`; thiếu header `x-device-id` → 400
   `VALIDATION_ERROR`.
4. Đủ trường: nơi đăng, (nhóm nếu trong nhóm), tiêu đề, giá, danh mục, ít nhất 1 ảnh → 400 `VALIDATION_ERROR`
   kèm danh sách trường thiếu. Danh mục đang bật → 409 `CATEGORY_DISABLED`. Lần gửi đầu ghim
   `template_version` = phiên bản đang phát hành rồi kiểm đủ `attributes` → 400. Khu vực: sàn chung thiếu tỉnh /
   phường → 400 `REGION_REQUIRED`; phường không thuộc tỉnh → 400 `VALIDATION_ERROR`.
5. Nhóm (trong transaction, qua `group.lockForPosting` — mục 10): không có → 404; tạm khoá → 409 `GROUP_LOCKED`;
   đã đóng → 409 `GROUP_CLOSED`; đang chuyển riêng tư và mức "nhóm công khai" → 409 `GROUP_MODE_CHANGING`; bị cấm
   → 403 `GROUP_BANNED`; "chỉ thành viên" mà không là thành viên → 403 `NOT_GROUP_MEMBER`; nhóm riêng tư mà "nhóm
   công khai" → 409 `PLACEMENT_NOT_ALLOWED`; người ngoài vào nhóm tắt nhận tin người ngoài → 403
   `OUTSIDER_POSTS_DISABLED`. Thành viên có đơn vị con → tin mang `unit_id` đó.
6. `trust.assertCanSubmit(tx, …)` — hạn mức, nhịp gửi (mục 7), trong transaction. `screening.precheck` — thời gian
   chờ — chạy ngay đầu lượt gửi; `screening.scoreText` — chấm chữ — chạy sau bước 5, trước transaction (mục 8).
7. `media.resolve` trước transaction; trong transaction: ghi có điều kiện `UPDATE … WHERE state = 'draft' AND
version = $v`, `media.attach(tx)`, `screening.openRun(tx, …)`, thêm dòng `listing_submissions`, `appendEvents`
   `listing.submitted`.

Không dòng nào đổi nếu bất kỳ bước nào trả lỗi — nháp giữ nguyên nội dung và ảnh (spec submission).

Lượt "gửi" khác (gửi lại sau sửa, gia hạn, chuyển lên sàn chung) đi chung bước 3–7, chỉ khác `kind` của dòng
`listing_submissions` — `trust` đếm theo `kind` (gia hạn sớm không chiếm thêm chỗ).

### 6. Ngày hiển thị — `display-period.calc.ts`

Đồng hồ của một tin là `expires_at` (đang chạy) **hoặc** `clock_remaining_ms` (đang dừng), không bao giờ cả hai.

- **Chạy** khi tin đã từng lên bảng (`first_live_at` có), trạng thái không phải bị từ chối / bị gỡ, và không còn
  lý do tạm ẩn nào thuộc loại "dừng" (bảng mục 9). Nên đồng hồ vẫn chạy khi tin đang kiểm hay chờ duyệt sau khi
  sửa (spec "Sửa không làm mới tin"), và tin hết ngày lúc đang chờ thì được cho qua rồi chuyển hết hạn ở lượt
  chạy kế tiếp (chốt 12/10/2026).
- **Dừng** = `clock_remaining_ms = expires_at - now`, `expires_at = null`; **chạy lại** = `expires_at = now +
clock_remaining_ms`. Một hàm thuần `nextClock(before, change, now)` cho mọi trường hợp (lên bảng lần đầu, thêm /
  bớt lý do, bị gỡ / khôi phục, gia hạn), có unit test cho từng scenario của spec display-period.
- **Lên bảng lần đầu**: `first_live_at = now`, `expires_at = now + visibleDays`.
- **Gia hạn**: `renewal` ghi lúc người đăng yêu cầu, áp lúc tin lên bảng lại: `early` → hạn cũ + `renewExtendDays`;
  `expired` → `now + visibleDays`. Rút về nháp giữa chừng giữ `renewal`.
- **Thời gian được thấy** cho tin sạch của `trust` (design `add-trust-tiers` mục 5): `shown_ms` cộng dồn các
  khoảng tin ở đang hiển thị mà không tạm ẩn, `shown_since` là khoảng đang mở. Cùng hàm `nextClock` cập nhật, ở
  mọi lượt đổi trạng thái hay lý do tạm ẩn.
- **Vị trí** trên bảng tin là `first_live_at`, không đổi khi sửa hay gia hạn — "không đẩy lên đầu" đúng theo cấu
  tạo. Tin chuyển lên sàn chung là tin mới nên có `first_live_at` mới.

### 7. Chỗ cắm mức tin cậy (`trust`)

```ts
interface ListingTrustPort {
  tierOf(accountId: string): Promise<'T0' | 'T1' | 'T2' | 'T3'>;
  assertCanSubmit(
    tx: Tx,
    input: {
      accountId: string;
      kind: SubmissionKind;
      placement: Placement;
      groupId: string | null;
    },
  ): Promise<void>;
}
```

- Hai chỗ gọi đồng bộ (luật 12): `assertCanSubmit` ở bước 6 của mục 5; `tierOf` lúc tin lên bảng để quyết lý do
  `new_account` (T0 và nơi đăng công khai).
- **Bản tạm** (`createInterimTrust`, gỡ ở `add-trust-tiers`): `tierOf` trả `T0` ở production và test, dev trả
  `DEV_TRUST_TIER` (mặc định `T1`); `assertCanSubmit` không chặn. Test cần mức khác đè qua `buildTestApp`.
- Lên T1: `listing` nghe `trust.tier.changed { accountId, from, to }` → từ T0 lên T1 trở lên thì gỡ `new_account`
  khỏi mọi tin của người đó; tụt về T0 không đặt lại lý do lên tin đang hiện. Bên
  nghe có từ đợt này (test ghi thẳng sự kiện vào outbox); bên phát ở `add-trust-tiers`.
- `trust` cần dữ kiện của tin: `listing` lộ cổng `ListingQuotaFacts` (đếm tin sống, lượt gửi trong giờ, tin người
  ngoài trong nhóm — đọc bằng `tx` của lượt gửi), `ListingDashboardFacts` (tin hạn chế, tin chờ duyệt) và
  `shownCandidates` (tin vượt mốc thời gian được thấy); `trust` không đọc bảng `listings`.

### 8. Chỗ cắm máy duyệt (`screening`)

- **Đồng bộ lúc gửi** (luật 12, "listing gọi screening chấm chữ lúc gửi" — design `add-screening` mục 1): cổng
  `ListingScreeningPort` có `precheck` (thời gian chờ → 429 `SUBMISSION_COOLDOWN`), `scoreText` (chấm chữ trước
  transaction, lỗi không ném ra) và `openRun(tx)` (ghi lượt chấm trong transaction gửi). Bản tạm: không chặn, không
  chấm, không ghi.
- **Kết quả máy** về qua outbox: `screening.result.recorded { listingId, listingVersion, outcome, restrictMachine,
rankAsListingId? }`; bên nghe của `listing` gọi `applyMachineOutcome`: ghi có điều kiện `state = 'checking' AND
version = listingVersion`, lệch thì bỏ qua. Cho qua: sang đang hiển thị; `restrictMachine` đặt hay gỡ lý do
  `machine` theo kết quả mới (kết quả mới thay kết quả của nội dung cũ); tính `new_account` (mục 7); đồng hồ theo
  mục 6; `rankAsListingId` (tin trùng tin cũ của chính mình) lấy `first_live_at` của tin cũ khi lên bảng lần đầu.
- `screening.listing.recalled { listingId, listingVersion }` → mũi tên rút về chờ duyệt (cụm từ cấm mới);
  `screening.listing.restricted { listingId }` → thêm lý do `machine` (lưới an toàn thiếu kết quả ảnh).
- **Máy tạm chỉ ở dev**: `DEV_MACHINE_REVIEW=pass_full | pass_limited | hold | off` (mặc định `off`). Khác `off`
  thì `listing` tự nghe `listing.submitted` của chính nó và gọi `applyMachineOutcome`. `env.ts` từ chối khởi động
  ở production nếu biến này khác `off` (như luật tên DB). Test gọi thẳng `applyMachineOutcome`. `add-screening`
  gỡ máy tạm.

### 9. Tạm ẩn — lý do, bên đặt, ngày hiển thị

| Lý do (`hide_reasons`) | Đặt khi                                                                                                           | Gỡ khi                                | Ngày | Hết hẳn        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---- | -------------- |
| `account_locked`       | `identity.account.locked`                                                                                         | `identity.account.unlocked`           | trôi |                |
| `account_deleted`      | `identity.account.deleted`                                                                                        | —                                     | —    | ✓              |
| `left_group`           | `group.member.left` lý do `left`: tin "chỉ thành viên"; tin "nhóm công khai" nếu `allowOutsiders = false` lúc rời | `group.member.joined`                 | trôi |                |
| `removed_from_group`   | như trên với lý do `removed` / `banned`                                                                           | `group.member.joined`                 | dừng |                |
| `group_banned`         | `group.ban.created`: mọi tin của người đó trong nhóm                                                              | `group.ban.lifted`                    | dừng |                |
| `group_locked`         | `group.state.locked`                                                                                              | `group.state.unlocked`                | dừng |                |
| `category_disabled`    | `category.status.changed` (tắt)                                                                                   | bật lại, hoặc người đăng đổi danh mục | dừng |                |
| `group_closed`         | `group.state.closed`                                                                                              | —                                     | dừng | ✓, chuyển được |
| `group_privatized`     | nhóm sang riêng tư: tin "nhóm công khai" của người ngoài                                                          | —                                     | dừng | ✓, chuyển được |
| `detached_by_group`    | điều hành viên gỡ tin khỏi nhóm (TK 17 — bên phát ở `add-review-queues`)                                          | —                                     | dừng | ✓, chuyển được |

- **Phạm vi đặt**: tin chưa xoá và **không phải nháp** (nháp không ai thấy; gửi nháp thì bước 5 của mục 5 kiểm lại
  nhóm, danh mục). **Phạm vi gỡ**: mọi tin đang mang lý do đó.
- `group.member.left` lý do `account_deleted` bị bỏ qua — `account_deleted` đã phủ.
- Ba lý do "hết hẳn" ghi thêm `left_group_at` (mốc 30 ngày chuyển lên sàn chung).
- Bên nghe làm theo lô 500 dòng: `SELECT … FOR UPDATE` → hàm thuần tính `hide_reasons` và đồng hồ mới cho từng dòng
  → một câu `UPDATE … FROM unnest(…)` cho cả lô. Không câu Prisma nào trong vòng lặp, và logic ngày hiển thị chỉ
  nằm ở `display-period.calc.ts`, không chép sang SQL.
- Bên nghe chịu được nhận trùng (thêm lý do đã có, gỡ lý do không có đều không đổi gì) và không dựa vào thứ tự: cấm
  một thành viên phát `group.member.left (banned)` và `group.ban.created`, hai bên nghe đặt hai lý do độc lập — đúng
  scenario "Cấm một thành viên" dù sự kiện nào tới trước.
- Lý do hạn chế (`restrictions`): `machine` (do `screening`; gỡ khi hậu kiểm đạt — `add-review-queues` — hoặc khi lượt qua máy sau khi sửa cho hiện
  đầy đủ),
  `new_account` (mục 7), `strike` (`add-strikes`). Mức hiển thị = đầy đủ khi mảng rỗng, không lưu riêng.

### 10. Nối với `group`

Thêm vào `GroupService`:

- `lockForPosting(tx, groupId, accountId)` — trong transaction của `listing`: `SELECT … FOR SHARE` dòng nhóm, lấy
  khoá cặp (nhóm, người) như mọi thay đổi tư cách của `group` (`pg_advisory_xact_lock`), rồi trả ảnh chụp: trạng
  thái, chế độ, `allow_outsiders`, dòng thành viên (vai, đơn vị), có bị cấm. Luật nơi đăng là hàm thuần
  `placement.calc.ts` của `listing` chạy trên ảnh chụp đó.
- `membersAmong(groupId, accountIds)`, `badgeHolders(groupId, accountIds)` (đọc theo lô, cho bên nghe),
  `badgeLabels(groupIds)` → tên nhóm và có đang tạm khoá (hiện huy hiệu lúc đọc), `canRemoveBadge(actor, groupId,
ownerId)` (chủ nhóm, điều hành viên có phạm vi gồm người đăng, master).

Sửa trong `group`:

- **Lỗ hổng cam kết 22**: `updateSettings` đếm tin "nhóm công khai" trước khi khoá nhóm, nên một lượt gửi chen giữa
  lúc đếm (= 0, đổi ngay sang riêng tư) và lúc ghi để lại một tin "nhóm công khai" dưới nhóm riêng tư. Sửa: quyết
  "đổi ngay hay đi qua đang chuyển riêng tư" **trong** transaction đã `FOR UPDATE` dòng nhóm, đếm bằng
  `PublicListingCounter.countInGroup(tx, groupId)`. Lượt gửi giữ `FOR SHARE` tới khi commit nên lượt đếm sau khoá
  thấy đủ. Test DB chạy hai lượt song song.
- `PublicListingCounter` đếm tin chưa xoá, không phải nháp, `placement = 'group_public'`, không mang lý do hết hẳn —
  mọi trạng thái, vì tin đã bán, hết hạn vẫn mở được bằng đường link.
- `group.member.left` thêm `allowOutsiders` đúng lúc rời (proposal Impact). Sự kiện phát trước khi có bản sửa: không
  có — chưa có tin nào.
- **Chuyển riêng tư**: bên nghe `group.privatization.started` hạ tin "nhóm công khai" của thành viên về "chỉ thành
  viên" (không qua máy, không đổi `version` — không phải sửa của người đăng) và đặt `group_privatized` cho tin
  người ngoài, theo lô; xong thì gọi `group.completePrivatization(groupId)`, hàm này đếm lại trong khoá. Trong lúc
  chuyển, `lockForPosting` thấy nhóm ở `going_private` nên mức "nhóm công khai" bị chặn (bước 5).
- Đơn vị con: tin theo đơn vị **hiện tại** của người đăng — nghe `group.member.unit_changed` và đổi `unit_id` các
  tin của người đó trong nhóm, để phạm vi của điều hành viên đơn vị (đợt 4) luôn đúng.

### 11. Nối với `category`, `media`, `identity`, `notification`

- **`category`**: `setStatus` phát `category.status.changed { categoryId, enabled }` trong cùng transaction; thêm
  `statusOf(categoryIds)`, `validateRegion(province, ward)` (đọc `regions.json` sẵn có) và
  `validateAttributes(categoryId, version, attributes, { complete })` trong `template.calc.ts` (`complete: false`
  cho lưu nháp — chỉ kiểm mục có trong mẫu và kiểu giá trị, không đòi mục bắt buộc).
- **`media`**: `requestUpload` nhận `ownerKind = 'listing'` qua cổng `ImageOwnership.canUpload(accountId, listingId)`
  do `listing` cấp (tin của người xin, chưa xoá) — `buildApp` nối sau khi dựng `listing`, như `PublicListingCounter`.
  Thêm `copyImages({ from, to, imageIds, uploaderId })`: chép tệp trong kho (`CopyObjectCommand` của SDK S3 đang
  dùng, không thêm gói) trước transaction, dòng `images` mới (chủ là tin mới, đã xác nhận) ghi trong transaction;
  transaction hỏng thì tệp chép thành mồ côi và lượt đối chiếu hằng tháng vét. Cần delta spec
  `media/image-storage` (mục "Sửa đi kèm").
- **`identity`** — dấu thiết bị: app gửi `x-device-id` (đã chốt ở design `add-identity`). Mã thô **không** vào
  outbox: `identity` lộ `deviceToken(deviceId)` (HMAC thuần, không chạm DB — thuộc "hỏi identity"), `listing` ghi
  dấu băm vào `listing.submitted`, bên nghe của `identity` gọi `recordListingSubmission(accountId, deviceHash, at)`
  (đổi chữ ký — hàm chưa ai gọi). Ghi qua outbox thay vì gọi thẳng vì đây là một lần ghi chéo module (luật 12).
- **`notification`**: thêm dòng vào ma trận, không đổi hạ tầng.

| #   | Chuyện                                                                       | Ai nhận                   | Nhóm | Hộp thư | Nhắc                     |
| --- | ---------------------------------------------------------------------------- | ------------------------- | ---- | ------- | ------------------------ |
| N31 | Tin mới hiện đầy đủ trên bảng tin nhóm                                       | thành viên trừ người đăng | TMN  | ✓ gộp   | ✓ ≤ 1 lần / 2 giờ / nhóm |
| N32 | Tin của bạn tạm ẩn / hiện lại vì nhóm khoá, mở, rời, cấm, danh mục tắt / bật | người đăng                | TĐB  | ✓ gộp   | —                        |
| N33 | Tin của bạn rời nhóm (nhóm đóng, sang riêng tư, bị gỡ khỏi nhóm): hạn chuyển | người đăng                | TĐB  | ✓       | ✓                        |
| N34 | Tin "nhóm công khai" hạ về "chỉ thành viên"                                  | người đăng                | TĐB  | ✓ gộp   | —                        |
| N35 | Huy hiệu bị gỡ khỏi tin của bạn                                              | người đăng                | TĐB  | ✓ gộp   | —                        |
| N37 | Tin sắp hết hạn (còn 7 ngày), kèm ngày hết hạn                               | người đăng                | TĐB  | ✓       | ✓                        |

N31–N35 đã chừa ở design `add-notification-core`; N32, N33 mở rộng thêm danh mục và "bị gỡ khỏi nhóm" theo chốt
12/10. N37 mới. Tin bị khoá tài khoản, xoá tài khoản không báo (người đó không vào được app).

### 12. Ai thấy một tin — `visibility.calc.ts`

`canView(listing, viewer, surface)` là hàm thuần duy nhất (luật 25). Người đăng luôn thấy tin của mình (trừ khi đã
xoá). Người khác:

| Bề mặt                                     | Trạng thái                     | Mức    | Nơi đăng                                                  |
| ------------------------------------------ | ------------------------------ | ------ | --------------------------------------------------------- |
| Đường link                                 | đang hiển thị, đã bán, hết hạn | cả hai | "chỉ thành viên" cần là thành viên                        |
| Bảng tin sàn chung, danh mục không từ khoá | đang hiển thị                  | đầy đủ | sàn chung                                                 |
| Tìm kiếm có từ khoá                        | đang hiển thị                  | cả hai | sàn chung                                                 |
| Gợi ý                                      | đang hiển thị                  | đầy đủ | sàn chung                                                 |
| Bảng tin nhóm                              | đang hiển thị                  | đầy đủ | "nhóm công khai"; thêm "chỉ thành viên" nếu là thành viên |
| Tìm trong nhóm có từ khoá                  | đang hiển thị                  | cả hai | như bảng tin nhóm                                         |
| Hồ sơ người bán                            | đang hiển thị                  | cả hai | mọi nơi đăng người xem được qua đường link                |

Mọi dòng thêm: không tạm ẩn, chưa xoá. Danh sách đọc bằng SQL, nên cùng file có `visibleWhere(viewer, surface)`
dựng điều kiện Prisma; **test DB** sinh mọi tổ hợp (8 trạng thái × 3 nơi đăng × có / không lý do hạn chế × có /
không tạm ẩn × người xem khách / người đăng / thành viên / người ngoài) và so kết quả SQL với `canView` từng bề
mặt — hai nơi lệch nhau là đỏ.

Tìm kiếm: `search_folded = fold(title + ' ' + description)` (hàm `fold` sẵn có), `LIKE '%từ khoá%'` trên tập đã
lọc bởi partial index. Không thêm extension (mục Risks).

### 13. Chuyển tin đã rời nhóm lên sàn chung

- Được khi tin mang `group_closed`, `group_privatized` hay `detached_by_group`, còn trong `left_group_at +
listing.moveToMarketplaceDays` (số mới, 30), trạng thái không phải nháp, đã bán, bị từ chối, bị gỡ (hai trạng
  thái sau là quyết định của người duyệt — chuyển đi là thoát quyết định).
- Body nhận tỉnh, phường (bắt buộc nếu tin cũ chưa có → 400 `REGION_REQUIRED`). Tin mới: sàn chung, chép nội dung,
  `template_version`, `attributes`, cờ; ảnh chép qua `media.copyImages`; không chép huy hiệu; đi bước 3–7 của mục 5
  với `kind = move`, nên sang đang kiểm.
- `moved_from_listing_id` unique → lượt thứ hai 409 `ALREADY_MOVED`, kể cả hai lượt song song. Quá hạn → 409
  `MOVE_WINDOW_EXPIRED`. Tin cũ không đổi.

### 14. Huy hiệu

- Gắn = trường `badgeGroupId` của sửa tin, qua máy (spec editing). Kiểm: tin sàn chung (không thì 400
  `VALIDATION_ERROR`), đang mang huy hiệu nhóm khác → 409 `BADGE_ALREADY_ATTACHED`, có dòng `listing_badge_blocks`
  → 403 `BADGE_REMOVED_BY_GROUP`, `group.badgeHolders` không có người đăng → 403 `BADGE_NOT_ELIGIBLE`.
- Hiện: đọc `badgeLabels` lúc trả tin; nhóm tạm khoá thì không hiện — không lưu gì, nên mở khoá là huy hiệu về
  đúng các tin cũ.
- Tự gỡ: nghe `group.badge.rights_changed { groupId, accountId? }` → hỏi `badgeHolders` theo lô, gỡ ở tin của người
  mất quyền, phát `listing.badge.removed` (N35). Không ghi `listing_badge_blocks`: mất quyền rồi có lại thì gắn lại
  được.
- Nhóm gỡ: `DELETE /groups/:groupId/listing-badges/:listingId` (route của `listing`, quyền qua
  `group.canRemoveBadge`) → bỏ huy hiệu + ghi `listing_badge_blocks`; master ghi `audit_log`. Gỡ tin sàn chung thì
  nhóm không có route nào.

### 15. Việc theo lịch (pg-boss)

| Việc                      | Lịch                   | Làm gì                                                                                                                                         |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `listing.expire-due`      | mỗi giờ                | Tin đang hiển thị có `expires_at <= now` → hết hạn (theo lô, ghi có điều kiện), phát `listing.state.changed`                                   |
| `listing.remind-expiring` | 09:00 Asia/Ho_Chi_Minh | Tin đang hiển thị, đồng hồ đang chạy, hết hạn đúng ngày D + `remindBeforeDays` và `reminded_for ≠ expires_at` → phát `listing.expiry.reminder` |

Không job nào đưa tin lên bảng (luật 15): `expire-due` chỉ đi mũi tên đang hiển thị → hết hạn. Tin đồng hồ đang
dừng không được nhắc (chưa biết ngày hết hạn).

### 16. Sự kiện outbox

Phát (`listing.outbox.ts`, payload chỉ mã và trạng thái):

| Sự kiện                        | Payload                                                                           | Ai nghe (đợt)                                   |
| ------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| `listing.submitted`            | `listingId, version, ownerId, kind, deviceHash, placement, groupId?`              | identity (2), screening (3), máy tạm dev        |
| `listing.state.changed`        | `listingId, ownerId, from, to, arrow, version, placement, groupId?, full, fault?` | notification N31 (2), trust (2, 5), review (4)  |
| `listing.hidden.changed`       | `listingIds, ownerIds, groupId?, reason, change: added / removed`                 | notification N32 (2)                            |
| `listing.detached`             | `listingIds, ownerIds, groupId, reason, moveUntil`                                | notification N33 (2)                            |
| `listing.placement.downgraded` | `groupId, listingIds, ownerIds`                                                   | notification N34 (2)                            |
| `listing.badge.removed`        | `listingId, ownerId, groupId, cause: rights / group`                              | notification N35 (2)                            |
| `listing.expiry.reminder`      | `listingId, ownerId, expiresAt`                                                   | notification N37 (2)                            |
| `listing.edited`               | `listingId, version, machine: boolean`                                            | review (4: việc tự huỷ khi máy cho qua bản sửa) |
| `listing.deleted`              | `listingId, ownerId`                                                              | review (4), reports (4)                         |
| `listing.moved`                | `fromListingId, toListingId, ownerId`                                             | review (4)                                      |

Nghe (`listing.events.ts`): `identity.account.{locked,unlocked,deleted}`, `group.member.{left,joined,unit_changed}`,
`group.ban.{created,lifted}`, `group.state.{locked,unlocked,closed}`, `group.privatization.started`,
`group.badge.rights_changed`, `category.status.changed`, `trust.tier.changed` (bên phát ở `add-trust-tiers`),
`screening.result.recorded`, `screening.listing.recalled`, `screening.listing.restricted` (đợt 3); `review.*` cho đạt / từ chối / gỡ / khôi phục /
gỡ khỏi nhóm thêm ở `add-review-queues`, mũi tên đã có sẵn.

### 17. Route (tiền tố `/api/v1`)

**Người đăng**: `POST /listings` (tạo nháp, 201), `PATCH /listings/:id` (lưu nháp / sửa, kèm `version`),
`POST /listings/:id/submit`, `POST /listings/:id/withdraw`, `POST /listings/:id/renew` (body sửa tuỳ chọn),
`POST /listings/:id/sold`, `DELETE /listings/:id`, `POST /listings/:id/move-to-marketplace`,
`GET /me/listings?state=&cursor=` (kèm lý do tạm ẩn, lý do hạn chế). Ảnh: `POST /media/uploads` sẵn có với
`ownerKind = listing`.

**Người xem** (khách được): `GET /listings/:id`, `GET /listings?q=&categoryId=&province=&ward=&priceMin=&priceMax=&cursor=`
(không `q` = bảng tin / danh mục, có `q` = tìm kiếm), `GET /listings/:id/suggestions`,
`GET /groups/:id/listings?q=&cursor=`, `GET /users/:id/listings?cursor=`.

**Nhóm**: `DELETE /groups/:groupId/listing-badges/:listingId`.

Phân trang theo con trỏ (`cursor` = mã hoá của (`first_live_at`, `id`)), không theo trang: bảng tin thêm tin liên
tục nên trang theo số trang lặp hoặc sót tin, và `total` của bảng tin là một lượt `COUNT` toàn bảng mỗi request.
Thêm `src/common/schemas/cursor.ts`; danh sách cũ giữ phân trang theo trang.

### 18. Mã lỗi mới

Trong spec: `INVALID_TRANSITION`, `PLACEMENT_NOT_ALLOWED`, `OUTSIDER_POSTS_DISABLED`, `GROUP_LOCKED`, `GROUP_CLOSED`,
`GROUP_MODE_CHANGING`, `CATEGORY_DISABLED`, `REGION_REQUIRED`, `TOO_MANY_IMAGES`, `PLACEMENT_LOCKED`,
`RENEWAL_TOO_EARLY`, `ALREADY_MOVED`, `MOVE_WINDOW_EXPIRED`, `BADGE_NOT_ELIGIBLE`, `BADGE_ALREADY_ATTACHED`,
`BADGE_REMOVED_BY_GROUP`, `SUBMISSION_COOLDOWN` (bên ném ở `add-screening`). Có sẵn: `EMAIL_NOT_VERIFIED`,
`NOT_GROUP_MEMBER`, `GROUP_BANNED`, `IMAGE_NOT_IN_STORAGE`, `CONFLICT`, `FORBIDDEN`, `NOT_FOUND`. Thêm do design:
`LISTING_DETACHED` (D3).

### 19. Tranh chấp đồng thời

| Tình huống                                                        | Cơ chế                                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bấm Đăng hai lần                                                  | `UPDATE … WHERE state = 'draft' AND version = $v` + unique (`listing_id`, `from_version`); lượt thua đọc lại và trả 200 cùng tin                                      |
| Gửi "nhóm công khai" đua với đổi sang riêng tư                    | `lockForPosting` `FOR SHARE` ↔ `updateSettings` `FOR UPDATE`, đếm trong khoá (mục 10)                                                                                 |
| Gửi vào nhóm đua với bị cấm, rời, bị gỡ                           | Khoá cặp (nhóm, người) trong `lockForPosting`, cùng khoá với mọi thay đổi tư cách của `group`                                                                         |
| Kết quả máy về sau khi người đăng đã sửa                          | Ghi có điều kiện `version`; lệch thì bỏ qua                                                                                                                           |
| Hai thiết bị cùng sửa                                             | `version` trong request; lệch → 409 `CONFLICT`                                                                                                                        |
| Bên nghe đặt lý do đua với người đăng sửa / gia hạn / job hết hạn | Mọi lượt ghi `SELECT … FOR UPDATE` dòng tin rồi mới tính; bên nghe không ghi đè cột nội dung, sửa không ghi đè `hide_reasons` (chỉ `array_remove` lý do của chính nó) |
| Job hết hạn đua với gia hạn sớm                                   | Cả hai ghi có điều kiện trên `state`; lượt sau thấy trạng thái mới                                                                                                    |
| Chuyển lên sàn chung hai lần                                      | Unique `moved_from_listing_id`                                                                                                                                        |
| Gắn huy hiệu đua với mất quyền                                    | Bên nghe `rights_changed` chạy sau commit của cả hai, gỡ lại nếu đã gắn                                                                                               |

Mỗi dòng một test DB chạy hai lượt song song (khuôn `code-attempts.db.test.ts`), chạy ở CI.

### Sửa đi kèm (làm cùng change, sau khi duyệt)

- **Delta spec**: `media/image-storage` thêm requirement "Bản sao ảnh cho tin chuyển lên sàn chung" (TK 25 đã có);
  `listing/editing` thêm D3; `listing/suspension` thêm "lý do của nhóm rơi khi tin rời nhóm đó" (D3).
- **TK**: phần 19 ghi D3; phần 28 thêm khoá `listing.moveToMarketplaceDays` (dòng chữ đã có từ 12/10).
- **CLAUDE.md**: luật 4 thêm phân trang con trỏ cho bảng tin; danh sách module thêm `listing`; luật 13 bỏ "(chưa
  có)" khi `listing.calc.ts` có.
- `config-keys.ts`: `listing.moveToMarketplaceDays` 30. `env.ts`: `DEV_TRUST_TIER`, `DEV_MACHINE_REVIEW` (production
  từ chối khác mặc định).

## Risks / Trade-offs

- **Production chạy bản tạm T0**: tới khi `add-trust-tiers` xong, mọi tin công khai trên production hiện hạn chế.
  Chấp nhận được vì chưa mở production; ba change đi liền nhau.
- **Tìm kiếm `LIKE '%…%'`** quét tập tin đang hiển thị ở sàn chung, không có index chữ. Đủ ở cỡ chục nghìn tin.
  Lớn hơn thì bật `pg_trgm` (extension có sẵn trong Postgres, không phải gói npm) — hỏi trước khi bật.
- **Nhóm rất đông tin** (đóng nhóm 10 nghìn tin): bên nghe làm theo lô 500 dòng một transaction; hỏng giữa chừng thì
  outbox chạy lại, phần đã làm không đổi (idempotent). Trong vài giây đó một số tin còn hiện — đóng nhóm đã chặn
  đăng mới ngay, còn tin cũ ẩn theo lô.
- **Dấu thiết bị giả được**: `x-device-id` do app gửi, ai sửa app cũng đổi được. Đã biết từ `add-identity`
  (DeviceCheck hoãn). Thiếu header thì từ chối thay vì bỏ qua, để không có đường gửi tin không để lại dấu.
- **Dấu thiết bị ghi sau vài giây** (qua outbox): máy chấm chữ trong lượt gửi không chờ dòng đó — nó hỏi
  `identity.deviceFlagsFor` tính đánh dấu kể cả lượt đang xét (design `add-screening` câu 20).
- **`version` không tăng khi tạm ẩn**: người duyệt có thể đạt một tin đang tạm ẩn vì nhóm khoá — đúng ý: tạm ẩn
  không phải việc của người duyệt, tin lên đang hiển thị nhưng vẫn ẩn tới khi nhóm mở khoá.

## Migration Plan

Một migration `init_listing`: 3 bảng, 7 enum, CHECK viết tay (ghi `///` trên model), partial index. Sửa `group`
(khoá, payload), `category` (sự kiện), `media` (chủ `listing`, chép ảnh), `identity` (chữ ký
`recordListingSubmission`) không đổi bảng. Không đổi dữ liệu có sẵn. Lùi: revert code, drop bảng mới.

## Đã duyệt (12/10/2026)

| #   | Đề xuất                                                                                                                                                                                                                                                                                                                                    | Vì sao                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Nháp là chính dòng tin (mục 1)                                                                                                                                                                                                                                                                                                             | Ảnh không phải đổi chủ; bấm Đăng hai lần chặn trên một dòng                                                                                                                                                          |
| D2  | Mọi lượt gửi (gửi, gửi lại sau sửa, gia hạn, chuyển lên sàn) bắt buộc header `x-device-id`; thiếu → 400. App web tự sinh một mã ngẫu nhiên lưu trên trình duyệt                                                                                                                                                                            | TK 8 đòi ghi dấu máy ở **mọi** lượt gửi; bỏ qua khi thiếu là cửa lách                                                                                                                                                |
| D3  | Tin đang tạm ẩn vì nhóm (tự rời, bị gỡ, bị cấm, nhóm khoá) mà người đăng đổi nơi đăng ra khỏi nhóm đó thì các lý do của nhóm ấy rơi theo (tin qua máy như mọi lần đổi nơi đăng). Tin đã rời nhóm hẳn (nhóm đóng, sang riêng tư, bị gỡ khỏi nhóm) không sửa được nữa — chỉ chuyển lên sàn chung (tin mới) hoặc xoá → 409 `LISTING_DETACHED` | Lệnh cấm là của nhóm, không phải của sàn. Nếu tin rời nhóm hẳn vẫn sửa được nơi đăng thì người đăng chuyển lên sàn (tin mới) rồi sửa tin cũ lên sàn lần nữa — hai bản của cùng món đồ, lách "mỗi tin chuyển một lần" |
| D4  | Ngày hiển thị chạy cả lúc đang kiểm, chờ duyệt, và nháp đã từng lên bảng (rút về); dừng ở bị từ chối, bị gỡ                                                                                                                                                                                                                                | Spec "sửa không làm mới" và "hết ngày lúc chờ" chỉ đúng khi đồng hồ chạy qua lúc chờ; bị từ chối như bị gỡ — quyết định của người duyệt, không do người đăng                                                         |
| D5  | `version` chỉ tăng khi nội dung, nơi đăng, trạng thái đổi; sửa tin gửi kèm `version`, lệch → 409 `CONFLICT`                                                                                                                                                                                                                                | Nhóm khoá giữa chừng không làm hỏng việc đang mở của người duyệt; hai thiết bị không ghi đè nhau                                                                                                                     |
| D6  | Bảng tin, tìm kiếm, hồ sơ, tin của tôi phân trang theo con trỏ                                                                                                                                                                                                                                                                             | Bảng tin thêm tin liên tục; `COUNT` toàn bảng mỗi request                                                                                                                                                            |
| D7  | Lý do tạm ẩn không đặt lên nháp                                                                                                                                                                                                                                                                                                            | Nháp không ai thấy; gửi nháp kiểm lại nhóm và danh mục                                                                                                                                                               |
| D8  | Chuyển lên sàn chung chỉ từ tin không phải nháp, đã bán, bị từ chối, bị gỡ                                                                                                                                                                                                                                                                 | Chuyển tin bị từ chối / bị gỡ là thoát quyết định của người duyệt                                                                                                                                                    |
| D9  | Lần gửi đầu ghim phiên bản mẫu thông tin; lưu nháp chỉ kiểm mục có trong mẫu và kiểu giá trị                                                                                                                                                                                                                                               | "Mẫu lúc đăng" là lúc gửi; nháp được dở dang                                                                                                                                                                         |
| D10 | Tin trong nhóm theo đơn vị con **hiện tại** của người đăng                                                                                                                                                                                                                                                                                 | Phạm vi của điều hành viên đơn vị (đợt 4) luôn đúng người                                                                                                                                                            |
| D11 | Tìm kiếm bằng `LIKE` trên chữ bỏ dấu, chưa bật `pg_trgm`                                                                                                                                                                                                                                                                                   | Không thêm gì mới (chốt 12/10); bật khi số tin cần                                                                                                                                                                   |
| D12 | Tin bị khoá tài khoản, xoá tài khoản không gửi thông báo; thêm N37 "tin sắp hết hạn"                                                                                                                                                                                                                                                       | Người đó không vào được app; N37 là lời nhắc của spec display-period                                                                                                                                                 |
