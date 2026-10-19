# Design

> **Đã duyệt 17/10/2026.** Người dùng giao tech lead chọn phương án ("Làm tiếp đi"), theo tiêu chí chạy ổn với lượng
> lớn người dùng. Không thêm package hay dịch vụ ngoài: việc nền theo lịch vẫn là **pg-boss** đã có (CLAUDE.md), nên
> điểm "phải chọn trước khi làm" của proposal không còn. Mười bốn câu hỏi mở trả lời ở mục 11.

## Context

- Mọi module đợt 1–6 đã archive; dữ liệu cần dọn đều có chủ. Đã có sẵn: việc dọn của `identity` (đăng ký dở, mã,
  phiên chết), `media` (ảnh chưa xác nhận, đối chiếu kho, ảnh của chủ đã mất), `outbox.purge-published`; xoá mềm tin
  (`listings.deleted_at`), xoá mềm tài khoản (`accounts.deleted_at`, ẩn danh hoá hồ sơ khi hết 90 ngày — nhưng chỉ chạy
  **lúc có người đăng ký lại cùng email**, `releaseDeleted`), ẩn hội thoại từng phía, cờ `permanent` / `lifted` của gậy.
- Chưa có: xoá hẳn tin, hội thoại, thông báo, dấu thiết bị, kết quả máy; ẩn danh hoá gậy; tạm giữ bằng chứng; bảng ghi
  kết quả từng lượt việc nền. Rà soát 15/10/2026 để lại hai mục: L13 (khoá ngoại RESTRICT `listings → groups`,
  `categories`) và dấu ảnh `image_checks` của ảnh bị xoá theo khoá ngoại tài khoản (L10).
- Hai khoá ngoại cản việc dọn đúng luật: `conversations.listing_id → listings ON DELETE CASCADE` (xoá hẳn tin sẽ xoá
  hội thoại, trái "hội thoại theo hạn lưu riêng") và `strikes.account_id → accounts` (không thay được mã người nhận
  bằng mã giả).

## Goals / Non-Goals

**Goals:** module `ops` với lượt dọn hằng ngày và lượt dọn nháp mỗi 6 giờ; hạn lưu cho mọi dòng của bảng TK 25; tạm giữ
bằng chứng thắng mọi hạn lưu; ẩn danh hoá gậy và nhật ký liên quan; kết quả máy gộp thành số liệu; bảng `job_runs` ghi
"xong" / "mới làm được một phần" cho mọi việc theo lịch; nhắc trước 7 ngày cho tin hết hạn sắp bị xoá hẳn.

**Non-Goals:** đổi luật xoá mềm, ẩn hội thoại, đóng nhóm (vẫn của module cũ); dọn `reports`, `reporter_scores`,
`review_decisions`, `audit_log` (giữ mãi, chỉ ẩn danh hoá phần dính gậy); nhật ký của pg-boss; kiểm ảnh.

## Decisions

### 1. Module `ops` — chỉ điều phối, không ghi bảng của ai

`src/modules/ops/` (dựng **sau cùng**, cần service của mọi module):

- `ops.jobs.ts` — `ops.retention` (03:45 hằng ngày, sau các lượt dọn của `identity`), `ops.purge-drafts` (phút 20 mỗi
  6 giờ), `ops.retention-continue` (việc theo sự kiện: lượt trước chạm trần thời gian thì làm tiếp từ bước dừng), và
  `outbox.purge-published` **chuyển từ `common/outbox/outbox.jobs.ts` sang đây** (tên việc giữ nguyên: pg-boss giữ
  lịch theo tên trong DB, đổi tên để lại một lịch mồ côi).
- `retention.service.ts` — một lượt = dãy **bước** cố định (mục 3), mỗi bước xử theo trang 500 dòng, mỗi trang một
  transaction của module sở hữu; trần thời gian cả lượt `RETENTION_BUDGET_MS` = 10 phút (TK 26 luật 1). Chạm trần thì
  lượt trả `partial: true` kèm bước đang dở, ghi `job_runs` "mới làm được một phần", xếp `ops.retention-continue { from }`.
  Mọi bước idempotent nên làm tiếp không làm lại phần đã xong.
- `evidence-hold.service.ts` — tạm giữ (mục 4). Hỏi `review` và `trust` qua cổng **dữ kiện**, tính "đang giữ" ở `ops`.
- `ops.repository.ts` — bảng `job_runs` (mục 6) và `createJobRunLog(prisma)` cho `lib/jobs.ts`.
- `ops.routes.ts` — `GET /ops/jobs/runs?name=&limit=` (master): kết quả các lượt gần nhất.
- Xoá hẳn, ẩn danh hoá dữ liệu của module nào thì gọi **cổng của module đó** (TK 30): `listing.purge`,
  `messaging.purge`, `notification.purgeBefore`, `identity.purgeDeletedAccount`, `group.purgeClosed`,
  `screening.foldRuns`, `trust.anonymizeStrike`, `review.pseudonymizeDecisions`, `pseudonymizeAudit`
  (`common/audit`). `ops` chỉ biết **luật** (mốc, thứ tự, tạm giữ), không biết bảng.

### 2. Hạn lưu là con số có phiên bản (`retention.*`, nhóm "Hạn lưu", TK 25)

Cam kết 33 nói mọi con số chỉnh được, và rà soát pháp lý có thể đổi mọi số của change này — để ở bảng con số thì
đổi không cần deploy. Khoá mới (giá trị khởi đầu = TK 25): `retention.draftDays` 7 · `retention.mistakeDays` 90 ·
`retention.violationGraceDays` 30 · `retention.seriousYears` 2 · `retention.selfDeletedDays` 30 · `retention.soldDays`
180 · `retention.expiredDays` 365 · `retention.purgeRemindBeforeDays` 7 · `retention.closedGroupDays` 90 ·
`retention.conversationIdleDays` 365 · `retention.notificationDays` 90 · `retention.screeningRunDays` 180 ·
`retention.strikeAnonymizeYears` 2 · `retention.evidenceHoldDays` 30. Dùng lại khoá đã có: `device.dataRetentionDays`
(180), `identity.deletedEmailHoldDays` (90 — cùng một con số "giữ 90 ngày" của TK 7 / 25). Ràng buộc:
`retention.purgeRemindBeforeDays < retention.expiredDays`. Spec giữ nguyên số (là giá trị khởi đầu); TK 28 nên thêm
các dòng này — việc của chủ TK, ghi ở `docs/VIEC-DANG-DO.md`.

### 3. Các bước của lượt dọn và cách xử từng loại dữ liệu

Mốc tính theo cột đã có; "lần sửa cuối" = `listings.updated_at` (đặt / gỡ lý do tạm ẩn cũng chạm cột này nên chỉ **giữ
lâu hơn**, không bao giờ xoá sớm). Mọi bước xoá tin đi qua `listing.purge(ids, rule)`: xoá trong transaction **có kiểm
lại điều kiện của luật** (tin vừa được gia hạn giữa lúc chọn và lúc xoá thì không xoá), kéo theo lượt gửi, việc đã đóng,
ứng viên mẫu (khoá ngoại), rồi `media.purgeOwners('listing', ids)` — dòng ảnh xoá cùng `media.images.deleted` nên
`screening` dọn dấu ảnh, tệp xoá khỏi kho (spec image-cleanup "ảnh theo chủ"). Quyết định (`review_decisions`) và gậy
không có khoá ngoại sang tin nên còn nguyên.

| Bước                | Chọn                                                                                                                   | Làm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `drafts` (cả 6 giờ) | `state = draft`, chưa xoá mềm, `updated_at` < 7 ngày                                                                   | xoá hẳn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `mistake`           | `fault = mistake` (rejected / removed) **hoặc** lý do `detached_by_group` / `group_privatized`, `updated_at` < 90 ngày | xoá hẳn (tạm giữ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `violation`         | `fault = violation`; `trust.strikesOfListings` → gậy mới nhất của tin                                                  | mốc = gậy thường / nặng: lúc đóng (hết hạn, huỷ, hạ) + 30 ngày; nghiêm trọng khoá vĩnh viễn / đã gỡ: ngày khoá + 2 năm; gậy còn `active`: chưa; không có gậy: như `mistake`. Quá mốc → xoá hẳn (tạm giữ), quyết định còn                                                                                                                                                                                                                                                                               |
| `selfDeleted`       | `deleted_at` < 30 ngày (mọi trạng thái)                                                                                | xoá hẳn (tạm giữ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sold`              | `state = sold`, `updated_at` < 180 ngày                                                                                | xoá hẳn (tạm giữ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `expiredRemind`     | `state = expired`, `expires_at` < (365 − 7) ngày, `purge_reminded_for` ≠ `expires_at`                                  | ghi `purge_reminded_for = expires_at`, phát `listing.purge.reminder` → N48 (một lần mỗi hạn; gia hạn đổi hạn thì nhắc lại)                                                                                                                                                                                                                                                                                                                                                                             |
| `expired`           | `state = expired`, `expires_at` < 365 ngày (`expires_at` đứng nguyên ở mốc hết hạn — `FINISHED_STATES`)                | xoá hẳn (tạm giữ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `closedGroups`      | `group.purgeDue`: `state = closed`, `closed_at` < 90 ngày, `purged_at IS NULL`                                         | `listing.softDeleteWhere({ groupId })` rồi `listing.purge` (tạm giữ; tin đã chuyển lên sàn chung là dòng khác, `group_id` null, không đụng) → `group.purgeClosed`: xoá thành viên, cấm, đơn, lời mời, danh sách lớp, lời giao chủ, thông báo nhóm; `purged_at`. Dòng nhóm giữ (tên nhóm còn trong quyết định, nhật ký) nên khoá ngoại RESTRICT (L13) không bao giờ bị chạm                                                                                                                             |
| `deletedAccounts`   | `identity.purgeDue`: `status = deleted`, `deleted_at` < 90 ngày, `purged_at IS NULL` (tạm giữ hồ sơ: mục 4)            | `listing.softDeleteWhere({ ownerId })` (phát `listing.listing.deleted` cho `review` huỷ việc) → `listing.purge` (tạm giữ từng tin; tin bị giữ ở lại dạng xoá mềm, luật `selfDeleted` dọn khi hết giữ) → `media.purgeOwners('profile')` (L10: ảnh đại diện đi qua `media`, có sự kiện) → `identity.purgeDeletedAccount`: ẩn danh hoá như `releaseDeleted` + xoá `id_verifications` + `purged_at`. Dòng tài khoản **giữ** (khoá ngoại của gậy đã kế thừa, dấu thiết bị, tin sạch…); hội thoại không đụng |
| `devices`           | `device_posts.last_posted_at` < 180 ngày; `account_flags.cleared_at` < 180 ngày; `sessions.created_at` < 180 ngày      | xoá lượt ghi; xoá đánh dấu đã gỡ; `sessions.ip = NULL` ("địa chỉ mạng lúc đăng ký" = IP của phiên — không có cột riêng). Đánh dấu đang mở, miễn trừ (`device_clearances`) giữ                                                                                                                                                                                                                                                                                                                          |
| `conversations`     | cả hai `*_hidden_at` có giá trị, **hoặc** `last_activity_at` < 365 ngày                                                | `messaging.purge(ids)` (tạm giữ): xoá hội thoại, tin nhắn, dấu đang mở                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `notifications`     | `updated_at` < 90 ngày (dòng gộp được cập nhật là "gửi lại")                                                           | xoá                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `screeningRuns`     | `started_at` < 180 ngày                                                                                                | `screening.foldRuns`: lượt đã kết luận cộng vào `screening_run_stats` rồi xoá; lượt chưa kết luận xoá; `screening_unchecked_marks` cùng mốc xoá                                                                                                                                                                                                                                                                                                                                                        |
| `strikes`           | gậy chưa ẩn danh: `expired` (`expires_at`), `cancelled` (`cancelled_at`) quá 2 năm; `lifted` khi ngày khoá quá 2 năm   | ẩn danh hoá (mục 5). Riêng `lifted` còn `email_hashes`: xoá ngay lượt kế tiếp, không chờ 2 năm                                                                                                                                                                                                                                                                                                                                                                                                         |
| `jobRuns`           | `job_runs.started_at` < 90 ngày                                                                                        | xoá (hằng hạ tầng, không phải con số TK)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Không bước nào đặt tin thành hiển thị hay gỡ lý do tạm ẩn (TK 26 luật 3): `purge` chỉ `DELETE`, `softDeleteWhere`
chỉ đặt `deleted_at`.

### 4. Tạm giữ bằng chứng (`evidence-hold.service.ts`)

"Việc" = báo cáo, gậy, khiếu nại. Mốc đóng: báo cáo `decided_at`; gậy — `expired` → `expires_at`, `cancelled` →
`cancelled_at`, `permanent` → **không đóng** cho tới `lifted` (`lifted_at`); gậy nghiêm trọng `active` (chờ master) là
đang mở; khiếu nại `pending` là đang mở (nằm trên gậy `active` nên đã được tính). Giữ tới mốc đóng + 30 ngày
(`retention.evidenceHoldDays`).

- Cổng dữ kiện: `review.reportHolds({ listingIds, accountIds, conversationIds }, since)` → báo cáo đang mở hoặc
  đóng sau `since`: mã tin bị báo, mã người bị báo (báo cáo **về người**), mã người đăng của mọi báo cáo (để giữ hồ
  sơ), mã hội thoại gửi kèm lượt báo; `trust.strikesOfListings(listingIds)` → gậy của từng tin (loại, trạng thái, mốc
  đóng).
- Tin được giữ khi: có báo cáo về tin; có báo cáo về **người đăng** (báo cáo về một người giữ mọi tin và hội thoại của
  người đó — câu 7); gậy của tin đang mở hoặc đóng chưa quá 30 ngày.
- Hội thoại được giữ khi: được gửi kèm báo cáo; báo cáo về tin của nó; báo cáo về một trong hai bên; gậy của tin của nó.
- Hồ sơ tài khoản đã xoá được giữ (không ẩn danh hoá, không xoá ảnh đại diện) khi có báo cáo về người đó hay về tin của
  người đó đang mở / đóng chưa quá 30 ngày; tin của họ vẫn được xoá mềm ngay (đã ẩn từ lúc xoá tài khoản) và xoá hẳn
  từng tin theo luật giữ của tin.
- Tạm giữ chỉ chặn `purge`; mọi cửa đọc giữ nguyên (`deleted_at` ẩn tin, `*_hidden_at` ẩn hội thoại) nên dữ liệu đã xoá
  không hiện lại.

### 5. Ẩn danh hoá gậy — một transaction, ba module

- **Mã giả** = `identity.pseudonymOf(accountId)`: HMAC-SHA256 (`IDENTITY_HASH_KEY`, scope `pseudonym`) cắt 16 byte,
  đặt nibble version / variant thành một UUID hợp lệ — cùng một người luôn ra cùng mã giả (gậy của một người vẫn gom
  được), không ai dò ngược nếu không có khoá nằm ngoài DB (TK 30).
- Transaction của `ops` (`SET LOCAL ghim.anonymize = 'on'`): `trust.anonymizeStrike(tx, …)` — `strikes.account_id` =
  mã giả, `email_hashes = []`, `anonymized_at`; `strike_appeals.account_id` = mã giả, `statement` xoá (lời người dùng tự
  viết); nhận xét của staff giữ (lời của người duyệt). `review.pseudonymizeDecisions(tx, …)` — `review_decisions` có
  `strike_id` / `issued_strike_id` là gậy đó và `account_id` là người đó → mã giả. `pseudonymizeAudit(tx, …)`
  (`common/audit`) — dòng `target_type = 'strike'` của gậy: `details.accountId` → mã giả; dòng `target_type =
'account'` của người đó có `details.strikeId` là gậy đó (khoá vì gậy nghiêm trọng): `target_id` → mã giả.
- Trigger `audit_log_immutable` đổi thành: UPDATE chỉ được khi `current_setting('ghim.anonymize', true) = 'on'` **và**
  chỉ `target_id`, `details` đổi; DELETE vẫn chặn tuyệt đối. Migration tay, ghi `///` ở model `AuditLog`.
- Khoá ngoại `strikes.account_id → accounts` bỏ (relation Prisma bỏ cả hai chiều): gậy sống lâu hơn liên kết với
  người. Hệ quả: dọn đăng ký dở dang (`identity.purge-unverified`, lượt Google đè) không còn kéo gậy đã kế thừa theo →
  `identity` phát `identity.account.purged { accountIds }`, `trust` nghe và xoá gậy của các tài khoản đó.
- Khoá vĩnh viễn: **chờ gỡ khoá mới ẩn danh hoá** (câu 3) — lượt xem lại 2 năm và lệnh gỡ khoá tìm tài khoản qua
  `strike.account_id`; `email_hashes` giữ tới khi gỡ (spec), `hasPermanentByEmailHash` không đổi.
- Gậy đã ẩn danh không bao giờ `active`, nên `listOf(accountId)`, `activeOf`, `seriousLockOf` tự loại chúng (mã giả không
  trùng mã tài khoản nào).

### 6. "Làm dở thì phải nói ra" — `job_runs` và `lib/jobs.ts`

- Handler của `jobs.schedule` được trả `JobOutcome | void` = `{ partial?: boolean; summary?: Record<string, …> }`.
  `createJobs(…, { runLog })` bọc mọi việc theo lịch: ghi `job_runs (name, started_at, finished_at, status
done|partial|failed, summary, error)` qua `runLog.record` sau mỗi lượt; ném → `failed` rồi ném tiếp (pg-boss thử
  lại). Việc theo sự kiện (`work`) không ghi — chúng chạy theo lô nhỏ, hàng trăm lượt mỗi giờ, và không có nghĩa "làm
  được một phần". `media.reconcile` trả `partial` khi còn `next`; lượt dọn trả `partial` khi chạm trần.
- Bản giả `tests/fakes/jobs.fake.ts` ghi `runs` trong bộ nhớ và có `runScheduled(name)` để test gọi một lịch.
- Ai xem: `GET /ops/jobs/runs` (master). Không thông báo master (câu 13): một lượt dở không phải sự cố — lượt sau làm
  tiếp; dòng `failed` thì `logger.error` đã có.

### 7. Thông báo N48 — tin hết hạn sắp bị xoá hẳn

`listing.purge.reminder { listingId, ownerId, purgeAt }` → ma trận `listing` (`notification.listing-matrix.ts`): nhóm
"tin đăng của bạn", `type listing.purge.reminder`, tiêu đề = tiêu đề tin, nội dung "Tin đã hết hạn gần một năm, sẽ bị
xoá hẳn ngày … Gia hạn nếu bạn còn bán.", `data { listingId, purgeAt }`, `personal`, `alertable`.

### 8. Dữ liệu và migration (`add_data_retention`)

- `accounts.purged_at`, `groups.purged_at`, `listings.purge_reminded_for`, `strikes.anonymized_at`.
- Bỏ FK `conversations_listing_id_fkey` (cột giữ NOT NULL; DTO đã trả `listing.title` null khi tin không còn) và
  `strikes_account_id_fkey`.
- `screening_run_stats (month, rule_version, config_version, outcome, cause, band, rule_code, runs)` — khoá chính
  gồm bảy cột đầu (`cause`, `band` rỗng khi lượt không có; `rule_code = '*'` là dòng tổng của lượt). `job_runs`.
- Index cho lượt dọn: `listings (state, updated_at) WHERE deleted_at IS NULL`, `listings (deleted_at) WHERE deleted_at
IS NOT NULL`, `listings (expires_at) WHERE state = 'expired'`, `conversations (last_activity_at)`, `notifications
(updated_at)`, `screening_runs (started_at)`, `device_posts (last_posted_at)`, `strikes (status, anonymized_at)`,
  `accounts (deleted_at) WHERE status = 'deleted' AND purged_at IS NULL`, `groups (closed_at) WHERE state = 'closed' AND
purged_at IS NULL`, `job_runs (name, started_at)`.
- Trigger `audit_log_immutable` viết lại (mục 5).

### 9. Ai gọi gì

| Bên                     | Gọi / nghe                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `ops` → `listing`       | `retentionDue`, `purge`, `softDeleteWhere`, `remindPurge`                                |
| `ops` → `media`         | `purgeOwners`                                                                            |
| `ops` → `group`         | `purgeDue`, `purgeClosed`                                                                |
| `ops` → `identity`      | `purgeDue`, `heldOrPurge…` (qua `purgeDeletedAccount`), `purgeDeviceData`, `pseudonymOf` |
| `ops` → `messaging`     | `retentionDue`, `purge`                                                                  |
| `ops` → `notification`  | `purgeBefore`                                                                            |
| `ops` → `screening`     | `foldRuns`                                                                               |
| `ops` → `trust`         | `strikesOfListings`, `anonymizeDue`, `anonymizeStrike(tx)`, `dropLiftedEmailHashes`      |
| `ops` → `review`        | `reportHolds`, `pseudonymizeDecisions(tx)`                                               |
| `ops` → `common/audit`  | `pseudonymizeAudit(tx)`                                                                  |
| `trust` nghe `identity` | `identity.account.purged` → xoá gậy của đăng ký dở đã bị dọn                             |
| `notification` nghe     | `listing.purge.reminder` (N48)                                                           |
| `lib/jobs` → `ops`      | `runLog.record` (bảng `job_runs`)                                                        |

## Risks / Trade-offs

- `updated_at` làm "lần sửa cuối" và "lúc đánh dấu đã bán": bên nghe chạm cột này (lý do tạm ẩn) nên tin có thể được
  giữ lâu hơn hạn — không bao giờ ngắn hơn. Thêm cột mốc riêng khi cần chính xác hơn.
- Lượt dọn hằng ngày xét lại mọi tin `fault = violation` chưa xoá (hỏi `trust` theo trang 500): tin vi phạm hiếm, chi phí
  nhỏ; nếu lớn lên thì lưu mốc dọn vào tin lúc gậy đóng.
- Bỏ hai khoá ngoại: `conversations.listing_id`, `strikes.account_id` không còn được DB bảo vệ — như `reports`,
  `review_decisions` vốn đã thế; người đọc coi tin / tài khoản không còn là "đã xoá hẳn".
- Dữ liệu thiết bị 180 ngày làm luật "bắt đầu đăng tin trên máy sau khi tài khoản khác ở đó bị khoá" chỉ nhìn được 180
  ngày (câu 9) — theo đúng TK 25; thêm dấu máy bền (DeviceCheck, TK 29) là chuyện khác.
- `screening_run_stats` gộp theo tháng, phiên bản, kết quả, dải, mã luật; không theo danh mục (lượt không lưu danh mục,
  và `review_decisions` giữ mãi đã đủ cho "máy quá tay theo luật").

## 10. Thứ tự làm

Schema + migration → `lib/jobs.ts` + bản giả → cổng ở từng module (listing, media, group, identity, messaging,
notification, screening, trust, review, audit) → `ops` (hold, retention, routes, jobs) → wiring `app.ts` → test → tài liệu.

## 11. Trả lời câu hỏi mở của proposal

1. **Rà soát pháp lý**: không phải hành vi hệ thống; mọi con số là khoá `retention.*` chỉnh được không cần deploy; ghi vào
   `docs/VIEC-DANG-DO.md` mục 4 kèm danh sách dữ liệu chưa có dòng (câu 8).
2. **Trong bảng con số**: có — mục 2.
3. **Gậy nghiêm trọng khoá vĩnh viễn**: ẩn danh hoá **sau khi gỡ khoá** (ngày khoá đã quá 2 năm thì ở lượt kế tiếp sau
   gỡ); `email_hashes` giữ tới khi gỡ. Master xem lại dựa trên hồ sơ gậy còn nguyên (điều đã trích, quyết định, nhận
   xét của staff, nhật ký).
4. **Dấu băm email 2 năm cùng gậy**: tính từ lúc gậy **đóng** (hết hạn / huỷ), cùng mốc với ẩn danh hoá — một bước.
5. **Tin tự xoá có báo cáo mở**: luật tạm giữ (đóng + 30 ngày) — như spec.
6. **Gậy nghiêm trọng "đóng"**: khi master hạ (thành gậy nặng, đóng theo hạn của gậy nặng) hay huỷ (`cancelled_at`); khoá
   vĩnh viễn thì không đóng tới khi gỡ. Riêng **tin** của gậy nghiêm trọng xoá hẳn sau 2 năm kể từ ngày khoá (TK 22,
   TK 25), không chờ gỡ: master xem lại dựa trên hồ sơ gậy, không cần nội dung tin.
7. **Phạm vi "dính tới" một người**: báo cáo về một người giữ hồ sơ, mọi tin và mọi hội thoại của người đó; gậy chỉ giữ
   tin của nó và hội thoại về tin đó.
8. **Dữ liệu chưa có dòng**: `id_verifications` xoá cùng lượt xoá hẳn tài khoản; phiên đã chết xoá sau 30 ngày (sẵn);
   đơn, lời mời, danh sách lớp, lời giao chủ, thành viên, thông báo nhóm xoá khi nhóm đóng quá 90 ngày; báo cáo (kể cả
   danh tính người báo), điểm tin cậy báo cáo, khiếu nại (lời khai xoá khi ẩn danh hoá gậy), chặn người, thành viên nhóm
   đang hoạt động, tài khoản bỏ không: **chưa có hạn** — ghi vào rà soát pháp lý, không tự đặt số TK không có.
9. **Dữ liệu thiết bị vs tài khoản bị khoá**: theo TK 25, 180 ngày; sau đó máy không còn nối với tài khoản bị khoá.
10. **"Không chứa nội dung tin"**: quyết định và nhật ký mang mã tin, lý do mẫu, lý do người duyệt gõ; không tiêu đề, mô
    tả, giá, ảnh, nội dung tin nhắn, tên hiển thị (đã đúng từ `add-review-queues`; change này không thêm gì vào đó).
11. **Số liệu sau khi gộp**: theo tháng × phiên bản luật × phiên bản bảng con số × kết quả × nguyên nhân × dải × mã luật;
    tỉ lệ "máy giữ mà người cho qua" tính từ `review_decisions` (giữ mãi).
12. **Một bên đã xoá tài khoản**: tính là đã xoá hội thoại ở phía đó (`hideAllOf` đã làm) — bên kia xoá nữa thì xoá hẳn.
13. **"Mới làm được một phần" báo ở đâu**: bảng `job_runs` + `GET /ops/jobs/runs`; không thông báo master.
14. **Outbox**: bộ phát ở `common/outbox` (hạ tầng, mọi module cần từ đợt 1) giữ nguyên; `ops` chỉ nhận việc dọn
    `outbox.purge-published`.
