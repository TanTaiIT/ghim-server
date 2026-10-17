# Design

> **Đã duyệt 17/10/2026.** Người dùng giao tech lead chọn phương án ("tiến hành giúp tôi"), theo tiêu chí chạy ổn với
> lượng lớn người dùng. Mười bốn câu hỏi mở của proposal được trả lời ở mục 12.

## Context

- Hàng chờ, nhận việc, quyết định, nhật ký đã có (`add-review-queues`); báo cáo và việc về một người đã có
  (`add-reports`). Hàng 2 (khiếu nại, 7 ngày — `review.appealDays`) và mọi con số của gậy (`strike.*`) đã khai trong
  bảng con số, chưa có code nào đọc.
- `listings.fault` đã có giá trị `violation`; sơ đồ TK 18 đã có mũi tên `appealWin`; `listing_restriction` đã có `strike`;
  `trust_void_cause.violation` đã được `trust` xử. Chỉ `trust` ghi gậy (CLAUDE.md luật 11): mọi module khác hỏi `trust`
  qua cổng hay nghe sự kiện của nó.

## Goals / Non-Goals

**Goals:** gậy ba loại; điểm và hạn; hạn chế theo điểm (hạn chế tin, trần T1, khoá đăng tin, treo quyền staff, mất vai
nhóm, hàng "có gậy" của máy, dấu thiết bị); khiếu nại; ân xá; gậy nghiêm trọng với kênh hỗ trợ, quyết định của master,
khoá vĩnh viễn và xem lại 2 năm; gậy đi theo email.

**Non-Goals:** thông báo khi nhận gậy / có kết quả (`add-notifications`), hạn lưu (`add-data-retention`), hội thoại.

## Decisions

### 1. Dữ liệu (`trust` sở hữu)

- `rule_articles` — quy định sàn để trích: `code` (unique), `title`, `text`, `active`, `sort`. Bước khởi động chèn bộ khởi
  đầu khi bảng trống (như lý do mẫu của `review`); master thêm / sửa / tắt qua `/ops/trust/rule-articles`.
- `strikes` — `account_id` (FK, cascade), `kind` (`normal` | `severe` | `serious`), `status` (`active` | `expired` |
  `cancelled` | `permanent` | `lifted`), `points`, `rule_article_id`, `rule_text` (bản trích lúc ra gậy — câu người bị
  phạt đọc không đổi khi master sửa điều), `issued_by`, `issued_by_role` (`staff` | `master`), `category_id?`
  (danh mục của tin — người xét khiếu nại), `from_report` (báo cáo về người → master xét), `listing_id?`,
  `decision_id?`, `email_hashes[]` (dấu băm email của tài khoản lúc ra gậy, thêm dấu mới khi đổi email),
  `inherited_from_id?`, `issued_at`, `expires_at?`, `cancelled_at?`, `cancel_cause?` (`appeal` | `amnesty` |
  `serious_cancel`), `cancelled_by?`, `serious_decision?` (`permanent` | `downgrade` | `cancel`),
  `serious_decided_at?`, `serious_decided_by?`, `permanent_review_at?`, `lifted_at?`, `lifted_by?`. GIN index trên
  `email_hashes`.
- `strike_appeals` — một dòng mỗi gậy (unique `strike_id`): `account_id`, `statement`, `channel` (`app` | `support`),
  `filed_at`, `status` (`pending` | `won` | `lost` | `closed`), `decided_at?`, `decided_by?` (null = tự thắng vì quá hạn).
- `strike_comments` — nhận xét của staff trên gậy nghiêm trọng: `strike_id`, `author_id`, `body`, `created_at`.
- `review_tasks.strike_id`, `review_decisions.strike_id` — việc / quyết định **về một gậy** (chủ thể thứ ba, CHECK đúng
  một trong ba); `review_decisions.issued_strike_id` — gậy quyết định này ra. Partial unique một việc mở mỗi gậy.
- Enum: `review_reason` + `appeal`, `serious_strike`, `permanent_review` (hàng 2); `review_outcome` + `violation`;
  `listing_restriction` + `strike_wave`; `account_flag_kind` + `device_of_struck_account`; `code_purpose` +
  `locked_appeal`; `account_flags.related_strike_id`; `session_revoke_reason` không đổi (khoá dùng `account_locked`).
- Con số mới: `trust.t3NoStrikeDays` (90). Luật máy mới `shared_device_strike` trọng số 30, chèn ở chế độ **bật** (spec
  đòi cộng điểm ngay; luật chạy thử là cho luật master thêm tay).

### 2. Điểm và hiệu lực

- Gậy đang hiệu lực = `status = active` và (`expires_at` null hay `> now`) — đọc là đúng ngay, không chờ job. Điểm = tổng
  `points` của gậy đang hiệu lực. `strike.calc.ts` thuần: `standing(strikes, now)` → `{ points, active, severe,
postingLockedUntil }` (mốc điểm về dưới ngưỡng = hạn của gậy mà sau nó tổng còn lại < ngưỡng).
- Job `trust.strikes-expire` mỗi giờ: `active` có `expires_at <= now` → `expired`, phát `trust.strike.expired` và
  `trust.strike.standing`. Job `trust.permanent-review` hằng ngày: `permanent` có `permanent_review_at <= now` và chưa
  có việc mở → phát `trust.strike.review_due`.
- `trust.strike.standing` `{ accountId, points, active, severe }` phát sau MỌI thay đổi (ra, hết hạn, huỷ, hạ, kế thừa):
  một sự kiện cho mọi bên đối chiếu — bên nghe hỏi lại `trust` (C1), không tin payload.

### 3. Ra gậy — chỉ từ quyết định của người (review)

- Body quyết định: `outcome: 'violation'` (= từ chối / gỡ vì vi phạm; tin chờ duyệt → `rejected`, đang hiện → `removed`;
  cũng là "xác nhận việc nhóm chuyển lên") hoặc `report.verdict = 'upheld'` kèm `strike`; `strike: { kind, ruleArticleId }`
  bắt buộc với `violation`, tuỳ với báo cáo đúng. Vai `owner` / `moderator` → 403; staff với tài khoản dùng chung máy đã
  bị loại khỏi việc từ trước (403 qua `refused`).
- Trong transaction quyết định: `trust.issueStrike(tx, …)` ghi gậy và phát `trust.strike.issued` + `standing`; nhật ký ghi
  `issued_strike_id`, `posterTierAfter` = `min(mức, T1)` khi có gậy thường / nặng (trần T1 là tất định — bên nghe tính
  lại sẽ ra đúng thế). Tin: `fault = violation`, `faultReason = rule_text`.
- Tin `fault = violation` không sửa được (`transition` đã chặn `edit`; lỗi đổi thành 409 `LISTING_UNDER_VIOLATION`), không
  tự xoá được (409 `LISTING_DELETE_BLOCKED`).

### 4. Hệ quả của gậy — mỗi module nghe `trust`

| Module     | Nghe                                                                   | Làm                                                                                                                 |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `trust`    | `strike.issued` / `expired` / `cancelled` / `decided`                  | tính lại mức (trần T1, điều kiện T3)                                                                                |
| `listing`  | `strike.standing`                                                      | đối chiếu `strike_wave` trên tin đang hiện (điểm ≥ 2 đặt, < 2 gỡ); điểm = 0 gỡ cả `strike`                          |
| `listing`  | `strike.cancelled` (có `listingId`)                                    | mũi tên `appealWin` cho tin đang `rejected` / `removed` vì vi phạm — ngày còn lại như lúc gỡ                        |
| `listing`  | lên bảng (`restrictionsGoingLive`)                                     | đọc `trust.strikePointsIn(tx)`: ≥ 1 → đặt `strike` (gỡ khi điểm về 0)                                               |
| `identity` | `strike.issued` (serious)                                              | khoá tài khoản, lý do = `rule_text`, thu phiên — như khoá của master                                                |
| `identity` | `strike.decided` (downgrade / cancel), `strike.lifted`                 | mở khoá                                                                                                             |
| `identity` | `strike.expired` / `cancelled`                                         | đóng đánh dấu `device_of_struck_account` trỏ tới gậy đó                                                             |
| `platform` | `strike.issued`                                                        | treo quyền staff (lý do `strike`)                                                                                   |
| `platform` | `strike.cancelled`                                                     | quyền đang treo vì gậy mà không còn gậy nào hiệu lực → trả lại (gậy bị huỷ coi như chưa có); hết hạn thì master trả |
| `group`    | `strike.issued` (severe)                                               | chủ nhóm đang hoạt động → thiếu chủ (như bị khoá)                                                                   |
| `group`    | `strike.expired` / `cancelled` (severe)                                | nhóm đang chờ chủ này, tài khoản hoạt động, không còn gậy nặng → trả chủ                                            |
| `review`   | `appeal.filed`, `strike.issued` (serious), `strike.review_due`         | mở việc về gậy (hàng 2)                                                                                             |
| `review`   | `appeal.closed`, `strike.cancelled`, `strike.decided`, `strike.lifted` | đóng việc về gậy còn mở                                                                                             |

- Mất vai nhóm: `context()` hỏi `trust.hasSevereStrike(accountId)`; chủ nhóm / điều hành viên đang có gậy nặng → mọi
  `requireOwner` / `requireManager` / `requireCanManageMember` ném 403 `GROUP_ROLE_SUSPENDED`; `reviewersOf` bỏ họ.
- Khoá đăng tin: `assertCanSubmit` (trong transaction gửi) với `submit`, `renew_*`, `move` khi điểm ≥ ngưỡng → 403
  `POSTING_LOCKED` kèm `details.until`; `resubmit` (sửa) vẫn qua.
- Máy: `decide()` nhận `struck`; có gậy → dải Thấp `pass_limited` (không đặt lý do "máy" — `listing` đặt `strike`), dải
  Vừa giữ, mọi nơi đăng. Dấu hiệu `shared_device_strike`: `identity.deviceFlagsFor` trả thêm `sharedWithStruck` (đã đăng
  trên máy trước lúc một tài khoản cùng máy nhận gậy, gậy còn hiệu lực); `identity` hỏi `trust.activeStrikesOf(ids)`.
- Dấu thiết bị `device_of_struck_account`: `recordListingSubmission` — tài khoản khác trên máy có gậy hiệu lực ra **trước**
  lần đăng đầu của tài khoản này → đánh dấu kèm `related_strike_id`; gậy hết hiệu lực → `identity` đóng đánh dấu. Đánh
  dấu này cũng là "luôn giữ cho người" như mọi đánh dấu theo thiết bị.

### 5. Gậy đi theo email

- `identity` phát `identity.account.created` `{ accountId, emailHash }` cùng transaction tạo tài khoản (đăng ký, Google) và
  `identity.account.email_changed` `{ accountId, emailHash }` khi xác nhận email mới.
- `trust` nghe: `created` → sao chép gậy đang hiệu lực có `email_hashes ∋ hash` (kể cả gậy của tài khoản đã xoá) sang tài
  khoản mới (`inherited_from_id`, giữ loại, điểm, hạn, điều trích); `email_changed` → thêm dấu mới vào gậy đang hiệu lực.
- Chặn email: `identity.claimEmail` hỏi `trust.isEmailBanned(hash)` (gậy `permanent` có dấu đó) → 403 `EMAIL_BANNED`.
  Cổng `trust` của `identity` nối muộn (`trust` dựng sau).

### 6. Khiếu nại gậy thường / nặng

- `POST /me/strikes/{id}/appeal { statement }`: gậy của mình (không thì 404), không phải nghiêm trọng (409
  `APPEAL_VIA_SUPPORT`), còn hiệu lực, trong `strike.appealDays` kể từ `issued_at` (409 `APPEAL_WINDOW_CLOSED`), chưa
  từng khiếu nại (409 `APPEAL_ALREADY_USED`). Ghi `strike_appeals`, phát `trust.appeal.filed`.
- `review` mở việc chủ thể gậy, lý do `appeal`, hàng 2, hạn `review.appealDays`, `category_id` của gậy — trừ khi gậy do
  master ra hay đến từ báo cáo về người (`category_id = null` → bậc staff rỗng → master). Loại trừ: người ra gậy, người
  nhận, máy của cả hai. Danh mục chỉ có một staff là người ra gậy → bậc rỗng → master, không cần luật riêng.
- Quyết: `{ outcome: 'keep', appeal: { verdict: 'won' | 'lost' } }` trên bàn vận hành; vai: staff có danh mục của việc
  hay master; `trust.decideAppeal(tx, …)`. Thắng → gậy `cancelled` (`cancel_cause = appeal`), `appeal.won`, phát
  `strike.cancelled` + `standing`; thua → `lost`, gậy chạy tiếp.
- Quá hạn (`everyMinute`): việc `appeal` của gậy thường → `trust.decideAppeal` thắng với `decided_by = null`, đóng việc
  (`close_cause = expired`); gậy nặng → chuyển master như mọi việc.

### 7. Ân xá

- `POST /ops/trust/accounts/{accountId}/amnesty { strikeIds, reason }` — master. Gậy phải của người đó, `active`, thường
  hay nặng (nghiêm trọng đi mục 8). Mỗi gậy → `cancelled` (`amnesty`), khiếu nại chờ → `closed`, phát `strike.cancelled`,
  `appeal.closed`; nhật ký một dòng mỗi gậy kèm lý do.

### 8. Gậy nghiêm trọng

- Ra gậy → `identity` khoá (mục 4); `review` mở việc chủ thể gậy, lý do `serious_strike`, hàng 2, `category_id = null`
  (chỉ master), loại trừ người ra gậy — master ra gậy thì chính `decide` chặn (`issued_by === actor`) vì `canHandle` cho
  master qua mọi loại trừ. Việc ở bậc master từ lúc sinh nên lượt nhắc N40 đã có (72 giờ rồi mỗi ngày) phủ nó; không
  chuyển cấp.
- Kênh hỗ trợ: `POST /support/serious-appeal/code { email }` — luôn 200; tài khoản đang khoá vì gậy nghiêm trọng chưa
  quyết thì gửi mã (`locked_appeal`). `POST /support/serious-appeal { email, code, statement }` — mã sai / hết → 401
  `UNAUTHORIZED`, không lộ gì; đúng → tiêu mã, trong `strike.seriousAppealDays` kể từ `issued_at` (409
  `APPEAL_WINDOW_CLOSED`), một lần (409 `APPEAL_ALREADY_USED`); 201 trả lý do khoá, lúc ra gậy, hạn khiếu nại. Lý do
  khoá cũng là `reason` của 403 `ACCOUNT_LOCKED` lúc đăng nhập (spec).
- Nhận xét: `POST /ops/trust/strikes/{id}/comments { body }` — staff đang hoạt động (bất kỳ việc) và master, trừ người ra
  gậy; chỉ gậy nghiêm trọng chưa quyết. Master xét thấy trong chi tiết việc.
- Quyết: `{ outcome: 'keep', serious: { decision: 'permanent' | 'downgrade' | 'cancel' } }` — chỉ master, khác người ra
  gậy. `permanent` → `status = permanent`, `permanent_review_at = + strike.permanentReviewYears`, email bị chặn (mục 5).
  `downgrade` → `kind = severe`, `points = 2`, `expires_at = issued_at + strike.severeDays` (đã quá thì hết hạn ngay),
  mở khoá. `cancel` → `cancelled` (`serious_cancel`), mở khoá, tin hiện lại qua mở khoá, và `trust` gọi
  `listings.compensateLockedDays(tx, { accountId, ms: now − issued_at })` cộng số ngày đã trôi cho tin đang `live` của
  người đó (một lần, trong transaction quyết).
- Xem lại 2 năm: việc `permanent_review` (master) từ job; quyết `{ outcome: 'keep', permanent: { decision: 'keep' |
'lift' } }` — giữ: `permanent_review_at += 2 năm`; gỡ: `lifted`, mở khoá, hết chặn email. Gỡ ngoài lần xem lại: cùng
  route `POST /ops/trust/strikes/{id}/lift` của master (câu 4).
- Master mở khoá thường (`/ops/accounts/{id}/unlock`) tài khoản đang khoá vì gậy nghiêm trọng (chưa quyết hay vĩnh viễn)
  → 409 `LOCKED_BY_STRIKE`: quyết gậy mới mở được.

### 9. Mức tin cậy

- `computeTier` nhận `strikes: { active, lastIssuedAt }`: có gậy hiệu lực → trần T1; T3 đòi không có gậy (trừ gậy đã huỷ)
  ra trong `trust.t3NoStrikeDays`. `factsHash` gồm hai dữ kiện đó; `recomputeDaily` tự bắt mốc hết hạn và mốc 90 ngày
  (job hết hạn mỗi giờ cũng phát sự kiện tính lại ngay trong ngày).

### 10. Bảng uy tín, màn xử việc

- `/me/trust` thêm `strikes[]` (loại, điểm, điều trích, ngày ra, ngày hết, số ngày còn lại, khiếu nại được không),
  `strikePoints`, `postingLockedUntil`.
- `GET /me/strikes` — lịch sử gậy kể cả đã huỷ / hết hạn (app hiện "đã huỷ").
- Chi tiết việc: `seller.strikes[]` (lịch sử gậy của người bán, dấu đã huỷ); việc về gậy: `strike` (gậy, điều trích, người
  nhận, tin liên quan), `appeal` (lời khiếu nại), `comments[]` (nhận xét kèm tên staff).

### 11. Thứ tự dựng và cổng

- `trust` dựng sau `identity`, `platform`, `group`, `listing`: ba module đầu nhận cổng `strikes` nối muộn (`trustService?`),
  `listing` qua `ListingTrustPort` (thêm `strikePointsIn`), `screening` qua `ScreeningTrustPort` (thêm `strikePoints`),
  `review` qua `ReviewTrustPort` (thêm `issueStrike`, `decideAppeal`, `decideSerious`, `decidePermanentReview`,
  `strikesOf`, `strikeDetail`).

### 12. Trả lời câu hỏi mở của proposal

1. Nhận xét: mọi staff đang hoạt động và master, trừ người ra gậy — gậy nghiêm trọng thường cần nhiều mắt; máy dùng chung
   với người bị khoá không chặn ghi nhận xét (chỉ là nhận xét).
2. Gỡ khoá ở lần xem lại: gậy thành `lifted` (còn trong lịch sử), tin hiện lại qua mở khoá, **không** trả ngày. Master xem
   lại trên dòng gậy (hạn lưu là việc của `add-data-retention`, chưa ẩn danh gì).
3. Việc chờ master có **ngay lúc ra gậy** (TK 22: "việc chờ master quyết nằm trên bảng tồn"); khiếu nại chỉ thêm lời của
   người bị khoá vào việc đó. Không ai khiếu nại thì việc vẫn chờ tới khi master quyết.
4. Mở khoá thường bị chặn (409 `LOCKED_BY_STRIKE`); khoá vĩnh viễn gỡ được bất kỳ lúc nào qua `lift`.
5. Tin đã `expired` trong lúc khoá thì ở lại hết hạn (TK 18 không có mũi tên); chỉ tin đang `live` được cộng ngày.
6. Hạ sau 180 ngày: gậy nặng hết hạn ngay (mốc hết hạn trong quá khứ).
7. Gậy bị huỷ → trả quyền staff tự động nếu đang treo vì gậy và không còn gậy nào; hết hạn → master trả (TK 5).
8. Gậy nặng của chủ nhóm hết hiệu lực trước khi có chủ mới → trả nhóm như mở khoá (nhóm đang chờ chủ này).
9. Sửa / gia hạn qua máy khi có 1 điểm → tin lên bảng lại mang `strike` (luật "tin lên bảng" áp cho mọi lượt lên bảng).
10. Gậy thường của tài khoản đã xoá thường hết hạn trước khi email tự do (90 ngày giữ): chấp nhận — gậy nặng vẫn kế thừa.
11. Quy định sàn = `rule_articles` do master soạn, gậy giữ bản trích lúc ra.
12. Hạn khiếu nại tính từ `issued_at`.
13. `trust.t3NoStrikeDays` = 90, giá trị khởi đầu.
14. Lịch sử gậy ở `seller.strikes` của chi tiết việc (capability `review/task-handling`).

## Risks / Trade-offs

- Khoá / mở khoá vì gậy nghiêm trọng đi qua outbox: vài giây sau quyết định. Đổi lại không có lượt ghi chéo module.
- Việc về gậy dùng chung máy nhận việc / quyết định của `review`: `claimedVersion` null như việc về người.
- Cộng ngày khi huỷ gậy nghiêm trọng là lượt ghi của `trust` vào `listing` qua cổng trong transaction — giống cách
  `review` đổi tin; chạy lại không áp lần hai vì quyết định là một lần.
